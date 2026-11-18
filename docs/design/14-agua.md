# 14. Agua física: campo de alturas, disparos e intercambios 🔨 #62

Rediseño de los fluidos para que **se simulen** con su física y no se imiten con reglas de juego (pedido del usuario, 18/11). La dirección la eligió el usuario y no se reabre: campo de alturas con Saint-Venant 1D para el agua del nivel, partículas chicas de agua pura para los disparos, absorción de partículas en el campo, flotación de Arquímedes por pieza, térmica con fases, mezcla por concentración, adherencia, arranque asentado y herramientas de debug.

- **Estado:** todo 🔨. Lo que está en `main` sigue descripto en [07-sph](07-sph.md) hasta que cada sub-issue se mergee.
- **Relevamiento medido** (18/11, no versionado): scripts, tablas y videos en el scratchpad del issue. Acá se citan los números usados.
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

**Coeficientes de transferencia** (también en `MATERIALS`): ebullición en película lava↔agua, `h_b` = 500 W/(m²·K) (rango de la literatura 200–1000); convección natural al aire, `h_a` = 10 W/(m²·K); arrastre de presión de cuerpos en el agua por forma de fixture (`MATERIALS.drag`): **caja 2,0** (placa o prisma de caras planas) y **círculo 1,2** (cilindro), en régimen inercial; término viscoso de Lamb `k_μ` = 8 (cilindro 2D, Re bajo). Las partículas inmiscibles usan 1,2 (círculo).

**Límite del motor:** en LiquidFun la masa de partícula es una sola por sistema (`density · A_p`). La lava y la miel empujan a los cuerpos por contacto como si fueran agua (la lava, 2,6 veces menos). Sus masas reales se usan en todo lo que calcula el juego (flotación, inmersión, térmica, mezcla, adherencia). Queda documentado y no se compensa.

## 14.2 Identidad estable de partículas (`ParticleStore`)

**Conflicto.** `DestroyParticle` marca la partícula como zombi y el motor compacta los buffers en el siguiente `Step`: los índices cambian. Hoy el buffer de `userData` guarda dos cosas distintas: el id de disparo (`damage.js`) y la marca de lluvia −1 (`flood.js`). Además, el tipo de fluido se deduce del color (`fluidFromColor`). Con la térmica el color cambia con la temperatura, y la entalpía, la concentración y la fase necesitan arreglos paralelos que sobrevivan a la compactación.

**Resolución:** `userData` guarda **solo un slot estable**, y todo el estado por partícula vive en arreglos de JS indexados por slot.

