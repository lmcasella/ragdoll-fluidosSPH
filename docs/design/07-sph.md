# 7. Fluidos / SPH (LiquidFun)

## 7.1 Modelo

LiquidFun es una variante de SPH:
- arma pares de partículas a menos de un diámetro, con peso `w = 1 − d/D`;
- calcula la presión como `max(0, η(w − w₀))`;
- los tipos de partícula (water, viscous, tensile, elastic, wall) agregan términos de fuerza o restricciones.

En la defensa se explica junto con su relación con el SPH de doble densidad de la materia (`SPHjs`).

## 7.2 Sistemas de partículas

Partículas de sistemas distintos **no interactúan entre sí**, solo con los cuerpos.

| Sistema | Contenido | Radio | Gravedad | Vida | Estado |
|---|---|---|---|---|---|
| Disparos (líquidos) | Agua, ácido, lava, miel | 0,1 m | 1 | Ilimitada | ✅ |
| Agua del nivel | Pileta y lluvia de la inundación (#22) | 0,25 m (477 de la pileta; hasta 5.500 con la lluvia). Se dibuja a 0,28 m | 1 | Ilimitada | ✅ #22 |
| Gases | Fuego, viento, vapor | — | Negativa o 0 | Corta (*verificado*: `set_lifetime` del grupo) | 🔨 #16 |

La lluvia comparte sistema con la pileta para que **suba el agua de la pileta**: si fuera un sistema aparte, las gotas atravesarían el agua de la pileta y quedarían superpuestas en el fondo. Se distinguen por la marca de `userData` (lluvia = −1, pileta = 0).

### Un solo sistema para todos los líquidos ❌ (rechazado 18/11)

**Rechazado por el usuario (18/11):** las partículas de 0,25 m ya se ven demasiado grandes respecto del robot, así que no se llevan los disparos a ese radio. Se mantienen **dos sistemas** (disparos de 0,1 m y agua del nivel de 0,25 m). Igual todos los líquidos tienen que interactuar: un **puente** detecta los disparos dentro del agua y aplica frenado, flotación y reacciones, en un solo sentido (agua → disparos). Se resuelve en #39 ([7.6](#76-puente-agua--disparos--39)). El análisis de abajo queda como registro de lo evaluado.

Objetivo del usuario: que **todos los líquidos interactúen entre sí** (disparos, pileta, inundación). Solo pasa si están en el mismo sistema.

- **Qué es por sistema** (*verificado* en `b2ParticleSystemDef`, `vendor/liquidfun.js`, 18/11): `radius`, `gravityScale`, `dampingStrength`, `pressureStrength`, `viscousStrength`, `surfaceTensionPressureStrength`/`surfaceTensionNormalStrength`, `elasticStrength`, `springStrength`, `powderStrength`, `maxCount`, `destroyByAge`. El comportamiento de cada fluido (water, viscous, tensile…) es una flag por partícula, pero su fuerza es la misma para todo el sistema.
- **El radio común manda.** El presupuesto de la inundación (~5.000 partículas a 0,25 m) solo entra con un radio grueso:

  | Radio común | Partículas de la inundación al tope | ¿Entra en 8 ms? |
  |---|---|---|
  | 0,1 m (el de hoy en los disparos) | ~31.000 | No; tampoco entra en el heap |
  | 0,15 m | ~13.000 | No |
  | 0,2 m | ~7.800 | Justo, sin margen para disparos |
  | **0,25 m** | ~5.000 | Sí |

  Unificar implica llevar **los disparos a 0,25 m**: chorros más gruesos (~6 veces menos partículas por volumen) y rebalancear el daño por partícula del ácido y el caudal de #13.
- **Qué gana:** los disparos chocan con la pileta y la inundación; ya no hace falta borrarlos al entrar al agua (`limpiarParticulas`). Habilita las reacciones partícula↔partícula de #30, que ya exigían compartir sistema.
- **Qué no cambia:** los gases (#16) siguen en su propio sistema, porque la gravedad negativa es por sistema. `DamageSystem` sigue identificando cada partícula por su id de disparo o por su color; el agua del nivel no tiene color de arma y no daña por contacto.
- **Riesgo:** con los disparos en el agua del nivel, los contactos partícula↔cuerpo de los disparos compiten por el mismo `maxCount` (subirlo a ~8.000 y volver a medir).

**Decisión:** la inundación usa el sistema del agua del nivel (radio 0,25 m) ✅ #22. Unificar los disparos en ese sistema se rechazó; la interacción disparos↔agua va por el puente de #39.

**Bindings verificados para la inundación** (lectura de `vendor/liquidfun.js`, 18/11): `b2ParticleSystem.CreateParticle(b2ParticleDef)`; `b2ParticleDef` con `set_position`, `set_velocity`, `set_color`, `set_flags`, `set_userData`; `b2ParticleSystemDef.set_maxCount` y `b2ParticleSystem.SetMaxParticleCount`; `SetPaused`/`GetPaused`; `DestroyParticlesInShape`; `GetVelocityBuffer`. **No** está `GetBodyContactCount` (ver [04-fluidos](04-fluidos.md#cortocircuito-regla-compartida--22)). Falta probar en ejecución que `CreateParticle` devuelve un índice negativo al llegar a `maxCount`: el emisor no depende de eso, porque controla su propio tope.

Las fuerzas de cada sistema (damping, presión, viscosidad, tensión superficial) y las flags de cada fluido se definen como datos en [7.5](#75-parámetros-por-sistema--40) (✅ #40).

## 7.3 Técnicas usadas

- **Acople bidireccional** ✅: los fluidos empujan cuerpos y los cuerpos desplazan fluidos.
- **Contactos partícula↔cuerpo** ✅ (*verificado*): `BeginParticleBodyContact` informa qué parte del cuerpo tocó cada partícula. Requiere la flag `1 << 14` (`b2_fixtureContactListenerParticle`) en las partículas.
- **Etiqueta por disparo** ✅: cada grupo disparado escribe su id en el buffer de `userData` de sus partículas (*por re-verificar*). Así se sabe de quién es cada partícula. Nota: la verificación anterior de que la marca sobrevive se hizo sobre el aliasing de un bug (`Box2D.getPointer` aplicado al número que devuelve `GetUserDataBuffer()`, que leía y escribía en la dirección 0 del heap). Desde #22 se escribe en el buffer real (`GetUserDataBuffer() >> 2`), que es lo que usan `damage.js` y `flood.js`.
- **Puente entre sistemas** ✅ #39: frenado y flotación de los disparos que están dentro del agua del nivel, escribiendo el buffer de velocidades del sistema de disparos una vez por paso ([7.6](#76-puente-agua--disparos--39)).
- **Contactos partícula↔partícula** 🔨 #30: reacciones entre fluidos ([04-fluidos](04-fluidos.md#44-reacciones-entre-fluidos--30)).
- **Escritura directa de buffers** 🔨: viento (velocidad) y reacciones (flags).

## 7.4 Render

- **Hoy** ✅:
  - cada partícula es un círculo de color sólido en un canvas 2D;
  - un filtro SVG "goo" (desenfoque más umbral de transparencia) funde las gotas;
  - el desenfoque se escala con el zoom de la cámara.

  El resultado son **manchas planas**, sin brillo ni volumen, y no escala a miles de partículas.
- **Diseño** 🔨 #26: el render metaball de la materia (`metaball.frag.glsl`).
  - Se acumulan los kernels de las partículas en una textura y un shader aplica umbral, borde, brillo y sombreado por densidad.
  - Un color por fluido, con brillo propio en lava y fuego.
  - Va en GPU (WebGL, PIXI ya está cargado) y reemplaza al filtro SVG.

## 7.5 Parámetros por sistema ✅ #40

**Problema** (feedback del usuario): las partículas de los disparos "rebotan como pelotitas" y el agua acumulada "parece pelotero, no fluye bien". **Restricción:** las partículas siguen chicas; no se tocan los radios (0,1 m los disparos, 0,25 m el agua del nivel, dibujada a 0,28 m).

**Causa principal.** Los dos sistemas se crean hoy con `dampingStrength` = 0,2, cinco veces menos que el valor por defecto de LiquidFun (1,0); el resto de las fuerzas queda en su valor por defecto. En `SolveDamping` (código fuente de LiquidFun 1.1, `b2ParticleSystem.cpp`), el damping quita la componente normal de la velocidad **de acercamiento** en cada contacto partícula↔partícula y partícula↔cuerpo, en proporción a `dampingStrength × peso`. Con 0,2 casi toda esa velocidad sobrevive y la presión la devuelve hacia afuera: el chorro que llega al piso se comprime y rebota, y el agua apilada vibra. El choque contra un fixture en sí (`SolveCollision`) es inelástico: proyecta la partícula sobre la superficie. El segundo factor es que `b2_waterParticle` no tiene cohesión: la presión es `max(0, …)`, solo repele, así que nada mantiene juntas las gotas que se separan. El build compilado no permite leer ese C++; las dos afirmaciones se confirman con el banco de pruebas de abajo (línea base contra valores nuevos).

### Bindings verificados

*Verificado* por lectura de `vendor/liquidfun.js` (18/11): `b2ParticleSystemDef` expone `set_`/`get_` de `radius`, `maxCount`, `destroyByAge`, `gravityScale`, `density`, `pressureStrength`, `dampingStrength`, `viscousStrength`, `surfaceTensionPressureStrength`, `surfaceTensionNormalStrength`, `repulsiveStrength`, `powderStrength`, `elasticStrength`, `springStrength`, `ejectionStrength`, `staticPressureStrength`, `staticPressureRelaxation`, `staticPressureIterations`, `colorMixingStrength`, `lifetimeGranularity` y `strictContactCheck`. En el sistema ya creado solo se pueden cambiar `SetDamping`, `SetDensity`, `SetGravityScale`, `SetRadius` y `SetStaticPressureIterations` (con sus `Get…`). El resto de las fuerzas **se fija al crear el sistema**. Las flags por partícula se escriben con `b2ParticleDef.set_flags` y `b2ParticleGroupDef.set_flags` (los dos existen).

El build no exporta los nombres de las flags (`b2_tensileParticle`, etc.). Sus valores salen de `b2Particle.h` de LiquidFun 1.1: `water` 0, `viscous` 1 << 5, `tensile` 1 << 7, `staticPressure` 1 << 11, `fixtureContactListener` 1 << 14. Las tres que ya usa el juego (`viscous`, `tensile` y el contact listener) se comprobaron en ejecución con #13. `staticPressure` se comprobó en ejecución (#40): agregar la flag y `staticPressure*` cambia el resultado del banco 2.

### Dónde viven

- **Módulo nuevo `js/particles.js`** (hoja, sin imports). Es el único que conoce `b2ParticleSystemDef`.
  - `PARTICLE`: las flags (`WATER`, `VISCOUS`, `TENSILE`, `STATIC_PRESSURE`, `CONTACT_LISTENER`).
  - `createParticleSystem(world, params)`: crea el def, llama a `def["set_" + clave](valor)` por cada clave de `params` que no sea `undefined`, crea el sistema y libera el def con `Box2D.destroy`. Si una clave no tiene setter, **lanza un error**: así un error de tipeo en los datos no queda en silencio.
- **Disparos:** `SHOT_SYSTEM` en `js/weapons.js`, junto a `WEAPONS`. `index.html` reemplaza su `b2ParticleSystemDef` a mano por `createParticleSystem(world, SHOT_SYSTEM)`. Las constantes de `weapons.js` que repiten el radio (`PARTICLE_RADIUS`, y `MUZZLE_OFFSET` = radio + 0,05) se derivan de `SHOT_SYSTEM.radius`. Las flags de cada arma siguen en `WEAPONS[].flags`, ahora con las constantes de `PARTICLE`.
- **Agua del nivel:** `LEVEL.pool.flags` (las flags de toda partícula del agua del nivel) y `LEVEL.pool.physics` (fuerzas del sistema) en `js/level.js`. `fillPool` llama a `createParticleSystem(world, { radius: pool.radius, maxCount: flood?.maxParticles, ...pool.physics })`. `fillPoolWater` aplica `pool.flags` al grupo, y `Flood` los aplica a su `b2ParticleDef` en el constructor. Así la pileta, la lluvia y el reinicio usan las mismas flags.
- **Dependencias:** `weapons.js` → `particles.js`, `level.js` → `particles.js`. `flood.js` ya importa `level.js`. No hay ciclos: `particles.js` no importa nada.

### Valores iniciales

| Parámetro | Disparos (`SHOT_SYSTEM`) | Agua del nivel (`LEVEL.pool.physics`) | Antes de #40 | Por qué |
|---|---|---|---|---|
| `radius` | 0,1 | 0,25 (`pool.radius`) | igual | Decisión del usuario: no se agrandan |
| `maxCount` | 1.500 | 5.500 (`flood.maxParticles`) | igual | Presupuestos de [09](09-arquitectura.md#93-presupuestos-y-métricas) |
| `destroyByAge` | `false` | (por defecto) | igual | Ver [04-fluidos](04-fluidos.md#tope-de-partículas-del-sistema-de-disparos) |
| `gravityScale` | 1 | 1 | 1 (por defecto) | Explícito para que el dato sea completo |
| `dampingStrength` | **1,0** | **1,0** | 0,2 | Choques inelásticos: la velocidad de acercamiento se pierde en lugar de volver como rebote. Es el valor por defecto de LiquidFun; no se pasa de 1 (por encima, el damping invierte la velocidad normal) |
| `pressureStrength` | **0,005** (final) | **0,1** (final) | 0,05 (por defecto) | Explícito. Más alto = más rígido y más rebote; es la perilla 2 |
| `viscousStrength` | **0,25** | **0,1** | 0,25 (por defecto) | Disparos: solo afecta a lava y miel (flag `viscous`); #41 lo sube para la miel. Agua del nivel: viscosidad baja, que calma el temblor entre vecinas sin frenar el escurrido |
| `surfaceTensionPressureStrength` | 0,2 | (sin uso) | 0,2 (por defecto) | Cohesión de agua, ácido y lava (flag `tensile`) |
| `surfaceTensionNormalStrength` | 0,2 | (sin uso) | 0,2 (por defecto) | Ídem; es la primera perilla si quedan gotas sueltas |

No se usan, aunque estén en el build: `repulsiveStrength`, `powderStrength`, `elasticStrength`, `springStrength`, `ejectionStrength` y `colorMixingStrength` (sus flags no se usan), ni `density` (cambiaría la masa de las partículas y, con ella, el empuje sobre los robots). `staticPressure*` queda como perilla 3 del agua del nivel.

### Flags por fluido

La fuerza es por sistema, pero cada partícula elige qué términos recibe. Con las flags, cada fluido se ve distinto dentro del mismo sistema, sin lógica por arma.

| Fluido | Sistema | Flags (#40) | Antes | Por qué |
|---|---|---|---|---|
| Agua (#18) | Disparos | `TENSILE` | (sin arma) | El agua real tiene tensión superficial: es lo que mantiene unido un chorro y forma gotas. Sin viscosidad: fluye y salpica |
| Ácido | Disparos | `TENSILE` | `WATER` | Igual que el agua. No lleva `viscous`, así que el aumento de #41 no lo afecta |
| Lava | Disparos | `TENSILE \| VISCOUS` | `TENSILE` | "Pesada y pegajosa" ([04](04-fluidos.md#las-armas)): forma gotas gruesas (`tensile`) y se arrastra (`viscous`). Si no lleva `viscous`, con el cambio del ácido se comportaría igual que él |
| Miel | Disparos | `VISCOUS` | `VISCOUS` | Espesa, sin tensión superficial: se extiende como una capa pegajosa en vez de hacer gotas |
| Pileta y lluvia | Agua del nivel | `VISCOUS` | `WATER` | Con una viscosidad baja (0,1) las vecinas se mueven juntas y el agua en reposo se aquieta. No lleva `tensile`: a 0,25 m la tensión junta las partículas en bolas (más "pelotero") |

Todas las de los disparos suman `CONTACT_LISTENER` al emitir, como hoy.

**Convivencia con #41.** `viscousStrength` del sistema de disparos arranca en 0,25 (el valor con el que hoy se juega la miel). #41 lo sube para la miel, y eso también espesa la lava, porque las dos llevan `viscous`. Es coherente con la física (la lava es más viscosa que la miel), pero #41 tiene que repetir el banco con la lava. Si la lava pierde alcance o deja de verse como chorro, vuelve a `TENSILE` sola: es un cambio de datos. El agua y el ácido no llevan `viscous` y no se ven afectados.

### Banco de pruebas

Archivo nuevo `tests/fluid-feel.test.js`, con el armado en `tests/helpers/fluid-bench.js`. Usa LiquidFun real, gravedad (0, −10), `stepWorld(world, [])` a 1/60 s y ningún `Math.random`. Así es determinista y corre en CI. Cada función del helper recibe **los parámetros del sistema y las flags como argumento**, y devuelve las métricas: los mismos números sirven para la línea base, para los asserts y para ajustar. Las métricas se informan con `t.diagnostic`.

**Banco 1, disparos** (`shotBench(systemParams, weapon)`, una corrida por arma de `WEAPONS`, y por el agua cuando exista con #18):
- **Mundo:** piso estático de x −10 a 20 con tope en y = 0, y paredes de 2 m en los extremos. El sistema se crea con `createParticleSystem(world, systemParams)`.
- **Emisión:** el `ShotEmitter` real, con un jugador falso (`weapon`, `tanks`, `dead: false`, `muzzle()` fijo en (−4, 1,5) apuntando 30° bajo la horizontal) y un daño falso (`shotId` → 1, `tagParticle` no hace nada). Sin raycaster. Se dispara **1 s** (la miel tiene tanque para 1,5 s).
- **Llegada e impacto:** por índice de partícula (no se destruye ninguna, así que los índices no cambian), el impacto es el primer paso en que `y ≤ radio + 0,02 m`. `v_llegada` = `|vy|` en el paso anterior. `v_rebote` = máximo de `vy` hacia arriba en los 0,5 s siguientes (0 si nunca sube).
- **Métrica de rebote:** `Σ v_rebote / Σ v_llegada` sobre las partículas que impactaron. Se informa también el percentil 90 del cociente por partícula. **Criterio:** ≤ 0,20.
- **Métrica de aisladas:** en `t* + 1 s`, donde `t*` es el impacto de la última partícula emitida, el porcentaje de partículas **sin otra a menos de 0,2 m** (un diámetro, el alcance de interacción de LiquidFun). Se calcula en O(n²) (n ≤ 90). **Criterio:** ≤ 10 %.

**Banco 2, agua del nivel** (`poolBench(physics, flags)`):
- **Mundo:** `buildLevel(world)` (islas y hueco reales) y el sistema creado como en `fillPool`, pero con un grupo de partida **desnivelado**: el agua ocupa x 18–33, y 0–3,9 (58,5 m², el mismo volumen que la pileta de 20 × 3 m). Es una rotura de presa: mide si el agua fluye y si se nivela.
- **Fluye:** tiempo hasta que alguna partícula llega a x ≥ 37. **Criterio:** ≤ 2 s.
- **Se nivela** (a los 8 s): superficie de cada columna de 1 m entre x 18,5 y 37,5 (19 columnas) = percentil 90 de la altura de sus partículas. **Criterio:** desvío estándar < 0,10 m y máximo − mínimo < 0,375 m (una capa de la grilla, 0,75 × diámetro).
- **Quieta** (promedio de los pasos entre 8 y 9 s): **criterio:** velocidad media < 0,05 m/s y percentil 95 < 0,2 m/s.

**Banco 3, inundación** (ya existe en `tests/flood.test.js`): con los parámetros nuevos tiene que seguir pasando "el agua asentada queda a ±0,4 m del nivel" y el test de costo. Para recalibrar `density`, se mide la superficie a 7,5, 10,5 y 13,5 m, con la misma función `measuredSurface`. La meta es la de la calibración del 18/11: entre −0,1 y +0,3 m del nivel.

**Línea base:** antes de cambiar los datos, se corren los bancos 1 y 2 con los valores de hoy (`dampingStrength` 0,2, el resto por defecto, flags de antes) y se anotan abajo. No son asserts: muestran cuánto mejoró.

| Métrica | Línea base (antes de #40) | Con #40 | Criterio |
|---|---|---|---|
| Rebote, agua / ácido / lava / miel | 0,52 / 0,58 / 1,34 / 0,29 | 0,12 / 0,11 / 0,06 / 0,11 | ≤ 0,20 |
| Aisladas a 1 s, agua / ácido / lava / miel | 38 % / 22 % / 2 % / 0 % | 5 % / 9 % / 0 % / 0 % | ≤ 10 % |
| Agua del nivel: frente en x 37 | 0,87 s | 1,22 s | ≤ 2 s |
| Agua del nivel: desvío / rango de la superficie | 0,138 / 0,476 m | 0,094 / 0,328 m | < 0,10 m / < 0,375 m |
| Agua del nivel: velocidad media / p95 | 0,25 / 0,55 m/s | 0,020 / 0,040 m/s | < 0,05 / < 0,2 m/s |
| Inundación: `density` y error a 7,5 / 10,5 / 13,5 m | 6,4; −0,04…+0,3 m | 6,3; +0,44 / +0,29 / −0,03 m (60 s) | −0,1…+0,3 m (**no cumple a 7,5 m**) |
| Costo con la inundación al tope | ~5,0 ms | ~7,2 ms (4.368 partículas) | ≤ 8 ms |

Notas de la medición (19/11):
- **Línea base** con `dampingStrength` 0,2, el resto por defecto y las flags de antes (agua sin flags, ácido `WATER`, lava `TENSILE`, miel `VISCOUS`). El agua con la flag de antes no existía como arma.
- **Impacto:** se mide con `y ≤ 2 × radio`, no con `radio + 0,02 m`: una partícula en reposo sobre el piso queda a ~1,65 radios, y con el umbral original la miel nunca "impactaba". Las partículas que caen sobre otras (no sobre el piso) no cuentan: impactan 99 de 99 (agua), 89 de 89 (ácido), 39 de 60 (lava) y 24 de 50 (miel).
- **Valores finales de los disparos:** `pressureStrength` **0,005** y las dos tensiones **0**. Con los valores iniciales (0,05 y 0,2) el rebote era 0,87 (agua) y 0,71 (ácido): **peor** que la línea base, porque la tensión superficial empuja hacia afuera al comprimirse el chorro. Barrido con `dampingStrength` 1,0: la tensión (cualquier valor ≥ 0,05) deja el rebote de agua y ácido en 0,26–0,60 aun con `pressureStrength` 0,005; sin tensión y con 0,02 el rebote es 0,27–0,28, con 0,01 es 0,19–0,20 y con 0,005 es 0,11–0,12. Con tensión 0 y `pressureStrength` 0,05 la tensión solo se queda en `TENSILE` como flag sin efecto. **Consecuencia:** el chorro no tiene cohesión real; las gotas no se agrupan por tensión. Se cumplen los dos criterios medibles, pero la cohesión visual hay que mirarla en el navegador, y #41 y #26 parten de estos valores. Si se prefiere cohesión, hay que relajar el criterio de rebote.
- **Agua del nivel:** los valores iniciales (`pressureStrength` 0,05, solo `VISCOUS`) daban desvío 0,216 / rango 0,79 m (peor que la línea base en la nivelación, pero con velocidad media 0,029). Se llegó a los valores finales con la perilla 3 (`STATIC_PRESSURE`, verificado en ejecución: cambia el resultado) y `pressureStrength` 0,1. El resultado es sensible: con 0,07 / 0,085 / 0,12 / 0,15 el desvío va de 0,12 a 0,16, y solo 0,1 cumple (la métrica depende de las capas de la grilla de 0,25 m).
- **Costo:** sube de ~5,0 a ~7,2 ms por la presión estática (4 iteraciones por subpaso).
### Procedimiento de ajuste

Se mueve **una perilla por vez**, en este orden, y se vuelven a correr los tres bancos.

**Disparos, si el rebote supera 0,20:**
1. Confirmar `dampingStrength` = 1,0 (no se sube más).
2. Bajar `pressureStrength` (0,05 → 0,03 → 0,02). El chorro se comprime más al chocar; mirar en el navegador que no se encime de forma visible.
3. Solo si falla con lava, agua o ácido: bajar `surfaceTensionPressureStrength` (0,2 → 0,1), que también empuja.

**Disparos, si las aisladas superan el 10 %:**
1. Subir `surfaceTensionNormalStrength` (0,2 → 0,35 → 0,5). Es la cohesión de las partículas de borde.
2. Subir `surfaceTensionPressureStrength` en el mismo paso.
3. Si falla solo la miel: subir `viscousStrength` (adelanta parte de #41) o, en último caso, darle `TENSILE`.
4. **Tope visual:** si la tensión es muy alta, el chorro se junta en bolas, que es otra vez el efecto "pelotitas". Cada valor nuevo se mira en el navegador con un disparo largo de cada arma.

**Agua del nivel, si no queda quieta o no se nivela:**
1. Confirmar `dampingStrength` = 1,0.
2. Subir `viscousStrength` (0,1 → 0,2). Si deja de cumplir "fluye ≤ 2 s", volver atrás.
3. Agregar `PARTICLE.STATIC_PRESSURE` a `pool.flags`, con `staticPressureStrength` 0,2, `staticPressureRelaxation` 0,2 y `staticPressureIterations` 4. Resuelve la presión de las pilas en reposo y quita el temblor, pero **cuesta**: itera sobre todos los contactos en cada uno de los 8 subpasos. Se mide el banco 3 de costo y se acepta solo si queda ≤ 8 ms con la inundación al tope. Antes, se comprueba en ejecución que la flag 1 << 11 hace efecto.
4. Bajar `pressureStrength` empeora la compresión y corre la superficie. No se usa salvo que fallen las tres anteriores.

**Inundación, después de cualquier cambio en el agua del nivel:** si la superficie queda sistemáticamente corrida, `density_nuevo = density × waterArea(nivel) / waterArea(superficie medida)` (promedio de las tres alturas). Se redondea a 0,1, se vuelve a medir y se actualiza la fila `density` de [02-partida](02-partida.md#21-inundación--22) con el valor y los errores medidos.

### Efectos sobre otros sistemas y coordinación

- **Empuje del agua (#18) y del ácido sobre los robots:** con damping 1,0, el choque partícula↔cuerpo también es más inelástico. La partícula le transfiere su cantidad de movimiento en lugar de rebotar, así que el empuje por partícula puede bajar. #18 mide el empuje después de #40.
- **#41 (miel muy viscosa):** sube `SHOT_SYSTEM.viscousStrength` y repite el banco 1 con la miel **y la lava**.
- **#26 (render metaball):** el umbral y el radio del kernel se calibran con la cohesión de #40 ya aplicada. Si #40 todavía no está en `main`, #26 no fija valores visuales.
- **#45 (hueco entre robot y agua):** #40 no cambia radios ni radio de dibujo, así que el hueco no cambia por este issue. Si #45 cambia el radio de dibujo o de la partícula, repite los bancos 2 y 3.
- **#39 (puente agua → disparos):** no depende de estas fuerzas; el frenado del puente es aparte ([7.6](#76-puente-agua--disparos--39)). Sí depende del costo: con la presión estática del agua del nivel, la inundación al tope ya cuesta ~7,2 ms y al puente le quedan ~0,8 ms.

## 7.6 Puente agua → disparos ✅ #39

**Problema.** Los disparos (radio 0,1 m) y el agua del nivel (0,25 m) están en sistemas distintos y LiquidFun no los hace interactuar: un disparo atravesaría la pileta o la inundación. Hasta ahora, `limpiarParticulas` borraba los disparos que entraban al agua, y el usuario lo vio como "los disparos desaparecen". El sistema único se rechazó ([arriba](#un-solo-sistema-para-todos-los-líquidos--rechazado-1811)).

**Decisión.** Un **puente en un solo sentido**. Una vez por paso fijo, después de `stepWorld`, se detectan los disparos que están dentro del agua del nivel y se les escribe la velocidad: frenado hacia la velocidad local del agua y flotación según el fluido. El agua del nivel no se toca: los disparos no la desplazan. Los disparos ya no se borran al entrar al agua.

### Detección: grilla de agua por paso

- **Grilla** de celdas de `cell` = 0,5 m sobre `LEVEL.bounds` (56 × 32 m → 112 × 64 = 7.168 celdas). Los buffers son arrays tipados de JS que se crean una vez en el constructor: `count` (`Uint16Array`), `sumVx`/`sumVy` (`Float32Array`), sus sumas vecinas y `depth` (`Float32Array`). Se limpian con `fill(0)` en cada paso.
- **Pasos**, una vez por paso fijo:
  1. **Agua tranquila.** Una pasada por las partículas del agua del nivel (posición y velocidad leídas de `HEAPF32`). Solo cuentan las que tienen |v| < `calmSpeed` = 4 m/s. Cada una suma 1 y su velocidad a su celda. Así **la lluvia en vuelo y la salpicadura no son agua**, sin depender de la marca de `userData`.
  2. **Vecindad.** Una caja 3×3 separable (dos pasadas sobre la grilla) da `n3` (partículas en 1,5 × 1,5 m) y la velocidad media local `u = sumV3 / n3`. Con `density` 6,3/m², una vecindad llena tiene ~14 partículas y una de superficie, ~7.
  3. **Celda mojada** si `n3 ≥ minNeighbors` = 4. Una celda suelta con una gota o dos (lluvia que cae, salpicadura) no moja.
  4. **Profundidad** por columna, de arriba hacia abajo: `run = mojada ? run + cell : 0`; `depth = mojada ? run − cell/2 : 0`.
- **Por qué no la superficie por columna** (`Flood.surfaceAt`): cada consulta recorre toda el agua del nivel, O(N). Con ~1.200 disparos serían ~6,6 M lecturas por paso. Además, una altura por columna no distingue capas: con un charco sobre una plataforma y agua más abajo, un disparo que está en el aire debajo de la plataforma se tomaría como sumergido. La grilla sirve igual para la pileta (antes de la inundación), la inundación y los charcos, y no necesita `flood.level`.
- **Costo estimado:** ~5.500 lecturas de agua, ~3 × 7.168 operaciones de grilla y ≤ 1.500 disparos: **~0,1–0,15 ms por paso**, ≤ 0,3 ms por frame con dos pasos. Entra en el margen de ~0,8 ms que deja la inundación al tope (~7,2 ms con #40). Es una estimación: se mide en el test.

### Respuesta por fluido (datos en `WEAPONS[].immersion`)

Para cada disparo dentro de una celda mojada (salvo zombis):

- **Sumersión:** `s = clamp(depth / fullDepth, 0, 1)`, con `fullDepth` = 0,5 m. Crece con la profundidad cerca de la superficie y se satura bajo el agua, como el empuje de Arquímedes, que es constante una vez sumergido. La transición evita que los disparos reboten en la superficie.
- **Frenado lineal hacia el agua:** `v ← u + (v − u) · exp(−drag · s · dt)`. Es exacto para el arrastre lineal y estable con cualquier `dt`. Como frena hacia la velocidad local `u`, las corrientes y los chapuzones arrastran los disparos.
- **Flotación:** `vy += buoyancy · g · s · dt`, con `buoyancy` = ρ_agua / ρ_fluido (adimensional). La gravedad ya la aplica el motor: con `buoyancy` = 1 el fluido queda neutro bajo el agua. `g` = 10 m/s² llega por constructor, no se lee del mundo, para no crear un `b2Vec2`.
- **Velocidad terminal bajo el agua:** `g · (buoyancy − 1) / drag` (negativa = se hunde).

| Fluido | `buoyancy` | `drag` (1/s) | Terminal | Resultado |
|---|---|---|---|---|
| Agua | 1,0 | 10 | 0 | Neutra: entra a 14 m/s, se frena en ~1,4 m y deriva con el agua |
| Ácido | 0,95 | 10 | −0,05 m/s | Casi neutro: se mezcla y se asienta despacio en el fondo |
| Lava | 0,38 | 6 | −1 m/s | **Se hunde** (densidad ~2,6). Con #30 se vuelve piedra |
| Miel | 0,7 | 14 | −0,2 m/s | Se hunde lento |

Se descartó el **arrastre cuadrático**: con pasos de 1/60 s y velocidades de entrada de 8–14 m/s necesita limitarse para no invertir la velocidad, y en el juego no se nota la diferencia. Los valores son perillas de datos: si se ven mal en el navegador, se cambian en la tabla.

### Cuándo y dónde

- **Paso fijo:** es física, como el movimiento, así que se aplica **una vez por paso** dentro del `while` del loop, con `dt` = `STEP_SETTINGS.dt`. El orden queda `flood.step` → `stepWorld` → **`immersion.step(dt)`** → `damage.process` → golpes. Como va después de `stepWorld`, los índices son los del paso que terminó y no se crea ni se destruye nada. *Verificado* que escribir el buffer de velocidad persiste (viento, [04-fluidos](04-fluidos.md#las-armas)).
- **Zombis:** `DestroyParticle` marca la partícula y el motor la quita en el próximo `Step`; los índices del paso siguen valiendo (lo mismo supone `damage.process`). *Por verificar en el test:* la partícula consumida por el daño no rompe el puente.
- **Agua disparada que entra al agua del nivel:** **se queda** como partícula de disparo, frenada y neutra, y vence con su tramo a los 6 s (`liveShotFloor`), como cualquier charco. No se "funde" ni se borra, porque el usuario se quejó de que los disparos desaparecen. El tope de 1.500 no se ve afectado: el presupuesto ya suponía 6 s de vida ([09](09-arquitectura.md#93-presupuestos-y-métricas)).
- **Contactos:** un disparo sumergido sigue tocando cuerpos. El ácido dentro de la inundación sigue dañando, y el agua sigue mojando.

### Interfaz para #30

- `immersion.submerged`: `Int32Array` de índices de disparos sumergidos, con capacidad `GetMaxParticleCount()` del sistema de disparos (1.500).
- `immersion.kinds`: `Uint8Array` paralelo, con el id de `FLUID`.
- `immersion.count`: cuántos son válidos.
- Valen desde `immersion.step` hasta el próximo `stepWorld` (el motor compacta los índices al borrar). El tipo sale del color de la partícula con `fluidFromColor`, que pasa a `js/weapons.js` y se deriva de los colores de `WEAPONS`. Así el puente no depende de `DamageSystem`.

### Módulo

`js/immersion.js` (nuevo), clase `Immersion`. Ver [09-arquitectura](09-arquitectura.md#91-módulos).

### Verificación esperada (`tests/immersion.test.js`, LiquidFun real)

1. **Por fluido:** nivel real, pileta asentada 2 s y sistema de disparos con `SHOT_SYSTEM`. Se crean 10 partículas de cada fluido en (28, 6), a (0, −10) m/s y con las flags y el color de la tabla. Se avanza con `stepWorld` + `immersion.step`.
   - No se destruye ninguna: el conteo se mantiene.
   - A 1 s, la rapidez media es < 2 m/s.
   - A 3 s: el agua y el ácido quedan entre y 0,5 y 3; la miel baja con una media < 0,5 m/s entre 1 y 3 s; la lava llega al fondo (y < 0,6).
   - Control sin puente: llegan al fondo en < 1 s.
2. **Lluvia no es agua:** con la inundación emitiendo, un disparo quieto a y = 10, lejos del agua asentada, no figura en `submerged`.
3. **Interfaz:** `submerged`/`kinds` contienen los índices y tipos de los disparos dentro de la pileta, y ninguno de los que están fuera.
4. **Costo (gameplay, `tests/helpers/game.js`):** inundación al tope, como en `tests/flood.test.js`, y los dos jugadores disparando agua hacia el agua durante 300 frames con gamepad simulado. Se mide el promedio de `stepWorld` + `flood.step` + `immersion.step` + `damage.process`. Falla por encima de 16 ms y la meta de 8 ms se revisa a mano. `immersion.step` solo: < 0,5 ms de media. Los valores se anotan en [9.2](09-arquitectura.md#92-rendimiento-medido).
5. **Sin borrado:** en esa partida, los disparos que entran al agua siguen vivos hasta su vencimiento.
