# 3. Robots

Código: `src/ragdoll/ActiveRagdoll.js` (un jugador), rig `ROBOT_RIG` en `index.js`, modelo `assets/robot.rag.json` (13 cuerpos, clips `walk`, `jump`, `dead`, `punch`, `aim`, `run_2`).

✅ #104: el modelo pasa al rig v5 (mismos cuerpos y fixtures, articulaciones renombradas y 19 clips) con combos, bloqueo, roll y estados de salto. Diseño completo en [3.7](#37-rig-v5-combos-bloqueo-roll-y-estados-de-salto--104); las secciones de abajo describen lo que hay hoy en `main` y señalan qué reemplaza #104.

## 3.1 Movimiento ✅

| Acción | Cómo funciona | Valores |
|---|---|---|
| Caminar | Fija la velocidad horizontal de la raíz. Sin input, frena ×0,85 por paso. Pegado (miel, ✅ #41): frena ×0,5 (hoy, con miel, ×0,95) | 6 m/s; pegado 0,6 m/s (`STICKY.speed` 0,1; hoy 3 con miel). Medido: el torso avanza 0,74 m en 1 s con el stick (el clip de caminar aporta ~0,64 m/s aun con `speed` en 0), 0,19 × lo que sin miel |
| Saltar (dirección arriba; ✅ con el remapeo: A, intención `jump`, [10](10-controles.md#101-mapeo--remapeo-pedido-por-el-usuario-el-1811)) | Solo apoyado: piso por raycast desde los pies ([08-raycast](08-raycast.md)). Se aplica la velocidad a **todos** los cuerpos | 9 m/s (≈ 4 m de altura); pegado 2,7 m/s (`STICKY.jump` 0,3) con 2 g, ≈ 0,18 m (hoy 3 m/s con miel); hace falta estar apoyado 5 pasos seguidos |
| Pegado (miel), **retirado**: la miel frena por física ([14-agua](14-agua.md)) | Historia: estado `stickyTimer` (s), renovado por `stick()` cada paso que toca miel y 0,3 s después. Suma gravedad extra a todas las piezas | `STICKY` en `src/ragdoll/ActiveRagdoll.js`: `speed` 0,1, `brake` 0,5, `jump` 0,3, `down` 10 m/s², `grace` 0,3 s. Reemplaza `honeyTimer`. Regla en [04-fluidos](04-fluidos.md#miel-pegajosa-regla-compartida--41) |
| Girar | Al cambiar el lado de la mira, se vuelve a generar el ragdoll espejado (`flipX`), conservando posición, velocidades y estado. RagImporter no permite espejar una instancia viva | — |
| Caminar hacia atrás | Si se camina en contra de la mira, se reproduce `walk_back`: una copia de `walk` con las claves invertidas, generada al cargar (`src/ragdoll/clips.js`) | Provisorio hasta Gann4Life/RagAssembler2D#231 |
| Apuntar | El hombro (`joint_11`) gira para que **la línea del cañón** pase por el objetivo (corrige el paralaje). El codo queda en reposo y el override va con fuerza 1, así que ningún clip mueve la cadena del arma | Error medido: 0,3–0,9° quieto, ~4,5° de media caminando, ≤ 12° en el salto (✅ #57, ver abajo). Exacto: #8 |
| Animación | Máquina de estados: `dead` > `punch` > `jump` > `walk` / `walk_back` > reposo. Los cambios son sin fundido (la librería aún no los tiene). ✅ #104 la reemplaza por la máquina de [3.7.3](#373-máquina-de-estados-de-clips) | — |
| Velocidad del clip de caminar ✅ #58 | Una vez por paso fijo, `play(clip, { speed })` con \|vx\| del torso / `WALK_ANIM.refSpeed`, acotada a `[minSpeed, maxSpeed]` y suavizada (`smoothing`); la guarda `animSpeed` del robot | `WALK_ANIM` = `refSpeed` 5,1 m/s (antes 4,7; el \|vx\| sostenido al caminar a 6 m/s pedidos), `minSpeed` 0,1, `maxSpeed` 1,25, `smoothing` 0,1. Medido (`tests/walk-anim.test.js`): normal ≈ 1 (0,97 con \|vx\| 4,9 m/s); pegado ≈ 0,1 (mínimo); salto máximo entre pasos 0,026 |

**Apuntar en el salto ✅ #57.** Causa medida: el clip `jump` trae claves de hombro y codo (`joint_11`/`joint_11_copy` llegan a 2,94 y 2,42 rad en t = 0,3 s, el brazo "tirado hacia arriba"). El override de mira gana en ángulo y velocidad, pero RagImporter suma `shortestDelta(clip, override)` al ángulo del clip sin normalizar: si el clip y la mira difieren más de π (mira abajo, por ejemplo −0,46 rad contra 2,94), el motor recibe un error de ~2π y, como el hombro no tiene límites, da la vuelta casi completa por el otro lado. Solución en el juego: `withoutJointTracks` (`src/ragdoll/clips.js`) quita al cargar las pistas de `aimJoints` y `aimHold` del clip `jump`; las piernas y el torso conservan la animación. No se tocó `lib/` ni el rig. El impulso de 9 m/s a todas las piezas se mantiene: es lo que hace saltar al robot (sin el de los brazos, el torso sube 1,9 m en vez de 4,0).

| Mira (Y arriba) | Error medio en el aire, antes → después | Error máximo, antes → después | Subida del torso, antes → después |
|---|---|---|---|
| (1, 0) | 3,4° → 3,4° | 7,9° → 7,9° | 4,02 m → 4,02 m |
| (1, −0,5) | 5,6° → 2,9° | 15,9° → 8,8° | 4,02 m → 4,02 m |
| (0,3, −1) | 33,2° → 3,6° | 129,5° → 11,3° | 4,01 m → 4,01 m |

Umbral de regresión (`tests/aim-jump.test.js`): error máximo ≤ 15°, medio ≤ 5° y subida ≥ 95 % de 4,02 m. Queda un resto de hasta ~12° apuntando hacia abajo, por el golpe de las piernas del clip al plegarse (t = 0,3 s).

Propuesta para el robot, sin urgencia (no hace falta si el juego quita las pistas): borrar de `jump` las pistas de `j_10`, `j_11`, `j_12` y `j_13` en `assets/robot.rag.json`, o llevar las claves de `j_11`/`j_13` a ±π de la pose de mira. El mismo defecto de librería (ángulo sin normalizar al aplicar un override) quedaría para #8 y RagAssembler2D#232.

**Mira:** gamepad primero. La dirección viene del stick derecho y se conserva al soltarlo. El mouse (solo J1) y el teclado son respaldo. El mouse solo retoma la mira si se mueve después del último uso del stick.

## 3.2 Golpe melee ✅ (✅ #104 lo reemplaza por el combo de [3.7.4](#374-ataques-melee-datos-en-melee))

- **Acción:** X (gamepad; ✅ con el remapeo pasa a B), F (teclado de J1; [10.1](10-controles.md#101-mapeo--remapeo-pedido-por-el-usuario-el-1811)). Reproduce el clip `punch`, que suelta los overrides de mira mientras dura.
- **Ventana activa:** 0,3–0,5 s, cuando el clip extiende el brazo. Duración total 0,55 s; enfriamiento 0,6 s.
- **Detección:** 3 rayos en abanico (±0,3 rad) desde el hombro en la dirección de la mira, alcance 1,1 m. El primer cuerpo rival que tocan recibe el golpe, una sola vez por golpe.
- **Efecto:**
  - 8 de daño × multiplicador de la parte;
  - impulso de 5 N·s en el punto de impacto;
  - **aturdimiento** de 0,4 s, en el que el control no pisa la velocidad;
  - **empuje** de todo el robot: +4,5 m/s hacia el costado y +3 m/s hacia arriba, sumados a todas sus piezas. Mueve unos 2 m: alcanza para tirar al rival de una plataforma o a la pileta.

  Un impulso sobre una sola pieza de 1 kg apenas movía a un robot de 13 piezas (medido: 0,16 m).
- **Feedback:** destello blanco en el punto de impacto (0,2 s).

## 3.3 Daño ✅

**Una sola barra de vida (100)**, pero el daño entra por partes del cuerpo (`src/combat/damage.js`):

| Parte | Multiplicador |
|---|---|
| Cabeza (`b_1`) | ×1,5 |
| Pecho y pelvis (`b_2`, `b_6`) | ×1 |
| Brazos y piernas | ×0,75 |

| Fuente | Cálculo | Técnica |
|---|---|---|
| Fluido que toca una parte | Según el fluido ([04-fluidos](04-fluidos.md)) | Contacto partícula↔cuerpo ([07-sph](07-sph.md)) |
| Golpe melee | 8 × multiplicador (✅ #104: daño por ataque en `MELEE`, [3.7.4](#374-ataques-melee-datos-en-melee)) | Raycast ([3.2](#32-golpe-melee-)) |
| Golpe melee bloqueado ✅ #104 | 0: sin daño, aturdimiento, empuje ni reacción; sí el impulso local en el brazo | Raycast + estado `block` del receptor ([3.7.5](#375-bloqueo)) |
| Impacto fuerte (caída, choque, ser lanzado) | `(v − 11 m/s) × 2` × multiplicador, si la velocidad de acercamiento sobre la normal supera 11 m/s; 0,25 s de espera por parte | `BeginContact` ([06-box2d](06-box2d.md)). Un salto normal aterriza a ~9 m/s y no daña |
| Pileta | Destrucción inmediata | Sensor ([05-escenario](05-escenario.md#52-pileta)) |

- **Destello:** la parte dañada se pone **roja** y vuelve a su color en **1 s** (`lerp`). Un golpe nuevo reinicia el fundido.
- **Bloqueo ✅ #104:** frena solo golpes melee. Los chorros, las quemaduras, el cortocircuito, la pileta y el impacto fuerte por `BeginContact` dañan igual que sin bloquear ([3.7.5](#375-bloqueo)).
- **Autodaño:** un disparo no daña a quien lo disparó durante 0,4 s (para que no se dañe al salir del cañón); después sí, incluido el charco propio. Decidido en §12.1.
- **Extremidad inutilizada** (💬, parte de #19): una extremidad muy corroída pierde fuerza con el override `strength`. No se puede romper el joint: el contrato de RagImporter no lo permite.

## 3.4 Empujar

Los robots chocan entre sí, porque cada instancia colisiona con las demás. Además del contacto al caminar, empujan:
- el golpe melee ✅;
- el viento 🔨 #17;
- los fluidos densos, porque transfieren cantidad de movimiento (acople bidireccional de LiquidFun) ✅;
- el gancho enganchado al rival 🔨 ([3.5](#35-gancho-)).

## 3.5 Gancho 🔨

Mecánica nueva para la entrega (X, intención `grapple`). Un rayo en la dirección de la mira busca un punto de enganche, y una cuerda de Box2D une el antebrazo del arma con ese punto. Mientras se mantiene X, la cuerda se recoge.

### Ubicación en los patrones

- **Módulo nuevo `src/ragdoll/grapple.js`**, clase `Grapple(world, ground, raycaster, damage, config = GRAPPLE)`. Un solo motivo de cambio: la cuerda.
  - `ground` es el cuerpo estático del nivel que devuelve `buildLevel`.
  - `raycaster` es el servicio compartido `getRaycaster(world)`.
  - `damage` se usa solo para `ownerOf(bodyPtr)`, para saber si el punto es de un robot.
- **Datos en tabla:** `GRAPPLE`, exportado del mismo módulo.
- **Intención, no dispositivo:** lee `state.grapple` (mantenido) y deriva el flanco.
- **Paso fijo:** enganchar y soltar es una acción de una vez por frame (como el golpe); recoger la cuerda, verificar la línea de visión y la rotura es física, una vez por paso fijo.
- **Juntar durante el paso, actuar después:** el joint se crea y se destruye fuera de `stepWorld` y de todo callback.
- **Memoria nativa:**
  - `b2RopeJointDef` y dos `b2Vec2` de trabajo se crean en el constructor y se liberan en `dispose()`;
  - el joint lo crea `world.CreateJoint(def)` y es del mundo: se destruye con `world.DestroyJoint(joint)`, **nunca** con `Box2D.destroy`;
  - para llamar a sus métodos se convierte con `Box2D.castObject(joint, Box2D.b2RopeJoint)`, una vez al crearlo.
- **Contrato de RagImporter:** el joint **no es de la instancia**. El juego lo crea y lo destruye, y une un cuerpo de la instancia con el nivel o con el rival. Riesgo: Box2D destruye los joints de un cuerpo cuando se destruye el cuerpo, y la instancia se destruye en cada giro (se regenera espejada) y en cada ronda. Por eso la raíz de composición llama a `grapple.detach(player)` **antes** de `player.destroy()` (destruye los joints donde ese robot es dueño o destino y guarda el punto de anclaje y la longitud). Después del giro, `grapple.reattach(player)` vuelve a crear la cuerda en el cuerpo nuevo con el mismo ancla y la misma longitud. En la ronda nueva no se reengancha.

### Verificado en el binding (`vendor/liquidfun.js`, 18/11)

| Qué | Estado |
|---|---|
| `b2RopeJointDef` con `set_bodyA`, `set_bodyB`, `set_localAnchorA`, `set_localAnchorB`, `set_maxLength`, `set_collideConnected` | *Verificado* |
| `b2RopeJoint` con **`SetMaxLength`** y `GetMaxLength` (longitud variable), `GetReactionForce(inv_dt)`, `GetLimitState`, `GetAnchorA`/`GetAnchorB` | *Verificado* |
| `b2DistanceJoint` con `SetLength`, `SetFrequency` y `SetDampingRatio` (alternativa: barra o resorte) | *Verificado* |
| `b2World.CreateJoint`, `b2World.DestroyJoint`, `b2World.GetJointList` y `Box2D.castObject` | *Verificado* |

**Se eligió `b2RopeJoint`:** es una restricción de distancia máxima (permite cuerda floja, como una cuerda real) y su largo se cambia en ejecución. `b2DistanceJoint` fija la distancia (barra rígida o resorte): empujaría al robot hacia afuera al acercarse al ancla, cosa que una cuerda no hace.

### Valores (`GRAPPLE`)

| Clave | Valor | Significado |
|---|---|---|
| `range` | 12 m | Alcance del rayo desde la boca del arma |
| `reelSpeed` | 6 m/s | Cuánto baja `maxLength` por segundo mientras se mantiene X |
| `minLength` | 1,2 m | Largo mínimo de la cuerda (no se recoge más) |
| `hookRival` | `false` (decisión del usuario, 18/11) | El gancho es movilidad, no ataque: solo engancha sólidos del nivel. Si el rayo pega en el rival, no engancha y empieza el cooldown |
| `cooldown` | 0,4 s | Desde que se suelta, o desde un tiro que no enganchó, hasta poder volver a tirar |
| `breakForce` | 1.500 N | Si la reacción de la cuerda (`GetReactionForce(1/subpaso)`) lo supera, se corta (≈ 11,5 veces el peso del robot) |
| `swingAccel` | 6 m/s² | Mientras está enganchado y en el aire, el stick suma esta aceleración tangencial a la raíz, en lugar de fijar su velocidad como al caminar, para no pelear con la cuerda |
| `body` | `rig.gun.body` | Pieza que lleva la cuerda (el antebrazo del arma); el ancla local es la boca (`rig.gun.muzzle`) |

### Funcionamiento

1. **Tiro** (flanco de X, una vez por frame, sin cooldown, robot vivo y no aturdido; con #104, además, sin `armsBusy`, porque la boca no apunta mientras un clip tiene los brazos, [3.7.3](#373-máquina-de-estados-de-clips)): `raycaster.cast` desde la boca en la dirección de la mira hasta `range`, ignorando los cuerpos propios y los sensores (como ya hace `Raycaster`). Los rayos de Box2D no tocan partículas ni el campo de alturas: el gancho atraviesa el agua y engancha en el fondo o en lo que haya detrás.
2. **Enganche:** si pega en un sólido del nivel (`ground`), o en el rival con `hookRival`, se crea el `b2RopeJoint`. `bodyA` es la pieza del arma con ancla en la boca; `bodyB` es el cuerpo golpeado, con ancla en el punto del impacto en su sistema local. `maxLength` es la distancia actual y `collideConnected` es `true`. Si no pega, empieza el cooldown.
3. **Recogida** (cada paso fijo mientras se mantiene X): `maxLength = max(minLength, min(distancia actual, maxLength − reelSpeed · dt))`. Si la cuerda está floja, primero se tensa.
4. **Se suelta** si pasa cualquiera de estas cosas:
   - se suelta X;
   - el robot recibe un golpe (aturdimiento);
   - el robot muere, se ahoga o queda KO;
   - el robot destino muere;
   - la reacción supera `breakForce`;
   - un rayo de la boca al ancla (una vez por paso fijo) pega primero en otro sólido: no se modela que la cuerda se enrosque;
   - la ronda se reinicia.

   En todos los casos se destruye el joint fuera del paso y empieza el cooldown.
5. **Dibujo:** una línea de la boca al ancla (`src/render/`, en el color del jugador).

### Agua

La cuerda es física de Box2D, sin masa y sin arrastre propio (limitación declarada). El robot que se recoge dentro del agua recibe el empuje y el arrastre del campo ([14.5](14-agua.md#145-flotación-de-arquímedes-por-pieza)), que lo frena: eso lo modela #72, no el gancho. Como el gancho no toca el modelo de fluidos, no requiere aprobación de `physics-reviewer`.

### Criterios de aceptación (Node, `tests/helpers/game.js`, LiquidFun real y gamepad simulado)

| Id | Escenario | Esperado |
|---|---|---|
| G1 | J1 apunta a una plataforma a ≤ 12 m y aprieta X | En el mismo frame se crea un `b2RopeJoint`; el ancla queda a ±0,01 m del impacto del rayo |
| G2 | Mantener X 1 s | La distancia de la boca al ancla baja a `reelSpeed` ±10 % hasta `minLength` ±0,05 m |
| G3 | Soltar X; volver a apretar dentro de los 0,4 s | El joint se destruye en ese frame (la cantidad de joints del mundo vuelve a la de RagImporter); el segundo tiro no crea nada |
| G4 | Apuntar a un sólido a 15 m | No se crea joint; empieza el cooldown |
| G5 | Colgado en reposo 3 s | Distancia ≤ `maxLength` + 0,02 m; separación de las articulaciones del brazo < 0,05 m |
| G6 | Recibir un golpe enganchado | Se suelta en ese paso |
| G7 | Girar (la mira cruza al otro lado) enganchado | El joint se vuelve a crear en el cuerpo nuevo con el mismo ancla y el largo ±0,02 m; no queda ningún joint colgado |
| G8 | Reinicio de ronda, KO y ahogo enganchados | Cantidad de joints igual a la de RagImporter; sin errores |
| G9 | Disparar el gancho contra el rival (`hookRival` = `false`) | No se crea ningún joint y empieza el cooldown |
| G10 | 1.000 ciclos de enganchar y soltar | Sin errores de heap y cantidad de joints estable (sin memoria nativa nueva por ciclo) |
| G11 | Cargar la cuerda por encima de `breakForce` (impulso hacia abajo al robot colgado) | Se corta en ese paso |
| G12 | Teclado (E) y mouse (botón derecho) del J1 con el gamepad apretando X | Mismo resultado; soltar E no suelta el gancho mientras X sigue apretado |

## 3.6 Modo ragdoll 🔨 M5

Diseño mínimo ("hacerse el muerto", Y, intención `ragdoll`):
- **Estado nuevo** `ragdoll` en la máquina de clips de `ActiveRagdoll`, con prioridad `dead` > `ragdoll` > `punch` > `jump` > `walk` (con #104: `dead` > `ragdoll` > `reaction` > el resto de [3.7.3](#373-máquina-de-estados-de-clips)). Reproduce el clip `dead` (ya existe y deja al robot flojo) sin bajar la vida, y suelta los overrides de mira. No escribe motores ni toca la librería: usa el mismo mecanismo que la muerte.
- **Entrada y salida:** Y entra; otro Y, o `RAGDOLL.maxTime` (3 s), sale. Después hay `RAGDOLL.cooldown` (2 s). Sin control mientras dura.
- **Tacle:** mientras dura, si una pieza del robot flojo choca al rival con velocidad de acercamiento sobre la normal ≥ `RAGDOLL.tackleSpeed` (6 m/s, menor que los 11 m/s del impacto general), el rival recibe `(v − 6) × 2` × multiplicador de la parte. Va por la misma cola de `BeginContact` de `DamageSystem`. Quien está flojo recibe el daño de impacto normal.
- Datos `RAGDOLL` en `src/ragdoll/ActiveRagdoll.js`.

## 3.7 Rig v5, combos, bloqueo, roll y estados de salto ✅ #104

El robot pasa al rig v5 exportado de ragassembler2d (formato `ragassembler` versión 4, editor 0.24.0). El archivo reemplaza a `assets/robot.rag.json` en la misma ruta, así que `loadRag` y `tests/helpers/game.js` no cambian de URL. Mapeo de controles en [10.1](10-controles.md#101-mapeo--remapeo-pedido-por-el-usuario-el-1811).

### 3.7.1 Rig v5: renombres y referencias

**Cuerpos:** sin cambios. Los 13 cuerpos conservan `id` (`b_1` … `b_18`) y `name` (`body_1`, `body_7_copy`, …). El juego los referencia solo por `id` (`feet`, `gun`, `damage` de `ROBOT_RIG`, `flashes`, `ownerOf`), así que nada cambia por cuerpos.

**Articulaciones:** conservan `id`, cuerpos, ancla, límites y motor; **solo cambia `name`**. Los clips apuntan a las articulaciones por `id` (`"target": "j_11"`), así que el renombre no los afecta; lo que se rompe es lo que el juego busca por nombre (`setJointAngle`, `clearJointOverride`, `joint(name)` de RagImporter y `withoutJointTracks`).

| `id` | v4 (`name`) | v5 (`name`) | Une | Uso por nombre en el juego |
|---|---|---|---|---|
| `j_2` | `joint_2` | `back_hip` | `b_6` pelvis → `b_9` cadera trasera | — |
| `j_3` | `joint_3` | `back_thigh` | `b_9` → `b_8` muslo trasero | — |
| `j_4` | `joint_4` | `back_knee` | `b_8` → `b_4` pierna y pie traseros | — |
| `j_8` | `joint_8` | `chest` | `b_6` → `b_2` pecho | — |
| `j_9` | `joint_9` | `head` | `b_2` → `b_1` cabeza | — |
| `j_10` | `joint_10` | `back_elbow` | `b_3` antebrazo del arma ↔ `b_13` brazo | `AIM_HOLD[0]` |
| `j_11` | `joint_11` | `back_shoulder` | `b_2` → `b_13` | `AIM_JOINTS[0]`: apunta por la línea del cañón y es el origen de los rayos melee |
| `j_12` | `joint_10_copy` | `front_elbow` | `b_14` ↔ `b_15` | `AIM_HOLD[1]` |
| `j_13` | `joint_11_copy` | `front_shoulder` | `b_2` → `b_15` | `AIM_JOINTS[1]` |
| `j_14` | `joint_2_copy` | `front_hip` | `b_6` → `b_18` | Origen de los rayos de `air_kick` (ancla común con `j_2`) |
| `j_15` | `joint_3_copy` | `front_thigh` | `b_18` → `b_17` | — |
| `j_16` | `joint_4_copy` | `front_knee` | `b_17` → `b_16` | — |

El arma va en el brazo **trasero** (`back_*`): `b_3` cuelga de `b_13` por `j_10`. Los nombres `*_thigh` y `*_knee` del v5 corresponden en realidad a rodilla y tobillo; no se renombran (el juego no los usa por nombre).

**Clips:**

| v4 (`key`, largo, loop) | v5 (`key`, largo, loop) | Uso |
|---|---|---|
| `punch` (1 s, sí) | `punch_old` (1 s, sí) | Sin uso; queda en el archivo |
| — | `punch_combo1` (0,4 s, no), `punch_combo2` (0,4 s, no), `punch_combo3` (1 s, no) | Combo ([3.7.4](#374-ataques-melee-datos-en-melee)). `combo1` golpea con el brazo delantero, `combo2` con el trasero, `combo3` con los dos por encima de la cabeza |
| `jump` (1 s, sí) | `jump_start` (0,6 s, no) | Despegue; ya no loopea en el aire |
| — | `air`, `air_forward`, `air_backward` (1 s, sí) | Vuelo según la dirección |
| — | `fall_high` (1 s, sí) | Caída alta |
| — | `air_punch`, `air_kick` (1 s, **sí**) | Ataques en el aire. Están marcados con loop: el juego los corta por duración (`MELEE`) |
| — | `block` (1 s, sí) | Bloqueo mantenido |
| — | `roll` (1,2 s, no) | Roll. Pista `root/bodyAngle` de 0 a −6,55 rad (una vuelta completa hacia adelante) |
| — | `melee_react_simple`, `melee_react_stumble` (0,4 s, no) | Reacciones al golpe |
| — | `idle` (10 s, sí) | Reposo (hoy el reposo es "sin clip") |
| `aim` (1 s, no) | `aim` (1 s, sí) | Reposo apuntando o disparando; hoy no se usa |
| `walk` (1 s, sí) | `walk` (**0,5 s**, sí) | Caminar; el largo cambia, ver riesgos |
| `dead` (2 s, no) | `dead` (2 s, no) | Muerte |
| `run_2` (1 s, sí) | — | Sin uso hoy; desaparece |

**Lugares del juego que referencian nombres del rig** (los que hay que tocar):

| Lugar | Qué referencia | Cambio |
|---|---|---|
| `index.js:96-97` | `AIM_JOINTS = ["joint_11", "joint_11_copy"]`, `AIM_HOLD = ["joint_10", "joint_10_copy"]` | `["back_shoulder", "front_shoulder"]` y `["back_elbow", "front_elbow"]` |
| `index.js:99` | `withoutJointTracks(json, ["jump"], …)` y `withReversedClip(…, "walk", "walk_back")` | Lista de clips sin pistas de mira ([3.7.3](#373-máquina-de-estados-de-clips)) y `withReversedClip(…, "roll", "roll_back")` |
| `index.js:106-112` | `ROBOT_RIG.clips` (`walk`, `walkBack`, `jump`, `dead`, `punch`) | Tabla de claves de [3.7.3](#373-máquina-de-estados-de-clips); se suman `arms` y `melee` |
| `index.js:239-288` | `golpear` y constantes `PUNCH_*` | Se mueve a `src/combat/melee.js` ([3.7.7](#377-ubicación-en-los-patrones)) |
| `src/ragdoll/ActiveRagdoll.js:12-15`, `81-120`, `434-448` | `PUNCH_TIME`, `PUNCH_ACTIVE`, `PUNCH_COOLDOWN`, `punch()`, estados `"punch"`, `"jump"` | Máquina de [3.7.3](#373-máquina-de-estados-de-clips) |
| `src/ragdoll/ActiveRagdoll.js:86`, `315`, `318` | `rig.aimJoints` / `rig.aimHold` | Ninguno (indirecto) |
| `src/ragdoll/clips.js:38` | Filtra por `name` | Ninguno (genérico) |
| `tests/aim-jump.test.js:84-88` | Rig real con `joint_10…`, `joint_11…` y el clip `jump` | Nombres v5 y la lista nueva de clips |
| `tests/punch.test.js:39-45` | `clipState === "punch"`, `isPunching()` | Pasa a medir el combo (R6, R7) |
| `tests/walk-anim.test.js:37` | Clip `walk` | Mismo nombre; se vuelve a medir `refSpeed` |
| `src/render/`, `src/combat/damage.js`, `src/ragdoll/grapple.js` (🔨) | Solo `id` de cuerpos | Ninguno |

### 3.7.2 Masas y fixtures v4 vs v5

**Idénticos.** Comparación campo por campo de `bodies` y `joints`:

| Qué | v4 | v5 |
|---|---|---|
| Cuerpos | 13, `mass` 1 kg cada uno (masa explícita, no densidad): 13 kg | Igual |
| Fixtures | 15 (`b_4` y `b_16` llevan círculo + caja), mismas formas, centros y medidas | Igual |
| Fricción, restitución, filtro | 0,6, 0, categoría 1, máscara 65535, sin sensores | Igual |
| Amortiguamiento, `bullet`, `fixedRotation` | 0, `false`, `false` | Igual |
| Articulaciones | 12 revolutas: anclas, límites y `maxTorque` (70–480 N·m) | Igual (solo cambia `name`) |
| Balance de la raíz | `rootBody` `b_6`, `maxTorque` 120 N·m, `gain` 10, `damping` 0,5, `maxSpeed` 20 | Igual |

Efecto en los valores que dependen del rig:
- **Flotación D1** ([14.18](14-agua.md#1418-decisiones-del-usuario)): depende de la masa (13 kg) y del área de las fixtures (1,08 m²). Sin cambio.
- **Empuje del chorro D2:** se compara con el peso (130 N). Sin cambio.
- **Salto (4,02 m):** el impulso de 9 m/s a todas las piezas no cambia, pero sí la pose en vuelo (`jump_start` y los clips de aire pliegan las piernas distinto que `jump`), y eso mueve el centro de masa respecto del torso. La subida del torso **se vuelve a medir**; el umbral de regresión sigue siendo ≥ 95 % de 4,02 m (R2).
- **Caminar:** `walk` pasa de 1 s a 0,5 s, así que el aporte del clip a la velocidad (hoy ~0,64 m/s con `speed` 0) y `WALK_ANIM.refSpeed` (4,7 m/s) **se vuelven a medir** con `tests/walk-anim.test.js`. Si `refSpeed` cambia, se actualiza el valor en esta sección.

### 3.7.3 Máquina de estados de clips

Vive en `ActiveRagdoll` (patrón "máquinas de estado"): un solo método resuelve el estado en cada paso fijo, en el orden de prioridad de la tabla, y todas las transiciones están ahí. Los clips cambian sin fundido (la librería no tiene `fadeIn`).

**Claves en `ROBOT_RIG.clips`** (estado → `key`): `idle` → `idle`, `aim` → `aim`, `walk` → `walk`, `walkBack` → `walk_back`, `jumpStart` → `jump_start`, `air` → `air`, `airForward` → `air_forward`, `airBackward` → `air_backward`, `fallHigh` → `fall_high`, `block` → `block`, `roll` → `roll`, `rollBack` → `roll_back` (generado al cargar con `withReversedClip`, como `walk_back`), `combo1`/`combo2`/`combo3` → `punch_combo1`/`2`/`3`, `airPunch` → `air_punch`, `airKick` → `air_kick`, `reactSimple` → `melee_react_simple`, `reactStumble` → `melee_react_stumble`, `dead` → `dead`. `punch_old` no se mapea.

**Prioridad** (gana el primero que se cumple):

| # | Estado | Se cumple si | Sale cuando | Mira |
|---|---|---|---|---|
| 1 | `dead` | `hp` ≤ 0 (perdió la ronda: daño, KO o ahogo) | Ronda nueva | Suelta (`clearAllOverrides`) |
| 2 | `ragdoll` (🔨 M5) | [3.6](#36-modo-ragdoll--m5) | [3.6](#36-modo-ragdoll--m5) | Suelta |
| 3 | `reactSimple` / `reactStumble` | Recibió un golpe melee que conectó (no bloqueado), según la columna `reaction` del ataque | Pasan 0,4 s (largo del clip); un golpe nuevo la reinicia | Suelta |
| 4 | `roll` / `rollBack` | Intención `roll` apoyado ([3.7.6](#376-roll)) | Pasa `ROLL.duration` | Suelta |
| 5 | Ataque (`combo1`–`3`, `airPunch`, `airKick`) | Intención `punch` o `kick` aceptada ([3.7.4](#374-ataques-melee-datos-en-melee)) | Pasa su `duration` sin encadenar; los ataques aéreos también al aterrizar | Suelta |
| 6 | `block` | `block` mantenido, apoyado, sin aturdimiento | Se suelta `block` o deja de estar apoyado | Suelta |
| 7 | `fallHigh` | En el aire y vy del torso < −`AIR.fallSpeed`; queda trabado hasta aterrizar | Aterriza | Activa |
| 8 | `jumpStart` | Saltó (impulso aplicado en este aire) y no pasó el largo del clip (0,6 s) | 0,6 s o aterriza | Activa |
| 9 | `air` / `airForward` / `airBackward` | En el aire. `rel` = vx del torso × lado de la mira (+1 si `flipX` es falso): `rel` > `AIR.deadband` → `airForward`; `rel` < −`AIR.deadband` → `airBackward`; si no, `air`. Cubre también caerse de un borde sin saltar | Aterriza | Activa |
| 10 | `walk` / `walkBack` | Apoyado y con `left` o `right` (como hoy, con la velocidad de `WALK_ANIM`) | — | Activa |
| 11 | `aim` | Apoyado, quieto y apuntando: `fire`, o `aim` no nulo, o `pointer` no nulo (J1) | — | Activa |
| 12 | `idle` | Ninguno de los anteriores | — | Activa |

- **Apoyado / aterrizar:** el criterio de hoy: `framesGrounded` > 2 aterriza (sale de los estados de aire) y > 5 permite saltar y rodar.
- **`armsBusy`** (getter nuevo): verdadero en los estados con la mira suelta (1–6). Mientras vale, `aim()` no escribe overrides (como hoy `isPunching`), el emisor de chorros ve el gatillo suelto y el gancho no tira. Al salir, el siguiente `aim()` retoma los overrides.
- **Clips sin pistas de mira:** `withoutJointTracks` quita al cargar las pistas de `AIM_JOINTS` y `AIM_HOLD` de los clips en los que la mira está activa y que mueven los brazos lejos de la pose de mira: `jump_start`, `air`, `air_forward`, `air_backward`, `fall_high`, `idle` y `aim`. Es la misma corrección de #57 (diferencia de más de π entre clip y override). `walk` se deja como hoy; si R2b falla caminando, se suma a la lista.
- **Giro durante el roll:** el giro regenera el ragdoll en la pose de reposo; a mitad de una vuelta perdería la rotación. Mientras dura el roll, la raíz de composición **difiere** el giro hasta que termina. En los demás estados el giro sigue como hoy.
- **`copyStateFrom`** copia también el estado de la máquina (estado, instante de entrada, ataque en curso, golpe del combo en espera, conectado, enfriamientos, `fallHigh` trabado), para que un giro no corte un combo ni una reacción.

**Datos** (exportados de `src/ragdoll/ActiveRagdoll.js`, como `STICKY` y `WALK_ANIM`):

| Tabla | Clave | Valor | Motivo |
|---|---|---|---|
| `AIR` | `deadband` | 1,0 m/s | Por debajo, el clip de aire es el neutro; evita parpadeo entre `air_forward` y `air_backward` cerca de 0 |
| `AIR` | `fallSpeed` | 10 m/s | Equivale a 5 m de caída libre (`v²/2g`). Un salto normal aterriza a ~9 m/s y no lo dispara; queda por debajo de los 11 m/s del daño por impacto, así que la pose avisa antes de una caída que daña |
| `ROLL` | `duration` | 0,8 s | El clip de 1,2 s reproducido a `clipSpeed` 1,5; la vuelta completa está en los primeros 0,8 s del clip original |
| `ROLL` | `clipSpeed` | 1,5 | — |
| `ROLL` | `speed` | 4 m/s | Recorre ≈ 3,2 m: sale del alcance de un golpe (1,1 m) sin cruzar medio mapa. Pegado (miel): × `STICKY.speed` |
| `ROLL` | `cooldown` | 0,5 s | Desde que termina, para que no se encadenen rolls |

**Caída con daño (#195, robot v7).** Si el impacto de una caída alta (`fallLatched`) hizo daño (`IMPACT_SPEED`), al aterrizar el robot entra en `landHurt` (al menos 1 s, el largo del clip, y hasta que alguna pieza esté apoyada en el mapa o en el agua `RECOVER.rest` = 0,5 s seguidos; cada despegue reinicia la cuenta) y después en `getupFront` o `getupBack` (2 s cada una), según `chestDown()`: el pecho es el lado al que mira (`side`) sobre el eje x local del torso, y mira al piso si `side · sin θ < 0` (boca abajo, `getupFront`); si no, espalda abajo (`getupBack`). Durante la secuencia (3 s si cae y queda quieto) el input se lee pero no actúa (sin mover, girar, saltar, rodar, atacar ni disparar); un golpe aplica daño sin cambiar de clip y la muerte corta la secuencia. Una caída sin daño sigue como antes. Los clips dan los largos mínimos (`rig.clipLengths`).

### 3.7.4 Ataques melee (datos en `MELEE`)

Tabla `MELEE` en el módulo nuevo `src/combat/melee.js`. La raíz de composición la pasa a `ActiveRagdoll` dentro del rig (`ROBOT_RIG.melee`), así `ActiveRagdoll` no importa el módulo (lo mismo que con `WEAPONS`).

| Ataque | Clip | `duration` | Ventana activa | Origen de los rayos | Dirección base | Alcance | Abanico | Daño | Empuje (lado, arriba) | Aturdimiento | `reaction` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `combo1` | `punch_combo1` | 0,4 s | 0,2–0,35 s | Ancla de `back_shoulder` (la misma que `front_shoulder`) | Mira | 1,1 m | ±0,3 rad | 8 | 1,5 / 0 m/s | 0,4 s | `simple` |
| `combo2` | `punch_combo2` | 0,4 s | 0,15–0,3 s | Ídem | Mira | 1,1 m | ±0,3 rad | 8 | 1,5 / 0 m/s | 0,4 s | `simple` |
| `combo3` | `punch_combo3` | 1,0 s | 0,35–0,6 s | Ídem | Mira | 1,2 m | ±0,4 rad | 14 | 6 / 4 m/s | 0,7 s | `stumble` |
| `airPunch` | `air_punch` | 0,9 s | 0,3–0,6 s | Ídem | Mira | 1,1 m | ±0,3 rad | 8 | 4,5 / 3 m/s | 0,4 s | `simple` |
| `airKick` | `air_kick` | 0,7 s | 0,4–0,6 s | Ancla de `front_hip` | Lado de la mira, 0,5 rad hacia abajo | 1,1 m | ±0,4 rad | 12 | 6 / 2 m/s | 0,6 s | `stumble` |

Además, para todos: impulso de 5 N·s en el punto de impacto (como hoy), daño × multiplicador de la parte, un solo impacto por ataque y feedback de golpe.

- **Ventanas activas:** salen de las claves de los clips (el brazo que golpea pasa de recogido a extendido: `front_shoulder` de −0,77 a 1,94 rad entre 0,2 y 0,3 s en `combo1`; `back_shoulder` de −0,83 a 2,40 rad entre 0,1 y 0,3 s en `combo2`; los dos hombros de ~3,2 a −2,6 rad entre 0,3 y 0,6 s en `combo3`; las caderas a su límite entre 0,4 y 0,6 s en `air_kick`). R6b verifica que el alcance máximo medido de la mano o el pie cae dentro de la ventana.
- **Paso adelante (`lunge`):** `combo2` y `combo3` llevan `lunge` = 2,5 m/s: el atacante apoyado avanza hacia el lado de la mira desde el inicio del golpe hasta el fin de su ventana activa. `combo1` no avanza. Durante el ataque el robot no camina ni gira.
- **Empuje del combo:** los dos primeros golpes empujan poco (1,5 m/s, sin despegar) para que el rival siga al alcance del siguiente; el tercero empuja fuerte. Daño del combo completo: 30 en 1,8 s más el enfriamiento, ≈ 14 por segundo, igual que el golpe actual repetido (8 cada 0,6 s ≈ 13 por segundo).
- **Valores aceptados (19/11):** daño 8/8/14 y empuje lateral 1,5/1,5/6 m/s del combo son el punto de partida aprobado; se ajustan en el balance de #27, cambiando solo la tabla.
- **Golpe fuerte:** `combo3` y `airKick` (columna `reaction` = `stumble`).
- **Combo** (`MELEE.combo`):
  - `punch` apoyado, sin ataque en curso y fuera de enfriamiento: empieza `combo1`.
  - Un `punch` **dentro de la ventana de encadenado** del golpe en curso (desde el inicio de su ventana activa hasta `duration` + `MELEE.combo.grace`) deja en espera el siguiente golpe, que empieza al terminar el actual (`combo1` → `combo2` → `combo3`). Un toque fuera de la ventana no hace nada.
  - Si el golpe en curso termina y pasa `grace` sin toque, el combo se corta y vuelve a la locomoción. Después de `combo3` no hay cuarto golpe.
  - El combo sigue aunque el golpe anterior no haya conectado.
  - Al cortarse o terminar, empieza `MELEE.combo.cooldown`.
  - Valores: `grace` 0,2 s; `cooldown` 0,25 s.
- **En el aire:** `punch` → `airPunch`; `kick` → `airKick`. Sin combo. Aterrizar corta el ataque aéreo (si no conectó, no conecta). Mismo enfriamiento de `MELEE.combo.cooldown`.
- **En el piso, `kick`** (abajo + golpe) **cuenta como `punch`**: no hay patada en el piso (decidido el 19/11).
- **No se ataca** en `dead`, reacción, roll ni bloqueo, ni aturdido.
- **No se dispara durante la reacción** a un golpe (0,4 s): la reacción pone `armsBusy` y el emisor ve el gatillo suelto. Es un cambio respecto de `main`, donde el aturdimiento no impide disparar; aceptado el 19/11.
- **Prioridad entre disparo, bloqueo y golpe:** bloqueo > golpe > disparo.
  - Con `block` mantenido no se empieza ningún ataque y el emisor ve el gatillo suelto.
  - Un ataque en curso termina aunque se apriete `block`; el bloqueo entra al terminar.
  - Un `punch` durante el disparo corta el chorro mientras dura el ataque (como hoy): `armsBusy`.

### 3.7.5 Bloqueo

- **Entrada:** `block` mantenido, apoyado y sin aturdimiento. **En el aire no se bloquea:** el gatillo se ignora y, si sigue apretado al aterrizar, entra en `block`.
- **Mientras bloquea:** no camina, ni siquiera lento (el control horizontal aplica el frenado de "sin input"; decidido el 19/11), no dispara, no ataca. Puede rodar (`roll`).
- **Qué frena:** solo golpes melee. Un golpe está **bloqueado** si se cumplen las dos:
  1. el receptor está en `block` y el golpe le llega **de frente**: la dirección del rayo apunta contra el lado de la mira del receptor (dx del rayo × lado del receptor < 0);
  2. el primer cuerpo del receptor que toca el rayo es un brazo: `ROBOT_RIG.arms` = `["b_3", "b_13", "b_14", "b_15"]`.

  El bloqueo es geométrico (decidido el 19/11): un golpe por la espalda, o uno que pase por encima o por debajo de la guardia y toque la cabeza, el torso o las piernas, entra normal. Si R8b muestra que la guardia deja descubierta la cabeza o el pecho, se aplica el plan B de R8b (todo golpe de frente queda bloqueado).
- **Efecto de un golpe bloqueado:**
  - sin daño en los brazos ni en ninguna parte;
  - sin aturdimiento, sin empuje del robot entero y sin reacción: el receptor sigue en `block`;
  - se aplica igual el impulso de 5 N·s en el punto (es física de contacto, no daño). Sobre un brazo de 1 kg da como mucho 5 m/s, por debajo de los 11 m/s del daño por impacto, así que tampoco entra daño por `BeginContact`;
  - el ataque cuenta como conectado (no vuelve a pegar en esa ventana);
  - se emite el evento de feedback `block`;
  - al atacante no le pasa nada: ni retroceso ni aturdimiento (decidido el 19/11 para la entrega; premiar el bloqueo queda como idea de pulido).
- **Rotura de guardia (#136):** un golpe cuya fila de `MELEE` tiene `breaksGuard: true` (solo `combo3`) que cumple las dos condiciones de arriba no queda bloqueado: sin daño, el receptor sale de `block`, queda aturdido `MELEE.guardBreakStun` = 0,7 s (no puede volver a `block` aunque mantenga LT, porque el bloqueo exige no estar aturdido), no recibe el `push` de la fila (el código no lo aplica), sí el impulso en el punto y la reacción de la fila; el ataque cuenta como conectado. Evento de feedback `blockBreak` (sonido `block_break_1..3`, sin `hit`, `hurt` ni `block`) y `kind: "blockBreak"` en `hits`: 8 líneas radiales de 0,15 a 0,8 m en 0,35 s, naranja.
- **Qué no frena:** chorros de fluido, quemaduras, cortocircuito, pileta, impacto fuerte por `BeginContact` (caídas, choques) y el gancho.
- **Feedback:** `Melee` agrega a su lista `hits` un evento `{ x, y, time, kind }` con `kind` = `"hit"`, `"block"` o `"blockBreak"` (#136: como `"block"`, pero 8 líneas de 0,15 a 0,8 m en 0,35 s, en naranja). `HitEffectsView` (`src/render/hitEffectsView.js`) dibuja `"hit"` como hoy (destello blanco de 0,2 s) y `"block"` como 6 líneas radiales que salen del punto de contacto, de 0,15 a 0,45 m, en 0,25 s, en blanco azulado. Datos `HIT_FX` en `src/render/hitEffectsView.js`. La lista reemplaza a `golpes` de `index.js`.

### 3.7.6 Roll

- **Entrada:** intención `roll` (saltar con `block` mantenido, [10.2](10-controles.md#102-intenciones-de-input)), apoyado (`framesGrounded` > 5), sin aturdimiento, sin ataque en curso y fuera de `ROLL.cooldown`. En el aire, `roll` no hace nada (tampoco salta).
- **Dirección:** `right` → +1, `left` → −1; con el stick al centro, hacia el lado de la mira. Si coincide con el lado de la mira, clip `roll`; si es contraria, `roll_back` (la vuelta hacia atrás, generada invirtiendo `roll`).
- **Movimiento:** cada paso fijo, mientras dura, fija la vx de la raíz en `ROLL.speed` × dirección (como caminar; la vy es libre). La rotación la hace el clip: la pista `root/bodyAngle` lleva el controlador de balance de RagImporter, que sigue el objetivo con el error envuelto a ±π y la velocidad de la pista como anticipación ([3.7.8](#378-verificado-en-la-librería)).
- **Sin invulnerabilidad:** esquiva porque el cuerpo se agacha y se aleja, no por reglas. Un golpe que conecta durante el roll daña y lo corta (la reacción tiene prioridad). Los fluidos dañan igual.
- **Al terminar:** si `block` sigue apretado, vuelve a `block`; si no, a la locomoción. Empieza `ROLL.cooldown`.

### 3.7.7 Ubicación en los patrones

| Patrón | Cómo se aplica |
|---|---|
| Sistemas por módulo | **Módulo nuevo `src/combat/melee.js`** (`Melee`, datos `MELEE`): resolución de los ataques melee (rayos, daño, bloqueo, empuje, reacción y feedback). Un motivo de cambio: el combate cuerpo a cuerpo. Sale de `index.js` (`golpear` y las constantes `PUNCH_*`). Constructor `Melee(raycaster, damage, config = MELEE)`; `damage` solo para `ownerOf`. `resolve(players, now)` una vez por paso fijo después de `stepWorld` (donde hoy corre `golpear`). Expone `hits` (eventos de feedback) y `reset()` (ronda nueva). **No importa nada**: recibe el raycaster, el sistema de daño y los jugadores |
| Máquinas de estado | La de clips de `ActiveRagdoll` ([3.7.3](#373-máquina-de-estados-de-clips)): estados y transiciones en un solo método. `ActiveRagdoll` decide **qué** ataque está activo y en qué ventana (`activeAttack(now)` devuelve la fila de `MELEE` o `null`); `Melee` decide **qué pasa** al conectar y llama a `victim.hit(…)` / `victim.blocked(…)`, que fijan la reacción |
| Datos en tablas | `MELEE` (ataques, combo), `AIR` y `ROLL`; claves de clips y `arms` en `ROBOT_RIG`. Un ataque nuevo es una fila de `MELEE` y una clave de clip |
| Intención, no dispositivo | `Input` suma `block`, `roll` y `kick` ([10.2](10-controles.md#102-intenciones-de-input)); `ActiveRagdoll` no lee dispositivos |
| Paso fijo | `roll` es movimiento: se aplica en `move()` una vez por paso y usa el mismo flanco pendiente que `jump` (`jumpPending` pasa a guardar también `roll`). `punch` y `kick` son golpes: se aceptan una vez por frame (como hoy `player.punch(now)`). La resolución de los rayos, una vez por paso después de `stepWorld` |
| Juntar durante el paso, actuar después | El melee no usa callbacks de Box2D: son rayos después de `stepWorld`. Los eventos de feedback se encolan en `Melee.hits` y los consume `HitEffectsView` al dibujar |
| Memoria nativa | `Melee` crea en el constructor los dos `b2Vec2` de trabajo que hoy crea `index.js` (impulso y punto) y los libera en `dispose()`. Nada nativo por golpe |
| Contrato de RagImporter | Solo `play`, `stop`, `setJointAngle`, `clearJointOverride` y velocidades de cuerpos, como hoy. No se escriben motores ni se tocan joints. `lib/` no cambia |
| Raíz de composición | `index.js` crea `Melee`, arma `ROBOT_RIG` (claves, `arms`, `melee`), difiere el giro durante el roll, pasa `!player.armsBusy` al emisor y `melee.hits` a `drawHits` |

### 3.7.8 Verificado en la librería

Leído en `lib/` (copia de ragassembler2d `d067775`), 19/11:

| Qué | Estado |
|---|---|
| El formato del v5 (`version` 4) está en `SUPPORTED_VERSIONS`, igual que el rig actual | *Verificado* (`lib/validate.js`) |
| Las pistas apuntan a `j_*`/`root` por `id`; `setJointAngle`, `clearJointOverride` y `joint` buscan por `name` | *Verificado* (`lib/instance.js`) |
| `play(key, { speed, restart })`: reproducir la clave activa no reinicia salvo `restart`; `stop`, `isPlaying(key)`, `activeClip(layer)` | *Verificado* |
| Una sola capa maneja la pose y todos los clips del v5 son de la capa 0: `aim` no se puede superponer a `walk` (por eso `aim` es un estado de reposo y la mira caminando sigue con overrides) | *Verificado* |
| Sin `fadeIn`/`fadeOut`: los cambios de clip son instantáneos | *Verificado* |
| Canal `root/bodyAngle`: `driveBalance` sigue `θ₀ + bodyAngle` con el error envuelto a ±π y la velocidad de la pista (× `speed`) como anticipación, con `maxTorque` 120 N·m. La vuelta de −6,55 rad la da la anticipación; al soltar el clip, el objetivo vuelve al reposo sin desenrollar 2π | *Verificado* en el código (`lib/instance.js:77-124`); que el torque alcance para dar la vuelta apoyado se mide en R12 |

### 3.7.9 Criterios de aceptación (Node, `tests/helpers/game.js`, LiquidFun real y gamepad simulado)

| Id | Escenario | Esperado |
|---|---|---|
| R1 | Cargar el v5 con `RagImporter.parse` y el armado de `ROBOT_RIG` | Sin errores; 13 cuerpos, 12 articulaciones, masa total 13 kg ±0,01; `AIM_JOINTS` y `AIM_HOLD` existen; todas las claves de `ROBOT_RIG.clips` existen (incluido `roll_back`) |
| R2 | A apoyado, mira (1, 0), (1, −0,5) y (0,3, −1) | `jumpStart` en el paso del salto; subida del torso ≥ 3,82 m (95 % de 4,02); error de mira en el aire ≤ 15° máximo y ≤ 5° medio (`tests/aim-jump.test.js` con el v5) |
| R2b | Caminar 2 s apuntando | Error medio de mira ≤ 5° (hoy ~4,5°) |
| R3 | Saltar con el stick a favor de la mira, en contra y al centro | A los 0,6 s + 1 paso: `airForward`, `airBackward` y `air` respectivamente |
| R4 | Caer desde 7 m de altura sobre el piso; saltar en el piso plano | En la caída, `fallHigh` antes de aterrizar; en el salto, nunca `fallHigh` |
| R5 | Aterrizar de cualquier estado de aire | Sale a `idle`, `aim` o `walk` a más tardar 3 pasos después del primer contacto de los pies |
| R6 | Rival quieto mirando al atacante a 0,8 m, sin bloquear; B en t = 0, 0,25 y 0,65 s | Secuencia `combo1` → `combo2` → `combo3`; tres impactos; daño total = Σ(8, 8, 14 × multiplicador de la parte tocada) ±0,01; después del tercero el rival está en `reactStumble` |
| R6b | Mismo escenario, sin rival | En cada ataque, el instante de máximo alcance de la mano (o del pie en `airKick`) medido desde el origen de sus rayos cae dentro de su ventana activa |
| R7 | Un solo B; y B en t = 0 y t = 0,1 s | `combo1` y, a los 0,4 + 0,2 s + 1 paso, locomoción; el toque en 0,1 s (antes de la ventana) no encadena |
| R8 | Rival con LT mantenido, de frente, a 0,8 m; combo completo | Ningún golpe que toque un brazo daña: `hp` sin cambio en esos golpes; el rival sigue en `block`, sin aturdimiento; un evento `block` en `melee.hits` por golpe bloqueado, a ±0,01 m del impacto; Δvx del torso del rival < 1 m/s por golpe bloqueado |
| R8b | Mismo escenario con el bloqueo | Se informa qué fracción de los rayos toca primero un brazo en cada golpe y qué parte recibe el impacto que resuelve `Melee`. **Regla (plan B, aprobado el 19/11):** si en algún golpe del combo el impacto cae primero en la cabeza (`b_1`) o en el pecho (`b_2`), se quita la condición 2 de [3.7.5](#375-bloqueo) y todo golpe melee de frente contra un robot en `block` queda bloqueado, sin importar la parte que toque; el evento `block` se emite en el punto de impacto. Con el plan B, R8 exige los tres golpes bloqueados y R9 no cambia. Se registra en [12.1](12-decisiones.md#121-decisiones-tomadas) cuál de las dos variantes quedó |
| R9 | Rival bloqueando, golpe por la espalda | Daño y reacción normales |
| R10 | Chorro de ácido 1 s contra un rival bloqueando y contra uno sin bloquear, misma pose de partida | Mismo daño ±10 % |
| R11 | LT + RT 1 s; LT + B | Cero partículas emitidas y tanque sin cambio; ningún ataque |
| R12 | LT + A con el stick hacia adelante, hacia atrás y al centro | `roll` / `rollBack` / `roll`; desplazamiento del torso 3,2 m ±25 % en el sentido pedido; giro acumulado del torso ≥ 0,9 × 2π en el sentido del clip; 0,3 s después de terminar, ángulo envuelto del torso ≤ 0,35 rad |
| R13 | Golpe que conecta a mitad del roll | Daño normal y `reactSimple` en ese paso; el roll se corta |
| R14 | B en el aire; abajo + B en el aire; aterrizar a mitad de `airPunch` | `airPunch`; `airKick`; al aterrizar, locomoción en ≤ 3 pasos. Un `airKick` que conecta deja al rival en `reactStumble` |
| R15 | Golpe que conecta | `reactSimple` en el receptor en el mismo paso; dura 0,4 s |
| R16 | Quieto sin mira; quieto con RT o stick derecho | `idle`; `aim` |
| R17 | `hp` a 0 | `dead` y overrides sueltos |
| R18 | LT del gamepad apretado y G apretado y soltado; LT del gamepad + W | Sigue en `block`; `roll` (O entre fuentes, ninguna pisa) |
| R18b | Teclado de J1: Shift (izquierdo o derecho) mantenido; S + F en el aire | `block` en J1; `kick` en J1 ([10.1](10-controles.md#101-mapeo--remapeo-pedido-por-el-usuario-el-1811)) |
| R19 | La mira cruza al otro lado a mitad del roll | El giro se aplica al terminar el roll; cantidad de joints igual a la de RagImporter |
| R20 | 1.000 combos, bloqueos y rolls | Sin errores de heap; cantidad de objetos nativos estable |
| R21 | Suite completa | `node --test tests/` pasa; los invariantes globales y la flotación (F4, F4b) sin cambio |

### 3.7.10 Riesgos

- **Guardia que no cubre:** si el clip `block` no pone un brazo delante de la cabeza o del pecho en la línea de los rayos, muchos golpes de frente entran igual. R8b lo mide antes de cerrar y, si pasa, se aplica su plan B (todo golpe de frente bloqueado).
- **Torque del roll:** el balance tiene 120 N·m; con el robot apoyado y la fricción de los pies, puede que no complete la vuelta en 0,8 s. R12 lo mide; si falla, se informa (no se suben torques del rig sin decisión).
- **Pose en vuelo y salto:** `jump_start` y los clips de aire pueden bajar la subida medida. R2 lo controla.
- **`walk` de 0,5 s:** cambia la cadencia y el aporte del clip a la velocidad. Se vuelve a medir `WALK_ANIM.refSpeed`.
- **Bloqueo de teclado:** es Shift, izquierdo o derecho (`KEYBOARD_LAYOUT`); el teclado es solo de J1 ([10.1](10-controles.md#101-mapeo--remapeo-pedido-por-el-usuario-el-1811)).
