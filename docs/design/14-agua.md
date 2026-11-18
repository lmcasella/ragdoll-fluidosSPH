# 14. Agua física: campo de alturas, disparos e intercambios 🔨 #62

Rediseño de los fluidos para que **se simulen** con su física y no se imiten con reglas de juego (pedido del usuario, 19/11). La dirección la eligió el usuario y no se reabre: campo de alturas con Saint-Venant 1D para el agua del nivel, partículas chicas de agua pura para los disparos, absorción de partículas en el campo, flotación de Arquímedes por pieza, térmica con fases, mezcla por concentración, adherencia, arranque asentado y herramientas de debug.

- **Estado:** todo 🔨. Lo que está en `main` sigue descripto en [07-sph](07-sph.md) hasta que cada sub-issue se mergee.
- **Relevamiento medido** (19/11, no versionado): scripts, tablas y videos en el scratchpad del issue. Acá se citan los números usados.
- **Restricciones:** `lib/` no se toca (`stepWorld` sigue con 8 subpasos para los ragdolls); render en Canvas2D, sin WebGL propio; el código no se comenta (solo JSDoc).
- **Cada parte** tiene variables con unidades, ecuaciones, módulo, qué reemplaza y criterios físicos ([14.16](#1416-criterios-de-aceptación)). `physics-reviewer` aprueba el diseño antes de implementar y valida cada resultado sobre video.

## 14.1 Unidades, rebanada 2D y materiales

**Rebanada 2D.** El mundo es una rebanada de espesor equivalente `b`. Las áreas (m²) son volúmenes por espesor, y las masas, fuerzas y energías son las de la rebanada. Las dinámicas acopladas (flotación, arrastre, empuje del chorro, tiempos térmicos) dependen de **cocientes de densidad**, no de `b`. Por eso se fija una sola constante:

- `ρ_w` = 1000 kg/m³ (agua);
- `σ_w` = **12,0 kg/m²** (decidido por el usuario, [D1](#1418-decisiones-del-usuario)), densidad areal del agua en la rebanada;
- toda masa de fluido es `m = SG · σ_w · A`, con `SG` la gravedad específica del material.

**Relación con la densidad física:** `σ_w = ρ_w · b`, así que la rebanada tiene un espesor equivalente `b` = 12,0 / 1000 = **12,0 mm**. Es el espesor con el que un robot de 13 kg y 1,08 m² tiene exactamente la densidad del agua (1000 kg/m³). Toda magnitud extensiva (masa, fuerza, energía, área de intercambio de calor = perímetro · `b`) es la de esa rebanada. Los cocientes que gobiernan la dinámica (gravedad específica, aceleraciones, tiempos térmicos) no dependen de `b`.

**De dónde sale 12,0.** Hoy cada pieza del robot pesa 1 kg (`assets/robot.rag.json`, 13 piezas). El área de sus fixtures suma **1,08 m²** (círculos y cajas del rig, contando los solapes en las articulaciones), así que la densidad areal media del robot es 13 / 1,08 = **12,0 kg/m²**. LiquidFun usa por defecto `density` = 1 kg/m²: el agua del motor es 12 veces más liviana que el robot, y las piezas van de 5,5 kg/m² (torso) a 49,7 kg/m² (pies). Ese es el "5–50 veces más denso que el agua" del issue. Con `σ_w` = 12,0, la gravedad específica media del robot es **1,00** (13 / 1,0816 / 12,0 = 1,002): **flotación neutra**, sin tocar las masas del rig. Los motores de RagImporter, que se calculan con esas masas, no cambian. Por pieza queda el torso en 0,46, la cabeza en 1,01, los antebrazos en 1,77 y los pies en 4,1. El robot no sube ni se hunde por sí solo (deriva casi a 0,002 g hacia abajo) y se orienta con el torso arriba y los pies abajo, por el par entre piezas livianas y pesadas.

**Masa de partícula:** `m_p = σ_w · A_p` = 12,0 · 0,0324 = **0,389 kg** para el agua (por `SG` para los demás materiales).

**Área por partícula.** LiquidFun empaqueta las partículas a una distancia de 0,75 diámetros, así que cada partícula representa `A_p = (1,5 r)²`. Con `r` = 0,12 m da **0,0324 m²**. *Verificado* en el relevamiento: la masa que informa `GetBodyContacts` con `density` 1 es `(1,5 r)²`. Toda conversión entre partícula y columna usa `A_p`.

**Materiales** (tabla de datos `MATERIALS` en el módulo hoja nuevo `js/materials.js`, sin imports). Son valores de referencia de la literatura y se marcan *a confirmar por physics-reviewer*:

| Material | `SG` | `c` (J/(kg·K)) | `k` (W/(m·K)) | Cambio de fase | `μ` (Pa·s) | `C_d` | Miscible con agua |
|---|---|---|---|---|---|---|---|
| Agua | 1,0 | 4186 | 0,6 | Ebulle a 100 °C, `L_v` = 2,257·10⁶ J/kg | 1,0·10⁻³ | — | — |
| Ácido (diluido) | 1,05 | 4000 | 0,6 | Como el agua | 1,1·10⁻³ | — | Sí |
| Miel | 1,42 | 2500 | 0,5 | — | 10 (a 20 °C) | — | Sí (soluto) |
| Lava (basalto fundido) | 2,6 | 1200 | 1,5 | Solidifica a 1000 °C, `L_f` = 4,0·10⁵ J/kg; se emite a 1150 °C; emisividad 0,9 | — | 1,2 | No |
| Piedra (basalto) | 2,6 | 1000 | 1,5 | — | — | 1,2 | No |
| Vapor (100 °C, 1 atm) | ρ = 0,59 kg/m³ | 2010 | 0,025 | Condensa por debajo de `e_v` | — | 1,0 | — |
| Aire | ρ = 1,2 kg/m³, 20 °C | — | — | — | — | — | — |

**Coeficientes de transferencia** (también en `MATERIALS`): ebullición en película lava↔agua, `h_b` = 500 W/(m²·K) (rango de la literatura 200–1000); convección natural al aire, `h_a` = 10 W/(m²·K); arrastre de cuerpos en el agua, `C_d` = 1,2 (cilindro, régimen inercial) y término viscoso de Lamb `k_μ` = 8 (cilindro 2D, Re bajo).

**Límite del motor:** en LiquidFun la masa de partícula es una sola por sistema (`density · A_p`). La lava y la miel empujan a los cuerpos por contacto como si fueran agua (la lava, 2,6 veces menos). Sus masas reales se usan en todo lo que calcula el juego (flotación, inmersión, térmica, mezcla, adherencia). Queda documentado y no se compensa.

## 14.2 Identidad estable de partículas (`ParticleStore`)

**Conflicto.** `DestroyParticle` marca la partícula como zombi y el motor compacta los buffers en el siguiente `Step`: los índices cambian. Hoy el buffer de `userData` guarda dos cosas distintas: el id de disparo (`damage.js`) y la marca de lluvia −1 (`flood.js`). Además, el tipo de fluido se deduce del color (`fluidFromColor`). Con la térmica el color cambia con la temperatura, y la entalpía, la concentración y la fase necesitan arreglos paralelos que sobrevivan a la compactación.

**Resolución:** `userData` guarda **solo un slot estable**, y todo el estado por partícula vive en arreglos de JS indexados por slot.

- **Módulo nuevo `js/particleStore.js`**, clase `ParticleStore(system, capacity = system.GetMaxParticleCount())`. Es el **único** que llama a `CreateParticle` y a `DestroyParticle` en el sistema de partículas.
- **Codificación:** `userData = slot + 1`. El 0 queda para "sin slot" (el valor con que el motor inicializa el buffer): una partícula con 0 es un error de programación, que el debug cuenta y muestra.
- **Estado por slot** (arreglos tipados creados en el constructor, fuera del heap de 16 MiB):

  | Arreglo | Tipo | Unidad | Contenido |
  |---|---|---|---|
  | `alive` | `Uint8Array` | — | 1 vivo, 0 destruido (zombi o libre) |
  | `kind` | `Uint8Array` | — | Material actual (`MATERIAL.WATER`, `ACID`, `HONEY`, `LAVA`, `STONE`, `STEAM`) |
  | `origin` | `Uint8Array` | — | `SHOT`, `RAIN`, `STEAM`, `MAP` (dibujo y limpieza) |
  | `shot` | `Int32Array` | — | Id de tramo de disparo de `DamageSystem` (0 si no tiene) |
  | `mass` | `Float32Array` | kg | `SG · σ_w · A_p` al crearla; no cambia |
  | `enthalpy` | `Float32Array` | J/kg | Entalpía específica ([14.8](#148-térmica-y-fases)) |
  | `solute` | `Float32Array` | — | Fracción másica de miel `X` ([14.9](#149-mezcla-por-concentración-y-viscosidad)) |
  | `born` | `Float32Array` | s | Reloj de simulación al crearla |

- **API:**
  - `create(def, props)` llama a `CreateParticle(def)`, toma un slot libre, escribe `userData` (el puntero del buffer se relee después de crear, porque crear puede reubicarlo) y llena los arreglos. Devuelve el índice, o −1 si no hay lugar.
  - `slotAt(i)` = `HEAP32[(GetUserDataBuffer() >> 2) + i] − 1`.
  - `destroy(i)` es idempotente: si el slot está vivo, `DestroyParticle(i)`, `alive[slot] = 0` y el slot pasa a `pending`.
  - `afterStep()` pasa `pending` a la lista libre. Se llama **inmediatamente después de cada `stepWorld`**.
  - `reset()` destruye todo (reinicio de ronda).
- **Por qué la liberación diferida:** la zombi sigue en el buffer, con su `userData`, hasta el próximo `Step`. Si su slot se reusara antes, dos partículas apuntarían al mismo estado. Todo recorrido salta los slots con `alive` = 0, así que las zombis del paso no se procesan dos veces.
- **Por qué funciona** (según el fuente de LiquidFun 1.1, `b2ParticleSystem::Solve` y `SolveZombie`): la compactación ocurre **al principio** de `Solve`, antes de armar contactos y de llamar a los callbacks, es **estable** (conserva el orden) y mueve todos los buffers de la partícula, incluidos `userData` y color. Como el juego no destruye partículas dentro de `stepWorld`, solo compacta el primero de los 8 subpasos, y los índices que informan los callbacks valen hasta el próximo `stepWorld`. El build compilado no deja leer el C++: **se verifica en ejecución** (criterio S1). `CreateParticle` agrega al final del buffer. No se usan grupos en este sistema: `CreateParticleGroup` y `JoinParticleGroups` pueden rotar buffers.
- **Consumidores:**
  - `DamageSystem.onParticleBodyContact` lee el slot en el callback y encola `{ index, slot }`. El tipo sale de `store.kind[slot]` y el tramo de `store.shot[slot]`. `process` consume con `store.destroy(index)`; el índice vale hasta el próximo `stepWorld`.
  - `tagParticle` desaparece: el emisor pasa `shot` a `store.create`.
  - `liveShotFloor` no cambia.
  - `limpiarParticulas` (`index.html`) lee `store.shot`, `store.kind` y `store.origin` y destruye con `store.destroy`.
  - `RAIN_MARK` desaparece: `origin = RAIN`.
  - `fluidFromColor` deja de usarse para identificar: el color es solo para dibujar.

## 14.3 Campo de alturas: Saint-Venant 1D (`ShallowWater`)

Reemplaza al sistema de partículas del agua del nivel (pileta e inundación, radio 0,25 m, hasta 5.500 partículas, ~7,2 ms por frame).

### Estado

Malla de volúmenes finitos sobre `LEVEL.bounds`: `dx` = **0,1 m**, `N` = 560 celdas entre x 0 y 56 (los bordes de la pileta, x 18 y x 38, caen en caras de celda). Los arreglos son `Float64Array` creados en el constructor (pura JS, sin `Box2D`):

| Variable | Unidad | Significado |
|---|---|---|
| `b[i]` | m | Lecho: tope del sólido más alto de tipo `floor` que cubre la celda (`LEVEL.solids`). Es 0 en la pileta y 4 en las islas |
| `h[i]` | m | Espesor de agua (área de agua por ancho) |
| `q[i]` | m²/s | Caudal por ancho, `h·u` |
| `E[i]` | J/m | Energía térmica por ancho de columna, `σ_w · c_w · h · T` ([14.8](#148-térmica-y-fases)) |
| `M[i]` | m | Volumen de miel por ancho, `h · X_v` ([14.9](#149-mezcla-por-concentración-y-viscosidad)) |
| `d[i]` | m | Desplazamiento por cuerpos (solo con [14.5](#reacción-de-los-cuerpos-sobre-el-agua-recortable)) |
| derivados | — | `η = b + h`, `u = q/h` si `h > h_dry`, `T = E/(σ_w c_w h)`, `X_v = M/h` |

### Ecuaciones

Aguas someras en forma conservativa, con lecho variable, fricción y fuentes:

```
∂h/∂t + ∂q/∂x = s_h
∂q/∂t + ∂(q²/h + g h²/2)/∂x = −g h ∂(b + d)/∂x − τ_b/ρ + s_q
∂E/∂t + ∂(q E/h)/∂x = s_E
∂M/∂t + ∂(q M/h)/∂x = s_M
```

- `g` = 10 m/s², el mismo del mundo (`b2World` con gravedad (0, −10)).
- **Fricción de fondo**, Manning más término laminar, tratada en forma semi-implícita (estable para `h` → 0): `τ_b/ρ = g n² u|u| / h^{1/3} + 3 ν(X) u / h`, con `n` = 0,012 s/m^{1/3} (hormigón liso). El segundo término es el de una película laminar: domina en columnas con miel.
- **Aproximación de Boussinesq:** la densidad de la mezcla (`ρ_col = ρ_w (1 + (SG_miel − 1) X_v)`) entra en el empuje sobre cuerpos y partículas, pero no en la dinámica de la columna. El error es chico mientras la miel sea una fracción pequeña del agua; si una columna es casi toda miel, se nota en la velocidad de las ondas. Queda documentado.
- **Fuentes del paso** `s_h`, `s_q`, `s_E`, `s_M`: absorción ([14.4](#144-absorción-e-inmersión)), reacción del arrastre sobre cuerpos ([14.5](#145-flotación-de-arquímedes-por-pieza)) y evaporación ([14.8](#148-térmica-y-fases)). Se acumulan en arreglos durante el paso y se aplican al principio de `step` (separación de operadores de Lie).

### Esquema numérico

- **Flujo HLL** (Harten–Lax–van Leer) con las velocidades de onda de Einfeldt.
- **Reconstrucción hidrostática** (Audusse, Bouchut, Bristeau, Klein y Perthame, *SIAM J. Sci. Comput.* 25(6), 2004). Es *well-balanced*: el lago en reposo sobre el escalón de 4 m de la pileta queda exactamente quieto, y conserva la positividad de `h` en los frentes seco/mojado.
- **Segundo orden:** reconstrucción MUSCL con limitador minmod sobre `η`, `h` y `u` (se reconstruyen `η` y `h`, así que `b` en la cara es `η − h`, como pide la reconstrucción hidrostática), e integración temporal SSP-RK2 (Heun).
- **Seco/mojado:** `h_dry` = 10⁻³ m. Por debajo, `q` = 0. La velocidad se desingulariza como en Kurganov y Petrova (2007): `u = 2 h q / (h² + max(h², h_dry²))`.
- **Escalares** `E` y `M`: flujo upwind según el signo del flujo de masa HLL de la cara. Es conservativo: lo que sale de una celda entra en la vecina.

### Paso, estabilidad y bordes

- **Un `step(dt)` por paso fijo** (dt = 1/60 s), con subpasos internos por CFL: `n = ceil(dt · max_i(|u_i| + √(g h_i)) / (CFL · dx))`, `CFL` = **0,25** (cota de positividad para MUSCL con SSP-RK2) y `n ≤ 32`. Peor caso esperado, con la inundación al tope (h = 15 m, √(gh) = 12,2 m/s) y |u| ≤ 10 m/s: ~15 subpasos. Si se llega al tope de 32 (velocidades no físicas), se recorta `|u|` a `√(g h)` y el debug lo cuenta.
- **Costo estimado:** 560 celdas × 2 etapas × ≤ 15 subpasos ≈ 17.000 flujos por frame: **< 0,3 ms** en JS. Se mide.
- **Bordes:** paredes reflectivas en x = 0 y x = 56 (celdas fantasma con `h` espejado y `q` negado). Sin fuentes ni sumideros en los bordes.
- **Plataformas** (sólidos `platform`, 0,4 m): **no son lecho**. El agua las atraviesa como placas delgadas sumergidas. A 15 m desplazarían 18,4 m² de ~700 m²: el **2,6 %** del volumen, que el modelo ignora. No hay "agua arriba de una plataforma y seco abajo": lo que cae sobre una plataforma seca sigue siendo partícula hasta que escurre por el borde ([14.4](#144-absorción-e-inmersión)).
- **Estado inicial (arranque asentado):** pileta con `η` = `pool.surface` (3 m) entre x 18 y 38, `q` = 0, `T` = 20 °C y `M` = 0; islas secas. Por ser *well-balanced*, el lago en reposo es una solución exacta: **no hay transitorio de arranque** (con partículas, el pico era de 33 m/s).

### Interfaz

`js/water.js`, clase `ShallowWater(level = LEVEL, config = WATER_FIELD)`. `WATER_FIELD` es un dato del mismo módulo: `dx`, `cfl`, `maxSubsteps`, `hDry`, `manning`, `ambientT` y `draw`.

- `step(dt)`;
- `deposit(x, area, momentum, energy, honey)`: reparte la fuente entre las dos celdas vecinas con pesos lineales (*cloud-in-cell*);
- `addMomentum(i, dq)`;
- `surfaceAt(x)`, `velocityAt(x)`, `densityAt(x)`, `viscosityAt(x)` y `temperatureAt(x)` (interpolación lineal);
- totales `volume()`, `momentum()`, `energy()` y `honey()` (para tests y debug);
- `boiled[i]` (J pendientes de vaporización, [14.8](#148-térmica-y-fases));
- `reset()`.

**No importa nada de `Box2D`.** Importa `LEVEL` (datos) y `MATERIALS`. Se testea entero en Node sin LiquidFun.

### Render

`drawWater(ctx, water, scale)` en `js/render.js`: un polígono relleno por tramo mojado, del lecho a `η`, con la línea de superficie encima. Se dibuja en el canvas principal **después de los robots**, con transparencia (0,55), para que las piezas sumergidas se vean bajo el agua. Costo esperado: un `fill` de ≤ 560 vértices, < 0,1 ms. Datos de dibujo en `WATER_FIELD.draw`.

### Qué reemplaza y qué se borra

- **Se borra:** `fillPool`, `fillPoolWater` y `LEVEL.pool.radius`, `.draw`, `.flags` y `.physics` (`js/level.js`). Se conservan `x1`, `x2`, `bottom`, `surface` y `killY` (sensor). También se borran el sistema `poolSystem` de `index.html`, `skinPosition` y `collectSurfaces` (parche de #45) y el dibujo del agua del nivel con círculos de `js/render.js`.
- **La rotura de presa y la nivelación** del banco 2 de #40 se reemplazan por los criterios W1–W6.

## 14.4 Absorción e inmersión

Acople partícula ↔ campo, una vez por paso, después de `stepWorld` y `store.afterStep()`. **Módulo `js/immersion.js`, reescrito:** conserva el nombre y el rol de puente, pero contra el campo de alturas. Un solo motivo de cambio: el intercambio entre partículas y columnas.

### Absorción (materiales miscibles: agua, lluvia, ácido, miel, vapor condensado)

- **Condición:** la partícula toca el agua o el lecho de su columna: `y ≤ η(x) + r`, con `r` el radio del sistema. Vale para columnas secas (`η = b`): la lluvia o el chorro que caen sobre el piso de las islas también se absorben, y el campo los escurre como película.
- **Qué suma a la columna** (con `deposit`, repartido en dos celdas):

  | Cantidad | Fuente | Unidad |
  |---|---|---|
  | Volumen | `A_p` | m² |
  | Cantidad de movimiento horizontal | `SG · A_p · v_x` (Boussinesq: momento por `ρ_w`) | m³/s |
  | Energía térmica | `m · e + ½ m v²` (la energía cinética del impacto se disipa como calor: a 25 m/s son 0,07 K, pero cierra el balance) | J |
  | Miel | `A_p · X_v` (fracción en volumen de la partícula) | m² |

- **Cantidad de movimiento vertical:** el modelo hidrostático no la resuelve. Se transfiere al lecho como impulso de presión y se registra en el debug. La **salpicadura es la ola** que genera el volumen agregado: dos frentes a ±√(g h).
- Después de depositar, `store.destroy(i)`.
- **Ácido:** se absorbe como volumen y pierde su identidad (deja de dañar). Un trazador de ácido por columna queda para M5 (💬).
- **Charcos sobre plataformas:** no se absorben hasta que caen al campo. Siguen venciendo a los 6 s del disparo como **regla de presupuesto** de partículas, no como física (decidido, [D5](#1418-decisiones-del-usuario)).

### Inmersión (materiales inmiscibles: lava, piedra, vapor recién creado)

Para cada partícula con `y < η(x)`, sea `ρ_col = densityAt(x)` y `u_c = velocityAt(x)`:

- **Empuje de Arquímedes** sobre la partícula: `a_b = g · ρ_col / (ρ_w · SG_p)` hacia arriba. La gravedad la aplica el motor.
- **Arrastre hacia la corriente:** `ẋ` se relaja hacia `(u_c, 0)` con el coeficiente cuadrático `k = ½ ρ_col C_d D |v − u_c| / (SG_p ρ_w A_p)` (`D` = 1,5 r), integrado en forma exacta en el paso (`v ← u_c + (v − u_c) / (1 + k dt)`), sin sobrecorrección.
- **Reacción:** `addMomentum` suma a la columna `−SG_p A_p Δv_x / dx`. La cantidad de movimiento horizontal se conserva entre partícula y columna.
- **Velocidad terminal resultante:** `v_t = √(2 g (SG_p − ρ_col/ρ_w) A_p / (C_d D))`. Para la lava en agua da **2,19 m/s** hacia abajo.
- **Escritura:** directo en el buffer de velocidades (`HEAPF32`), como hoy.
- **Interfaz para la térmica:** `submerged` (`Int32Array` de índices), `count` y `columns` (celda de cada uno). Valen hasta el próximo `stepWorld`.

### Qué reemplaza

El puente de #39 completo: la grilla de 0,5 m, `IMMERSION` y `WEAPONS[].immersion`. La respuesta sale de `MATERIALS`, ya no de constantes de juego.

## 14.5 Flotación de Arquímedes por pieza

**Módulo nuevo `js/buoyancy.js`**, clase `Buoyancy(water, materials)`. Comparte con la adherencia la geometría de las piezas, en el módulo hoja nuevo `js/bodyShapes.js`: polígonos locales de cada fixture, con los círculos como 16-gonos, guardados una vez por cuerpo.

- **Registro:** `register(players)`, en los mismos lugares que `damage.register` (aparición, giro, ronda nueva). Lee una vez `GetFixtureList`/`GetShape`/`GetType`, `GetVertexCount`/`GetVertex` y `get_m_p`/`get_m_radius`.
- **Paso** (`apply(dt)`, una vez por paso fijo, **antes** de `stepWorld`). Para cada pieza:
  1. polígono en el mundo, con `GetPosition` y `GetAngle` y cuentas en JS;
  2. para cada columna `i` que cruza: recorte Sutherland–Hodgman contra la franja `[x_i, x_{i+1}]` y contra el semiplano `y ≤ ζ_i`, donde `ζ_i = η_i` (o `η_i + d_i`, con la reacción). Da el área sumergida `A_i` y su centroide `c_i`;
  3. **empuje:** `F_i = ρ_col,i · g · A_i · b` hacia arriba, aplicado en `c_i`. La suma reproduce el empuje total y su momento (par adrizante);
  4. **arrastre** por franja con la velocidad relativa en `c_i` (`GetLinearVelocityFromWorldPoint` menos `(u_i, 0)`): `F = −(½ ρ_col C_d ℓ_⊥ |v_r| + k_μ μ_col) v_r · b`, con `ℓ_⊥` el largo de la franja proyectado perpendicular a `v_r`. Como se calcula por franja, aparece solo el amortiguamiento angular;
  5. se acumulan el impulso total `J = Σ F_i dt` y el impulso angular respecto del centro de masa, y se aplican **una vez por pieza** con `ApplyLinearImpulse(J, centro)` y `ApplyAngularImpulse`. El arrastre se limita para que no invierta la velocidad relativa de la pieza en el paso.
- **Por qué impulsos y no fuerzas:** `stepWorld` llama a `world.Step` 8 veces (*verificado* en `lib/ragimporter.js`) y Box2D borra las fuerzas después de cada `Step` (`autoClearForces`, que vale `true` por defecto; *a verificar* en el test con `world.GetAutoClearForces()`, que el build expone). Una fuerza aplicada antes de `stepWorld` actuaría solo 1/8 del paso. Este dato se agrega a la regla de paso fijo de `CLAUDE.md`.
- **Estabilidad del acople explícito:** la rigidez del empuje de una pieza es `k = σ_w g w_flotación`. El caso más rígido es el torso (w ≈ 0,48 m, 1 kg): con `σ_w` = 12,0, k = 57,6 N/m y ω = √(k/m) ≈ 7,6 rad/s, así que ω·dt ≈ 0,13 ≪ 2. Es estable con un impulso por paso. Se descartó aplicar el empuje en cada subpaso colando un objeto con `update(dt)` en la lista de `stepWorld`: funciona, pero depende de un detalle de RagImporter que no está en su contrato.
- **Masa agregada:** no se modela. No cambia el equilibrio, pero el período de oscilación de una pieza que flota queda más corto que el real (para un cilindro, la masa agregada es igual a la masa desplazada). Queda documentado.
- **Reacción horizontal:** `water.addMomentum(i, −J_arrastre,x / (σ_w dx))` en cada franja: la cantidad de movimiento horizontal se conserva entre cuerpos y agua.
- **Densidad del rig** (decidido, [D1](#1418-decisiones-del-usuario)): no cambia. Con `σ_w` = 12,0 kg/m², la gravedad específica media es 1,00 (flotación neutra, [14.1](#141-unidades-rebanada-2d-y-materiales)).
- **Reglas de juego que no cambian** (decidido, [D6](#1418-decisiones-del-usuario)): el sensor de la pileta (`killY` 2,2 m) sigue matando y la pileta no moja antes de la inundación. Con flotación neutra, un robot que cae a la pileta no vuelve a subir por sí solo: deriva con la inercia de la caída y toca el sensor, como hoy. El mojado (`soak`) usa `water.surfaceAt(x)` en lugar de `Flood.surfaceAt`, con la misma regla de `lowestPoint()`.
- **Costo estimado:** 26 piezas × ≤ 7 franjas × recorte de ≤ 16 vértices, más 2 llamadas al binding por pieza: **< 0,15 ms por paso**.

### Reacción de los cuerpos sobre el agua (recortable)

Sin este término, el robot flota, pero el agua no lo siente entrar: no hay ola al caer ni depresión bajo el casco. Se modela como **presión de casco** (modelo clásico de buque como distribución de presión): `d_i = A_i^{perfora} / dx`, el área sumergida en la columna `i` de las piezas que **perforan la superficie**, entra en el término `−g h ∂(b + d)/∂x`. El equilibrio es `η + d` constante: el agua bajo el casco baja `d`, y el volumen desplazado sube el nivel alrededor. Cuando cambia `d(t)`, la entrada, el movimiento y la salida radian ondas.

- **Piezas totalmente sumergidas:** su `d` se apaga linealmente cuando el tope de la pieza queda a más de 0,1 m bajo la superficie. Una pieza profunda no deprime la superficie. Su desplazamiento sube el nivel medio solo `A/W` (el robot entero en la pileta: 1,08/20 = 5 cm), que se ignora.
- **Recorte de la flotación** contra `ζ = η + d`, la superficie de presión, que en equilibrio es plana.
- **Riesgo:** el acople implícito entre `d` y `η` puede oscilar. Si no cumple el criterio B5, se recorta a M5 y queda solo la reacción horizontal del arrastre.

## 14.6 Disparos con agua pura

Reemplaza el preset de #40 y #41 (`VISCOUS` + `STATIC_PRESSURE` + damping 1,0 en el agua del nivel; disparos con `pressureStrength` 0,005 y `TENSILE` sin efecto). Ese preset es lo que se ve "viscoso": en el relevamiento, el frente de rotura de presa iba a −70/−75 % de Ritter, contra −20/−35 % del agua pura.

**Un solo sistema de partículas líquidas** (`SHOT_SYSTEM` en `js/weapons.js`, creado con `createParticleSystem`). Lleva disparos, lluvia, vapor y piedra, para que todos se toquen (contactos partícula↔partícula para la térmica y la mezcla). Los gases de #16, si se hacen, comparten este sistema: el vapor ya lo hace, con su empuje en aire calculado ([14.8](#148-térmica-y-fases)).

| Parámetro | Valor | Antes | Por qué |
|---|---|---|---|
| `radius` | **0,12 m** (respaldo 0,15) | 0,1 | Relevamiento: con 0,12 entra en memoria y costo; con ≤ 0,10, la inundación en partículas no entraba. Ahora la inundación no es partículas |
| `maxCount` | **3.000** | 1.500 | Disparos (≤ 1.500) + lluvia en vuelo (~450, ver [14.7](#147-inundación-con-lluvia-absorbida)) + vapor (tope 300) + miel persistente y piedra. El heap de 16 MiB admite ~30.000 |
| `density` | **`σ_w` = 12,0 kg/m²** (0,389 kg por partícula) | 1 (por defecto) | Masa física de la partícula de agua, coherente con la flotación ([D1, D2](#1418-decisiones-del-usuario)) |
| `dampingStrength` | **0,5** | 1,0 | Relevamiento (`D4`): con 0,5 y presión 0,1, temblor 0,064 m/s, densidad 1,00–1,09 y frente −27 % |
| `pressureStrength` | **0,1** | 0,005 | Incompresibilidad: densidad en reposo ≈ 1,0 del empaquetado ideal |
| tensiones superficiales | **0** | 0 | A 0,24 m de diámetro, la tensión superficial real es despreciable (número de Bond ≫ 1) |
| `viscousStrength` | **0,6** (a medir) | 1,0 | Solo actúa en partículas con `VISCOUS` (miel con `X ≥ 0,6`, [14.9](#149-mezcla-por-concentración-y-viscosidad)). Valor del relevamiento `J` |
| flags del agua, el ácido y la lluvia | **0** | `TENSILE` | Agua pura |
| flags de la miel | `VISCOUS` según `X` | `VISCOUS` | [14.9](#149-mezcla-por-concentración-y-viscosidad) |
| flags de la lava | **0** | `TENSILE \| VISCOUS` | La lava se diferencia por material (`SG` 2,6, temperatura), no por un preset viscoso |

- **Separación al emitir (arranque sin explosión):** dos partículas del mismo chorro nacen separadas al menos `1,5 r` (0,18 m), el paso de empaquetado. Con un solo carril, el emisor las separa `speed / rate` a lo largo del chorro. Como D2 conserva el caudal y la velocidad actuales, el emisor reparte cada tramo en **`n = ceil(rate · 1,5 r / speed)` carriles paralelos**, separados `1,5 r` en la dirección perpendicular al disparo (la boca tiene ese ancho). Así, cada carril cumple `rate/n ≤ speed / (1,5 r)`: agua (100/s, 14 m/s) 2 carriles; ácido (90/s, 14 m/s) 2; lava (60/s, 10 m/s) 2; miel (50/s, 18 m/s) 1. `MUZZLE_OFFSET` sigue en `r + 0,05`, y el recorte por raycast se aplica a cada carril.
- **Empuje del chorro:** el flujo de cantidad de movimiento es `ṁ v = rate · σ_w · A_p · v`. **Chorro fuerte** (decidido, [D2](#1418-decisiones-del-usuario)): con `density` = `σ_w` = 12,0 y el caudal y la velocidad actuales, que no cambian:

| Arma | Caudal y velocidad | Empuje `ṁ v` | Respecto del peso del robot (130 N) |
|---|---|---|---|
| Agua | 100/s, 14 m/s | **544 N** | 4,2 veces |
| Ácido | 90/s, 14 m/s | 490 N | 3,8 veces |
| Lava | 60/s, 10 m/s | 233 N (con masa de agua: límite del motor, [14.1](#141-unidades-rebanada-2d-y-materiales)) | 1,8 veces |
| Miel | 50/s, 18 m/s | 350 N | 2,7 veces |

Hoy el agua empuja 31,5 N. Es física (un chorro de 0,2 m de ancho a 14 m/s es un cañón de agua) y no se compensa. Los tanques, la duración y el daño por partícula (`dps / rate`) no cambian.
- **Qué se borra:** `TENSILE` de los datos de armas y `PARTICLE.STATIC_PRESSURE` del agua del nivel. El banco 1 de #40 se conserva con criterios físicos (P2–P4).

## 14.7 Inundación con lluvia absorbida

`js/flood.js` (`Flood`) pasa a ser **solo la fuente de masa**: emite gotas en el sistema líquido con `store.create(..., { kind: WATER, origin: RAIN })`. Las gotas caen como partículas, y al tocar el campo se absorben ([14.4](#144-absorción-e-inmersión)).

- **El emisor no impone el nivel.** El caudal sale de la curva de diseño: `Q(t) = riseSpeed · W_libre(nivel(t))` (m²/s), con `W_libre` del ancho libre que ya calcula `waterArea`, y emite `Q / A_p` partículas por segundo con crédito acumulado, en las mismas x de baja discrepancia. El nivel resulta de la conservación de la masa. Se corta cuando `η` medio ≥ `maxLevel`.
- **Caudal:** 93/s mientras el agua está bajo las islas (W = 20 m) y ~255/s por encima (W ≈ 55 m). La caída de 27,5 m dura 1,7 s, así que hay ~430 gotas en vuelo. Por presupuesto, `maxRate` = 300/s.
- **Se borra:** `rainTarget`, `density`, `drainHeight`/`drainSpeed` (el "escurrido" que destruía gotas quietas era una imitación: ahora los charcos de las plataformas escurren por el borde o quedan como partículas), `measureSurface`/`surfaceAt` (lo da el campo), `RAIN_MARK`, `maxParticles` y el uso de `fillPoolWater` en `reset()`. `reset()` llama a `water.reset()`, y la raíz de composición destruye las partículas con `store.reset()`.
- **Se conserva:** `floodLevel(t)` (curva de diseño y HUD), `waterArea` y la regla "antes de `start` no moja" (`Flood.level` = −∞).
- **Nota de realismo:** subir 0,15 m/s equivale a 540 m de lluvia por hora. La intensidad es un evento de juego; la acumulación, el escurrido y las olas son físicos.

## 14.8 Térmica y fases

**Módulos:** `js/contacts.js` (nuevo, lector del buffer nativo de contactos) y `js/thermal.js` (nuevo). La energía de las columnas vive en `ShallowWater` (`E[i]`).

### Lector de contactos partícula↔partícula (`js/contacts.js`)

- El binding no exporta `GetContacts` (*verificado*: la lista de métodos de `b2ParticleSystem` en `vendor/liquidfun.js` tiene `GetContactCount`, pero no `GetContacts`). El buffer nativo es un `b2GrowableBuffer` `{ data*, count, capacity, allocator* }` dentro de `b2ParticleSystem`.
- **Relevamiento:** está a **+54 palabras** del puntero del sistema, con 6 palabras por contacto (`indexA`, `indexB`, `weight`, `nx`, `ny`, `flags`).
- **No se fija el offset.** La primera vez que `GetContactCount() > 0`, se buscan en las primeras 600 palabras un puntero y un conteo igual a `GetContactCount()`, y se validan los primeros contactos (índices en rango, `0 < weight ≤ 1`). El offset hallado queda en `stats`, y el debug avisa si no es 54. Si no se encuentra, **la térmica y la mezcla se desactivan** (el juego sigue) y el debug lo muestra.
- En cada paso se relee `data*` (el buffer puede reubicarse) y se recorre en solo lectura. Costo medido: **0,05–0,2 ms** con 5.000–14.000 partículas.
- Es el **único** módulo que conoce la estructura nativa (patrón de memoria nativa).

### Estado y ecuaciones por partícula

- **Variable:** la entalpía específica `e` (J/kg), en `store.enthalpy`. La temperatura sale de `e` por tramos, con referencia 0 J/kg a 0 °C:
  - agua líquida, `T = e / c_w` hasta `e_l = c_w · 100`;
  - mezcla en ebullición entre `e_l` y `e_v = e_l + L_v` (`T` = 100 °C; título `x = (e − e_l)/L_v`);
  - vapor, `T = 100 + (e − e_v)/c_v`;
  - lava/piedra: sólido hasta `e_s = c_p · 1000`, fusión entre `e_s` y `e_s + L_f`, y líquido por encima.
- **Cambio de fase con histéresis natural:** el agua pasa a `STEAM` cuando `e ≥ e_v` y vuelve a `WATER` cuando `e ≤ e_l`; la lava pasa a `STONE` cuando `e ≤ e_s`. La masa de la partícula no cambia, y la energía se conserva por construcción.
- **Intercambio entre vecinas** por el buffer de contactos, para cada par vivo `(a, b)` con peso `w`:
  - el calor `Q_ab = K_ab · w · (T_b − T_a)` (W) se aplica como `e_a += Q dt/m_a` y `e_b −= Q dt/m_b`, una suma de pares antisimétrica que conserva la energía;
  - lava o piedra con agua: `K = h_b · D · b` (ebullición en película);
  - entre fluidos iguales: `K = ρ c b · (α_mol + C_s |v_a − v_b| D)`, con difusividad turbulenta por cizalla (analogía de Reynolds con la mezcla, [14.9](#149-mezcla-por-concentración-y-viscosidad)). En agua quieta, la conducción molecular (α = 1,4·10⁻⁷ m²/s) es despreciable a la escala de 0,18 m, como en la realidad;
  - **limitador:** el intercambio de un par en el paso no supera el que igualaría sus temperaturas, dividido por el número de vecinas. Así no hay sobrecorrección con ninguna `dt`.
- **Pérdidas al ambiente** (aire a 20 °C), que se acumulan en `E_perdida`:
  - lava y piedra, por radiación y convección: `Q = P b [ε σ_SB (T⁴ − T_a⁴) + h_a (T − T_a)]`, con `P` el perímetro equivalente (círculo de área `A_p`);
  - vapor, por arrastre de aire de la pluma (hipótesis de *entrainment* de Morton, Taylor y Turner, 1956): `Q = λ m c_v (T − T_a)` con `λ` como dato (1/s), a calibrar con physics-reviewer contra la altura de condensación de una pluma de vapor.
- **Dinámica del vapor en el aire:** el motor aplica −g. Se suma el empuje del aire `+g ρ_a/ρ_s` y el arrastre cuadrático en aire, `½ ρ_a C_d D |v| v / (ρ_s A_p)`, integrado en forma exacta. Velocidad terminal resultante: `v_t = √(2 g (ρ_a − ρ_s) A_p / (ρ_a C_d D))` = **1,35 m/s** hacia arriba. **Límite:** una partícula de vapor es una parcela que lleva la masa de agua de la que vino. Su volumen dibujado no está a escala (el vapor real ocuparía 1.600 veces más). Queda documentado.
- **Piedra:** al solidificar, `SetParticleFlags(i, POWDER)` (granular, sin cohesión: cae y se apila con su `SG`). Cuando queda en reposo (|v| < 0,05 m/s durante 0,5 s), `SetParticleFlags(i, WALL)`, inmóvil (*verificado* en ejecución en el relevamiento `H`: la piedra con `WALL` quedó en 0,00 m/s). `POWDER` (1 << 6, de `b2Particle.h`) está *por verificar* en ejecución.

### Columnas

- **Transporte:** `E` se advecta con el flujo ([14.3](#143-campo-de-alturas-saint-venant-1d-shallowwater)).
- **Lava sumergida** (`immersion.submerged`): `Q = h_b · P · b · (T_lava − T_col)` entre la partícula y su columna, con el mismo limitador.
- **Ebullición de columna:** si `T_col` llegaría a superar 100 °C, la columna queda en 100 °C y el excedente va a `boiled[i]` (J). Cuando `boiled[i] ≥ m_p L_v` (una partícula de vapor), la columna pierde `A_p` de volumen y `m_p e_l` de energía, y la térmica crea una partícula `STEAM` en `(x_i, η_i + 1,5 r)` con `e = e_v`. Así se conservan la masa y la energía. Se emite como mucho una partícula por columna y por paso; con el tope de 300 vapores, el excedente espera en `boiled`.
- **Pérdida de superficie al aire:** `h_a` sobre el ancho `dx`, acumulada en `E_perdida`.

### Colores

La térmica escribe el color de las partículas según `T` y fase (agua que se calienta, lava que se oscurece, piedra gris, vapor blanco), como en el relevamiento. El dibujo no cambia; el color ya no identifica el material.

### Expectativa física (decidido, [D3](#1418-decisiones-del-usuario): tiempos reales, sin escalar)

Con `h_b` = 500 W/(m²·K), una partícula de lava de 0,24 m tarda **~2,5 min** en solidificar en el agua (modelo concentrado; la costra real se forma en segundos, pero el interior sigue fundido). Un tanque de lava entero (90 partículas, 1.150 °C) calienta la pileta (60 m²) unos 50 K: hierve localmente en las columnas donde se junta la lava, no toda la pileta. Las "plataformas de piedra temporales" de #30 no aparecen en el tiempo de una ronda con valores reales.

### Qué reemplaza

El diseño de reacciones de #30 ([04-fluidos §4.4](04-fluidos.md#44-reacciones-entre-fluidos--30)): lava + agua → piedra y vapor, con física en lugar de una regla de contacto. #32 (explosión de vapor) pasa a depender de esta parte.

## 14.9 Mezcla por concentración y viscosidad

**Módulo nuevo `js/mixing.js`.** Usa `js/contacts.js` y `store.solute`.

- **Variable:** fracción másica de miel `X` por partícula (1 en la miel disparada, 0 en el agua). En la columna, la variable es el volumen de miel `M` ([14.3](#143-campo-de-alturas-saint-venant-1d-shallowwater)), con `X_v = M/h`.
- **Intercambio:** `F_ab = ρ̄ b · D_eff · w · (X_b − X_a)` (kg/s), que se aplica como `X_a += F dt/m_a` y `X_b −= F dt/m_b`. Conserva `Σ m X` exactamente y usa el mismo limitador que la térmica.
- **Difusividad efectiva:** `D_eff = D_mol + C_s |v_a − v_b| D`. `D_mol` (miel–agua) ≈ 10⁻¹⁰ m²/s es despreciable: la miel quieta en agua quieta no se diluye en segundos, como en la realidad. El término de cizalla (longitud de mezcla) es el que mezcla cuando hay movimiento. `C_s` es un dato a calibrar.
- **Viscosidad de la mezcla** (regla logarítmica de Arrhenius / Grunberg–Nissan): `ln μ(X) = X ln μ_miel + (1 − X) ln μ_agua`.
- **Partículas, híbrido** (relevamiento `I`: la flag es fuerte pero binaria; el arrastre propio es graduado pero débil):
  1. flag `VISCOUS` con histéresis: se activa si `X ≥ 0,6` y se apaga si `X ≤ 0,5` (`SetParticleFlags`, *verificado* en el binding; costo medido 0,003 ms por frame);
  2. arrastre entre vecinas graduado por `ν(X̄)`: impulso de par `p = m_red · β · w · (v_b − v_a)`, con `β = min(0,5, dt ν(X̄) / D² · χ_v)`. Conserva la cantidad de movimiento.
- **Columnas:** `ν(X_v)` entra en la fricción laminar `3 ν u / h` ([14.3](#143-campo-de-alturas-saint-venant-1d-shallowwater)) y `ρ_col` en el empuje.
- **Qué reemplaza:** la diferencia entre miel y agua deja de depender solo de `viscousStrength` del sistema. La miel que cae al agua se absorbe con su soluto ("se hunde y se diluye por columna").

## 14.10 Adherencia

**Módulo nuevo `js/adhesion.js`.** Usa `js/bodyShapes.js` y `store`.

- **Detección por cercanía:** `GetBodyContacts` no alcanza, porque las partículas en reposo quedan a ~1,65 radios y el build no expone el conteo (*verificado*). Las partículas a menos de `δ_max` = `2 r` de la superficie de una pieza (distancia punto-polígono en JS, filtrada por las cajas de `fixtureBoxes()`) forman una película.
- **Fuerza viscosa de película** sobre la velocidad relativa en el punto más cercano, `v_r = v_p − v_cuerpo(punto)`:
  - **tangencial:** esfuerzo de corte de película `τ = μ(X) v_t / δ`, con `δ` la distancia a la superficie (acotada a ≥ 0,25 r);
  - **normal**, solo al separarse: resistencia viscosa a la separación (adhesión de Stefan), con el mismo `μ(X)/δ` y un factor geométrico dato.
  - El impulso sobre la partícula se integra en forma exacta (no invierte `v_r`). El impulso opuesto va al cuerpo (`ApplyLinearImpulse` en el punto, con vectores de trabajo reutilizados), así que la cantidad de movimiento se conserva.
- **Escala:** con `μ_agua` el efecto es nulo (el agua no se pega); con la miel, la película escurre por una pared y frena a un cuerpo que la atraviesa. Relevamiento `J`: la miel escurre a ~0,2 m/s, y una caja que entra a 6 m/s en miel queda en 0,87 m/s a los 0,5 s, contra 3,47 m/s en agua (con constantes no calibradas; con valores físicos se recalibra contra el criterio A2).
- **Qué reemplaza** (decidido, [D4](#1418-decisiones-del-usuario)): `DamageSystem.stickHoney` y la regla de juego `STICKY` de #41 (estado `pegado` con velocidad ×0,1) **se retiran en este sub-issue (#62-J)**, cuando cumple A1–A2. Hasta entonces sigue el temporizador actual: `stickHoney` sigue con `store.kind` y suma la consulta de columnas con `X_v ≥ 0,5` bajo `lowestPoint()`, porque la miel absorbida en el piso deja de ser partícula.

## 14.11 Arranque asentado

- **Agua del nivel:** el lago en reposo es solución exacta del esquema *well-balanced* ([14.3](#paso-estabilidad-y-bordes)), así que no hace falta asentar nada (criterio W2).
- **Chorros:** separación de `1,5 r` entre partículas del mismo chorro ([14.6](#146-disparos-con-agua-pura)).
- **Vapor:** nace a `1,5 r` sobre la superficie de su columna.
- **Grupos de partículas iniciales** (charcos del mapa, #23): se crean **separados un radio** del piso, las paredes y los cuerpos, y desde un **estado asentado guardado**: posiciones y velocidades tras 5 s, generadas por un script de `tests/tools/` y guardadas como datos del nivel. Relevamiento `E`, r = 0,12: el pico de velocidad baja de 11,7 m/s (apoyada, como hoy) a 3,6 m/s (separada un radio) y a **0,6 m/s** (asentada y guardada). Con la absorción en el piso, un charco de miel del mapa sobre las islas es una **columna con `M` inicial**, no partículas: #23 se simplifica.

## 14.12 Herramientas de debug

**Módulo nuevo `js/debug.js`**, que integra el panel de métricas de #29. Es una herramienta de desarrollo, no una mecánica: se conmuta con teclado (F3 el panel, F4 el modo de capa) y con el botón Select del gamepad mantenido junto con LB. No viola "gamepad primero" porque no es una mecánica.

- **Panel:** partículas por material y por origen, slots libres y pendientes, offset del buffer de contactos, ms por subsistema (`flood`, `buoyancy`, `stepWorld`, `immersion`, `thermal`, `mixing`, `adhesion`, `water`, `damage` y el render de fluidos), subpasos CFL del campo y FPS.
- **Monitores de conservación:** volumen de agua (columnas + partículas · `A_p`), energía (`Σ m e` + `Σ E` + `E_perdida`) y miel (`Σ m X` + `Σ ρ_miel M dx`), con su deriva desde el inicio de la ronda.
- **Capas:**
  - columnas del campo (barras de `h`, vectores de `u`, color por `T` o `X_v`);
  - partículas coloreadas por temperatura o concentración;
  - vectores de velocidad (muestreados);
  - contactos partícula↔partícula (líneas, muestreadas);
  - empuje y arrastre por pieza (flechas en el centroide sumergido).
- **Patrón:** cada módulo expone un objeto `stats` de solo lectura y `index.html` mide los tiempos con `performance.now()` alrededor de cada llamada. `debug.js` no importa ningún sistema y ningún sistema importa `debug.js`. Apagado cuesta < 0,05 ms; encendido, ≤ 1 ms.
- **Grabador para physics-reviewer** (versionado; parte del primer sub-issue): `tests/helpers/recorder.js` captura por frame posiciones y materiales de las partículas, `η` del campo, piezas y sólidos en JSON. Un visor HTML (`tests/tools/viewer.html`) los reproduce como video, con las capas de arriba. Se basa en el `rec.mjs` y el `viewer.html` del relevamiento. Cada criterio que pide video ([14.16](#1416-criterios-de-aceptación)) graba su escenario con esta herramienta.

## 14.13 Orden en el paso fijo y patrones

**Loop del paso fijo** (`index.html`):

```
players: move / updateStatus
flood.step(roundTime, dt)            emite lluvia (store.create)
buoyancy.apply(dt)                   impulsos en piezas, reacción horizontal y d(x) para el agua
stepWorld(world, instances)
store.afterStep()                    libera los slots de las zombis compactadas en este paso
immersion.step(dt)                   absorbe (deposit + store.destroy) y aplica inmersión
thermal.step(dt)                     contactos, fases, columnas, vapor
mixing.step(dt)                      soluto y viscosidad
adhesion.step(dt)                    películas e impulsos de reacción
water.step(dt)                       Saint-Venant con las fuentes del paso
damage.process(now, water.surfaceAt) daño, mojado, consumo (store.destroy)
golpes
```

Por frame, fuera del paso: `emitter.fire` (`store.create`), `limpiarParticulas` (`store.destroy`) y el render.

**Patrones** (`CLAUDE.md`):

- **Juntar durante el paso, actuar después:** ningún callback crea, destruye ni cambia flags. Todo ocurre después de `stepWorld` (o antes, en `flood` y `buoyancy`).
- **Identidad estable de partículas** (patrón nuevo, [14.2](#142-identidad-estable-de-partículas-particlestore)) e **híbrido campo + partículas** (patrón nuevo): se agregan a la tabla de `CLAUDE.md`.
- **Memoria nativa:** los vectores de trabajo (`b2Vec2` para impulsos, `b2ParticleDef`) se crean en el constructor de cada módulo y se liberan en `dispose()`. Por paso solo hay lecturas y escrituras en `HEAPF32`/`HEAP32`/`HEAPU8`, con punteros releídos.
- **Contrato de RagImporter:** solo se aplican impulsos a cuerpos de las instancias. No se tocan joints, fixtures ni motores, y `lib/` no cambia.
- **Datos en tablas:** `MATERIALS`, `WATER_FIELD`, `SHOT_SYSTEM`, `WEAPONS` y `LEVEL.flood`.

**Módulos y dependencias** (sin ciclos; las hojas no importan nada):

| Módulo | Responsabilidad | Importa |
|---|---|---|
| `js/materials.js` (nuevo, hoja) | `MATERIALS`, `MATERIAL` (ids), `σ_w`, coeficientes | — |
| `js/water.js` (nuevo) | `ShallowWater`, `WATER_FIELD` | `level.js`, `materials.js` |
| `js/particleStore.js` (nuevo, hoja) | Slots, estado por partícula, creación y destrucción | — |
| `js/bodyShapes.js` (nuevo, hoja) | Polígonos locales de fixtures y transformación al mundo | — |
| `js/buoyancy.js` (nuevo) | Flotación, arrastre, reacción y `d(x)` | `materials.js`, `bodyShapes.js` |
| `js/immersion.js` (reescrito) | Absorción e inmersión | `materials.js` |
| `js/contacts.js` (nuevo, hoja) | Lector del buffer nativo de contactos | — |
| `js/thermal.js` (nuevo) | Entalpía, fases, vapor, columnas | `materials.js`, `contacts.js`, `particles.js` (flags) |
| `js/mixing.js` (nuevo) | Soluto, viscosidad, flag `VISCOUS` | `materials.js`, `contacts.js`, `particles.js` |
| `js/adhesion.js` (nuevo) | Películas viscosas sobre cuerpos | `materials.js`, `bodyShapes.js` |
| `js/debug.js` (nuevo) | Panel y capas | — (recibe `stats` por parámetro) |
| `js/flood.js` (cambia) | Fuente de lluvia | `level.js` |
| `js/damage.js` (cambia) | Lee `store` en lugar de `userData` y color | `weapons.js`, `materials.js` |
| `js/particles.js` (cambia) | Suma `WALL` (1 << 2) y `POWDER` (1 << 6) a `PARTICLE` | — |

Los sistemas reciben `water` y `store` por constructor desde la raíz de composición: ninguno los importa.

## 14.14 Qué se borra

| Qué | Dónde | Lo reemplaza | Sub-issue |
|---|---|---|---|
| Sistema del agua del nivel (`fillPool`, `fillPoolWater`, `LEVEL.pool.radius/draw/flags/physics`, `poolSystem`) | `level.js`, `index.html` | Campo de alturas | #62-D2 |
| Puente #39 (grilla, `IMMERSION`, `WEAPONS[].immersion`) | `immersion.js`, `weapons.js` | Absorción e inmersión | #62-D2 |
| Parche #45 (`skinPosition`, `collectSurfaces`, dibujo con círculos del agua del nivel) | `render.js`, `index.html` | `drawWater` | #62-D2 |
| Control de la lluvia (`rainTarget`, `density`, escurrido, `measureSurface`, `RAIN_MARK`, `maxParticles`) | `flood.js`, `level.js` | Fuente por caudal y absorción | #62-D2 |
| `userData` como id de disparo o marca; `tagParticle`; `fluidFromColor` para identificar | `damage.js`, `weapons.js`, `index.html` | `ParticleStore` | #62-B |
| Preset `TENSILE`/`STATIC_PRESSURE`; `pressureStrength` 0,005 | `weapons.js`, `level.js` | Agua pura | #62-C |
| `stickHoney` y `STICKY` | `damage.js`, `ActiveRagdoll.js` | Adherencia y arrastre (D4) | #62-J |
| Tests `water-gap`, `immersion` (puente), bancos 2 y 3 de `fluid-feel` y los de densidad de `flood` | `tests/` | Criterios W, F, I y P | Cada uno en su sub-issue |

## 14.15 Verificaciones contra LiquidFun y el binding

| Afirmación | Cómo se verificó | Estado |
|---|---|---|
| `SetParticleFlags`, `GetParticleFlags`, `GetContactCount`, `GetBodyContacts`, `DestroyParticle`, `GetUserDataBuffer`, `CreateParticle` y `GetMaxParticleCount` existen | Lista de exportaciones de `b2ParticleSystem` en `vendor/liquidfun.js` (18/11) | *Verificado* |
| No existen `GetContacts`, `GetBodyContactCount`, `GetParticleHandleFromIndex` ni `ParticleApplyForce` | Misma lista | *Verificado* |
| Buffer de contactos a +54 palabras (6 por contacto) y de contactos con cuerpos a +58 (7 por contacto) | Relevamiento (`contacts.mjs`, `bodycontacts.mjs`) | Medido; frágil por compilación: se busca y valida al arrancar |
| `WALL` (1 << 2) deja inmóvil a la partícula con `SetParticleFlags` en ejecución | Relevamiento `H` (velocidad máxima de la piedra 0,00 m/s) | *Verificado en ejecución* |
| `POWDER` (1 << 6) | `b2Particle.h` de LiquidFun 1.1 | *Por verificar* en ejecución (#62-H) |
| Masa de partícula = `density · (1,5 r)²` | Relevamiento (`GetBodyContacts().mass`) | *Verificado en ejecución* |
| `b2ParticleSystemDef.set_density` existe | Exportaciones | *Verificado* |
| `ApplyLinearImpulse`, `ApplyAngularImpulse`, `GetLinearVelocityFromWorldPoint`, `GetMass`, `GetWorldCenter`, `GetFixtureList`/`GetShape`/`GetType`, `GetVertex`/`GetVertexCount`, `get_m_p`/`get_m_radius` | Exportaciones | *Verificado* |
| `stepWorld` llama a `world.Step` 8 veces por paso | `lib/ragimporter.js` | *Verificado* |
| `autoClearForces` en `true` | Por defecto en Box2D; `GetAutoClearForces` existe en el build | *Por verificar* en el test de #62-F |
| Compactación estable de zombis al principio de `Solve`, moviendo `userData` | Fuente de LiquidFun 1.1 (no legible en el build) | *Por verificar* en ejecución (criterio S1) |
| Costo de recorrer contactos, de la térmica (0,14 ms con ~1.000 partículas) y de la mezcla (0,038 ms) | Relevamiento `H` e `I` | Medido |
| Separar un radio + estado guardado: pico de 0,6 m/s | Relevamiento `E` | Medido |
| Render ≤ 2 ms hasta ~4.000 círculos con GPU | Relevamiento `F` | Medido |

## 14.16 Criterios de aceptación

Para `physics-reviewer`. Cada criterio tiene referencia, valor esperado y tolerancia. "Video" significa una grabación con el grabador de [14.12](#1412-herramientas-de-debug), revisada sobre la secuencia de frames.

### S. Identidad de partículas (#62-B)

| Id | Criterio | Referencia | Esperado | Tolerancia |
|---|---|---|---|---|
| S1 | Crear 20 partículas, destruir las de índice par, `stepWorld`: el `userData` de las sobrevivientes sigue el orden original y el estado por slot coincide | Contrato de `SolveZombie` (compactación estable) | Igualdad exacta | 0 errores |
| S2 | Destruir y crear en el mismo frame nunca comparte un slot entre una zombi y una viva | Liberación diferida | 0 colisiones en 10.000 ciclos aleatorios con semilla fija | 0 |
| S3 | El comportamiento de daño, el vencimiento y el tope de miel no cambian (tests actuales de #13, #18 y #41 en verde) | Regresión | Mismos resultados | Los de cada test |

### W. Campo de alturas (#62-D1, Node puro)

| Id | Criterio | Referencia | Esperado | Tolerancia |
|---|---|---|---|---|
| W1 | Volumen en un tanque cerrado, 60 s con olas y frentes seco/mojado | Conservación de la masa (esquema conservativo) | `Σ h dx` constante | Error relativo < 0,01 % (más estricto que el 0,5 % del issue) |
| W2 | Lago en reposo sobre el lecho real (escalón de 4 m), 60 s | *Well-balanced* (Audusse et al., 2004) | `u` = 0 y `η` = 3 m | max \|u\| < 10⁻⁸ m/s |
| W3 | Velocidad de una onda chica (a/h = 0,02) con h = 1 m y h = 3 m | `c = √(g h)` | 3,16 y 5,48 m/s | ±10 % (issue); se informa el valor medido |
| W4 | Rotura de presa sobre lecho seco, h₀ = 2 m, sin fricción | Solución de Ritter: frente en `2√(g h₀) t`; perfil `h = (2c₀ − x/t)²/(9g)` | Posición de `h = 0,01 h₀` en `x/t = 1,7 c₀` a t = 1, 2 y 3 s; perfil | Frente ±10 %; error L1 del perfil < 5 % de `h₀ · L` |
| W5 | Rotura de presa sobre lecho mojado (h_L = 2, h_R = 0,5 m) | Solución de Stoker | Velocidad del resalto | ±5 % |
| W6 | Positividad: `h ≥ 0` en todos los pasos de W1–W5 y en el nivel real con lluvia | Propiedad del esquema con CFL 0,25 | min h ≥ 0 | 0 violaciones |
| W7 | Escalares: energía y miel advectadas en el tanque cerrado | Conservación | `Σ E` y `Σ M` constantes | < 0,01 % |
| W8 | Costo de `step` con h = 15 m y flujo de 5 m/s | Presupuesto | < 0,3 ms por paso fijo | Se mide y se anota |

### I. Absorción e inmersión (#62-D2)

| Id | Criterio | Referencia | Esperado | Tolerancia |
|---|---|---|---|---|
| I1 | N partículas de agua caen en la pileta: el volumen del campo crece `N · A_p` | Conservación de la masa | Exacto | Error relativo < 10⁻⁶ |
| I2 | Cantidad de movimiento horizontal absorbida | Conservación | `Δ Σ q dx = Σ SG A_p v_x` | < 10⁻⁶ |
| I3 | 20 gotas en x₀ generan dos frentes de onda | `c = √(g h)` | Frentes a ±√(g h) | ±10 % (video) |
| I4 | Ninguna partícula miscible atraviesa el agua | Absorción | 0 partículas miscibles con `y < η − 2r` más de un paso | 0 |
| I5 | Lava soltada en agua quieta de 3 m | Velocidad terminal `√(2 g (SG − 1) A_p / (C_d D))` | 2,19 m/s | ±15 % |
| I6 | Reacción de la inmersión sobre la columna | Tercera ley de Newton | `Σ` cambios de momento partícula + columna = 0 | < 10⁻⁶ |
| I7 | Inundación: `η` medio sigue la curva `floodLevel(t)` | Fuente = `riseSpeed · W_libre`, conservación | Atraso ≈ tiempo de caída (1,7 s · 0,15 m/s ≈ 0,26 m) | Desvío respecto de la curva corrida 1,7 s: ±0,3 m (video) |
| I8 | Costo total con la inundación al tope, dos robots disparando | Presupuesto | Física ≤ 8 ms; `immersion.step` < 0,3 ms | Se mide y se anota en [09 §9.2](09-arquitectura.md#92-rendimiento-medido) |

### F. Flotación (#62-F)

| Id | Criterio | Referencia | Esperado | Tolerancia |
|---|---|---|---|---|
| F1 | Cajas con SG 0,25, 0,5 y 0,75 en agua quieta, a los 10 s | Arquímedes: fracción sumergida = SG | 0,25 / 0,50 / 0,75 | ±10 % |
| F2 | Círculo con SG 0,5 | Arquímedes | Mitad sumergida | ±10 % |
| F3 | Caja con SG 2 que se hunde | Velocidad terminal `√(2 (SG − 1) g A / (C_d ℓ))` | Según datos | ±15 % |
| F4 | Robot totalmente sumergido en la inundación (más de 5 m de agua), soltado en reposo | Arquímedes con gravedad específica 1,002: fuerza neta = `(m − σ_w A) g` ≈ 0,2 N hacia abajo | Velocidad vertical del centro de masa casi nula; queda con el torso arriba | \|v_y\| < 0,1 m/s a los 5 s; torso por encima de los pies (video) |
| F4b | Mismo robot, con una masa de prueba que lleva la gravedad específica a 0,9 y a 1,1 | Arquímedes | 0,9 sube y flota con 90 % del área sumergida; 1,1 se hunde | Fracción sumergida ±10 % |
| F5 | Reacción horizontal del arrastre | Tercera ley de Newton | `Σ` impulsos sobre cuerpos + cantidad de movimiento agregada al agua = 0 | < 10⁻⁶ |
| F6 | Caja soltada en la superficie: sin crecimiento de energía | Estabilidad del acople | Energía mecánica de la caja no creciente después de 2 s | Sin picos > 1 % sobre la envolvente (video) |
| F7 | `world.GetAutoClearForces()` es `true` | Supuesto de impulsos | `true` | — |

### B. Reacción de los cuerpos sobre el agua (#62-G, recortable)

| Id | Criterio | Referencia | Esperado | Tolerancia |
|---|---|---|---|---|
| B1 | Caja que flota en un tanque cerrado de ancho W | Desplazamiento: sube el nivel `A_s/(W − w)` fuera de la caja | Según datos | ±10 % |
| B2 | Volumen de agua con cuerpos que entran y salen | Conservación | `Σ h dx` constante | < 0,01 % |
| B3 | Caja soltada desde 1 m genera ondas que salen | `c = √(g h)` | Frentes a √(g h) | ±10 % (video) |
| B4 | Robot quieto flotando 60 s | Equilibrio estático | Sin oscilación sostenida de `η` | Amplitud < 1 cm después de 10 s |
| B5 | Estabilidad del acople `d`–`η` | — | Ninguna celda con \|u\| > √(g h) por el acople | 0 (si falla, se recorta a M5) |

### P. Disparos con agua pura (#62-C)

| Id | Criterio | Referencia | Esperado | Tolerancia |
|---|---|---|---|---|
| P1 | Rotura de presa con `SHOT_SYSTEM` dentro de `stepWorld` (8 subpasos), h₀ = 2 m | Ritter: frente a `2√(g h₀)` | ≥ 0,65 × Ritter (≥ −35 %) | Se informa el valor (relevamiento: −20/−35 %) |
| P2 | Sin explosión al crear: chorro horizontal de cada arma durante 0,5 s, con sus carriles | Separación ≥ `1,5 r` | Rapidez máxima ≤ rapidez de boca + 1 m/s | — |
| P3 | Compresión en reposo (tanque de 12 m, 3 m de agua, 8 s) | Incompresibilidad | Densidad 1,00 del empaquetado ideal | ±10 % |
| P4 | Coeficiente de restitución del chorro contra el piso | Impacto de líquido con We ≫ 1: se esparce y no rebota | ≤ 0,2 | — |
| P5 | Chorro de agua contra una placa fija normal | Impacto de chorro: `F = ṁ v` | 544 N (`100 · 12,0 · 0,0324 · 14`) | ±15 % |
| P6 | Costo con 1.500 disparos vivos | Presupuesto | Física ≤ 8 ms con la inundación al tope | Se mide |

### T. Térmica y fases (#62-H)

| Id | Criterio | Referencia | Esperado | Tolerancia |
|---|---|---|---|---|
| T1 | Lava en la pileta, 30 s | Primera ley: `Σ m e + Σ E + E_perdida = E₀` | Constante | < 0,1 % (relevamiento: ~0 %) |
| T2 | Masa en cambios de fase | Conservación | Partículas + volumen de las columnas · `σ_w` constante (salvo el vapor que sale por arriba, contado) | < 10⁻⁶ |
| T3 | Partícula de lava aislada en agua a 20 °C hasta solidificar | Modelo concentrado (enfriamiento de Newton + `L_f`) con los datos `h_b` y `P` | ~2,5 min con `h_b` = 500 | ±10 % del valor analítico con los mismos datos |
| T4 | Columna a 100 °C con aporte de calor Q | Calor latente | Volumen evaporado `Q/(σ_w L_v)` | ±1 % |
| T5 | Ascenso del vapor en aire quieto | Velocidad terminal `√(2 g (ρ_a − ρ_s) A_p / (ρ_a C_d D))` | 1,35 m/s | ±15 % |
| T6 | Agua quieta con dos zonas de 80 °C y 20 °C, sin movimiento | Difusión molecular despreciable a 0,18 m | Cambio < 1 K en 10 s en la interfaz | — |
| T7 | La piedra en reposo queda inmóvil (`WALL`) y la que cae se apila (`POWDER`) | — | v = 0 en reposo; pila con ángulo > 0 (video) | — |
| T8 | Costo con ~1.000 partículas térmicas | Presupuesto | < 0,3 ms por paso | Se mide |

### M. Mezcla (#62-I)

| Id | Criterio | Referencia | Esperado | Tolerancia |
|---|---|---|---|---|
| M1 | Masa de miel en partículas y columnas, 30 s | Conservación del soluto | `Σ m X + Σ ρ_miel M dx` constante | < 10⁻⁶ (relevamiento: 10⁻⁵ %) |
| M2 | Miel quieta en agua quieta | `D_mol` ≈ 10⁻¹⁰ m²/s | `X` medio de la miel original cambia < 1 % en 10 s | — |
| M3 | Asentamiento de una columna de miel (X = 1) | Corriente de gravedad viscosa (Huppert, 1982): `x_f ∝ t^{1/5}` | Exponente ajustado 0,20 | ±0,05 |
| M4 | Frente a 4 s según `X` (0; 0,25; 0,5; 0,75; 1) | Viscosidad monótona en `X` | Estrictamente decreciente | — |

### A. Adherencia (#62-J)

| Id | Criterio | Referencia | Esperado | Tolerancia |
|---|---|---|---|---|
| A1 | Cantidad de movimiento entre partículas y cuerpos | Tercera ley de Newton | `Σ Δp` = 0 | < 10⁻⁶ |
| A2 | Película de miel que escurre por una pared vertical | Película de Nusselt: velocidad media `ρ g δ²/(3 μ_eff)` con el `μ_eff` calibrado en M3 | Según datos | ±30 % (video) |
| A3 | Agua (X = 0) en la misma escena | `μ_agua` / `μ_miel` = 10⁻⁴ | Impulso de adherencia < 1 % del de la miel | — |

### D. Debug (#62-K)

| Id | Criterio | Esperado |
|---|---|---|
| D1 | Conmutables por teclado y gamepad | Panel y cada capa encienden y apagan sin recargar |
| D2 | Costo apagado / encendido | < 0,05 ms / ≤ 1 ms |
| D3 | Los monitores de conservación muestran la misma deriva que los tests W1, T1 y M1 | Coinciden |

### Global

- **Costo con todo al máximo** (inundación al tope, dos robots disparando, térmica activa): física ≤ 8 ms y render de fluidos ≤ 2 ms con GPU, medidos y anotados en [09](09-arquitectura.md#92-rendimiento-medido).
- **Videos** de los escenarios W4, I3, I7, F4, P1, T1 y M3 revisados por `physics-reviewer` y por el usuario.

## 14.17 División en sub-issues y prioridades

Implementación en serie, un agente a la vez. Cada sub-issue deja el juego jugable en `main`.

| Id | Título | Depende de | Milestone | Imprescindible |
|---|---|---|---|---|
| #62-A | Grabador de escenarios para revisión física | — | M2 | Sí (sin video no hay aprobación) |
| #62-B | Identidad estable de partículas (`ParticleStore`) | — | M2 | Sí |
| #62-C | Disparos con agua pura y radio 0,12 m | A, B | M2 | Sí |
| #62-D1 | Módulo `ShallowWater` (Saint-Venant 1D) con tests | A | M2 | Sí |
| #62-D2 | Pileta e inundación como campo de alturas, con absorción e inmersión | B, C, D1 | M3 | Sí |
| #62-F | Flotación de Arquímedes por pieza | D2 | M3 | Sí |
| #62-K1 | Debug básico (panel, columnas, conservación, empuje) | D2 | M3 | No (recomendado) |
| #62-G | Reacción de los cuerpos sobre el agua | F | M4 | No (recortable a M5) |
| #62-H | Térmica y fases | B, D2 | M4 | No (recortable a M5) |
| #62-I | Mezcla por concentración y viscosidad | H | M5 | No |
| #62-J | Adherencia con reacción (retira `STICKY`) | I, F | M5 | No |
| #62-K2 | Debug completo (temperatura, concentración, contactos, vectores) | H | M5 | No |

**Orden de recorte** si algo se atrasa (pasa a M5): G → H → K1. **Mínimo de #62 para la entrega:** A, B, C, D1, D2 y F.

**Afecta a otros issues:** #26 (render metaball: solo partículas), #29 (se integra en K), #30 (lo reemplaza H), #31 (sin cambios), #32 (depende de H), #39 y #45 (reemplazados por D2), #41 (`STICKY` se retira en J) y #23 (charcos del mapa como columnas con `M`, [14.11](#1411-arranque-asentado)).

## 14.18 Decisiones del usuario

Decididas por el usuario (19/11). Ninguna bloquea ya a un sub-issue.

| Id | Tema | Decisión | Efecto en el diseño |
|---|---|---|---|
| D1 | Flotación de los robots | **Neutra:** `σ_w` = 12,0 kg/m², sin tocar las masas del rig | Espesor equivalente de 12,0 mm; robot con gravedad específica 1,00; partícula de agua de 0,389 kg; criterios F4 y F4b ([14.1](#141-unidades-rebanada-2d-y-materiales)) |
| D2 | Empuje del chorro | **Chorro fuerte:** densidad física (`σ_w`) con el caudal y la velocidad actuales; no se baja el empuje | Agua 544 N (4,2 veces el peso del robot); el emisor reparte en carriles paralelos para respetar la separación de `1,5 r`; criterio P5 ([14.6](#146-disparos-con-agua-pura)) |
| D3 | Tiempos térmicos | **Reales, sin escalar** | La lava tarda ~2,5 min en solidificar en el agua; no hay plataformas de piedra temporales dentro de una ronda ([14.8](#148-térmica-y-fases)) |
| D4 | Miel pegajosa | **Se retira el estado `pegado`** cuando llegue la adherencia (#62-J); hasta entonces sigue el temporizador actual de #41 | [14.10](#1410-adherencia) |
| D5 | Charcos en plataformas | **Siguen venciendo a los 6 s**, declarado como regla de presupuesto; los del piso se absorben en el campo | [14.4](#144-absorción-e-inmersión) |
| D6 | Reglas de la pileta | **Se mantienen:** el sensor mata y la pileta no moja antes de la inundación | [14.5](#145-flotación-de-arquímedes-por-pieza) |
