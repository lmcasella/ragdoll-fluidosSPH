# 7. Fluidos / SPH (LiquidFun)

> **🔨 #62: se reemplaza por partes.** Esta sección describe lo que está hoy en `main`. El rediseño está en [14-agua](14-agua.md): el agua del nivel pasa a ser un campo de alturas (Saint-Venant 1D) y los disparos pasan a ser agua pura con radio 0,12 m, en un solo sistema líquido con identidad estable por slot. También se reemplazan el puente de §7.6 (#39), el parche del hueco de §7.4 (#45) y el agua del nivel y los presets de §7.5. Cada subsección se marca como reemplazada cuando se mergea su sub-issue. **✅ #71 (0.15.0):** ya no existe el agua del nivel en partículas (pileta e inundación son el campo de alturas), ni el puente de §7.6 (lo reemplaza `src/water/immersion.js`, [14.4](14-agua.md#144-absorción-e-inmersión--71)), ni el dibujo del agua del nivel de §7.4; lo que sigue vigente de §7.4 es el acercamiento del dibujo de las gotas de disparo a los cuerpos. Las partes de §7.2 a §7.6 sobre el agua del nivel quedan como historia.

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
| Agua del nivel | Pileta y lluvia de la inundación (#22) | 0,25 m (477 de la pileta; hasta 5.500 con la lluvia). Se dibuja a 0,28 m | 1 | Ilimitada | ✅ #22; ✅ #62 (#71) la reemplazó por un campo de alturas ([14.3](14-agua.md#143-campo-de-alturas-saint-venant-1d-shallowwater)) |
| Gases | Fuego, viento, vapor | — | Negativa o 0 | Corta (*verificado*: `set_lifetime` del grupo) | 🔨 #16. **Reemplazado por #62:** no hay sistema de gases; fuego, viento y vapor van en el sistema líquido único con empuje en aire calculado ([14.6](14-agua.md#146-disparos-con-agua-pura)) |

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
  - cada partícula es una partícula de PIXI (`ParticleContainer`) con la textura de campo de su material (perfil (1 − (d/R)²)², R = 2,2 radios), generada una sola vez y teñida con el color de la partícula; cada frame solo cambian su posición, escala, giro y tinte (#213, #310);
  - un filtro de umbral propio (`PIXI.Filter`) con solo el umbral de alfa (0,5) funde las gotas vecinas de los líquidos; el vapor va sin umbral y se ve difuso, como una nube;
  - cada material tiene su propia capa (un contenedor de la escena con el filtro), así que materiales distintos no se funden entre sí;
  - una gota en movimiento se estira a lo largo de su velocidad, para que el chorro se vea como un hilo continuo y no como una fila de bolitas (tabla `DROP_STRETCH`); vale igual para disparos y lluvia;
  - las capas de fluido van encima de los robots y debajo del agua del nivel, que las refracta y oscurece con la profundidad como al resto de lo que tiene detrás, y debajo de la capa superpuesta (recogibles, mira, golpes, rueda de armas y debug del mundo); todo en el único canvas de la escena.

  El resultado son **manchas planas**, sin brillo ni volumen. El costo del dibujo con miles de partículas todavía no está medido ([9.2](09-arquitectura.md#92-rendimiento-medido)).
- **Diseño** 🔨 #26 (revisado con #62): **PIXI v8 con sus filtros y filtros propios como `PIXI.Filter`, sin contexto WebGL propio**, y solo para las partículas (disparos, lluvia en vuelo, vapor, fuego). El agua del nivel es un polígono del campo de alturas ([14.3](14-agua.md#render)).
  - Las gotas se funden por la suma de los campos de sus partículas más el umbral de transparencia sobre cada capa (desde #310 ya no hay desenfoque: el campo de cada partícula lo reemplaza).
  - Mejoras sobre lo de hoy: un color por material y por temperatura (lo escribe la térmica), brillo propio en lava y fuego con una capa de mezcla aditiva dentro de la misma escena (nada de un segundo canvas), y borde más claro por un segundo pase con el umbral corrido.
  - Presupuesto: ≤ 2 ms con GPU hasta ~4.000 círculos (relevamiento `F` de #62; el costo escala con la cantidad de círculos, no con el goo).
  - Se descartó el metaball en shader (`metaball.frag.glsl`): exige WebGL propio, que el usuario descartó para el examen.
- **Aspecto por material** 🔨 #350, con filtros de PIXI sobre las mismas capas:
  - **Agua** (la del nivel y las gotas): deja ver lo que tiene detrás, deformado por ondas que se mueven con el tiempo. Mirada de frente es transparente; en la superficie y en el borde de las gotas brilla más y se vuelve casi opaca (efecto fresnel), con una línea de reflejo en la superficie. Cuanto más profunda, más oscura y menos se ve el fondo. Refleja la luz de la lava cercana ([13.3](13-arte.md#133-luz)).
  - **Lava:** brilla con luz propia. Es lisa, sin textura: el interior es más claro que el borde, con un degradé suave; alrededor tiene un halo naranja que se suma a lo que hay detrás. El color sigue la temperatura que escribe la térmica, así que la lava que se enfría deja de brillar.
  - **Ácido:** como el agua, sin refracción, con un brillo verde tenue en el borde.
  - **Miel y el resto:** volumen con un borde más claro y un reflejo arriba, sin brillo propio.
  - El halo y el borde salen del campo de las partículas, no de un desenfoque. El costo no baja los fps de forma medible.
- **Lluvia en vuelo** (#44, **retirado**): los trazos finos de la lluvia, con su canvas aparte, ya no existen. Desde #101 el dibujo de una partícula depende solo de su material, no de su velocidad ni de si es lluvia o disparo ([14.16, I3](14-agua.md#i3-volumen-dibujado-igual-al-físico)), y desde #310 la lluvia es una gota más de la capa del agua, estirada a lo largo de su velocidad como cualquier gota en movimiento (ver "Hoy").
- **Hueco agua-cuerpo** ✅ #45:
  - **Medición** (LiquidFun real, paso fijo del juego, agua en reposo contra piso, pared y una caja dinámica; tests/water-gap.test.js): el centro de las partículas de la primera fila queda a **0,46 m** de la superficie de cualquier cuerpo (1,85 radios físicos de 0,25 m), igual contra el piso estático que contra una pieza dinámica del robot. Con el círculo dibujado de 0,28 m el borde queda a **0,18 m** del cuerpo.
  - **Causa**: es física del motor, no del dibujo ni de las fixtures (el robot se dibuja con sus fixtures reales). El contacto partícula-cuerpo de LiquidFun empuja hasta una distancia de ~0,9 diámetros. Se probaron pressureStrength (0,001 a 0,5), staticPressure*, damping, viscous, density, ejection, repulsive, strictContactCheck y gravityScale: la distancia queda entre 0,37 y 0,50 m (solo baja a 0,29-0,32 m con pressureStrength 0,001, que vuelve el agua compresible y rompe el banco de #40). No hay un parámetro que la acerque sin cambiar el radio.
  - **Filtro goo**: el umbral al 50 % no mueve los bordes rectos (el 50 % del desenfoque cae sobre el borde del círculo); solo redondea esquinas y erosiona gotas sueltas. No agranda ni achica el hueco medido.
  - **Solución (render)**: agrandar el dibujo hasta cerrar 0,18 m dejaría partículas de ~0,46 m de radio, así que no se hizo. skinPosition (src/render/fluidSurfaces.js) dibuja las partículas a menos de snapReach de una superficie (cajas y círculos de las piezas de los robots y sólidos del nivel, collectSurfaces) acercadas por la normal hasta que su borde se mete 0,02 m bajo el cuerpo; el efecto se apaga linealmente entre snapFullReach y snapReach. La física no cambia. Datos en LEVEL.pool.draw (radius 0,28, snapReach 0,9, snapFullReach 0,6 m) para que #26 los reutilice: el metaball puede leer el mismo radio y aplicar el mismo acercamiento a sus kernels. Con el segundo círculo, el hueco de la primera fila queda en -0,02 m (toca el cuerpo) contra +0,18 m antes. **Costo** (Chromium headless, 4.400 partículas en la pileta, dos robots adentro, canvas 1280x720): dibujar el agua pasa de 2,97 a 3,65 ms por frame, unos 0,7 ms de más incluyendo la grilla; sin la grilla eran 1,5 ms.
  - **Límite**: entre piezas finas o cóncavas (por ejemplo entre las patas y el torso, bolsillos de menos de ~1 m) las partículas no entran, y ese vacío sigue visible; cerrarlo requiere el metaball de #26 o una máscara de agua.
  - **Disparos** (r 0,1 m, dibujados a 0,14 m): sin hueco. Su presión baja (0,005) los deja comprimidos contra el cuerpo, con el centro a 0,006-0,1 m de la superficie, dentro de lo que cubre el dibujo.

## 7.5 Parámetros por sistema ✅ #40

**Problema** (feedback del usuario): las partículas de los disparos "rebotan como pelotitas" y el agua acumulada "parece pelotero, no fluye bien". **Restricción:** las partículas siguen chicas; no se tocan los radios (0,1 m los disparos, 0,25 m el agua del nivel, dibujada a 0,28 m).

**Causa principal.** Los dos sistemas se crean hoy con `dampingStrength` = 0,2, cinco veces menos que el valor por defecto de LiquidFun (1,0); el resto de las fuerzas queda en su valor por defecto. En `SolveDamping` (código fuente de LiquidFun 1.1, `b2ParticleSystem.cpp`), el damping quita la componente normal de la velocidad **de acercamiento** en cada contacto partícula↔partícula y partícula↔cuerpo, en proporción a `dampingStrength × peso`. Con 0,2 casi toda esa velocidad sobrevive y la presión la devuelve hacia afuera: el chorro que llega al piso se comprime y rebota, y el agua apilada vibra. El choque contra un fixture en sí (`SolveCollision`) es inelástico: proyecta la partícula sobre la superficie. El segundo factor es que `b2_waterParticle` no tiene cohesión: la presión es `max(0, …)`, solo repele, así que nada mantiene juntas las gotas que se separan. El build compilado no permite leer ese C++; las dos afirmaciones se confirman con el banco de pruebas de abajo (línea base contra valores nuevos).

### Bindings verificados

*Verificado* por lectura de `vendor/liquidfun.js` (18/11): `b2ParticleSystemDef` expone `set_`/`get_` de `radius`, `maxCount`, `destroyByAge`, `gravityScale`, `density`, `pressureStrength`, `dampingStrength`, `viscousStrength`, `surfaceTensionPressureStrength`, `surfaceTensionNormalStrength`, `repulsiveStrength`, `powderStrength`, `elasticStrength`, `springStrength`, `ejectionStrength`, `staticPressureStrength`, `staticPressureRelaxation`, `staticPressureIterations`, `colorMixingStrength`, `lifetimeGranularity` y `strictContactCheck`. En el sistema ya creado solo se pueden cambiar `SetDamping`, `SetDensity`, `SetGravityScale`, `SetRadius` y `SetStaticPressureIterations` (con sus `Get…`). El resto de las fuerzas **se fija al crear el sistema**. Las flags por partícula se escriben con `b2ParticleDef.set_flags` y `b2ParticleGroupDef.set_flags` (los dos existen).

El build no exporta los nombres de las flags (`b2_tensileParticle`, etc.). Sus valores salen de `b2Particle.h` de LiquidFun 1.1: `water` 0, `viscous` 1 << 5, `tensile` 1 << 7, `staticPressure` 1 << 11, `fixtureContactListener` 1 << 14. Las tres que ya usa el juego (`viscous`, `tensile` y el contact listener) se comprobaron en ejecución con #13. `staticPressure` se comprobó en ejecución (#40): agregar la flag y `staticPressure*` cambia el resultado del banco 2.

### Dónde viven

- **Módulo nuevo `src/fluids/particles.js`** (hoja, sin imports). Es el único que conoce `b2ParticleSystemDef`.
  - `PARTICLE`: las flags (`WATER`, `VISCOUS`, `TENSILE`, `STATIC_PRESSURE`, `CONTACT_LISTENER`).
  - `createParticleSystem(world, params)`: crea el def, llama a `def["set_" + clave](valor)` por cada clave de `params` que no sea `undefined`, crea el sistema y libera el def con `Box2D.destroy`. Si una clave no tiene setter, **lanza un error**: así un error de tipeo en los datos no queda en silencio.
- **Disparos:** `SHOT_SYSTEM` en `src/combat/weapons.js`, junto a `WEAPONS`. `index.js` reemplaza su `b2ParticleSystemDef` a mano por `createParticleSystem(world, SHOT_SYSTEM)`. Las constantes de `weapons.js` que repiten el radio (`PARTICLE_RADIUS`, y `MUZZLE_OFFSET` = radio + 0,05) se derivan de `SHOT_SYSTEM.radius`. Las flags de cada arma siguen en `WEAPONS[].flags`, ahora con las constantes de `PARTICLE`.
- **Agua del nivel:** `LEVEL.pool.flags` (las flags de toda partícula del agua del nivel) y `LEVEL.pool.physics` (fuerzas del sistema) en `src/level/level.js`. `fillPool` llama a `createParticleSystem(world, { radius: pool.radius, maxCount: flood?.maxParticles, ...pool.physics })`. `fillPoolWater` aplica `pool.flags` al grupo, y `Flood` los aplica a su `b2ParticleDef` en el constructor. Así la pileta, la lluvia y el reinicio usan las mismas flags.
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
| `viscousStrength` | **1,0** (✅ #41; antes 0,25, ver abajo) | **0,1** | 0,25 (por defecto) | Disparos: desde #41 solo afecta a la miel (única con flag `viscous`): la espesa para que quede como charco. Agua del nivel: viscosidad baja, que calma el temblor entre vecinas sin frenar el escurrido |
| `surfaceTensionPressureStrength` | 0,2 | (sin uso) | 0,2 (por defecto) | Cohesión de agua, ácido y lava (flag `tensile`) |
| `surfaceTensionNormalStrength` | 0,2 | (sin uso) | 0,2 (por defecto) | Ídem; es la primera perilla si quedan gotas sueltas |

No se usan, aunque estén en el build: `repulsiveStrength`, `powderStrength`, `elasticStrength`, `springStrength`, `ejectionStrength` y `colorMixingStrength` (sus flags no se usan), ni `density` (cambiaría la masa de las partículas y, con ella, el empuje sobre los robots). `staticPressure*` queda como perilla 3 del agua del nivel.

### Flags por fluido

La fuerza es por sistema, pero cada partícula elige qué términos recibe. Con las flags, cada fluido se ve distinto dentro del mismo sistema, sin lógica por arma.

| Fluido | Sistema | Flags (#40) | Antes | Por qué |
|---|---|---|---|---|
| Agua (#18) | Disparos | `TENSILE` | (sin arma) | El agua real tiene tensión superficial: es lo que mantiene unido un chorro y forma gotas. Sin viscosidad: fluye y salpica |
| Ácido | Disparos | `TENSILE` | `WATER` | Igual que el agua. No lleva `viscous`, así que el aumento de #41 no lo afecta |
| Lava | Disparos | `TENSILE \| VISCOUS` (✅ #41 la conserva, ver abajo) | `TENSILE` | #40 le dio `viscous` para que se arrastrara. #41 propuso quitársela: como las tensiones del sistema quedaron en 0, `TENSILE \| VISCOUS` se comporta **igual que la miel** y la lava sería otro charco pegajoso (además, `SolveViscous` arrastra cuerpos). Se distingue por su velocidad (10 m/s, arco) y su quemadura. Ver "Convivencia con #41" |
| Miel | Disparos | `VISCOUS` | `VISCOUS` | Espesa, sin tensión superficial: se extiende como una capa pegajosa en vez de hacer gotas. Con #41 es el único fluido de los disparos con `viscous` |
| Pileta y lluvia | Agua del nivel | `VISCOUS` | `WATER` | Con una viscosidad baja (0,1) las vecinas se mueven juntas y el agua en reposo se aquieta. No lleva `tensile`: a 0,25 m la tensión junta las partículas en bolas (más "pelotero") |

Todas las de los disparos suman `CONTACT_LISTENER` al emitir, como hoy.

**Convivencia con #41** (🔨 decidido en el diseño de #41). `viscousStrength` del sistema de disparos arranca en 0,25 (el valor con el que se jugaba la miel). #41 lo sube, y con la flag de #40 eso también espesaría la lava. **Decisión: la lava pierde `VISCOUS` y vuelve a `TENSILE`.**
- Con las tensiones del sistema en 0 (valores finales de #40), la flag `TENSILE` no hace nada: la lava con `TENSILE | VISCOUS` sería físicamente idéntica a la miel. Con `viscousStrength` alto, la lava también quedaría como charco pegajoso y arrastraría al robot (ver abajo), y la miel dejaría de ser única.
- La lava ya se diferencia del ácido por datos: 10 m/s (no 14), ±1° y caudal 60, así que cae en un arco más corto. Su efecto es la quemadura, no la traba.
- Es un cambio de datos (`WEAPONS[LAVA].flags`). **Condición:** con `TENSILE` sola, la lava tiene que cumplir el banco 1 con los valores de `SHOT_SYSTEM`. Antes de #40 rebotaba 1,34, pero con damping 0,2; con damping 1,0 y `pressureStrength` 0,005 se espera algo como el ácido (0,11). Si no cumple, se vuelve a `TENSILE | VISCOUS`, se acepta que se espese y se anota la medición de los dos casos en la tabla.

El agua y el ácido no llevan `viscous` y no se ven afectados.

**Resultado de #41 ✅.** Lava: con `TENSILE` sola el banco 1 da aisladas 13,3 % (> 10 %) y rebote 0,135, así que se **vuelve a `TENSILE | VISCOUS`**, como pedía la condición de arriba; con `viscousStrength` 1,0 queda más espesa que antes (rebote 0,025, aisladas 0 %, `spread` 2,06 m). Miel: ver el barrido en el párrafo siguiente.

**Valor de `viscousStrength` para la miel** (✅ #41: **1,0**). En `SolveViscous` (LiquidFun 1.1, `b2ParticleSystem.cpp`), cada contacto entre partículas `viscous` les acerca las velocidades en proporción a `viscousStrength × peso`; con varias vecinas por partícula, un valor mucho mayor que 1 puede sobrecorregir y oscilar (el mismo argumento que el tope de 1 del damping). La misma función arrastra a los cuerpos que tocan partículas `viscous` (impulso de signo contrario). *No verificado en ejecución*: el build no deja leer el C++; se confirma con el banco.
- **Barrido:** 0,25 (línea base) → 0,5 → 0,75 → 1,0. Se queda el **valor más alto** que cumpla todos los criterios del banco 1 de la miel, incluidos los nuevos de charco. Propuesta inicial: **1,0**. No se pasa de 1,0 sin una medición que muestre que no oscila.
- **Criterios nuevos del banco 1, solo para la miel** (métricas nuevas de `shotBench`, en el mismo paso `measuredAtStep`):
  - `spread`: ancho del charco, percentil 95 menos percentil 5 de la `x` de las partículas con `y ≤ 0,5 m`. **Criterio (ajustado en #41):** el `spread` con el valor final es menor que con 0,25 (se corren las dos en el mismo test: el criterio es relativo). El 0,6 × original no se alcanza: el ancho lo fija la cantidad de movimiento del disparo.
  - `restSpeedP95`: percentil 95 de la rapidez de esas partículas. **Criterio:** < 0,1 m/s (el charco no oscila ni "hierve").
- La lava se corre con sus flags nuevas y también con `TENSILE | VISCOUS` y el valor nuevo, para dejar registrada la alternativa descartada.
- **Medido (✅ #41, `shotBench` en `tests/fluid-feel.test.js`):**

  | `viscousStrength` | `spread` (m) | `restSpeedP95` (m/s) | Rebote | Aisladas | Alcance de la miel desde la boca (m) |
  |---|---|---|---|---|---|
  | 0,25 | 3,23 | 0,103 | 0,111 | 0 % | 3,65 |
  | 0,5 | 2,76 | 0,068 | 0,079 | 0 % | 2,84 |
  | 0,75 | 2,82 | 0,055 | 0,068 | 0 % | 2,61 |
  | **1,0** | **2,84** | **0,051** | **0,052** | **0 %** | **2,15** |
  | 1,5 (informativo) | 2,55 | 0,046 | 0,034 | 0 % | — |
  | 2,0 (informativo) | 2,24 | 0,048 | 0,026 | 0 % | — |
  | 4,0 (informativo) | 13,4 | 0,030 | 0,052 | 4 % | — |
  | 8,0 (informativo) | 70 | 33 | 1,39 | 84 % | — |

  - **Criterio de ancho (aceptado como "reduce el ancho"):** ningún valor hasta 1,0 baja el `spread` a 0,6 × el de 0,25 (1,94 m); con 1,0 es 0,88 × (miel a 8 m/s). El ancho lo fija sobre todo la cantidad de movimiento del disparo (la miel patina por el piso), no la viscosidad. Con 2,0 llega a 0,69 × y con 4,0 oscila y explota (la miel se dispersa a 13 m), de modo que el tope de 1,0 del diseño se respeta y no se probó nada intermedio entre 2,0 y 4,0. Se quedó en 1,0 (el más alto permitido que cumple rebote, aisladas y `restSpeedP95`). El test exige que reduzca el ancho (< 1 ×) y que `restSpeedP95` sea < 0,1.
  - **Costo de la viscosidad alta:** el alcance de la miel cae de 3,65 m (0,25) a 2,15 m (1,0) con 8 m/s. Se compensa subiendo la velocidad de la miel en `WEAPONS` (sin tocar `viscousStrength`). **Barrido de `speed` con 1,0** (alcance desde la boca / `spread` / `restSpeedP95` / rebote / aisladas / partículas que llegan al piso; el banco exige ≥ 20):

  | `speed` (m/s) | Alcance (m) | `spread` | `restSpeedP95` | Rebote | Aisladas | Llegan al piso |
  |---|---|---|---|---|---|---|
  | 8 | 2,15 | 2,84 | 0,051 | 0,052 | 0 % | 26 |
  | 10 | 2,35 | 2,60 | 0,072 | 0,052 | 0 % | 24 |
  | 11 | 2,47 | 2,81 | 0,061 | 0,044 | 0 % | 24 |
  | 12 | 2,61 | 2,76 | 0,045 | 0,041 | 0 % | 23 |
  | 16 | 2,77 | 2,30 | 0,074 | 0,062 | 0 % | 21 |
  | 17 | 2,84 | 2,43 | 0,050 | 0,073 | 0 % | 21 |
  | **18** | **2,96** | 2,24 | 0,078 | 0,074 | 0 % | 20 |
  | 19 | 3,14 | 2,45 | 0,050 | 0,065 | 0 % | 19 |
  | 20 | 3,31 | 2,17 | 0,066 | 0,089 | 0 % | 18 |
  | 22 | 3,75 | 2,16 | 0,073 | 0,065 | 0 % | 18 |

  Con 10–12 m/s no se llega a 3 m (2,35–2,61 m). Se eligió **18 m/s**: es la más alta que mantiene el banco con los 20 de partículas que llegan al piso (con 19 o más, el chorro se apila en una columna y llegan menos). Con 18 m/s el `spread` con 1,0 es 0,87 × el de 0,25 y `restSpeedP95` 0,078.

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
| ✅ #41: rebote / aisladas de la miel con 1,0 y 18 m/s | — | 0,074 / 0 % | ≤ 0,20 y ≤ 10 % |
| ✅ #41: rebote / aisladas de la lava con `TENSILE \| VISCOUS` y 1,0 (la que se conserva) | — | 0,025 / 0 % | ≤ 0,20 y ≤ 10 % |
| ✅ #41: rebote / aisladas de la lava con `TENSILE` sola (descartada) | — | 0,135 / **13,3 %** | ≤ 0,20 y ≤ 10 %: **no cumple** |
| ✅ #41: `spread` de la miel, 0,25 → 1,0 | — | 3,23 → 2,84 m (0,88 ×, miel a 8 m/s); a 18 m/s: 2,58 → 2,24 m (0,87 ×) | reduce el ancho (el 0,6 × original no se alcanza) |
| ✅ #41: `restSpeedP95` de la miel con 1,0 | — | 0,078 m/s a 18 m/s (con 0,25: 0,185) | < 0,1 m/s |
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
- **#41 (miel muy viscosa)** ✅: sube `SHOT_SYSTEM.viscousStrength` (barrido hasta 1,0), le quita `VISCOUS` a la lava y repite el banco 1 con la miel **y la lava**, más las métricas de charco de la miel (ver "Convivencia con #41"). La regla de juego que pega al robot está en [04-fluidos](04-fluidos.md#miel-pegajosa-regla-compartida--41).
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
- **Agua disparada que entra al agua del nivel:** **se queda** como partícula de disparo, frenada y neutra, y no vence (#160), como cualquier charco. No se "funde" ni se borra, porque el usuario se quejó de que los disparos desaparecen. Bajo carga rige el recorte `PERF` ([04](04-fluidos.md)).
- **Contactos:** un disparo sumergido sigue tocando cuerpos. El ácido dentro de la inundación sigue dañando, y el agua sigue mojando.

### Interfaz para #30

- `immersion.submerged`: `Int32Array` de índices de disparos sumergidos, con capacidad `GetMaxParticleCount()` del sistema de disparos (1.500).
- `immersion.kinds`: `Uint8Array` paralelo, con el id de `FLUID`.
- `immersion.count`: cuántos son válidos.
- Valen desde `immersion.step` hasta el próximo `stepWorld` (el motor compacta los índices al borrar). El tipo sale del color de la partícula con `fluidFromColor`, que pasa a `src/combat/weapons.js` y se deriva de los colores de `WEAPONS`. Así el puente no depende de `DamageSystem`.

### Módulo

`src/water/immersion.js` (nuevo), clase `Immersion`. Ver [09-arquitectura](09-arquitectura.md#91-módulos).

### Verificación esperada (`tests/immersion.test.js`, LiquidFun real)

1. **Por fluido:** nivel real, pileta asentada 2 s y sistema de disparos con `SHOT_SYSTEM`. Se crean 10 partículas de cada fluido en (28, 6), a (0, −10) m/s y con las flags y el color de la tabla. Se avanza con `stepWorld` + `immersion.step`.
   - No se destruye ninguna: el conteo se mantiene.
   - A 1 s, la rapidez media es < 2 m/s.
   - A 3 s: el agua y el ácido quedan entre y 0,5 y 3; la miel baja con una media < 0,5 m/s entre 1 y 3 s; la lava llega al fondo (y < 0,6).
   - Control sin puente: llegan al fondo en < 1 s.
2. **Lluvia no es agua:** con la inundación emitiendo, un disparo quieto a y = 10, lejos del agua asentada, no figura en `submerged`.
3. **Interfaz:** `submerged`/`kinds` contienen los índices y tipos de los disparos dentro de la pileta, y ninguno de los que están fuera.
4. **Costo (gameplay, `tests/helpers/game.js`):** inundación al tope, como en `tests/flood.test.js`, y los dos jugadores disparando agua hacia el agua durante 300 frames con gamepad simulado. Se mide el promedio de `stepWorld` + `flood.step` + `immersion.step` + `damage.process`. Falla por encima de 16 ms y la meta de 8 ms se revisa a mano. `immersion.step` solo: < 0,5 ms de media. Los valores se anotan en [9.2](09-arquitectura.md#92-rendimiento-medido).
5. **Sin borrado:** en esa partida, los disparos que entran al agua siguen vivos.
