# 4. Fluidos

Código: tabla de armas y emisor de chorros en `js/weapons.js` (🔨 #13; hoy `disparar` y `ARMAS` en `index.html`), daño en `js/damage.js`, pileta en `js/level.js`.

## 4.1 Armas

### Disparo continuo con tanque 🔨 #13

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

- **Ritmo:** cada jugador acumula un crédito de `caudal × dt` por frame (`dt` del frame escalado por `match.timeScale`, igual que la física). Se emiten `floor(crédito)` partículas y se descuentan del crédito. El primer frame de una ráfaga arranca con crédito 1, así el chorro sale en cuanto se aprieta. Por frame se emiten como máximo `ceil(caudal × 0,05)` partículas: después de un frame largo no sale un tapón, y el crédito que sobra se descarta. Al soltar, el crédito vuelve a 0.
- **Posición:** las `n` partículas de un frame se reparten sobre el tramo que el chorro recorrió en ese frame: la partícula `j` (de `0` a `n−1`) nace en `boca + dir × (0,15 m + s × (n−1−j))`, donde `s = velocidad / caudal`. Los 0,15 m son el radio de la partícula más 5 cm, para que no nazca dentro del arma. Con los valores de la tabla, `s` queda entre 0,14 y 0,17 m, cerca del paso de grilla de LiquidFun (0,75 × diámetro = 0,15 m): el SPH casi no las repele al nacer y el chorro no "explota" en pelotitas.
- **Velocidad:** `velocidad × dir'`, con `dir'` = dirección del cañón (`muzzle()`) rotada `dispersión × u`. `u` en [−1, 1] sale de una secuencia determinista por jugador (`u = 2·frac(i × 0,618034) − 1`, con `i` = partículas emitidas por ese jugador): los tests son repetibles y no hay huecos. No se suma la velocidad del robot.
- **Creación:** `particleSystem.CreateParticle(def)`, con un `b2ParticleDef`, dos `b2Vec2` y un `b2ParticleColor` por arma creados una vez en el emisor y reutilizados. Las flags del arma más `CONTACT_LISTENER_PARTICLE`. Sin grupo. Después de cada `CreateParticle` se vuelve a leer `GetUserDataBuffer()`, porque crear puede reubicar los buffers (como en `Flood.emit`). *Verificado* en `vendor/liquidfun.js` (18/11): existen `b2ParticleDef.set_position/velocity/color/flags`, `CreateParticle` devuelve el índice y `Flood` ya lo usa.
- **Patrón:** se dispara una vez por frame, antes de `stepWorld` y fuera de cualquier callback. El movimiento sigue aplicándose una vez por paso.

#### Etiqueta de disparo: una por tramo de 0,1 s

Cada partícula guarda en `userData` el id de su disparo, que en `DamageSystem.shots` apunta a `{ owner, weapon, time }`. Un id por partícula o por frame inflaría el `Map` (120 ids/s con dos jugadores), y un id por ráfaga rompería la gracia de 0,4 s: a mitad de un chorro largo, la partícula recién salida ya tendría la "edad" de la ráfaga.

- **Tramo:** `damage.shotId(owner, weapon, now)` devuelve el id abierto de ese jugador si es del mismo arma y se abrió hace menos de `SHOT_SLICE` = **0,1 s**. Si no, abre uno nuevo. Cada emisión actualiza `time` al instante de la última partícula del tramo. Así la gracia efectiva queda entre 0,4 y 0,5 s, nunca menos: a 14 m/s, la partícula ya está a más de 5 m de la boca.
- **Marca:** `damage.tagParticle(index, id)` escribe el id en `userData`. Reemplaza a `tagShot(group, …)`.
- **Vida del disparo:** `SHOT_LIFETIME` = **6 s**. `process` borra del `Map` los tramos más viejos. `damage.liveShotFloor` es el id más chico que sigue en el `Map` (o `nextShot` si está vacío). `limpiarParticulas`, una vez por frame, destruye además las partículas con `0 < userData < liveShotFloor`. Los charcos se secan a los 6 s y el sistema no se llena.
- **Tamaño del `Map`:** como máximo 2 jugadores × 10 tramos/s × 6 s = **120 entradas**.

#### Tope de partículas del sistema de disparos

- **Hoy** el sistema de disparos no tiene `maxCount`: crece sin tope, de a 8 partículas por clic, y solo se limpia al salir del mapa o caer al agua.
- **Con #13:** `psDef.set_maxCount(1500)` y `psDef.set_destroyByAge(false)`.
  - **Presupuesto:** en 6 s, un jugador no puede emitir más que sus tanques llenos, salvo que recoja armas. Con el inventario completo son 600 partículas (300 + 135 + 90 + 75), 1.200 con dos jugadores. Junto con las 5.500 del agua del nivel, el total queda por debajo del techo de 8.000 ([09-arquitectura](09-arquitectura.md#93-presupuestos-y-métricas)). En memoria, es muy poco frente a las 20.000 medidas.
  - **Al llegar al tope:** el emisor compara `GetParticleCount()` con el tope antes de cada partícula. Si no hay lugar, **corta la emisión de ese frame sin descontar el tanque**, y también corta si `CreateParticle` devuelve un índice negativo. No se recicla la partícula más vieja.
  - **Por qué no usar `destroyByAge` del motor** (que viene activo por defecto): `DestroyOldestParticle` necesita el buffer de vencimientos, que solo existe si alguna partícula tiene `lifetime`. El build no expone `SetParticleLifetime`, `SetDestructionByAge` ni `GetDestructionByAge` en el sistema (*verificado* en `vendor/liquidfun.js`, 18/11: sí están `b2ParticleDef.set_lifetime`, `b2ParticleSystemDef.set_maxCount` y `set_destroyByAge`). Dejarlo activo sin vencimientos es comportamiento indefinido. *Verificado* con LiquidFun real (`tests/weapons.test.js`): con `maxCount` y `destroyByAge(false)`, `CreateParticle` devuelve **−1** al llegar al tope, el conteo se queda en el tope y el sistema sigue avanzando sin romperse. El emisor ni siquiera llega a pedirlo: compara antes con `GetMaxParticleCount()`.

#### Daño por caudal

Con chorro continuo, el daño se define como **daño por segundo con el chorro entero sobre el rival** (`dps` en la tabla). Las armas de daño por contacto lo convierten a daño por partícula con `dps / caudal`: si se cambia el caudal, el DPS no cambia. Las armas que aplican un estado (agua, lava, miel) no dañan por partícula: el estado renovado da el DPS, con sus constantes en `ActiveRagdoll`. Para esas armas, la columna DPS es una referencia de balance.

#### Tabla de armas (datos en `WEAPONS`, `js/weapons.js`)

El orden de la tabla es el orden del ciclo de armas (LB / RB) y de las teclas numéricas. `weapon` en el jugador es el `id`, que coincide con `FLUID`.

| Arma | `id` (`FLUID`) | Flags | Color | Caudal (p/s) | Velocidad (m/s) | Dispersión | Tanque (p) | Dura | DPS esperado | Por partícula | Se consume | Estado |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Agua** | `WATER` = 4 | `b2_waterParticle` | 90, 170, 255 | 100 | 14 | ±2° (0,035 rad) | **300** | 3 s | 3 (cortocircuito; dura 3 s más) | `soak()` | No (empuja y deja charco) | 🔨 #18 |
| **Ácido** | `ACID` = 1 | `b2_waterParticle` | 50, 255, 50 | 90 | 14 | ±2° (0,035 rad) | 135 | 1,5 s | **20** | 20 / 90 ≈ 0,22 × multiplicador de la parte | Sí | 🔨 #13 |
| **Lava** | `LAVA` = 2 | `b2_tensileParticle` | 255, 80, 20 | 60 | 10 | ±1° (0,017 rad) | 90 | 1,5 s | ~12 (4/s por parte quemada, ~3 partes; dura 1,5 s más) | `burn()` | No | 🔨 #13 |
| **Miel** | `HONEY` = 3 | `b2_viscousParticle` | 255, 200, 50 | 50 | 8 | ±1° (0,017 rad) | 75 | 1,5 s | 0 (ralentiza) | `applyHoney()` | Sí | 🔨 #13 |

- **Balance:** un tanque de ácido entero sobre el rival saca ~30 de vida, menos de un tercio, y el golpe melee saca 8. El agua es débil en daño (~3/s, hasta ~15 con un tanque, por los 3 s de mojado) y fuerte en control: empuja, deja charcos y prepara el arco eléctrico (#31). Por eso tiene el tanque más grande.
- La columna "Dura" es `tanque / caudal`. Las velocidades dan un alcance útil de ~6 m para el agua y el ácido, y de ~3–4 m para la lava y la miel, que caen en arco.
- La cohesión y la viscosidad del chorro se ajustan en #40.

**Hoy** ✅: un grupo de 8 partículas por pulsación (radio de grupo 0,25 m, partícula de 0,1 m, salida a 20 m/s), sin límite ni tope. Armas 1/2/3: ácido (2 por partícula), lava, miel.

### Las armas

| Fluido | Implementación LiquidFun | Comportamiento | Efecto en el robot | Estado |
|---|---|---|---|---|
| **Agua** | Sistema de disparos, `b2_waterParticle` | **Arma inicial** de cada robot. Chorro rápido que salpica, empuja y se acumula en charcos | **Cortocircuito:** cada partícula que toca al robot lo moja (`soak()`, regla compartida abajo): −3 de vida por segundo mientras está mojado y 3 s después, con chispas. Arco eléctrico entre robots mojados ([08-raycast](08-raycast.md), #31) | 🔨 #18 |
| **Ácido** | Sistema de disparos, `b2_waterParticle` | Rápido, se escurre por las superficies | Hoy: 2 de daño por partícula, que se consume ✅. Con #13: **DPS 20** por caudal (tabla de arriba). Con #19: **corrosión**: la parte queda corroída 4 s y recibe +50 % de daño de cualquier fuente (humo verde) | 🔨 #13, #19 |
| **Lava** | Sistema líquido, `b2_tensileParticle` | Pesada, pegajosa, forma gotas | **Quema:** cada contacto deja la parte quemándose 1,5 s a 4 de daño por segundo. No se consume | ✅ |
| **Fuego** | Sistema de **gases** (gravedad negativa, vida ~0,6 s) | Lanzallamas de corto alcance (~3 m). Sube y se apaga solo | Daño por contacto. Seca el estado mojado | 🔨 #16 |
| **Viento** | Sistema de gases (gravedad 0, vida ~1,2 s), con velocidad escrita en cada paso | Ráfaga visible como estelas | **Sin daño.** Empuja por transferencia de cantidad de movimiento | 🔨 #17 |
| **Miel** | Sistema líquido, `b2_viscousParticle` | Espesa | Ralentiza 1 s (movimiento y salto a la mitad); la partícula se consume. Pasa a ser peligro del mapa ([4.3](#43-peligros-del-mapa)) | ✅ (arma provisoria) |

### Cortocircuito: regla compartida ✅ #22

El agua de la inundación y el arma de agua (#18) dañan igual, así que la regla vive en un solo lugar y cada fuente solo la dispara.

- **Estado `mojado`** en `ActiveRagdoll`: `soak()` lo deja en `WET_TIME` = **3 s** (si ya estaba mojado, lo renueva). En `updateStatus(dt)`, una vez por paso fijo, mientras quede tiempo: **−3 de vida por segundo** (`SHORT_CIRCUIT_DPS`) con `takeDamage`, **sin multiplicador por parte** (es una falla de todo el robot, no un impacto). El tiempo baja con `dt`. Se copia en `copyStateFrom` al girar.
- **Quién lo dispara:** siempre `DamageSystem.process`, después de `stepWorld` (patrón "juntar durante el paso, actuar después").
  - **Inundación (#22):** `process(now, waterLevel)` recorre los robots registrados y moja al que tiene el borde inferior de alguna parte (`lowestPoint()`) por debajo del agua. `waterLevel` es un número o una función `(x) => altura`; el juego pasa `Flood.surfaceAt` (superficie real local) y `-Infinity` fuera de `playing`. No usa callbacks. Antes de los 60 s de ronda no hay agua que moje (la pileta no moja; ver [02-partida](02-partida.md#21-inundación--22)).
  - **Arma de agua** 🔨 #18: `onParticleBodyContact` encola el contacto de una partícula `FLUID.WATER` del sistema de disparos, como el ácido. Después, `process` llama a `soak()`. La partícula **no se consume**: sigue empujando y forma charco. Rige la regla de fuego amigo: el agua propia no moja a su dueño durante la gracia de 0,4 s del tramo de disparo. Pasado ese tiempo, sí lo moja (pisar su propio charco cuesta).
- **Visual:**
  - tinte cian intermitente mientras dura el estado ✅ (#22);
  - **chispas** 🔨 #18: mientras `player.wet`, `drawRobot` dibuja 3 chispas por frame, cada una un zigzag de 3 tramos de ~0,12 m en amarillo o blanco (`#fff27a` / `#e8ffff`, 2 px), que nace en el centro de una pieza del robot. La pieza y los ángulos salen de `floor(now × 12)`, así que las chispas saltan a 12 Hz, sin `Math.random` ni objetos por frame. Como dependen solo del estado, se ven igual cuando moja la inundación y cuando moja el arma;
  - el arco entre robots mojados es de #31.
- No se usan contactos partícula↔cuerpo para la inundación: `BeginParticleBodyContact` solo avisa cuando un contacto empieza, y un robot quieto bajo el agua podría dejar de recibir avisos. Leer todos los contactos del paso tampoco es posible: `GetBodyContacts` existe en el build pero no hay `GetBodyContactCount` (*verificado* en `vendor/liquidfun.js`, 18/11).

**¿El fuego es un fluido?** Sí, gaseoso: es SPH igual que los líquidos, pero en otro sistema de partículas con gravedad negativa (sube) y tiempo de vida corto (se extingue).

**El viento como impulso:** LiquidFun no tiene "fuerza de viento". La ráfaga es un grupo de partículas sin gravedad cuya velocidad se escribe en cada paso (*verificado*: escribir el buffer de velocidad persiste). Al tocar un cuerpo le transfieren cantidad de movimiento, y como las partículas se ven, el empuje se entiende.

## 4.2 Recogida e inventario 🔨

- **Arranque** 🔨 #18: cada robot empieza cada ronda, y la revancha, con el **agua equipada y su tanque lleno**, más el golpe melee. El agua reemplaza al ácido como arma inicial. El inventario inicial es un dato (`LOADOUT` en `js/weapons.js`):
  - **#13:** todas las armas de la tabla con tanque lleno; arranca equipada la primera fila. Es provisorio, para poder probar.
  - **#18:** arranca equipada el agua. Mientras #14 no esté, el resto de las armas sigue en el inventario inicial, así se pueden probar.
  - **#14:** el inventario inicial queda **solo con el agua**; el ácido, la lava, la miel y el fuego se recogen.
- **Inventario en el jugador:** `player.weapon` (id del arma equipada) y `player.tanks` (`Map` id → partículas que quedan). Viven en `ActiveRagdoll` porque son estado del jugador: se copian en `copyStateFrom` al girar y se pierden al recrear el robot en cada ronda. `ActiveRagdoll` no conoce la tabla: el inventario lo carga la raíz de composición con `equipLoadout(robot)` de `js/weapons.js` al crear cada robot.
- **Puntos de aparición** (#14): las armas están en puntos fijos del mapa, definidos como datos del nivel. Al tocar un arma (sensor de Box2D), se suma al inventario con el tanque lleno; si ya estaba, se rellena. Reaparece en su punto a los 15 s. **El agua también aparece como recogible**: es su única recarga dentro de la ronda (ver 12.1).
- **Rueda de armas** (#15): mantener LB (Q / Ctrl derecho de respaldo) abre un círculo con las armas del inventario. Se elige con el stick o las direcciones y se equipa al soltar. El juego sigue corriendo. Reemplaza las teclas 1/2/3 y el teclado numérico.

## 4.3 Peligros del mapa

| Peligro | Implementación | Efecto | Estado |
|---|---|---|---|
| **Pileta** | Agua SPH al fondo del hueco central + sensor | Caer = robot destruido | ✅ ([05-escenario](05-escenario.md#52-pileta)) |
| **Inundación** | Lluvia en el sistema del agua del nivel, con nivel controlado | Bajo el agua real = mojado (cortocircuito) | ✅ #22 ([02-partida](02-partida.md#21-inundación--22)) |
| **Charcos de miel** | Grupos `b2_viscousParticle` al colocar el nivel | Velocidad y salto ×0,5 mientras haya contacto | 🔨 #23 |
| **Ventiladores** | Emisor de viento hacia arriba | Ascensor de aire a plataformas altas | 🔨 #24 |
| **Goteo de ácido** | Emisor periódico desde el techo | Fuerza a moverse | 💬 |
| **Cascada de lava** | Emisor continuo | Corta el mapa; se apaga con agua | 💬 |
| **Gel elástico** | Grupo `b2_elasticParticle` | Trampolín deformable | 💬 |

## 4.4 Reacciones entre fluidos 🔨 #30

Se detectan con contactos **partícula↔partícula** (`BeginParticleContact`). Para eso, los fluidos que reaccionan comparten el sistema líquido y se identifican por color o por flags.

| Reacción | Resultado |
|---|---|
| Lava + agua | La lava se vuelve **piedra** (`b2_wallParticle`, estática, gris) y sale **vapor** en el sistema de gases: **plataformas temporales** que se rompen con el tiempo |
| Fuego + agua | Se apagan los dos y queda vapor |
| Fuego + miel | Caramelo: más viscoso y quema poco (💬) |
| Ácido + agua | El ácido se diluye y pierde daño (💬) |

**Explosión de vapor** (#32): cuando reacciona mucha lava de una vez, se lanzan rayos desde el centro y solo se empuja lo que tiene línea de visión ([08-raycast](08-raycast.md)).