- **Módulo nuevo `js/particleStore.js`**, clase `ParticleStore(system, params, capacity = system.GetMaxParticleCount())`: recibe los datos del sistema (`params`, por ejemplo `SHOT_SYSTEM`) porque es un módulo hoja y no los importa. Implementado en #68 con `alive`, `kind`, `origin` y `shot`; el resto de los arreglos por slot los agrega cada issue que los usa. Es el **único** que llama a `CreateParticle` y a `DestroyParticle` en el sistema de partículas.
- **Sin destrucción por edad:** `SHOT_SYSTEM` declara `destroyByAge: false` explícito. El constructor de `ParticleStore` recibe esos datos y lanza un error si no es `false`: el build no expone `GetDestructionByAge` para leerlo del sistema (*verificado* en la lista de exportaciones). Con la destrucción por edad activa, el motor borraría partículas por su cuenta al llenarse y los slots quedarían colgados.
- **Codificación:** `userData = slot + 1`. El 0 queda para "sin slot" (el valor con que el motor inicializa el buffer): una partícula con 0 es un error de programación, que el debug cuenta y muestra.
- **Estado por slot** (arreglos tipados creados en el constructor, fuera del heap de 16 MiB):

  | Arreglo | Tipo | Unidad | Contenido |
  |---|---|---|---|
  | `alive` | `Uint8Array` | — | 1 vivo, 0 destruido (zombi o libre) |
  | `evaporated` | `Float32Array` | — | Fracción evaporada `φ` ([14.7b](#147b-evaporación-de-agua-detenida-d7)) |
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
- **Aproximación de Boussinesq:** la densidad de la mezcla (`ρ_col = ρ_w (1 + (SG_miel − 1) X_v)`) entra en el empuje sobre cuerpos y partículas, pero no en la dinámica de la columna. El error es chico mientras la miel sea una fracción pequeña del agua; si una columna es casi toda miel, se nota en la velocidad de las ondas. **Consecuencia:** en el campo, `M` es un **trazador pasivo** promediado en la vertical. La miel absorbida se reparte en toda la columna: no se hunde ni se estratifica, y no genera corrientes de densidad. Queda documentado.
- **Fuentes del paso** `s_h`, `s_q`, `s_E`, `s_M`: absorción ([14.4](#144-absorción-e-inmersión)), reacción del arrastre sobre cuerpos ([14.5](#145-flotación-de-arquímedes-por-pieza)) y evaporación ([14.8](#148-térmica-y-fases)). Se acumulan en arreglos durante el paso y se aplican al principio de `step` (separación de operadores de Lie).

### Esquema numérico

- **Flujo HLL** (Harten–Lax–van Leer). Velocidades de onda:
  - entre estados mojados, las de Einfeldt;
  - con un lado seco, las de Toro (*Shock-Capturing Methods for Free-Surface Shallow Flows*, 2001): si `h_R = 0`, `S_L = u_L − c_L` y `S_R = u_L + 2 c_L`; si `h_L = 0`, `S_L = u_R − 2 c_R` y `S_R = u_R + c_R` (`c = √(g h)`).
- **Reconstrucción hidrostática** (Audusse, Bouchut, Bristeau, Klein y Perthame, *SIAM J. Sci. Comput.* 25(6), 2004). Es *well-balanced*: el lago en reposo sobre el escalón de 4 m de la pileta queda exactamente quieto, y conserva la positividad de `h` en los frentes seco/mojado. Con `B = b + d` (lecho más desplazamiento por cuerpos, [14.5](#reacción-de-los-cuerpos-sobre-el-agua-recortable)) y los valores reconstruidos en las caras (`h_{i+1/2−}` es el lado izquierdo de la cara `i+1/2`):
  - **en cada cara:** `B*_{i+1/2} = max(B_{i+1/2−}, B_{i+1/2+})`, `h*_{i+1/2±} = max(0, h_{i+1/2±} + B_{i+1/2±} − B*_{i+1/2})` y `U* = (h*, h* u)`;
  - **actualización de la celda** (Audusse 2004, §3, segundo orden):

    ```
    U_i ← U_i − (Δt/Δx) [ F⁻_{i+1/2} − F⁺_{i−1/2} − Sc_i ]
    F⁻_{i+1/2} = F_HLL(U*_{i+1/2−}, U*_{i+1/2+}) + (0, g/2 · (h²_{i+1/2−} − h*²_{i+1/2−}))
    F⁺_{i−1/2} = F_HLL(U*_{i−1/2−}, U*_{i−1/2+}) + (0, g/2 · (h²_{i−1/2+} − h*²_{i−1/2+}))
    Sc_i       = (0, −g · (h_{i−1/2+} + h_{i+1/2−})/2 · (B_{i+1/2−} − B_{i−1/2+}))
    ```

    `Sc_i` es el término fuente centrado que da el segundo orden; con reconstrucción constante (orden 1) se anula.
- **Segundo orden:** reconstrucción MUSCL con limitador minmod sobre `h` y `η` (la cara usa `B = η − h`) y sobre `u`, más integración temporal SSP-RK2 (Heun).
- **Positividad:** el minmod sobre `h` deja `h` ≥ 0 en las caras. En las celdas secas y en las que tienen una vecina seca se usa **orden 1** (reconstrucción constante).
- **Seco/mojado:** `h_dry` = 10⁻³ m. Por debajo, `q` = 0. La velocidad se desingulariza como en Kurganov y Petrova (2007): `u = 2 h q / (h² + max(h², h_dry²))`.
- **Escalares** `E` y `M`: flujo upwind según el signo del flujo de masa HLL de la cara. Es conservativo: lo que sale de una celda entra en la vecina.
- **Dispersión (limitación declarada):** Saint-Venant es no dispersivo y vale para ondas largas (`kh ≪ 1`). Contra la teoría lineal de Airy, `c = √(g tanh(kh)/k)`, la velocidad de fase queda sobreestimada en `1 − √(tanh(kh)/kh)`: 1,6 % con `kh` = 0,31 (λ = 20 h), **4 %** con `kh` = 0,5 y **13 %** con `kh` = 1. Las ondas cortas (salpicaduras, ondas de menos de ~6 h) viajan más rápido que en la realidad. W3 se mide con λ ≥ 20 h, y W9 informa la desviación contra Airy.

### Paso, estabilidad y bordes

- **Un `step(dt)` por paso fijo** (dt = 1/60 s), con subpasos internos por CFL:
  - `n = ceil(dt · S_max / (CFL · dx))`, con `S_max` el máximo de `|S_L|` y `|S_R|` sobre todas las caras (las mismas velocidades de onda del flujo HLL);
  - `CFL` = **0,25** (cota de positividad para MUSCL con SSP-RK2);
  - si una etapa de RK2 da `h < 0` en alguna celda, el subpaso se repite con `dt/2` y el debug lo cuenta.
- **Tope de subpasos:** `n ≤ 32`. Se dimensiona con una velocidad máxima física fija, `u_max` = 2√(g h_max) ≈ **24,5 m/s** (h_max = 15 m, la velocidad del frente de Ritter): con `S_max` ≤ `u_max` hacen falta 17 subpasos, así que 32 deja margen. Si igual se llega al tope, se recorta `|u|` a `u_max` (no a `√(g h)`), y cada activación se cuenta y se informa en el debug. En W1–W6 se exige **0 activaciones**.
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
  | Energía térmica | `m · e` más solo la **pérdida inelástica** del choque: `½ m v² − ΔK_col`, con `ΔK_col` el cambio de energía cinética de las dos columnas al recibir la cantidad de movimiento horizontal (choque plástico). A 25 m/s son ≤ 0,07 K, pero cierra el balance de T1 | J |
  | Miel | `A_p · X_v` (fracción en volumen de la partícula) | m² |

- **Volumen por partícula:** `A_p / dx` = **0,32 m** de altura de agua si cae entera en una celda (repartida entre dos celdas, menos en cada una). Una gota es un montículo de ese tamaño, que el campo reparte como dos ondas.
- **Cantidad de movimiento vertical:** el modelo hidrostático no la resuelve, y **no genera ola**. Se transfiere al lecho como impulso de presión y se registra en el debug. La **salpicadura es la ola** que genera el volumen agregado: dos frentes a ±√(g h).
- **Evaporación previa** ([14.7b](#147b-evaporación-de-agua-detenida-d7)): si la partícula ya se evaporó en parte (fracción `φ`), deposita `A_p (1 − φ)` de volumen y la masa, la cantidad de movimiento y la energía en la misma proporción.
- Después de depositar, `store.destroy(i)`.
- **Ácido:** se absorbe como volumen y pierde su identidad (deja de dañar). Un trazador de ácido por columna queda para M5 (💬).
- **Charcos y gotas sobre plataformas:** no se absorben hasta que caen al campo. Escurren por física, se juntan con otros y se evaporan según su superficie expuesta (D7, [14.7b](#147b-evaporación-de-agua-detenida-d7)). D7 reemplaza al vencimiento de 6 s de D5 para el agua y el ácido; D5 queda solo para la lava hasta #75 ([14.18](#1418-decisiones-del-usuario)).

### Inmersión (materiales inmiscibles: lava, piedra, vapor recién creado)

Para cada partícula con `y < η(x)`, sea `ρ_col = densityAt(x)` y `u_c = velocityAt(x)`:

- **Empuje de Arquímedes** sobre la partícula: `a_b = g · ρ_col / (ρ_w · SG_p)` hacia arriba. La gravedad la aplica el motor.
- **Arrastre hacia la corriente:** `ẋ` se relaja hacia `(u_c, 0)` con el coeficiente cuadrático `k = ½ ρ_col C_d D |v − u_c| / (SG_p ρ_w A_p)` (`D` = 1,5 r), integrado en forma exacta en el paso (`v ← u_c + (v − u_c) / (1 + k dt)`), sin sobrecorrección.
- **Reacción:** `addMomentum` suma a la columna `−SG_p A_p Δv_x / dx`. La cantidad de movimiento horizontal se conserva entre partícula y columna.
- **Tope por masa reducida:** el impulso del arrastre sobre el par partícula–columna cumple `|J| ≤ m_red |v_r|`, con `m_red = m_p m_col / (m_p + m_col)` y `m_col = σ_w h_i dx`. Así ni la partícula ni una columna muy delgada invierten su velocidad relativa en el paso.
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
  3. **empuje de Froude–Krylov** (presión hidrostática del agua no perturbada): `F_i = ρ_col,i g A_i b · (−∂η/∂x |_i, 1)`, aplicado en `c_i`. La componente vertical es Arquímedes; la horizontal es la del gradiente de la superficie (una pieza en una ola es empujada por la pendiente). La suma reproduce el empuje total y su momento (par adrizante);
  4. **arrastre de presión por arista:** para cada arista **original** del polígono que queda sumergida (no las aristas artificiales del corte con la superficie ni con las franjas), con normal exterior `n̂`, largo sumergido `ℓ` y velocidad relativa `v_r` en su punto medio (`GetLinearVelocityFromWorldPoint` menos `(u, 0)` de su columna):

     ```
     dF = −½ ρ_col C_d (n̂·v̂_r)₊ ℓ |v_r| v_r · b
     ```

     aplicado en el punto medio de la arista. Solo cuentan las aristas que enfrentan el flujo (`(n̂·v̂_r)₊`). Así, el largo frontal integrado es el ancho proyectado de la pieza, sin sobrecontarlo por franjas, y el amortiguamiento angular sale solo. `C_d` es por forma (`MATERIALS.drag`: caja 2,0, círculo 1,2; con esta integral, el `C_d` de la forma completa coincide con el de la literatura). Se suma un término viscoso `−k_μ μ_col v_r b` en el centroide sumergido (régimen de Re bajo, miel);
  5. se acumulan el impulso total `J = Σ F dt` y el impulso angular respecto del centro de masa, y se aplican **una vez por pieza** con `ApplyLinearImpulse(J, centro)` y `ApplyAngularImpulse`;
  6. **tope por masa reducida** en cada franja: `|J_arrastre,i| ≤ m_red |v_r,i|`, con `m_red = m_pieza m_col / (m_pieza + m_col)` y `m_col = σ_w h_i dx`. Ni la pieza ni la columna invierten su velocidad relativa en el paso.
- **Por qué impulsos y no fuerzas:** `stepWorld` llama a `world.Step` 8 veces (*verificado* en `lib/ragimporter.js`) y Box2D borra las fuerzas después de cada `Step` (`autoClearForces`, que vale `true` por defecto; *a verificar* en el test con `world.GetAutoClearForces()`, que el build expone). Una fuerza aplicada antes de `stepWorld` actuaría solo 1/8 del paso. Este dato se agrega a la regla de paso fijo de `CLAUDE.md`.
- **Estabilidad del acople explícito:** la rigidez del empuje de una pieza es `k = σ_w g w_flotación`. El caso más rígido es el torso (w ≈ 0,48 m, 1 kg): con `σ_w` = 12,0, k = 57,6 N/m y ω = √(k/m) ≈ 7,6 rad/s, así que ω·dt ≈ 0,13 ≪ 2. Es estable con un impulso por paso. Se descartó aplicar el empuje en cada subpaso colando un objeto con `update(dt)` en la lista de `stepWorld`: funciona, pero depende de un detalle de RagImporter que no está en su contrato.
- **Masa agregada:** no se modela. No cambia el equilibrio, pero el período de oscilación de una pieza que flota queda más corto que el real (para un cilindro, la masa agregada es igual a la masa desplazada). Queda documentado.
- **Reacción horizontal:** `water.addMomentum(i, −J_arrastre,x / (σ_w dx))` en cada franja: la cantidad de movimiento horizontal se conserva entre cuerpos y agua.
- **Volumen del robot:** es la suma de las áreas de las fixtures, **con los solapes** de las articulaciones (1,08 m²). Es la misma convención de la flotación, que recorta cada fixture por separado, así que la gravedad específica de 1,00 es consistente con el empuje que se aplica.
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

**Un solo sistema de partículas líquidas** (`SHOT_SYSTEM` en `js/weapons.js`, creado con `createParticleSystem`). Lleva disparos, lluvia, vapor y piedra, para que todos se toquen (contactos partícula↔partícula para la térmica y la mezcla). **Los gases de #16 (fuego, viento) también van en este sistema**, no en uno propio. La gravedad es una sola por sistema, así que la "gravedad negativa" del diseño viejo se reemplaza por el mismo modelo del vapor ([14.8](#148-térmica-y-fases)): empuje de Arquímedes en el aire, `+g ρ_a/ρ_gas`, más arrastre cuadrático en aire, escritos en el buffer de velocidades. El fuego es gas caliente (aire a ~800 °C, `ρ` ≈ 0,33 kg/m³): sube con su empuje y se apaga cuando su entalpía baja de la temperatura de llama, por enfriamiento al ambiente o por contacto con agua (lo calcula la térmica de #75). Su vida no la controla el motor (`destroyByAge` es `false`): `ParticleStore` destruye la partícula cuando se apaga o, como tope de presupuesto, a los `MATERIALS.fire.maxLife` s (dato, 0,6 s). Así fuego y vapor se tocan con el agua y entran en la conservación de energía. Antes de #75, el fuego sube con su empuje y vence por `maxLife`.

| Parámetro | Valor | Antes | Por qué |
|---|---|---|---|
| `radius` | **0,12 m** (respaldo 0,15) | 0,1 | Relevamiento: con 0,12 entra en memoria y costo; con ≤ 0,10, la inundación en partículas no entraba. Ahora la inundación no es partículas |
| `maxCount` | **3.000** | 1.500 | Disparos vivos (con los caudales de D2, ≤ ~600 entre los dos jugadores) + miel persistente (300) + lluvia en vuelo (~450, ver [14.7](#147-inundación-con-lluvia-absorbida)) + agua retenida en plataformas (tope de diseño 800, ver I7 y [14.7b](#147b-evaporación-de-agua-detenida-d7)) + vapor (tope 300) + piedra: ~2.500. El heap de 16 MiB admite ~30.000 |
| `destroyByAge` | **`false`** (explícito) | `false` | El motor no borra partículas por su cuenta; lo verifica `ParticleStore` ([14.2](#142-identidad-estable-de-partículas-particlestore)) |
| `density` | **`σ_w` = 12,0 kg/m²** (0,389 kg por partícula) | 1 (por defecto) | Masa física de la partícula de agua, coherente con la flotación ([D1, D2](#1418-decisiones-del-usuario)) |
| `dampingStrength` | **0,5** | 1,0 | Relevamiento (`D4`): con 0,5 y presión 0,1, temblor 0,064 m/s, densidad 1,00–1,09 y frente −27 % |
| `pressureStrength` | **0,1** | 0,005 | Incompresibilidad: densidad en reposo ≈ 1,0 del empaquetado ideal |
| tensiones superficiales | **0** | 0 | A 0,24 m de diámetro, la tensión superficial real es despreciable (número de Bond ≫ 1) |
| `viscousStrength` | **0,6** (a medir) | 1,0 | Solo actúa en partículas con `VISCOUS` (miel con `X ≥ 0,6`, [14.9](#149-mezcla-por-concentración-y-viscosidad)). Valor del relevamiento `J` |
| flags del agua, el ácido y la lluvia | **0** | `TENSILE` | Agua pura |
| flags de la miel | `VISCOUS` según `X` | `VISCOUS` | [14.9](#149-mezcla-por-concentración-y-viscosidad) |
| flags de la lava | **0** | `TENSILE \| VISCOUS` | La lava se diferencia por material (`SG` 2,6, temperatura), no por un preset viscoso |

- **Separación al emitir (arranque sin explosión):** dos partículas del mismo chorro nacen separadas al menos `1,5 r` (0,18 m), el paso de empaquetado. El emisor las separa `speed / rate` a lo largo del chorro, en **un solo carril**, así que cada arma cumple **`rate ≤ speed / (1,5 r)`**: agua y ácido a 14 m/s ≤ 77/s; lava a 10 m/s ≤ 55/s; miel a 18 m/s ≤ 100/s. Los caudales de D2 (abajo) cumplen todos, y el emisor no necesita carriles paralelos. `MUZZLE_OFFSET` sigue en `r + 0,05`.
- **Empuje del chorro:** el flujo de cantidad de movimiento es `ṁ v = rate · σ_w · A_p · v`. **Empuje balanceado por caudal** (decidido, [D2](#1418-decisiones-del-usuario)). La densidad sigue siendo física (`density` = `σ_w` = 12,0). Con el caudal y la velocidad de hoy, el agua empujaría 544 N (4,2 veces el peso del robot), y el usuario lo descartó. Criterio:

1. **Se conserva la velocidad de cada arma**, que fija el alcance y el arco (la miel a 18 m/s se eligió en #41 por alcance).
2. **Se baja el caudal a la mitad en todas las armas.** El agua queda en ~270 N (la referencia del usuario), y el resto conserva su proporción de empuje respecto del agua.
3. **Un solo carril:** cada caudal cumple `rate ≤ speed / (1,5 r)`.
4. **Los tanques se escalan con el caudal** para conservar la duración del chorro (`tank = rate × duración actual`). El daño por partícula `dps / rate` se duplica solo, así que el DPS no cambia.

| Arma | Caudal | Velocidad | Empuje `ṁ v` | Veces el peso del robot (130 N) | Carriles | Tanque (duración) |
|---|---|---|---|---|---|---|
| Agua | 50/s (antes 100) | 14 m/s | **272 N** | 2,1 | 1 (tope 77/s) | 150 (3 s) |
| Ácido | 45/s (antes 90) | 14 m/s | 245 N | 1,9 | 1 (tope 77/s) | 68 (1,5 s) |
| Lava | 30/s (antes 60) | 10 m/s | 117 N (con masa de agua: límite del motor, [14.1](#141-unidades-rebanada-2d-y-materiales)) | 0,9 | 1 (tope 55/s) | 45 (1,5 s) |
| Miel | 25/s (antes 50) | 18 m/s | 175 N | 1,35 | 1 (tope 100/s) | 38 (1,5 s) |

**Empuje con la masa del motor:** LiquidFun usa una sola masa de partícula por sistema (la del agua). Por eso los empujes de la tabla, que son los que se miden en P5, son los del motor para todas las armas. Con la masa física de cada material serían: ácido 257 N (`SG` 1,05), miel 248 N (`SG` 1,42) y lava 304 N (`SG` 2,6). Es la limitación declarada en [14.1](#141-unidades-rebanada-2d-y-materiales).

`ṁ v = rate · σ_w · A_p · v`, con `σ_w · A_p` = 0,389 kg. Hoy el agua empuja 31,5 N. El empuje sigue siendo físico; lo que se balancea es el caudal. Sigue siendo un chorro que puede sacar a un robot de una plataforma: si en el navegador resulta excesivo, el próximo paso es bajar más el caudal, no la densidad. `PERSIST_MAX` (300) queda como tope de presupuesto aunque el tanque de miel baje a 38.
- **Qué se borra en #69:** `TENSILE` de los datos de armas. `PARTICLE.STATIC_PRESSURE` del agua del nivel se borra en #71, junto con el resto del agua en partículas. El banco 1 de #40 se conserva con criterios físicos (P2–P4).

## 14.7 Inundación con lluvia absorbida

`js/flood.js` (`Flood`) pasa a ser **solo la fuente de masa**: emite gotas en el sistema líquido con `store.create(..., { kind: WATER, origin: RAIN })`. Las gotas caen como partículas, y al tocar el campo se absorben ([14.4](#144-absorción-e-inmersión)).

- **El emisor no impone el nivel.** El caudal sale de la curva de diseño: `Q(t) = riseSpeed · W_libre(nivel(t))` (m²/s), con `W_libre` del ancho libre que ya calcula `waterArea`, y emite `Q / A_p` partículas por segundo con crédito acumulado, en las mismas x de baja discrepancia. El nivel resulta de la conservación de la masa. Se corta cuando `η` medio ≥ `maxLevel`.
- **Caudal:** 93/s mientras el agua está bajo las islas (W = 20 m) y ~255/s por encima (W ≈ 55 m). La caída de 27,5 m dura 1,7 s, así que hay ~430 gotas en vuelo. Por presupuesto, `maxRate` = 300/s.
- **Se borra:** `rainTarget`, `density`, `drainHeight`/`drainSpeed` (el "escurrido" que destruía gotas quietas era una imitación: ahora los charcos de las plataformas escurren por el borde o quedan como partículas), `measureSurface`/`surfaceAt` (lo da el campo), `RAIN_MARK`, `maxParticles` y el uso de `fillPoolWater` en `reset()`. `reset()` llama a `water.reset()`, y la raíz de composición destruye las partículas con `store.reset()`.
- **Se conserva:** `floodLevel(t)` (curva de diseño y HUD), `waterArea` y la regla "antes de `start` no moja" (`Flood.level` = −∞).
- **Nota de realismo:** subir 0,15 m/s equivale a 540 m de lluvia por hora. La intensidad es un evento de juego; la acumulación, el escurrido y las olas son físicos.
- **Lluvia retenida en plataformas:** las plataformas cubren ~38 m de los 54 m de ancho de la lluvia (la unión de sus tramos en x), así que una parte grande de las gotas cae primero sobre una plataforma. Ahí siguen como partículas (D7): escurren por los bordes por física, se juntan con otras y, si llegan al campo, se absorben. Mientras están en la plataforma, ese volumen no está en el campo, así que el nivel sube más lento que la curva. I7 compara el **volumen total** (campo + partículas · `A_p` + evaporado) contra la curva e informa aparte lo retenido. Las partículas retenidas entran en el presupuesto de `maxCount` (tope de diseño: 800, medido en I7).

## 14.7b Evaporación de agua detenida (D7)

Decisión del usuario D7: las gotas y charcos que no llegan al campo (plataformas, paredes, robots) se evaporan con una tasa proporcional a su superficie expuesta. Una gota suelta desaparece en segundos y un charco grande aguanta mucho más.

- **Módulo nuevo `js/evaporation.js`.** Usa `js/contacts.js` (el buffer de contactos partícula↔partícula y también el de contactos partícula↔cuerpo, que el relevamiento ubicó a +58 palabras con 7 palabras por contacto; se busca y valida igual que el otro) y `ParticleStore`.
- **A qué partículas aplica:** agua y ácido (el ácido diluido es casi todo agua) de cualquier origen, con `|v| < 1 m/s` ("agua detenida"). La lluvia y los chorros en vuelo no se evaporan: si lo hicieran, el caudal que llega al campo dejaría de ser el de la curva. La miel, la lava y la piedra no se evaporan.
- **Variable de estado:** `store.evaporated[slot]` = `φ` ∈ [0, 1], la fracción de la masa de la partícula que ya se evaporó.
- **Fracción expuesta del contorno:** `f = clamp(1 − (W_pp + W_pb) / W_full, 0, 1)`. `W_pp` es la suma de pesos de sus contactos con otras partículas, `W_pb` la de sus contactos con cuerpos, y `W_full` la suma de pesos de una partícula interior en agua en reposo, que se mide una vez en el banco P3 y queda como dato. Una partícula rodeada tiene `f` ≈ 0; una gota sola sobre una plataforma tiene `f` < 1 por su apoyo.
- **Ecuación:**

  ```
  dφ/dt = F_evap · e_r · f · P / A_p
  ```

  - `e_r` = 3,5·10⁻⁸ m/s es la tasa real de evaporación de agua quieta al aire (~3 mm por día, orden de magnitud de referencia);
  - `P` = 0,638 m es el perímetro del círculo de área `A_p`;
  - `F_evap` = **3·10⁵** es el **factor de aceleración**, una aproximación nombrada (`MATERIALS.water.evaporationScale`). La tasa real es de milímetros por día y no se vería en una ronda. Con este valor, una gota totalmente expuesta (`f` = 1) dura `A_p / (F_evap e_r P)` = **4,8 s**.
- **Remoción discreta:** cuando `φ ≥ 1`, `store.destroy(i)`. Mientras tanto, la partícula sigue en el motor con su masa entera (LiquidFun no deja achicarla), pero los monitores cuentan `m (1 − φ)` como agua y `m φ` como evaporada.
- **Energía:** el calor latente `L_v · m dφ` lo aporta el aire ambiente y se contabiliza en `E_perdida` con signo negativo. La partícula no se enfría por evaporar: el aire se toma como reservorio. Es una simplificación declarada. En los monitores, la energía de la partícula se cuenta como `m (1 − φ) e`, la que sale como vapor como `m φ e_v` (con `e_v = e + L_v`) y se mantiene `−L_v m φ` en `E_perdida`: el balance cierra por construcción, porque `m (1 − φ) e + m φ (e + L_v) − L_v m φ = m e`.
- **Predicción para un charco:** al inicio, el tiempo de vida de un charco de N partículas es `τ_N = N A_p / (F_evap e_r P Σ f_i)`. Solo evaporan las partículas de la superficie y los bordes, así que `τ_N / τ_1 = N f_1 / Σ f_i` y crece con el espesor del charco. A medida que se evapora la capa de arriba, las de abajo quedan expuestas, y la predicción se toma como tasa inicial.
- **Paso:** una vez por paso fijo, después de `immersion.step`. Costo: un recorrido de los contactos (ya medido en 0,05–0,2 ms) y uno de las partículas detenidas.
- **Relación con D5:** reemplaza el vencimiento de 6 s para el agua y el ácido ([14.18](#1418-decisiones-del-usuario)).

## 14.8 Térmica y fases

**Módulos:** `js/thermal.js` (nuevo), que usa `js/contacts.js` (nuevo, lector del buffer nativo de contactos; lo introduce #73, la evaporación). La energía de las columnas vive en `ShallowWater` (`E[i]`).

**Límite del modelo concentrado:** cada partícula tiene una sola temperatura. Con lava, el número de Biot es `Bi = h_b L / k` ≈ 17 (`L` = 0,05 m, la mitad del radio equivalente), así que el perfil interno real no es uniforme: la costra se enfría en segundos y el núcleo sigue fundido. El modelo da el balance de energía y el tiempo medio de solidificación, pero no el perfil interno ni la costra. Queda declarado.

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
  - vapor, por arrastre de aire de la pluma (hipótesis de *entrainment* de Morton, Taylor y Turner, 1956): `Q = λ m c_v (T − T_a)`, con `λ = 2 α w / R` (térmico lineal 2D):
    - `α` = 0,10 es el coeficiente de arrastre de aire de Morton–Taylor–Turner (rango de la literatura 0,07–0,13);
    - `w` es la velocidad de ascenso de la parcela;
    - `R = √(ρ_w A_p / (π ρ_s))` ≈ 4,1 m es el radio del volumen real de vapor que representa la parcela (1.600 veces `A_p`).
    - Con `w` = 1,35 m/s da `λ` ≈ 0,066 1/s (τ ≈ 15 s). Criterio T9.
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
- **Qué reemplaza:** la diferencia entre miel y agua deja de depender solo de `viscousStrength` del sistema. La miel que cae al agua se absorbe con su soluto y **se diluye en la columna como trazador pasivo**. Por la aproximación de Boussinesq ([14.3](#ecuaciones)), en el campo **no se hunde ni se estratifica**: el hundimiento de la miel solo existe mientras es partícula (inmersión con su `SG`), antes de tocar la superficie. Es una limitación declarada del modelo promediado en la vertical, y una diferencia con el pedido original ("se hunde y diluye por columna"): dentro de la columna, el hundimiento no se resuelve.

## 14.10 Adherencia

**Módulo nuevo `js/adhesion.js`.** Usa `js/bodyShapes.js` y `store`.

- **Detección por cercanía:** `GetBodyContacts` no alcanza, porque las partículas en reposo quedan a ~1,65 radios y el build no expone el conteo (*verificado*). Las partículas a menos de `δ_max` = `2 r` de la superficie de una pieza (distancia punto-polígono en JS, filtrada por las cajas de `fixtureBoxes()`) forman una película.
- **Fuerza viscosa de película** sobre la velocidad relativa en el punto más cercano, `v_r = v_p − v_cuerpo(punto)`:
  - **tangencial:** esfuerzo de corte de película `τ = μ(X) v_t / δ`, con `δ` la distancia a la superficie (acotada a ≥ 0,25 r);
  - **normal**, solo al separarse: resistencia viscosa a la separación (adhesión de Stefan), con el mismo `μ(X)/δ` y un factor geométrico dato.
  - El impulso sobre la partícula se integra en forma exacta (no invierte `v_r`). El impulso opuesto va al cuerpo (`ApplyLinearImpulse` en el punto, con vectores de trabajo reutilizados), así que la cantidad de movimiento se conserva.
- **Escala:** con `μ_agua` el efecto es nulo (el agua no se pega); con la miel, la película escurre por una pared y frena a un cuerpo que la atraviesa. Relevamiento `J`: la miel escurre a ~0,2 m/s, y una caja que entra a 6 m/s en miel queda en 0,87 m/s a los 0,5 s, contra 3,47 m/s en agua (con constantes no calibradas).
- **Calibración:** se usa `μ_miel` = 10 Pa·s, sin ajustarla, y un factor geométrico nombrado `filmFactor` (`MATERIALS.honey.filmFactor`) para la película. El factor se **mide**: se ajusta en un escenario de corte de Couette (una placa que se desliza sobre una capa de miel de espesor conocido, esfuerzo `τ = μ v / δ`) y se valida en otro escenario independiente, el escurrido por una pared (A2). No se calibra con M3, que mide otra cosa (la viscosidad de LiquidFun entre partículas).
- **Qué reemplaza** (decidido, [D4](#1418-decisiones-del-usuario)): `DamageSystem.stickHoney` y la regla de juego `STICKY` de #41 (estado `pegado` con velocidad ×0,1) **se retiran en este sub-issue (#77)**, cuando cumple A1–A2. Hasta entonces sigue el temporizador actual: `stickHoney` sigue con `store.kind` y suma la consulta de columnas con `X_v ≥ 0,5` bajo `lowestPoint()`, porque la miel absorbida en el piso deja de ser partícula.

## 14.11 Arranque asentado

- **Agua del nivel:** el lago en reposo es solución exacta del esquema *well-balanced* ([14.3](#paso-estabilidad-y-bordes)), así que no hace falta asentar nada (criterio W2).
- **Chorros:** separación de `1,5 r` entre partículas del mismo chorro ([14.6](#146-disparos-con-agua-pura)).
- **Vapor:** nace a `1,5 r` sobre la superficie de su columna.
- **Grupos de partículas iniciales** (charcos del mapa, #23): se crean **separados un radio** del piso, las paredes y los cuerpos, y desde un **estado asentado guardado**: posiciones y velocidades tras 5 s, generadas por un script de `tests/tools/` y guardadas como datos del nivel. Relevamiento `E`, r = 0,12: el pico de velocidad baja de 11,7 m/s (apoyada, como hoy) a 3,6 m/s (separada un radio) y a **0,6 m/s** (asentada y guardada). Con la absorción en el piso, un charco de miel del mapa sobre las islas es una **columna con `M` inicial**, no partículas: #23 se simplifica.

## 14.12 Herramientas de debug

**Módulo nuevo `js/debug.js`**, que integra el panel de métricas de #29. Es una herramienta de desarrollo, no una mecánica: se conmuta con teclado (F3 el panel, F4 el modo de capa) y con L3 + R3 en el gamepad (juntos encienden y apagan el panel; mantenidos 1 s pasan a la capa siguiente). El atajo anterior, Select + LB, chocaba con la pausa y la rueda ([10.5](10-controles.md#105-debug)). No viola "gamepad primero" porque no es una mecánica.

- **Panel:** partículas por material y por origen, slots libres y pendientes, offset del buffer de contactos, ms por subsistema (`flood`, `buoyancy`, `stepWorld`, `immersion`, `thermal`, `mixing`, `adhesion`, `water`, `damage` y el render de fluidos), subpasos CFL del campo y FPS.
- **Monitores de conservación:** volumen de agua (columnas + partículas · `A_p (1 − φ)` + evaporado + vapor), pérdidas por fricción y por el `q` = 0 de las celdas secas, activaciones del tope de subpasos y repeticiones con `dt/2`, energía (`Σ m (1 − φ) e` + `Σ m φ e_v` + `Σ E` + `E_perdida`) y miel (`Σ m X` + `Σ ρ_miel M dx`), con su deriva desde el inicio de la ronda.
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
evaporation.step(dt)                 agua detenida: φ por superficie expuesta (D7)
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
| `js/evaporation.js` (nuevo) | Evaporación de agua detenida (D7) | `materials.js`, `contacts.js` |
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
| Sistema del agua del nivel (`fillPool`, `fillPoolWater`, `LEVEL.pool.radius/draw/flags/physics`, `poolSystem`) | `level.js`, `index.html` | Campo de alturas | #71 |
| Puente #39 (grilla, `IMMERSION`, `WEAPONS[].immersion`) | `immersion.js`, `weapons.js` | Absorción e inmersión | #71 |
| Parche #45 (`skinPosition`, `collectSurfaces`, dibujo con círculos del agua del nivel) | `render.js`, `index.html` | `drawWater` | #71 |
| Control de la lluvia (`rainTarget`, `density`, escurrido, `measureSurface`, `RAIN_MARK`, `maxParticles`) | `flood.js`, `level.js` | Fuente por caudal y absorción | #71 |
| `userData` como id de disparo o marca; `tagParticle`; `fluidFromColor` para identificar | `damage.js`, `weapons.js`, `index.html` | `ParticleStore` | #68 |
| Preset de los disparos (`TENSILE`, `pressureStrength` 0,005) | `weapons.js` | Agua pura | #69 |
| `STATIC_PRESSURE` y fuerzas del agua del nivel (`LEVEL.pool.flags`/`.physics`) | `level.js` | Campo de alturas | #71 |
| `stickHoney` y `STICKY` | `damage.js`, `ActiveRagdoll.js` | Adherencia y arrastre (D4) | #77 |
| Tests `water-gap`, `immersion` (puente), bancos 2 y 3 de `fluid-feel` y los de densidad de `flood` | `tests/` | Criterios W, F, I y P | Cada uno en su sub-issue |

## 14.15 Verificaciones contra LiquidFun y el binding

| Afirmación | Cómo se verificó | Estado |
|---|---|---|
| `SetParticleFlags`, `GetParticleFlags`, `GetContactCount`, `GetBodyContacts`, `DestroyParticle`, `GetUserDataBuffer`, `CreateParticle` y `GetMaxParticleCount` existen | Lista de exportaciones de `b2ParticleSystem` en `vendor/liquidfun.js` (18/11) | *Verificado* |
| No existen `GetContacts`, `GetBodyContactCount`, `GetParticleHandleFromIndex` ni `ParticleApplyForce` | Misma lista | *Verificado* |
| Buffer de contactos a +54 palabras (6 por contacto) y de contactos con cuerpos a +58 (7 por contacto) | Relevamiento (`contacts.mjs`, `bodycontacts.mjs`) | Medido; frágil por compilación: se busca y valida al arrancar |
| `WALL` (1 << 2) deja inmóvil a la partícula con `SetParticleFlags` en ejecución | Relevamiento `H` (velocidad máxima de la piedra 0,00 m/s) | *Verificado en ejecución* |
| `POWDER` (1 << 6) | `b2Particle.h` de LiquidFun 1.1 | *Por verificar* en ejecución (#75) |
| Masa de partícula = `density · (1,5 r)²` | Relevamiento (`GetBodyContacts().mass`) | *Verificado en ejecución* |
| `b2ParticleSystemDef.set_density` existe | Exportaciones | *Verificado* |
| `ApplyLinearImpulse`, `ApplyAngularImpulse`, `GetLinearVelocityFromWorldPoint`, `GetMass`, `GetWorldCenter`, `GetFixtureList`/`GetShape`/`GetType`, `GetVertex`/`GetVertexCount`, `get_m_p`/`get_m_radius` | Exportaciones | *Verificado* |
| `b2PrismaticJoint.GetMotorForce(inv_dt)`, `EnableMotor`, `SetMotorSpeed` y `SetMaxMotorForce` existen (banco P5) | Exportaciones | *Verificado* |
| No existe `GetDestructionByAge` en el sistema (por eso `destroyByAge` se verifica en los datos) | Exportaciones | *Verificado* |
| `stepWorld` llama a `world.Step` 8 veces por paso | `lib/ragimporter.js` | *Verificado* |
| `autoClearForces` en `true` | Por defecto en Box2D; `GetAutoClearForces` existe en el build | *Por verificar* en el test de #72 |
| Compactación estable de zombis al principio de `Solve`, moviendo `userData` | Fuente de LiquidFun 1.1 (no legible en el build) | *Por verificar* en ejecución (criterio S1) |
| Costo de recorrer contactos, de la térmica (0,14 ms con ~1.000 partículas) y de la mezcla (0,038 ms) | Relevamiento `H` e `I` | Medido |
| Separar un radio + estado guardado: pico de 0,6 m/s | Relevamiento `E` | Medido |
| Render ≤ 2 ms hasta ~4.000 círculos con GPU | Relevamiento `F` | Medido |

## 14.16 Criterios de aceptación

Para `physics-reviewer`. Cada criterio tiene referencia, valor esperado y tolerancia. "Video" significa una grabación con el grabador de [14.12](#1412-herramientas-de-debug), revisada sobre la secuencia de frames.

### S. Identidad de partículas (#68)

| Id | Criterio | Referencia | Esperado | Tolerancia |
|---|---|---|---|---|
| S1 | Crear 20 partículas, destruir las de índice par, `stepWorld`: el `userData` de las sobrevivientes sigue el orden original y el estado por slot coincide | Contrato de `SolveZombie` (compactación estable) | Igualdad exacta | 0 errores |
| S2 | Destruir y crear en el mismo frame nunca comparte un slot entre una zombi y una viva | Liberación diferida | 0 colisiones en 10.000 ciclos aleatorios con semilla fija | 0 |
| S3 | El comportamiento de daño, el vencimiento y el tope de miel no cambian (tests actuales de #13, #18 y #41 en verde) | Regresión | Mismos resultados | Los de cada test |
| S4 | Con el sistema lleno (`maxCount`) y zombis pendientes de compactar, `store.create` devuelve −1, no compacta y no cambia ningún índice ni `userData` hasta el próximo `stepWorld` | Contrato de `CreateParticle` sin destrucción por edad | −1; índices iguales | 0 cambios |
| S5 | `ParticleStore` lanza un error si `SHOT_SYSTEM.destroyByAge` no es `false` | Verificación en los datos | Error | — |

### W. Campo de alturas (#70, Node puro)

| Id | Criterio | Referencia | Esperado | Tolerancia |
|---|---|---|---|---|
| W1 | Volumen en un tanque cerrado, 60 s con olas y frentes seco/mojado | Conservación de la masa (esquema conservativo) | `Σ h dx` constante | Error relativo < 0,01 % (más estricto que el 0,5 % del issue) |
| W2 | Lago en reposo sobre el lecho real (escalón de 4 m), 60 s | *Well-balanced* (Audusse et al., 2004) | `u` = 0 y `η` = 3 m | max \|u\| < 10⁻⁸ m/s |
| W3 | Velocidad de una onda chica (a/h = 0,02) de onda larga (λ ≥ 20 h) con h = 1 m y h = 3 m | `c = √(g h)` (con λ ≥ 20 h, Airy difiere < 1,6 %) | 3,16 y 5,48 m/s | ±10 % (issue); se informa el valor medido |
| W4 | Rotura de presa sobre lecho seco, h₀ = 2 m, sin fricción. Dominio sin reflejos hasta t = 3 s: embalse ≥ 13,4 m (`c₀ t`) y aguas abajo ≥ 27 m (`2 c₀ t`) | Solución de Ritter: frente en `2√(g h₀) t`; perfil `h = (2c₀ − x/t)²/(9g)` | Posición de `h = 0,01 h₀` en `x/t = 1,7 c₀` a t = 1, 2 y 3 s; perfil en `L = 3 c₀ t` (de `−c₀ t` a `2 c₀ t`) | Frente ±10 %; error L1 del perfil < 5 % de `h₀ · L` |
| W5 | Rotura de presa sobre lecho mojado (h_L = 2, h_R = 0,5 m) | Solución de Stoker: `h_m` = 1,1035 m, `u_m` = 2,300 m/s, resalto a 4,207 m/s | `h_m`, `u_m` y velocidad del resalto | `h_m` ±5 %; resalto ±5 % |
| W6 | Positividad: `h ≥ 0` en todos los pasos de W1–W5 y en el nivel real con lluvia; activaciones del tope de subpasos y repeticiones con `dt/2` | Propiedad del esquema con CFL 0,25 | min h ≥ 0; 0 activaciones del tope en W1–W6 (se informan las repeticiones) | 0 violaciones |
| W7 | Escalares: energía y miel advectadas en el tanque cerrado | Conservación | `Σ E` y `Σ M` constantes | < 0,01 % |
| W7b | `T` y `X_v` uniformes al inicio de la rotura de presa W4 | Un escalar uniforme se mantiene uniforme (consistencia del transporte) | `T` y `X_v` constantes en todas las celdas mojadas | Error < 10⁻¹² |
| W8 | Costo de `step` con h = 15 m y flujo de 5 m/s | Presupuesto | < 0,3 ms por paso fijo | Se mide y se anota |
| W9 | Seiche fundamental de la pileta (20 × 3 m), perturbación inicial `cos(πx/L)` de 2 cm | Saint-Venant: `T = 2L/√(g h)` | 7,30 s | ±2 %; se informa la desviación contra Airy (`T` = 7,56 s, 3,6 %) |
| W10 | Vertedero: embalse sobre el escalón de 4 m de una isla con carga `H` sobre la cresta, caudal estacionario | Vertedero de cresta ancha: `q = √g (2H/3)^{3/2}` | Según `H` (H = 0,5 m: 0,61 m²/s) | ±15 % |

### I. Absorción e inmersión (#71)

| Id | Criterio | Referencia | Esperado | Tolerancia |
|---|---|---|---|---|
| I1 | N partículas de agua caen en la pileta: el volumen del campo crece `N · A_p` | Conservación de la masa | Exacto | Error relativo < 10⁻⁶ |
| I2 | Cantidad de movimiento horizontal absorbida, medida **antes** de `water.step` (sin fricción ni el `q` = 0 de las celdas secas, que el debug cuenta aparte) | Conservación | `Δ Σ q dx = Σ SG A_p v_x` | < 10⁻⁶ |
| I3 | 20 gotas en x₀ generan dos frentes de onda | `c = √(g h)` | **Frente delantero** de cada onda a ±√(g h) (las componentes cortas viajan más rápido, ver dispersión en [14.3](#esquema-numérico)) | ±10 % (video) |
| I4 | Ninguna partícula miscible atraviesa el agua | Absorción | 0 partículas miscibles con `y < η − 2r` más de un paso | 0 |
| I5 | Lava soltada en agua quieta de 3 m | Velocidad terminal `√(2 g (SG − 1) A_p / (C_d D))` | 2,19 m/s | ±15 % |
| I6 | Reacción de la inmersión sobre la columna, medida antes de `water.step`; se verifica también el tope por masa reducida | Tercera ley de Newton | `Σ` cambios de momento partícula + columna = 0; ninguna velocidad relativa invertida | < 10⁻⁶ |
| I7 | Inundación: volumen total (campo + partículas · `A_p (1 − φ)` + evaporado) contra el volumen de la curva `floodLevel(t)`; lo retenido en plataformas se informa aparte | Fuente = `riseSpeed · W_libre`, conservación | Volumen total = volumen emitido − en vuelo; retenido en plataformas ≤ 800 partículas | Total ±0,5 %; `η` medio informado contra la curva (video) |
| I8 | Costo total con la inundación al tope, dos robots disparando | Presupuesto | Física ≤ 8 ms; `immersion.step` < 0,3 ms | Se mide y se anota en [09 §9.2](09-arquitectura.md#92-rendimiento-medido) |

### F. Flotación (#72)

| Id | Criterio | Referencia | Esperado | Tolerancia |
|---|---|---|---|---|
| F1 | Cuadrados con SG 0,25, 0,5 y 0,75 en agua quieta. Un cuadrado solo flota derecho si `s(1 − s)` < 1/6, así que estos se inclinan: se mide la **fracción de área sumergida** `Σ A_i / A`, sin importar la orientación | Arquímedes: fracción sumergida = SG | 0,25 / 0,50 / 0,75, promediada entre 8 y 10 s | ±10 %; se informa la amplitud de oscilación |
| F1b | Estabilidad de flotación: cuadrado de 1 m de lado con SG 0,5 y tablón de 4 × 1 m con SG 0,5 | Altura metacéntrica `GM = I/V − BG` (> 0: estable) | Cuadrado estable a 45° (independiente del tamaño); tablón derecho (lado largo horizontal; `GM = W²/(6H) − H/4` = 2,42 m) | Cuadrado 45° ±5°; tablón ±5° |
| F2 | Círculo con SG 0,5 | Arquímedes | Fracción sumergida 0,5, promediada entre 8 y 10 s | ±10 %; se informa la amplitud |
| F3 | Caja con SG 2 que se hunde | Velocidad terminal `√(2 (SG − 1) g A / (C_d ℓ))` | Según datos | ±15 % |
| F4 | Robot totalmente sumergido en la inundación (más de 5 m de agua), soltado en reposo, con el estado del ragdoll fijo durante el test (motores en reposo, sin clip activo; o KO) | Arquímedes con gravedad específica 1,002: fuerza neta = `(m − σ_w A) g` ≈ 0,2 N hacia abajo | Velocidad vertical del centro de masa casi nula; queda con el torso arriba | \|v_y\| < 0,1 m/s a los 5 s; torso por encima de los pies (video) |
| F4b | Mismo robot, con una masa de prueba que lleva la gravedad específica a 0,9 y a 1,1 | Arquímedes | 0,9 sube y flota con 90 % del área sumergida; 1,1 se hunde | Fracción sumergida ±10 % |
| F5 | Reacción horizontal del arrastre | Tercera ley de Newton | `Σ` impulsos sobre cuerpos + cantidad de movimiento agregada al agua = 0 | < 10⁻⁶ |
| F6 | Caja soltada en la superficie: sin crecimiento de energía. `E = ½ m v² + ½ I ω² + m g y + U_b`, con `U_b(y, θ) = σ_w g ∫_y^{y_ref} A_sub(y', θ) dy'` (`y_ref` con la caja fuera del agua; `−∂U_b/∂y` es el empuje) | Estabilidad del acople | Sin arrastre (`C_d` = 0, `μ` = 0): `E` constante; con arrastre: `E` no creciente después de 2 s. Alternativa si `U_b` no se puede evaluar: envolvente de cabeceo no creciente | Sin arrastre ±2 % en 10 s; con arrastre, sin picos > 1 % sobre la envolvente (video) |
| F8 | Fuerza de Froude–Krylov: caja fija en una onda larga | Componente de Froude–Krylov de la fuerza inercial de Morison, `F_x = −ρ g A_i ∂η/∂x` por franja; falta la de masa agregada (`C_a ρ V du/dt`, no modelada, §14.5): la fuerza total queda subestimada en un factor 1 + C_a. La tolerancia verifica la implementación | Fuerza horizontal medida contra la integral analítica sobre la caja | ±10 % |
| F9 | Arrastre de presión por arista: caja y círculo arrastrados a velocidad fija en agua quieta (sin campo de velocidad) | `F = ½ ρ C_d D_proy v² b` con `C_d` caja 2,0 y círculo 1,2 | Según datos | ±10 % |
| F7 | `world.GetAutoClearForces()` es `true` | Supuesto de impulsos | `true` | — |

### B. Reacción de los cuerpos sobre el agua (#74, recortable)

| Id | Criterio | Referencia | Esperado | Tolerancia |
|---|---|---|---|---|
| B1 | Caja que flota en un tanque cerrado de ancho W | Desplazamiento: sube el nivel `A_s/(W − w)` fuera de la caja | Según datos | ±10 % |
| B2 | Volumen de agua con cuerpos que entran y salen | Conservación | `Σ h dx` constante | < 0,01 % |
| B3 | Caja soltada desde 1 m genera ondas que salen | `c = √(g h)` | Frentes a √(g h) | ±10 % (video) |
| B4 | Robot quieto flotando 60 s | Equilibrio estático | Sin oscilación sostenida de `η` | Amplitud < 1 cm después de 10 s |
| B5 | Estabilidad del acople `d`–`η` | — | Ninguna celda con \|u\| > √(g h) por el acople | 0 (si falla, se recorta a M5) |

### P. Disparos con agua pura (#69)

| Id | Criterio | Referencia | Esperado | Tolerancia |
|---|---|---|---|---|
| P1 | Rotura de presa con `SHOT_SYSTEM` dentro de `stepWorld` (8 subpasos), h₀ = 2 m, sin el campo de alturas. Frente: la x más lejana donde la altura de agua (partículas por bin de 0,1 m · `A_p` / 0,1) es ≥ 0,01 h₀ | Ritter: frente a `2√(g h₀) t` | Cociente frente medido / Ritter en cada frame de la ventana t = 0,3–1,5 s | ≥ 0,65 en **toda** la ventana; se informa la curva (relevamiento: −20/−35 %) |
| P2 | Sin explosión al crear: chorro horizontal de cada arma, en un carril, durante 0,5 s, con los caudales de D2 (separación `speed/rate`: agua 0,28 m, ácido 0,31, lava 0,33, miel 0,72; todas ≥ `1,5 r`) | Tiro balístico: rapidez esperada `√(v₀² + (g t)²)` a la edad `t` de cada partícula | Rapidez de cada partícula que no tocó un sólido ≤ esperada + 1 m/s; desvío transversal respecto de la parábola < `r` | 0 partículas fuera |
| P3 | Compresión en reposo (tanque de 12 m, 3 m de agua) | Incompresibilidad | Densidad 1,00 del empaquetado ideal, en una ventana interior de 4 × 1 m (lejos de paredes, fondo y superficie), promediada entre t = 6 y 8 s | ±10 % |
| P4 | Coeficiente de restitución del chorro contra una plataforma (o contra el piso con la absorción apagada). `e = Σ v_rebote,n / Σ v_llegada,n` (componentes normales; rebote = máximo de la componente normal saliente en los 0,5 s siguientes al impacto) | Impacto de líquido con We ≫ 1: se esparce y no rebota | `e` ≤ 0,2 | — |
| P5 | Chorro de cada arma contra una placa dinámica a ≤ 1 m de la boca, montada en una junta prismática normal al chorro con motor a velocidad 0 (`GetMotorForce(inv_dt)`, *verificado* en el binding). Solo la componente normal, promediada en régimen | Impacto de chorro: `F = ṁ v = rate · σ_w · A_p · v`, con la masa del motor | Agua 272 N (`50 · 12,0 · 0,0324 · 14`), ácido 245 N, lava 117 N, miel 175 N | ±15 % |
| P6 | Costo con 1.500 disparos vivos | Presupuesto | Física ≤ 8 ms con la inundación al tope | Se mide |

### T. Térmica y fases (#75)

| Id | Criterio | Referencia | Esperado | Tolerancia |
|---|---|---|---|---|
| T1 | Lava en la pileta, 30 s (incluye el calor por pérdida inelástica de la absorción y el latente de la evaporación) | Primera ley: `Σ m (1 − φ) e + Σ m φ e_v + Σ E + E_perdida = E₀` | Constante | < 0,1 % (relevamiento: ~0 %) |
| T2 | Masa en cambios de fase | Conservación | Partículas + volumen de las columnas · `σ_w` constante (salvo el vapor que sale por arriba, contado) | < 10⁻⁶ |
| T3 | Partícula de lava aislada en agua a 20 °C hasta solidificar | Modelo concentrado (enfriamiento de Newton + `L_f`) con los datos `h_b` y `P` | ~2,5 min con `h_b` = 500 | ±10 % del valor analítico con los mismos datos |
| T4 | Columna a 100 °C con aporte de calor Q | Calor latente | Volumen evaporado `Q/(σ_w L_v)` | ±1 % |
| T5 | Ascenso del vapor en aire quieto | Velocidad terminal `√(2 g (ρ_a − ρ_s) A_p / (ρ_a C_d D))` | 1,35 m/s | ±15 % |
| T6 | Agua quieta con dos zonas de 80 °C y 20 °C, sin movimiento | Difusión molecular despreciable a 0,18 m | Cambio < 1 K en 10 s en la interfaz | — |
| T7 | La piedra en reposo queda inmóvil (`WALL`) y la que cae se apila (`POWDER`) | — | v = 0 en reposo; pila con ángulo > 0 (video) | — |
| T8 | Costo con ~1.000 partículas térmicas | Presupuesto | < 0,3 ms por paso | Se mide |
| T9 | Altura de condensación de una pluma de vapor en aire quieto | Arrastre de aire de Morton–Taylor–Turner, `λ = 2 α w / R` con `α` = 0,10 | Altura a la que la mitad del vapor emitido condensó, según el modelo con `α` = 0,10 | Dentro del rango que dan `α` = 0,07 y 0,13 |

### M. Mezcla (#76)

| Id | Criterio | Referencia | Esperado | Tolerancia |
|---|---|---|---|---|
| M1 | Masa de miel en partículas y columnas, 30 s | Conservación del soluto | `Σ m X + Σ ρ_miel M dx` constante | < 10⁻⁶ (relevamiento: 10⁻⁵ %) |
| M2 | Miel quieta en agua quieta | `D_mol` ≈ 10⁻¹⁰ m²/s | `X` medio de la miel original cambia < 1 % en 10 s | — |
| M3 | Asentamiento de una columna de **partículas** de miel pura (X = 1) sobre una plataforma o con la absorción apagada (en el campo, la miel es un trazador pasivo y no forma corriente de gravedad) | Corriente de gravedad viscosa (Huppert, 1982): `x_f ∝ t^{1/5}` | Exponente ajustado 0,20 | ±0,05 |
| M4 | Frente a 4 s según `X` (0; 0,25; 0,5; 0,75; 1) | Viscosidad monótona en `X` | Estrictamente decreciente | — |

### A. Adherencia (#77)

| Id | Criterio | Referencia | Esperado | Tolerancia |
|---|---|---|---|---|
| A1 | Cantidad de movimiento entre partículas y cuerpos | Tercera ley de Newton | `Σ Δp` = 0 | < 10⁻⁶ |
| A2a | Calibración de `filmFactor`: placa que se desliza a velocidad fija sobre una capa de miel de espesor `δ` | Corte de Couette: `τ = μ v / δ`, con `μ_miel` = 10 Pa·s | Se mide e informa `filmFactor` | — (calibración) |
| A2 | Validación independiente: película de miel que escurre por una pared vertical, con el `filmFactor` de A2a | Película de Nusselt: velocidad media `ρ g δ²/(3 μ)` con `μ_miel` = 10 Pa·s | Según datos | ±30 % (video) |
| A3 | Agua (X = 0) en la misma escena | `μ_agua` / `μ_miel` = 10⁻⁴ | Impulso de adherencia < 1 % del de la miel | — |

### E. Evaporación de agua detenida (#73, D7)

| Id | Criterio | Referencia | Esperado | Tolerancia |
|---|---|---|---|---|
| E1 | Gota aislada en reposo sobre una plataforma | Modelo de [14.7b](#147b-evaporación-de-agua-detenida-d7): `τ_1 = A_p / (F_evap e_r P f_1)` con la `f_1` medida | Con `f_1` = 1 serían 4,8 s; se compara contra la `f_1` real del apoyo | ±15 % |
| E2 | Charco de N = 40 partículas sobre una plataforma | Tasa inicial `dV/dt = F_evap e_r P Σ f_i`; relación `τ_N / τ_1 = N f_1 / Σ f_i` | Tasa inicial y relación según las `f` medidas al inicio | ±15 % |
| E3 | Volumen total con evaporación, 60 s | Conservación: `Σ m (1 − φ)` + campo + evaporado = inicial | Constante | < 10⁻⁶ |
| E4 | Lluvia y chorros en vuelo (\|v\| ≥ 1 m/s) | Regla de aplicación | `φ` no aumenta mientras \|v\| ≥ 1 m/s (dφ = 0 en vuelo); la lluvia y los chorros que llegan al campo sin haberse detenido llegan con `φ` = 0 | 0 partículas con dφ > 0 en vuelo |

### D. Debug (#29 y #78)

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

Las letras del primer borrador (A, B, C, D1, D2, F, K1, E, G, H, I, J, K2) quedaron como issues #67–#78 y #29. En el texto se usan los números.

| Issue | Título | Depende de | Milestone | Imprescindible |
|---|---|---|---|---|
| #67 | Grabador de escenarios para revisión física | — | M2 | Sí (sin video no hay aprobación) |
| #68 | Identidad estable de partículas (`ParticleStore`) | — | M2 | Sí |
| #69 | Disparos con agua pura y radio 0,12 m | #67, #68 | M2 | Sí |
| #70 | Módulo `ShallowWater` (Saint-Venant 1D) con tests | #67 | M2 | Sí |
| #71 | Pileta e inundación como campo de alturas, con absorción e inmersión | #68, #69, #70 | M3 | Sí |
| #72 | Flotación de Arquímedes por pieza | #71 | M3 | Sí |
| #29 | Debug básico (panel, columnas, conservación, empuje) | #71 | M3 | No (recomendado) |
| #73 | Evaporación de agua detenida (D7) y lector de contactos `contacts.js` | #68, #71 | M4 | No (si no llega, D5 vence a los 6 s todos los disparos en plataformas) |
| #74 | Reacción de los cuerpos sobre el agua | #72 | M4 | No (recortable a M5) |
| #75 | Térmica y fases | #73 | M4 | No (recortable a M5) |
| #76 | Mezcla por concentración y viscosidad | #75 | M5 | No |
| #77 | Adherencia con reacción (retira `STICKY`) | #76, #72 | M5 | No |
| #78 | Debug completo (temperatura, concentración, contactos, vectores) | #75 | M5 | No |

**Alcance de #69:** `SHOT_SYSTEM` nuevo (radio 0,12 m, `density` 12,0, damping 0,5, presión 0,1, sin tensiones, `maxCount` 3.000, `destroyByAge` `false`, flags 0 en agua, ácido y lava); en `WEAPONS`, los caudales y tanques de D2 con las velocidades actuales, sin `TENSILE`; emisión en un carril con la regla `rate ≤ speed/(1,5 r)` verificada por test; criterios P1–P6. El agua del nivel y su `STATIC_PRESSURE` **no** se tocan en #69: se borran en #71.

**Cambios de la revisión de physics-reviewer (18/11), por issue:**
- **#70:** velocidades de Toro en lecho seco, término fuente de Audusse §3, orden 1 cerca de lo seco, CFL por caras con repetición a `dt/2`, tope con `u_max`, W3 con λ ≥ 20 h, W4/W5 con valores de referencia, W7b, W9 y W10.
- **#71:** pérdida inelástica como calor, tope por masa reducida, I2/I6 antes de `water.step`, I7 con volumen total.
- **#72:** arrastre por arista, Froude–Krylov, `C_d` por forma, tope por masa reducida, F1/F1b/F2 por fracción de área, F6 con `U_b`, F8/F9, F4 con ragdoll fijo.
- **#69:** P1–P5 medibles, placa con junta prismática.
- **#68:** `destroyByAge` explícito, S4 y S5.

**Orden de trabajo y recorte:** ver [11-cronograma](11-cronograma.md). **Mínimo de #62 para la entrega:** #67, #68, #69, #70, #71 y #72.

**Afecta a otros issues:**
- #26: render de las partículas en Canvas2D ([07-sph §7.4](07-sph.md#74-render)).
- #29: se integra en `js/debug.js`.
- #30: lo reemplaza #75. #32 depende de #75. #31 sin cambios.
- #39 y #45: reemplazados por #71.
- #41: `STICKY` se retira en #77.
- #16: gases en el sistema único ([04-fluidos](04-fluidos.md#las-armas)).
- #23: charcos del mapa como columnas con `M` ([14.11](#1411-arranque-asentado)).

## 14.18 Decisiones del usuario

Decididas por el usuario (18/11). Ninguna bloquea ya a un sub-issue. D7 llegó con la revisión de `physics-reviewer`.

| Id | Tema | Decisión | Efecto en el diseño |
|---|---|---|---|
| D1 | Flotación de los robots | **Neutra:** `σ_w` = 12,0 kg/m², sin tocar las masas del rig | Espesor equivalente de 12,0 mm; robot con gravedad específica 1,00; partícula de agua de 0,389 kg; criterios F4 y F4b ([14.1](#141-unidades-rebanada-2d-y-materiales)) |
| D2 | Empuje del chorro | **Revisada (18/11):** densidad física (`σ_w` = 12,0) y empuje balanceado bajando el caudal; la primera versión (caudal y velocidad actuales, 544 N) se descartó | Velocidades conservadas, caudales a la mitad: agua 50/s → 272 N (2,1 veces el peso del robot), ácido 45/s → 245 N, lava 30/s → 117 N, miel 25/s → 175 N; tanques escalados para conservar la duración; un solo carril; criterios P2 y P5 ([14.6](#146-disparos-con-agua-pura)) |
| D3 | Tiempos térmicos | **Reales, sin escalar** | La lava tarda ~2,5 min en solidificar en el agua; no hay plataformas de piedra temporales dentro de una ronda ([14.8](#148-térmica-y-fases)) |
| D4 | Miel pegajosa | **Se retira el estado `pegado`** cuando llegue la adherencia (#77); hasta entonces sigue el temporizador actual de #41 | [14.10](#1410-adherencia) |
| D5 | Charcos en plataformas | **Siguen venciendo a los 6 s**, como regla de presupuesto; los del piso se absorben en el campo. **Desde #73, D7 la reemplaza para el agua y el ácido**: D5 queda solo para la lava, hasta que #75 la haga solidificar; la miel sigue con `PERSIST_MAX` | [14.4](#144-absorción-e-inmersión) |
| D6 | Reglas de la pileta | **Se mantienen:** el sensor mata y la pileta no moja antes de la inundación | [14.5](#145-flotación-de-arquímedes-por-pieza) |
| D7 | Lluvia y gotas sobre plataformas | Siguen como partículas: escurren por física, se juntan y se absorben si llegan al campo. **Se evaporan** con una tasa proporcional a su superficie expuesta (fracción del contorno sin vecinas), acelerada respecto de la real con un factor nombrado; el volumen evaporado entra en los monitores | Modelo, módulo y criterios en [14.7b](#147b-evaporación-de-agua-detenida-d7) (`F_evap` = 3·10⁵, gota expuesta 4,8 s; E1–E4). **Reemplaza a D5 para el agua y el ácido:** es un modelo físico aproximado, con un factor nombrado, en lugar de una desaparición por reloj; trata igual a la lluvia y a los disparos; un charco grande dura más que una gota, como se pidió; y el tope de `maxCount` sigue protegiendo el presupuesto. D5 queda como respaldo si #73 no llega |
