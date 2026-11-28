# 4. Fluidos

Código: tabla de armas y emisor de chorros en `src/combat/weapons.js` (✅ #13), daño en `src/combat/damage.js`, pileta en `src/level/level.js`.

## 4.1 Armas

### Disparo continuo con tanque ✅ #13

- **Disparo:** mientras se **mantiene** el botón (A / RT, Espacio / Enter, clic del J1), el arma emite un **chorro continuo**, como una manguera. Conceptualmente, el robot guarda el líquido en un tanque y lo expulsa a presión.
- **Tanque:** cada arma del inventario tiene el suyo, medido en **partículas**. Cada partícula emitida descuenta 1; vacío, el arma no dispara (el resto del inventario conserva lo suyo).
- **Recarga:** **no se recarga sola**. El tanque se llena:
  - al empezar cada ronda y en la revancha (el robot se vuelve a crear con su inventario inicial);
  - al recoger el arma en el mapa, aunque ya esté en el inventario ([4.2](#42-recogida-e-inventario), #14). Esto vale también para el agua, que además aparece como recogible.

  Así se limita el disparo y se incentiva el golpe melee.
- **HUD:** cada jugador tiene una barra de tanque de 180 × 10 px debajo del texto de salud, alineada a su lado de la pantalla. El relleno es del color del arma y su largo es `tanks.get(weapon) / tanque`, sobre un fondo `rgba(255,255,255,0.15)`. Vacía, se muestra "VACÍO" en rojo. `drawHud` recibe la tabla de armas (nombre, color, tanque) en lugar de `NOMBRES_ARMAS`.
- **Cuándo emite:** solo con la ronda en juego (`Match.state === "playing"`), con el robot vivo y sin golpe en curso. Después de un reinicio de ronda o de la revancha hay que **soltar el botón** antes de volver a disparar: si no, el mismo botón que pidió la revancha vaciaría el tanque en el arranque.

#### Emisión: partículas sueltas, una vez por frame

El chorro es una fila de partículas sueltas, separadas un poco menos que su diámetro para que se vean juntas. No es un grupo que sale como una bala.

> **Vigente desde #69 y #100:** el radio (0,06 m), la separación (`speed/rate` ≥ `1,5 r`, un carril), el tiempo de emisión (tiempo físico de los pasos del frame anterior, no el `dt` del frame) y los caudales y tanques están en [14.6](14-agua.md#146-disparos-con-agua-pura). Los valores de esta sección y de la tabla de armas son los anteriores.

- **Ritmo:** cada jugador acumula un crédito de `caudal × dt` por frame (`dt` del frame escalado por `match.timeScale`, igual que la física). Se emiten `floor(crédito)` partículas y se descuentan del crédito. El primer frame de una ráfaga arranca con crédito 1, así el chorro sale en cuanto se aprieta. Por frame se emiten como máximo `ceil(caudal × 0,05)` partículas: después de un frame largo no sale un tapón, y el crédito que sobra se descarta. Al soltar, el crédito vuelve a 0.
- **Posición:** las `n` partículas de un frame se reparten sobre el tramo que el chorro recorrió en ese frame: la partícula `j` (de `0` a `n−1`) nace en `boca + dir × (0,15 m + s × (n−1−j))`, donde `s = velocidad / caudal`. Los 0,15 m son el radio de la partícula más 5 cm, para que no nazca dentro del arma. Con los valores de la tabla, `s` queda entre 0,14 y 0,17 m, cerca del paso de grilla de LiquidFun (0,75 × diámetro = 0,15 m): el SPH casi no las repele al nacer y el chorro no "explota" en pelotitas.
- **Velocidad:** `velocidad × dir'`, con `dir'` = dirección del cañón (`muzzle()`) rotada `dispersión × u`. `u` en [−1, 1] sale de una secuencia determinista por jugador (`u = 2·frac(i × 0,618034) − 1`, con `i` = partículas emitidas por ese jugador): los tests son repetibles y no hay huecos. No se suma la velocidad del robot.
- **Creación:** `particleSystem.CreateParticle(def)`, con un `b2ParticleDef`, dos `b2Vec2` y un `b2ParticleColor` por arma creados una vez en el emisor y reutilizados. Las flags del arma más `CONTACT_LISTENER_PARTICLE`. Sin grupo. Después de cada `CreateParticle` se vuelve a leer `GetUserDataBuffer()`, porque crear puede reubicar los buffers (como en `Flood.emit`). *Verificado* en `vendor/liquidfun.js` (18/11): existen `b2ParticleDef.set_position/velocity/color/flags`, `CreateParticle` devuelve el índice y `Flood` ya lo usa.
- **Patrón:** se dispara una vez por frame, antes de `stepWorld` y fuera de cualquier callback. El movimiento sigue aplicándose una vez por paso.

#### Etiqueta de disparo: una por tramo de 0,1 s

Cada partícula guarda en `userData` el id de su disparo, que en `DamageSystem.shots` apunta a `{ owner, weapon, time }`. Un id por partícula o por frame inflaría el `Map` (120 ids/s con dos jugadores), y un id por ráfaga rompería la gracia de 0,4 s: a mitad de un chorro largo, la partícula recién salida ya tendría la "edad" de la ráfaga.

- **Tramo:** `damage.shotId(owner, weapon, now)` devuelve el id abierto de ese jugador si es del mismo arma y se abrió hace menos de `SHOT_SLICE` = **0,1 s**. Si no, abre uno nuevo. Cada emisión actualiza `time` al instante de la última partícula del tramo. Así la gracia efectiva queda entre 0,4 y 0,5 s, nunca menos: a 14 m/s, la partícula ya está a más de 5 m de la boca.
- **Marca:** `damage.tagParticle(index, id)` escribe el id en `userData`. Reemplaza a `tagShot(group, …)`.
- **Vida del disparo:** desde #160 las partículas no vencen. `SHOT_LIFETIME` = **6 s** solo poda del `Map` los tramos más viejos (la gracia de 0,4 s del daño y `damage.liveShotFloor`). `limpiarParticulas`, una vez por frame, solo destruye las que salen del mundo (±1 m de `LEVEL.bounds`). Si el juego baja de 50 fps sostenidos (frame > 20 ms durante 1 s), `ParticleStore.trim` destruye de a 100 por frame las de id de disparo menor, con las del mapa al final (causa `PERF`). Los disparos que entran al agua del nivel **no se borran**: el puente los frena y los hace flotar o hundirse ([07-sph §7.6](07-sph.md#76-puente-agua--disparos--39)).
- **Tamaño del `Map`:** como máximo 2 jugadores × 10 tramos/s × 6 s = **120 entradas**.

#### Tope de partículas del sistema de disparos

- El sistema de disparos se crea con `maxCount` 1.500 (12.000 desde #100, [14.6](14-agua.md#146-disparos-con-agua-pura)) y `destroyByAge(false)` ✅. Desde #40 ✅, estos valores pasan a `SHOT_SYSTEM` (`src/combat/weapons.js`) junto con las fuerzas del sistema, y `index.js` lo crea con `createParticleSystem(world, SHOT_SYSTEM)` ([07-sph §7.5](07-sph.md#75-parámetros-por-sistema--40)).
  - **Presupuesto:** en 6 s, un jugador no puede emitir más que sus tanques llenos, salvo que recoja armas. Con el inventario completo son 600 partículas (300 + 135 + 90 + 75), 1.200 con dos jugadores. Desde #160 las partículas no vencen: el tope es `maxCount` (si se llega, el emisor corta sin descontar el tanque) y, bajo carga, el recorte `PERF`. Junto con las 5.500 del agua del nivel, el total queda por debajo del techo de 8.000 ([09-arquitectura](09-arquitectura.md#93-presupuestos-y-métricas)). En memoria, es muy poco frente a las 20.000 medidas.
  - **Al llegar al tope:** el emisor compara `GetParticleCount()` con el tope antes de cada partícula. Si no hay lugar, **corta la emisión de ese frame sin descontar el tanque**, y también corta si `CreateParticle` devuelve un índice negativo. No se recicla la partícula más vieja.
  - **Por qué no usar `destroyByAge` del motor** (que viene activo por defecto): `DestroyOldestParticle` necesita el buffer de vencimientos, que solo existe si alguna partícula tiene `lifetime`. El build no expone `SetParticleLifetime`, `SetDestructionByAge` ni `GetDestructionByAge` en el sistema (*verificado* en `vendor/liquidfun.js`, 18/11: sí están `b2ParticleDef.set_lifetime`, `b2ParticleSystemDef.set_maxCount` y `set_destroyByAge`). Dejarlo activo sin vencimientos es comportamiento indefinido. *Verificado* con LiquidFun real (`tests/weapons.test.js`): con `maxCount` y `destroyByAge(false)`, `CreateParticle` devuelve **−1** al llegar al tope, el conteo se queda en el tope y el sistema sigue avanzando sin romperse. El emisor ni siquiera llega a pedirlo: compara antes con `GetMaxParticleCount()`.

#### Daño por caudal

Con chorro continuo, el daño se define como **daño por segundo con el chorro entero sobre el rival** (`dps` en la tabla). Las armas de daño por contacto lo convierten a daño por partícula con `dps / caudal`: si se cambia el caudal, el DPS no cambia. Las armas que aplican un estado (agua, lava, miel) no dañan por partícula: el estado renovado da el DPS (la miel, ninguno: solo pega), con sus constantes en `ActiveRagdoll`. Para esas armas, la columna DPS es una referencia de balance.

#### Tabla de armas (datos en `WEAPONS`, `src/combat/weapons.js`)

> **Caudales y tanques de esta tabla son históricos.** Los valores actuales están en [17-balance](17-balance.md#armas).

El orden de la tabla es el orden del ciclo de armas (LB / RB) y de las teclas numéricas. `weapon` en el jugador es el `id`, que coincide con `FLUID`.

| Arma | `id` (`FLUID`) | Flags | Color | Caudal (p/s) | Velocidad (m/s) | Dispersión | Tanque (p) | Dura | DPS esperado | Por partícula | Se consume | Estado |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Agua** | `WATER` = 4 | `TENSILE` (#40) | 90, 170, 255 | 100 | 14 | ±2° (0,035 rad) | **300** | 3 s | 3 (cortocircuito; dura 3 s más) | `soak()` | No (empuja y deja charco) | ✅ #18 |
| **Ácido** | `ACID` = 1 | `TENSILE` (#40; antes `WATER`) | 50, 255, 50 | 90 | 14 | ±2° (0,035 rad) | 135 | 1,5 s | **20** | 20 / 90 ≈ 0,22 × multiplicador de la parte | Sí | ✅ #13 |
| **Lava** | `LAVA` = 2 | `TENSILE \| VISCOUS` (#41 ✅ evaluó dejarla en `TENSILE` sola y no cumple el banco 1: aisladas 13,3 %; se conserva) | 255, 80, 20 | 60 | 10 | ±1° (0,017 rad) | 90 | 1,5 s | ~12 (4/s por parte quemada, ~3 partes; dura 1,5 s más) | `burn()` | No | ✅ #13 |
| **Miel** | `HONEY` = 3 | `VISCOUS` | 255, 200, 50 | 50 | **18** (✅ #41; antes 8) | ±1° (0,017 rad) | 75 | 1,5 s | 0 (pega al piso) | `stick()` por cercanía, no por contacto (✅ #41; antes `applyHoney()`) | **No** (✅ #41; antes sí): queda como charco, `persist: true` | ✅ #13, ✅ #41 |

- **Columna `persist`** ✅ #41: nueva en `WEAPONS`, `true` solo en la miel (las demás la omiten o la tienen en `false`). Desde #160 ninguna partícula vence, así que la columna no cambia el vencimiento.

- **Balance:** un tanque de ácido entero sobre el rival saca ~30 de vida, menos de un tercio, y el golpe melee saca 8. El agua es débil en daño (~3/s, hasta ~15 con un tanque, por los 3 s de mojado) y fuerte en control: empuja, deja charcos y prepara el arco eléctrico (#31). Por eso tiene el tanque más grande.
- La columna "Dura" es `tanque / caudal`. Las velocidades dan un alcance útil de ~6 m para el agua y el ácido, y de ~3–4 m para la lava, que cae en arco. La miel, con `viscousStrength` 1,0 y 8 m/s, llegaba a solo 2,15 m de la boca (3,65 m con 0,25): el sistema espeso la frena en el aire. #41 sube su velocidad a **18 m/s** y llega a **~3,0 m** (medido con J1 disparando 1,5 s a nivel; barrido de velocidad en [07 §7.5](07-sph.md#75-parámetros-por-sistema--40)). Sigue siendo el arma de menor alcance. Con la velocidad alta el chorro sale casi recto y cae al llegar.
- **Flags** ✅ #40: son las constantes `PARTICLE` de `src/fluids/particles.js` (`TENSILE` = `b2_tensileParticle`, etc.). El emisor les suma `CONTACT_LISTENER`. La fuerza de cada término (tensión superficial, viscosidad, damping) es del sistema de disparos (`SHOT_SYSTEM` en `src/combat/weapons.js`); cada arma elige con sus flags qué términos recibe. Valores, justificación y banco de pruebas en [07-sph §7.5](07-sph.md#75-parámetros-por-sistema--40).
- **En el agua del nivel** ✅ #39: cada fila suma `immersion: { buoyancy, drag }`. `buoyancy` = ρ_agua / ρ_fluido (adimensional) y `drag` = frenado lineal en 1/s. Los aplica el puente de [07-sph §7.6](07-sph.md#76-puente-agua--disparos--39). Un arma nueva solo agrega su fila.

  | Arma | `buoyancy` | `drag` (1/s) | Bajo el agua |
  |---|---|---|---|
  | Agua | 1,0 | 10 | Neutra: se frena en ~1,4 m y deriva con el agua |
  | Ácido | 0,95 | 10 | Casi neutro: se asienta a ~0,05 m/s |
  | Lava | 0,38 | 6 | Se hunde a ~1 m/s |
  | Miel | 0,7 | 14 | Se hunde lento, a ~0,2 m/s |
- **Tipo por color** ✅ #39: `fluidFromColor(r, g)` se mueve de `damage.js` a `weapons.js` y se deriva de los colores de `WEAPONS` (sin `if` por arma). Lo usan `DamageSystem` y el puente.

**Estado** ✅ #13: chorro continuo de partículas sueltas de 0,1 m con los caudales, velocidades y tanques de la tabla. Verificado en Node con gamepad simulado: 1 s de A con el ácido emitió 89 partículas (el tanque bajó 89) y el tanque se vacía a los ~1,5 s. En navegador headless el chorro sale en arco, la barra baja y aparece "VACÍO". Las gotas todavía se separan y rebotan: ✅ #40 sube el damping del sistema a 1,0 y da cohesión con `TENSILE` (criterios: rebote ≤ 20 % de la velocidad de llegada y ≤ 10 % de partículas aisladas 1 s después del impacto; [07-sph §7.5](07-sph.md#75-parámetros-por-sistema--40)). El agua (#18) ✅: en Node, un chorro de agua de J1 a 7,5 m moja a J2 a los 0,5 s y le saca 3,00 de vida por segundo; el tanque de J1 queda en 201 tras 1 s. A 5,5 m, el salpicado vuelve y moja al propio tirador a los ~0,85 s (regla de fuego amigo).

- **Reloj de simulación:** los ids de disparo, la gracia de 0,4 s, la vida de 6 s, el golpe, los estados y la inundación usan un único `simTime` (suma de `frameDt × timeScale`), no `performance.now()`. Así una pestaña oculta o la cámara lenta no vencen disparos ni borran charcos.
- **Recorte por raycaster:** una vez por frame y por jugador que dispara, el emisor lanza un rayo con el raycaster compartido (ignorando el propio robot) y no crea partículas a más de `impacto − 0,1 m`. El chorro no atraviesa paredes ni nace dentro del rival; con el rival pegado al cañón (< ~0,25 m) no sale chorro: a esa distancia se usa el golpe.
- **Golpe:** mientras dura el golpe el emisor recibe "no disparar"; al terminar, volver a apretar es una ráfaga nueva.
- **Reinicio:** `reiniciarRonda` llama a `emitter.reset()` y `damage.resetShots()` (vacía los tramos abiertos sin reusar ids).

### Las armas

| Fluido | Implementación LiquidFun | Comportamiento | Efecto en el robot | Estado |
|---|---|---|---|---|
| **Agua** | Sistema de disparos, `b2_tensileParticle` (#40) | **Arma inicial** de cada robot. Chorro rápido que salpica, empuja y se acumula en charcos | **Cortocircuito:** cada partícula que toca al robot lo moja (`soak()`, regla compartida abajo): −3 de vida por segundo mientras está mojado y 3 s después, con chispas. Arco eléctrico entre robots mojados ([08-raycast](08-raycast.md), #31) | ✅ #18 |
| **Ácido** | Sistema de disparos, `b2_tensileParticle` (#40; antes `b2_waterParticle`) | Rápido, se escurre por las superficies | **DPS 20** por caudal (`dps / caudal` por partícula, que se consume) ✅ #13. Con #19: **corrosión**: la parte queda corroída 4 s y recibe +50 % de daño de cualquier fuente (humo verde) | ✅ #13, 🔨 #19 |
| **Lava** | Sistema de disparos, `b2_tensileParticle \| b2_viscousParticle` (#41 ✅ la conserva: sin viscosidad no cumple el banco 1) | Pesada (más lenta, cae en arco), forma gotas | **Quema:** cada contacto deja la parte quemándose 1,5 s a 4 de daño por segundo. No se consume | ✅ |
| **Fuego** | 🔨 #62: **sistema líquido único** ([14.6](14-agua.md#146-disparos-con-agua-pura)), sin sistema de gases propio. Gas caliente (~800 °C) que sube por empuje de Arquímedes en el aire (`+g ρ_a/ρ_gas`, más arrastre en aire), igual que el vapor ([14.8](14-agua.md#148-térmica-y-fases)); se apaga por enfriamiento o al tocar agua (con #75), y como tope a los 0,6 s (`MATERIALS.fire.maxLife`) | Lanzallamas de corto alcance (~3 m). Sube y se apaga solo | Daño por contacto. Seca el estado mojado | 🔨 #16 |
| **Viento** | 🔨 #62: sistema líquido único. Es aire: su empuje en el aire compensa exactamente la gravedad (`ρ_gas = ρ_a`), así que no hace falta una gravedad 0 por sistema. Velocidad escrita en cada paso; tope de vida de 1,2 s por `ParticleStore` | Ráfaga visible como estelas | **Sin daño.** Empuja por transferencia de cantidad de movimiento | 🔨 #17 |
| **Miel** | Sistema de disparos, `b2_viscousParticle`, `viscousStrength` alto (✅ #41) | Muy espesa: cae en arco y queda como **charco** que no se seca a los 6 s | **Pegajosa** (✅ #41): mientras la toca y 0,3 s después, el robot casi no camina, salta muy poco y recibe una fuerza hacia abajo ([regla](#miel-pegajosa-regla-compartida--41)). No se consume. La misma regla vale para los charcos del mapa (#23, [4.3](#43-peligros-del-mapa)) | ✅ #13 (provisoria: ralentizaba 1 s y se consumía), ✅ #41 |

### Miel pegajosa: regla compartida ✅ #41

**Problema** (feedback del usuario): "¿Por qué la miel desaparece? Fluye como agua; debería ser más pegajosa y pegar a los jugadores al piso". Hoy la partícula se consume al tocar (`applyHoney()` + `DestroyParticle`), el estado dura 60 pasos y la miel tiene la misma viscosidad (0,25) con la que se jugaba antes de #40.

La regla tiene tres partes, cada una en el sistema que le corresponde: **detección** en `DamageSystem.process`, **efecto** en `ActiveRagdoll` y **persistencia** en `limpiarParticulas` con datos de `weapons.js`. La viscosidad es un dato de `SHOT_SYSTEM` ([07-sph §7.5](07-sph.md#75-parámetros-por-sistema--40)).

#### 1. Detección: cercanía por paso, sin callbacks

`BeginParticleBodyContact` solo avisa cuando un contacto **empieza**: un robot parado en el charco deja de recibir avisos y se despegaría a los 0,3 s. `EndParticleBodyContact` tampoco sirve para llevar un conjunto de contactos activos: identifica la partícula por índice, que cambia cuando se destruyen partículas, y los cuerpos se recrean al girar. Y `GetBodyContacts` no tiene `GetBodyContactCount` en el build (ver [Cortocircuito](#cortocircuito-regla-compartida--22)). Se usa lo mismo que la inundación: una **consulta geométrica una vez por paso**, después de `stepWorld`.

- **Dónde:** `DamageSystem.process(now, waterLevel)`, en el mismo lugar que el mojado por nivel. No hay callbacks involucrados, así que respeta "juntar durante el paso, actuar después".
- **Cajas del robot:** `ActiveRagdoll.fixtureBoxes()` devuelve un `Float32Array` **reutilizado** (se crea una vez por robot) con `[minX, minY, maxX, maxY]` de cada fixture más la caja que las une a todas, leídas con `GetAABB(0)` como `lowestPoint()`. Se llama una vez por robot y por paso; el resto es JS puro. No crea memoria nativa.
- **Partículas de miel:** una pasada por el sistema de disparos. Desde #110 la miel ya no se identifica por color ni por `userData`: se identifica por el `kind` de la partícula en `ParticleStore` (`store.kind[slot] === FLUID.HONEY`). Así vale igual la miel disparada y la del mapa (#23), que pasa a ser partículas con `origin` MAP y no tiene id de disparo. Los charcos del mapa no pegan por columnas del campo: el pegado es solo por partículas.
- **"Toca":** el centro de la partícula está dentro de la caja de alguna fixture agrandada `radio + 0,02 m` (radio de `GetRadius()` del sistema, 0,1 m). Primero se descarta con la caja que las une. Las cajas de una pieza inclinada son algo más grandes que la pieza: es un error de unos centímetros y a favor de pegar, aceptable para un efecto de juego.
- **Fuego amigo:** si `userData` de la partícula es un id que sigue en `shots`, y su dueño es el robot y pasaron menos de 0,4 s desde `time`, no cuenta (la misma gracia que el resto). Una partícula sin tramo vivo (miel de más de 6 s o del mapa) pega a cualquiera: pisar el charco propio cuesta.
- **Efecto:** si alguna partícula toca, `player.stick()`. No se encola nada ni se destruye ninguna partícula.
- **`onParticleBodyContact` y la miel:** la rama `HONEY` de `process` se elimina; el callback deja de encolar miel. Una sola fuente de verdad.
- **Costo esperado:** una lectura de color por partícula (≤ 1.500) y, por partícula de miel (≤ ~375), dos comparaciones de caja por robot más las de sus fixtures si entra en la caja que las une. Del orden de decenas de miles de comparaciones en JS por paso: bastante menos de 0,1 ms. Se mide en el test de gameplay y se anota en [09](09-arquitectura.md#92-rendimiento-medido).

#### 2. Efecto: estado `pegado` en `ActiveRagdoll`

> **Retirado.** `STICKY` ya no existe: la miel frena por física, con adherencia viscosa ([14-agua](14-agua.md)). Lo que sigue es historia.

Reemplaza a `honeyTimer` (60 pasos), `applyHoney()` y los valores sueltos de `move()` (3 m/s, salto 3, fricción 0,95). Los valores son datos: `STICKY`, exportado desde `src/ragdoll/ActiveRagdoll.js` junto a las demás constantes de estado.

| Clave | Valor | Efecto | Libre / pegado |
|---|---|---|---|
| `speed` | **0,1** | Factor de la velocidad de caminar | 6 → 0,6 m/s |
| `brake` | **0,5** | Factor de la velocidad horizontal por paso **sin input** (reemplaza la fricción 0,85; antes, con miel, era 0,95: frenaba *menos*) | Se detiene en ~0,1 s |
| `jump` | **0,3** | Factor de la velocidad de salto | 9 → 2,7 m/s |
| `down` | **10** m/s² | Gravedad extra, sumada como `vy -= down × dt` a **todas** las piezas en cada paso (igual que el salto: con la raíz sola, el resto del rig no acompaña) | Gravedad total 2 g: el salto llega a ~0,18 m (≈ 4 m libre) |
| `grace` | **0,3** s | Cuánto dura después de la última vez que tocó miel | — |

- **`stick()`** deja `stickyTimer = STICKY.grace` (renueva). `get sticky()` es `stickyTimer > 0`. `updateStatus(dt)` lo baja con `dt` (segundos, no pasos). Se copia en `copyStateFrom` al girar.
- **En `move(input, dt)`:** `move` recibe el `dt` del paso fijo (`index.js` pasa `STEP_SETTINGS.dt`; por defecto 1/60). Con `sticky`: primero la gravedad extra, después caminar con `6 × speed` o frenar con `brake`, y el salto con `9 × jump`, que pisa `vy` del paso. Así el salto sale entero en su paso y la gravedad extra lo acorta después.
- **Aturdido:** el golpe sigue empujando libre (no se aplica `brake` ni caminar). Es intencional: un golpe puede sacar al rival del charco.
- **En el aire:** si el chorro le pega en el aire, la gravedad extra lo baja más rápido. Es el "pegar al piso" del feedback.
- **Feedback visual:** mientras `player.sticky` (y vivo), `drawRobot` mezcla el color de cada pieza con ámbar (`STICKY_COLOR` 255, 170, 30) con un parpadeo de 3 Hz (mezcla de 0,1 a 0,9), en el mismo estilo que el tinte cian del mojado ([Cortocircuito](#cortocircuito-regla-compartida--22)). Como depende solo del estado, se ve igual con la miel disparada y la del mapa. Verificado en navegador headless (capturas con `stick()` forzado cada frame): el robot alterna entre su color y un ocre/ámbar; se distingue del cian del mojado, que además lleva chispas.
- **Por qué reglas de juego y no física:** LiquidFun no tiene adherencia de partículas a cuerpos (la presión solo repele). La viscosidad sí arrastra cuerpos: según `SolveViscous` de LiquidFun 1.1, las partículas `viscous` en contacto con un cuerpo le aplican un impulso proporcional a `viscousStrength × masa de la partícula × (velocidad relativa)`. Con partículas de 0,1 m ese arrastre es chico frente a un robot de 13 piezas; suma, pero no alcanza. *No verificado en ejecución*: el test de gameplay mide el resultado total.
- **Riesgo:** con 2 g los motores del rig podrían no sostener al robot (se agacha o se cae). El test mide la altura del torso parado en el charco; si cae más de un 10 %, se baja `down` (10 → 5) antes de tocar los otros valores.

#### 3. Persistencia y tope

- **No vence** (como ninguna partícula desde #160). Las causas de destrucción son: salir del mundo y el reinicio de ronda (`reiniciarRonda` destruye todas las partículas del sistema). Desde #39 caer al agua ya no destruye: la miel que entra al agua del nivel queda sumergida y se hunde despacio (`WEAPONS[].immersion`, `buoyancy` 0,7, terminal −0,2 m/s; [07-sph §7.6](07-sph.md#76-puente-agua--disparos--39)), queda en el fondo de la pileta o bajo la inundación y sigue pegando a quien la toque ahí.
- **Sin tope propio desde #160** (antes `PERSIST_MAX`): la miel cuenta para `maxCount` y para el recorte `PERF` como el resto.
- **Al pasar el tope:** en la misma pasada, `limpiarParticulas` junta las partículas persistentes **con `userData > 0`** (las disparadas). Si son más que el tope, destruye las de **id más chico** (las más viejas: los ids crecen con el tiempo) hasta quedar en el tope. La miel del mapa (#23, `userData` 0) no cuenta ni se destruye.
- **Costo:** la pasada ya existe. Ordenar solo pasa cuando se supera el tope y con ≤ ~375 elementos.
- **Por qué no una vida más larga** (por ejemplo 20 s): haría falta un segundo `Map` o un id aparte para los tramos de miel, porque `process` poda `shots` por orden de id. El charco que dura toda la ronda es lo que pidió el usuario, y el tope por cantidad ya protege al sistema.
- **El `Map` de tramos no cambia:** los tramos de miel se podan a los 6 s como todos. Pasado ese tiempo la partícula sigue identificándose por su `kind` y la gracia de 0,4 s ya no aplica.

#### 4. Verificación

Valores de diseño y, entre paréntesis o en la columna "Medido", lo que dieron las pruebas al cerrar #41 (Node, LiquidFun real, `node --test tests/`; el banco está en [07-sph §7.5](07-sph.md#75-parámetros-por-sistema--40)).

- **Estado** (`tests/status.test.js`, sin física): `stick()` deja `sticky`; a los 0,3 s + 1 paso sin renovar ya no; renovar cada paso lo mantiene 3 s; `copyStateFrom` copia `stickyTimer`.
- **Detección** (`tests/damage.test.js`, LiquidFun real): un cuerpo registrado como robot (con `fixtureBoxes()` falso o real) y una partícula con el color de la miel dentro de su caja: `process` llama a `stick()` **en cada paso** durante 3 s sin que nada se mueva (lo que `BeginParticleBodyContact` no lograba) y la partícula sigue existiendo. Con la partícula a 0,2 m de la caja, no pega. Con id de disparo del propio robot y menos de 0,4 s, no pega; a los 0,5 s, sí.
- **Gameplay** (`tests/honey.test.js`, nuevo, con `tests/helpers/game.js` y gamepad simulado). Un charco armado a mano en `game.particleSystem` bajo J2 (filas a 0,15 m, de `x − 1` a `x + 1` m del torso y 3 capas sobre el piso, color de la miel, `VISCOUS | CONTACT_LISTENER`, `userData` 0: el mismo camino que #23). Cada medición se compara con la misma corrida **sin** charco:

  | Medición | Sin charco (esperado) | Con charco: criterio | Medido (sin charco → con charco) |
  |---|---|---|---|
  | Δx del torso con el stick a la derecha 1 s | ≥ 4 m | ≤ 0,2 × sin charco (diseño original: 0,15 ×) | 3,88 m → 0,74 m (0,19 ×). El criterio quedó en **0,2 ×** (decidido en #41) porque el clip de caminar aporta ~0,64 m/s aun con `STICKY.speed` en 0 (con 0,1 da 0,74 m, con 0,07 da 0,70 m); no se suprime el clip. El test exige además ≥ 3,5 m sin charco |
  | Subida máxima del torso al saltar (arriba 0,5 s) | ≥ 2 m | ≤ 0,4 m | 3,88 m → 0,18 m |
  | Altura del torso parado 2 s | referencia | ≥ 0,9 × sin charco (no colapsa con 2 g) | 0,703 m → 0,703 m (1,00 ×): `down` se queda en 10, no hizo falta bajarlo |
  | Quieto 3 s sin input sobre el charco | — | `sticky` en todos los pasos y la misma cantidad de partículas de miel | Cumple (180 frames, misma cantidad) |
  | Charco destruido a mano | — | `sticky` en `false` a los 0,3 s + 1 paso | Cumple: sigue `true` a los 15 frames y es `false` a los 22 (algún frame no completa un paso) |

- **Disparo y persistencia** (mismo archivo): J1 dispara miel 1,5 s a J2 a **~3 m**; J2 dispara ácido hacia arriba al mismo tiempo (a nivel, los dos chorros se cruzan y frenan la miel). J2 queda `sticky`; J1 no queda `sticky` en los primeros 0,4 s. A los 8 s del disparo (más que `SHOT_LIFETIME`) siguen en el sistema **todas** las partículas de miel emitidas (las que cayeron al agua también: #39 no las borra) y no queda ninguna de un disparo de ácido hecho al mismo tiempo. **Medido:** J2 queda pegado; J1 no en los primeros 24 frames; 75 de 75 partículas a los 8 s; en una segunda corrida con J1 a 16,5 m y la mira 30° arriba, 56 de las 75 cayeron a la pileta y las 75 siguen ahí a los 8 s.
- **Costo de la consulta** (medido en Node, 300 partículas de miel y 2 robots): **0,02 ms por paso** (`stickHoney`), de los cuales `fixtureBoxes()` de los dos robots son 0,004 ms. Muy por debajo del 0,1 ms previsto. Anotado en [09 §9.2](09-arquitectura.md#92-rendimiento-medido).
- **Tope:** rellenando el tanque de miel a mano (`tanks.set`), J1 dispara 5 tanques (375 partículas, más que el tope). Después de `limpiarParticulas` quedan como mucho 300 partículas de miel con `userData > 0`, y el id más chico de las que quedan es mayor que el más chico de las que se emitieron. **Medido:** de 376 emitidas quedan 300 y el id más chico es 14 (el primer disparo es el 1).
- **Banco 1** ([07-sph §7.5](07-sph.md#75-parámetros-por-sistema--40)): la miel y la lava siguen cumpliendo rebote ≤ 0,20 y aisladas ≤ 10 %, y la miel cumple los criterios nuevos de charco. **Medido:** rebote y aisladas cumplen para todas las armas; `restSpeedP95` de la miel 0,051 m/s (< 0,1); criterio de ancho: reduce el ancho (`spread` con 1,0 / con 0,25 = 0,87 × a 18 m/s; el 0,6 × original no se alcanzó: lo fija la cantidad de movimiento del disparo). Ver [07 §7.5](07-sph.md#75-parámetros-por-sistema--40).
- **Navegador:** un disparo largo de miel se ve como chorro espeso y deja un charco que no se seca; caminar por él se siente pegado.

### Cortocircuito: regla compartida ✅ #22

El agua de la inundación y el arma de agua (#18) dañan igual, así que la regla vive en un solo lugar y cada fuente solo la dispara.

- **Estado `mojado`** en `ActiveRagdoll`: `soak()` lo deja en `WET_TIME` = **3 s** (si ya estaba mojado, lo renueva). En `updateStatus(dt)`, una vez por paso fijo, mientras quede tiempo: **−3 de vida por segundo** (`SHORT_CIRCUIT_DPS`) con `takeDamage`, **sin multiplicador por parte** (es una falla de todo el robot, no un impacto). El tiempo baja con `dt`. Se copia en `copyStateFrom` al girar.
- **Quién lo dispara:** siempre `DamageSystem.process`, después de `stepWorld` (patrón "juntar durante el paso, actuar después").
  - **Inundación (#22):** `process(now, waterLevel)` recorre los robots registrados y moja al que tiene el borde inferior de alguna parte (`lowestPoint()`) por debajo del agua. `waterLevel` es un número o una función `(x) => altura`; el juego pasa `Flood.surfaceAt` (superficie real local) y `-Infinity` fuera de `playing`. No usa callbacks. Antes de los 60 s de ronda no hay agua que moje (la pileta no moja; ver [02-partida](02-partida.md#21-inundación--22)).
  - **Arma de agua** ✅ #18: `onParticleBodyContact` encola el contacto de una partícula `FLUID.WATER` del sistema de disparos, como el ácido. Después, `process` llama a `soak()`. La partícula **no se consume**: sigue empujando y forma charco. Rige la regla de fuego amigo: el agua propia no moja a su dueño durante la gracia de 0,4 s del tramo de disparo. Pasado ese tiempo, sí lo moja (pisar su propio charco cuesta).
- **Visual:**
  - tinte cian intermitente mientras dura el estado ✅ (#22);
  - **chispas** ✅ #18: mientras `player.wet`, `drawRobot` dibuja 3 chispas por frame, cada una un zigzag de 3 tramos de 0,3 m en amarillo o blanco (`#fff27a` / `#e8ffff`, 3 px; con 0,12 m no se veían al zoom de juego), que nace en el centro de una pieza del robot. La pieza y los ángulos salen de `floor(now × 12)`, así que las chispas saltan a 12 Hz, sin `Math.random` ni objetos por frame. Como dependen solo del estado, se ven igual cuando moja la inundación y cuando moja el arma;
  - el arco entre robots mojados es de #31.
- No se usan contactos partícula↔cuerpo para la inundación: `BeginParticleBodyContact` solo avisa cuando un contacto empieza, y un robot quieto bajo el agua podría dejar de recibir avisos. Leer todos los contactos del paso tampoco es posible: `GetBodyContacts` existe en el build pero no hay `GetBodyContactCount` (*verificado* en `vendor/liquidfun.js`, 18/11).

**¿El fuego es un fluido?** Sí, gaseoso: es SPH igual que los líquidos, pero en otro sistema de partículas con gravedad negativa (sube) y tiempo de vida corto (se extingue).

**El viento como impulso:** LiquidFun no tiene "fuerza de viento". La ráfaga es un grupo de partículas sin gravedad cuya velocidad se escribe en cada paso (*verificado*: escribir el buffer de velocidad persiste). Al tocar un cuerpo le transfieren cantidad de movimiento, y como las partículas se ven, el empuje se entiende.

## 4.2 Recogida e inventario ✅

- **Arranque** ✅ #18: cada robot empieza cada ronda, y la revancha, con el **agua equipada y su tanque lleno**, más el golpe melee. El agua reemplaza al ácido como arma inicial. El inventario inicial es un dato (`LOADOUT` en `src/combat/weapons.js`):
  - **#13** ✅: todas las armas de la tabla con tanque lleno; arranca equipada la primera fila. Es provisorio, para poder probar.
  - **#18** ✅: arranca equipada el agua. Mientras #14 no esté, el resto de las armas sigue en el inventario inicial, así se pueden probar.
  - **#14** ✅: el inventario inicial queda **solo con el agua**; el ácido, la lava y la miel se recogen en el mapa (el fuego no existe todavía).
- **Inventario en el jugador:** `player.weapon` (id del arma equipada) y `player.tanks` (`Map` id → partículas que quedan). Viven en `ActiveRagdoll` porque son estado del jugador: se copian en `copyStateFrom` al girar y se pierden al recrear el robot en cada ronda. `ActiveRagdoll` no conoce la tabla: el inventario lo carga la raíz de composición con `equipLoadout(robot)` de `src/combat/weapons.js` al crear cada robot.
- **Puntos de aparición** ✅ #14 (`LEVEL.pickups`, `src/level/pickups.js`): las armas están en puntos fijos del mapa, definidos como datos del nivel. Al tocar un arma (sensor de Box2D), se suma al inventario con el tanque lleno; si ya estaba, se rellena. Reaparece en su punto a los 15 s. **El agua también aparece como recogible**: es su única recarga dentro de la ronda (ver 12.1). Puntos (m, centro del ícono, 0,6 m sobre la plataforma): ácido (28; 14,2), lava (13; 10,9) y (43; 10,9), miel (4,5; 7,6) y (51,5; 7,6), agua (26; 8,4). Sensor de radio 0,5 m; al empezar cada ronda todos están disponibles.
- **Ítem de reparación** ✅ #156 (`kind: "repair"` en `LEVEL.pickups`, `REPAIR` en `src/level/pickups.js`): suma `REPAIR.hp` = 35 de salud, con tope en la salud máxima (`MAX_HP`). Con la salud llena no se recoge y sigue activo. Reaparece a los `REPAIR.respawn` = 20 s de juego (las armas, a los 15 s). Ícono: tuerca hexagonal gris con borde verde. Punto del clásico: (30; 8,4), en la plataforma central de la pileta. El bot con menos de `BOT.repairHp` = 40 de salud lo busca si la ruta tiene `pickupReach` aristas o menos. Suena `pickup_5`.
- **Cajas** 🔨 #358: cada arma y cada reparación aparece **dentro de una caja de acero** que es un objeto físico, no un dibujo fijo.
  - La caja mide 0,7 m de lado, pesa unos 20 kg y aparece en el punto del ítem: cae, se apoya en la plataforma, choca con los robots y con otras cajas, y un robot la puede empujar o tirar de la plataforma. Los fluidos la mojan y la empujan como a cualquier objeto.
  - Tiene 30 de resistencia. La gastan los golpes melee (el daño del golpe), los choques fuertes (por encima de 8 m/s, el doble de la velocidad sobre ese umbral) y el ácido y la lava que la tocan (1 por cada 10 partículas que la tocan). La caja no tiene dueño: el daño no cuenta para ningún jugador.
  - Al romperse se parte en 4 pedazos que salen despedidos, caen, chocan con el escenario y desaparecen a los 1,5 s. En su lugar queda el ítem como hoy, flotando donde estaba la caja, y se recoge al tocarlo.
  - Si la caja cae al agua o fuera del mapa, se rompe ahí y el ítem queda en ese lugar; si queda bajo el agua, el ítem sube a la superficie.
  - Después de recogido el ítem, a los 15 s (reparación, 20 s) cae una caja nueva en el punto original.
  - Se ve como una caja de acero de las plataformas (§13.2, con la misma luz) con un panel del color del arma y su inicial, o con la tuerca de la reparación. A medida que pierde resistencia se oscurece y se marca de óxido.
  - El bot que quiere un ítem va hasta la caja y la golpea hasta romperla; si la caja quedó fuera de su alcance, la descarta.
  - Los valores (tamaño, peso, resistencia, umbral de choque, daño por partícula, pedazos y su duración) van en la tabla `CRATE`.
- **Rueda de armas** ✅ #15 (revisada con el remapeo del 18/11; controles en [10](10-controles.md#101-mapeo--remapeo-pedido-por-el-usuario-el-1811)):
  - mantener LB ≥ 0,25 s (`TAP_MAX`; Q de respaldo) abre un círculo con las armas del inventario, repartidas en sectores iguales desde arriba en sentido horario;
  - se elige con el **stick derecho** (W/A/S/D de respaldo) y se equipa al **soltar LB**; con el stick al centro se cancela;
  - mientras está abierta, el stick no apunta (la mira conserva la dirección) y el juego sigue corriendo;
  - un toque corto de LB (< 0,25 s) es arma anterior y RB es arma siguiente;
  - **ya no reemplaza** a la elección directa: la cruceta (y 1–4) sigue eligiendo por posición en la tabla;
  - `Input` entrega `wheel` y `wheelPick`; el sector lo calcula la raíz de composición, que conoce el inventario.

## 4.3 Peligros del mapa

| Peligro | Implementación | Efecto | Estado |
|---|---|---|---|
| **Pileta** | Agua SPH al fondo del hueco central + sensor | Caer = robot destruido | ✅ ([05-escenario](05-escenario.md#52-pileta)) |
| **Inundación** | Lluvia en el sistema del agua del nivel, con nivel controlado | Bajo el agua real = mojado (cortocircuito) | ✅ #22 ([02-partida](02-partida.md#21-inundación--22)) |
| **Charcos de miel** | Partículas `b2_viscousParticle` en el **sistema de disparos** (para recibir su `viscousStrength`), con `origin` MAP en `ParticleStore` (la miel se identifica por su `kind`, no por color ni `userData`) y `CONTACT_LISTENER`, creadas al colocar el nivel. Sin tramo de disparo: no vencen ni cuentan para `PERSIST_MAX` | La regla de la miel pegajosa de #41, sin lógica nueva ([4.1](#miel-pegajosa-regla-compartida--41)) | 🔨 #23 (depende de #41) |
| **Ventiladores** | Emisor de viento hacia arriba | Ascensor de aire a plataformas altas | 🔨 #24 |
| **Goteo de ácido** | Emisor periódico desde el techo | Fuerza a moverse | 💬 |
| **Cascada de lava** | Emisor continuo | Corta el mapa; se apaga con agua | 💬 |
| **Gel elástico** | Grupo `b2_elasticParticle` | Trampolín deformable | 💬 |

## 4.4 Reacciones entre fluidos 🔨 #30

> **🔨 #62 reemplaza este diseño:** las reacciones se modelan con entalpía y calor latente (lava → piedra, agua ↔ vapor) y con concentración (miel diluida), no con reglas de contacto. Con valores reales, la lava tarda minutos en solidificar ([14.8](14-agua.md#148-térmica-y-fases), [14.9](14-agua.md#149-mezcla-por-concentración-y-viscosidad)). El estado `pegado` de la miel (#41) se retira con la adherencia de #77 (decisión D4); hasta entonces sigue el temporizador ([14.10](14-agua.md#1410-adherencia)).

Hay dos fuentes de detección, según dónde está el agua:

- **Entre disparos** (lava disparada + agua disparada): contactos **partícula↔partícula** (`BeginParticleContact`) dentro del sistema de disparos. Se identifican por color o por flags.
- **Disparo + agua del nivel** (pileta e inundación): los sistemas son distintos y no hay contactos. Se usa la lista del puente de #39: `immersion.submerged`, `immersion.kinds` y `immersion.count`, válidos entre `immersion.step` y el próximo `stepWorld` ([07-sph §7.6](07-sph.md#76-puente-agua--disparos--39)). Los consumidores de la lista filtran por material: la ebullición en película y la reacción con el agua del nivel valen solo para la lava (la miel sumergida también figura en la lista, [14.4](14-agua.md#144-absorción-e-inmersión--71)). Hoy no hay consumidores.

En los dos casos, el cambio (flags, destrucción, vapor) se aplica después de `stepWorld`, nunca en un callback.

| Reacción | Resultado |
|---|---|
| Lava + agua | La lava se vuelve **piedra** (`b2_wallParticle`, estática, gris) y sale **vapor** en el sistema de gases: **plataformas temporales** que se rompen con el tiempo |
| Fuego + agua | Se apagan los dos y queda vapor |
| Fuego + miel | Caramelo: más viscoso y quema poco (💬) |
| Ácido + agua | El ácido se diluye y pierde daño (💬) |

**Explosión de vapor** (#32): cuando reacciona mucha lava de una vez, se lanzan rayos desde el centro y solo se empuja lo que tiene línea de visión ([08-raycast](08-raycast.md)).
