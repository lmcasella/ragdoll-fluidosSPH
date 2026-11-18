# 3. Robots

Código: `js/ActiveRagdoll.js` (un jugador), rig `ROBOT_RIG` en `index.html`, modelo `assets/robot.rag.json` (13 cuerpos, clips `walk`, `jump`, `dead`, `punch`, `aim`, `run_2`).

## 3.1 Movimiento ✅

| Acción | Cómo funciona | Valores |
|---|---|---|
| Caminar | Fija la velocidad horizontal de la raíz. Sin input, frena ×0,85 por paso. Pegado (miel, ✅ #41): frena ×0,5 (hoy, con miel, ×0,95) | 6 m/s; pegado 0,6 m/s (`STICKY.speed` 0,1; hoy 3 con miel). Medido: el torso avanza 0,74 m en 1 s con el stick (el clip de caminar aporta ~0,64 m/s aun con `speed` en 0), 0,19 × lo que sin miel |
| Saltar (dirección arriba; 🔨 con el remapeo: A, intención `jump`, [10](10-controles.md#101-mapeo--remapeo-pedido-por-el-usuario-el-1811)) | Solo apoyado: piso por raycast desde los pies ([08-raycast](08-raycast.md)). Se aplica la velocidad a **todos** los cuerpos | 9 m/s (≈ 4 m de altura); pegado 2,7 m/s (`STICKY.jump` 0,3) con 2 g, ≈ 0,18 m (hoy 3 m/s con miel); hace falta estar apoyado 5 pasos seguidos |
| Pegado (miel) ✅ #41 | Estado `stickyTimer` (s), renovado por `stick()` cada paso que toca miel y 0,3 s después. Suma gravedad extra a todas las piezas | `STICKY` en `js/ActiveRagdoll.js`: `speed` 0,1, `brake` 0,5, `jump` 0,3, `down` 10 m/s², `grace` 0,3 s. Reemplaza `honeyTimer`. Regla en [04-fluidos](04-fluidos.md#miel-pegajosa-regla-compartida--41) |
| Girar | Al cambiar el lado de la mira, se vuelve a generar el ragdoll espejado (`flipX`), conservando posición, velocidades y estado. RagImporter no permite espejar una instancia viva | — |
| Caminar hacia atrás | Si se camina en contra de la mira, se reproduce `walk_back`: una copia de `walk` con las claves invertidas, generada al cargar (`js/clips.js`) | Provisorio hasta Gann4Life/RagAssembler2D#231 |
| Apuntar | El hombro (`joint_11`) gira para que **la línea del cañón** pase por el objetivo (corrige el paralaje). El codo queda en reposo y el override va con fuerza 1, así que ningún clip mueve la cadena del arma | Error medido: 0,3–0,9° quieto, ~4,5° de media caminando, ≤ 12° en el salto (✅ #57, ver abajo). Exacto: #8 |
| Animación | Máquina de estados: `dead` > `punch` > `jump` > `walk` / `walk_back` > reposo. Los cambios son sin fundido (la librería aún no los tiene) | — |
| Velocidad del clip de caminar ✅ #58 | Una vez por paso fijo, `play(clip, { speed })` con \|vx\| del torso / `WALK_ANIM.refSpeed`, acotada a `[minSpeed, maxSpeed]` y suavizada (`smoothing`); la guarda `animSpeed` del robot | `WALK_ANIM` = `refSpeed` 4,7 m/s (el \|vx\| sostenido al caminar a 6 m/s pedidos), `minSpeed` 0,1, `maxSpeed` 1,25, `smoothing` 0,1. Medido (`tests/walk-anim.test.js`): normal ≈ 1 (0,97 con \|vx\| 4,9 m/s); pegado ≈ 0,1 (mínimo); salto máximo entre pasos 0,026 |

**Apuntar en el salto ✅ #57.** Causa medida: el clip `jump` trae claves de hombro y codo (`joint_11`/`joint_11_copy` llegan a 2,94 y 2,42 rad en t = 0,3 s, el brazo "tirado hacia arriba"). El override de mira gana en ángulo y velocidad, pero RagImporter suma `shortestDelta(clip, override)` al ángulo del clip sin normalizar: si el clip y la mira difieren más de π (mira abajo, por ejemplo −0,46 rad contra 2,94), el motor recibe un error de ~2π y, como el hombro no tiene límites, da la vuelta casi completa por el otro lado. Solución en el juego: `withoutJointTracks` (`js/clips.js`) quita al cargar las pistas de `aimJoints` y `aimHold` del clip `jump`; las piernas y el torso conservan la animación. No se tocó `lib/` ni el rig. El impulso de 9 m/s a todas las piezas se mantiene: es lo que hace saltar al robot (sin el de los brazos, el torso sube 1,9 m en vez de 4,0).

| Mira (Y arriba) | Error medio en el aire, antes → después | Error máximo, antes → después | Subida del torso, antes → después |
|---|---|---|---|
| (1, 0) | 3,4° → 3,4° | 7,9° → 7,9° | 4,02 m → 4,02 m |
| (1, −0,5) | 5,6° → 2,9° | 15,9° → 8,8° | 4,02 m → 4,02 m |
| (0,3, −1) | 33,2° → 3,6° | 129,5° → 11,3° | 4,01 m → 4,01 m |

Umbral de regresión (`tests/aim-jump.test.js`): error máximo ≤ 15°, medio ≤ 5° y subida ≥ 95 % de 4,02 m. Queda un resto de hasta ~12° apuntando hacia abajo, por el golpe de las piernas del clip al plegarse (t = 0,3 s).

Propuesta para el robot, sin urgencia (no hace falta si el juego quita las pistas): borrar de `jump` las pistas de `j_10`, `j_11`, `j_12` y `j_13` en `assets/robot.rag.json`, o llevar las claves de `j_11`/`j_13` a ±π de la pose de mira. El mismo defecto de librería (ángulo sin normalizar al aplicar un override) quedaría para #8 y RagAssembler2D#232.

**Mira:** gamepad primero. La dirección viene del stick derecho y se conserva al soltarlo. El mouse (solo J1) y el teclado son respaldo. El mouse solo retoma la mira si se mueve después del último uso del stick.

## 3.2 Golpe melee ✅

- **Acción:** X (gamepad; 🔨 con el remapeo pasa a B), F (J1) o Shift derecho (J2). Reproduce el clip `punch`, que suelta los overrides de mira mientras dura.
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

**Una sola barra de vida (100)**, pero el daño entra por partes del cuerpo (`js/damage.js`):

| Parte | Multiplicador |
|---|---|
| Cabeza (`b_1`) | ×1,5 |
| Pecho y pelvis (`b_2`, `b_6`) | ×1 |
| Brazos y piernas | ×0,75 |

| Fuente | Cálculo | Técnica |
|---|---|---|
| Fluido que toca una parte | Según el fluido ([04-fluidos](04-fluidos.md)) | Contacto partícula↔cuerpo ([07-sph](07-sph.md)) |
| Golpe melee | 8 × multiplicador | Raycast ([3.2](#32-golpe-melee-)) |
| Impacto fuerte (caída, choque, ser lanzado) | `(v − 11 m/s) × 2` × multiplicador, si la velocidad de acercamiento sobre la normal supera 11 m/s; 0,25 s de espera por parte | `BeginContact` ([06-box2d](06-box2d.md)). Un salto normal aterriza a ~9 m/s y no daña |
| Pileta | Destrucción inmediata | Sensor ([05-escenario](05-escenario.md#52-pileta)) |

- **Destello:** la parte dañada se pone **roja** y vuelve a su color en **1 s** (`lerp`). Un golpe nuevo reinicia el fundido.
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

- **Módulo nuevo `js/grapple.js`**, clase `Grapple(world, ground, raycaster, damage, config = GRAPPLE)`. Un solo motivo de cambio: la cuerda.
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
| `hookRival` | `true` (decisión del usuario) | Si el rayo pega en el rival, se engancha a esa pieza: la cuerda tira de los dos según sus masas |
| `cooldown` | 0,4 s | Desde que se suelta, o desde un tiro que no enganchó, hasta poder volver a tirar |
| `breakForce` | 1.500 N | Si la reacción de la cuerda (`GetReactionForce(1/subpaso)`) lo supera, se corta (≈ 11,5 veces el peso del robot) |
| `swingAccel` | 6 m/s² | Mientras está enganchado y en el aire, el stick suma esta aceleración tangencial a la raíz, en lugar de fijar su velocidad como al caminar, para no pelear con la cuerda |
| `body` | `rig.gun.body` | Pieza que lleva la cuerda (el antebrazo del arma); el ancla local es la boca (`rig.gun.muzzle`) |

### Funcionamiento

1. **Tiro** (flanco de X, una vez por frame, sin cooldown, robot vivo y no aturdido): `raycaster.cast` desde la boca en la dirección de la mira hasta `range`, ignorando los cuerpos propios y los sensores (como ya hace `Raycaster`). Los rayos de Box2D no tocan partículas ni el campo de alturas: el gancho atraviesa el agua y engancha en el fondo o en lo que haya detrás.
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
5. **Dibujo:** una línea de la boca al ancla (`render.js`, en el color del jugador).

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
| G9 | Enganchar al rival (con `hookRival`) y recoger 1 s | La distancia entre los dos baja; con masas iguales, cada uno se mueve la mitad ±20 % |
| G10 | 1.000 ciclos de enganchar y soltar | Sin errores de heap y cantidad de joints estable (sin memoria nativa nueva por ciclo) |
| G11 | Cargar la cuerda por encima de `breakForce` (impulso hacia abajo al robot colgado) | Se corta en ese paso |
| G12 | Teclado (E) y mouse (botón derecho) del J1 con el gamepad apretando X | Mismo resultado; soltar E no suelta el gancho mientras X sigue apretado |

## 3.6 Modo ragdoll 🔨 M5

Diseño mínimo ("hacerse el muerto", Y, intención `ragdoll`):
- **Estado nuevo** `ragdoll` en la máquina de clips de `ActiveRagdoll`, con prioridad `dead` > `ragdoll` > `punch` > `jump` > `walk`. Reproduce el clip `dead` (ya existe y deja al robot flojo) sin bajar la vida, y suelta los overrides de mira. No escribe motores ni toca la librería: usa el mismo mecanismo que la muerte.
- **Entrada y salida:** Y entra; otro Y, o `RAGDOLL.maxTime` (3 s), sale. Después hay `RAGDOLL.cooldown` (2 s). Sin control mientras dura.
- **Tacle:** mientras dura, si una pieza del robot flojo choca al rival con velocidad de acercamiento sobre la normal ≥ `RAGDOLL.tackleSpeed` (6 m/s, menor que los 11 m/s del impacto general), el rival recibe `(v − 6) × 2` × multiplicador de la parte. Va por la misma cola de `BeginContact` de `DamageSystem`. Quien está flojo recibe el daño de impacto normal.
- Datos `RAGDOLL` en `js/ActiveRagdoll.js`.
