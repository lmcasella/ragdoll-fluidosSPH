# 3. Robots

Código: `js/ActiveRagdoll.js` (un jugador), rig `ROBOT_RIG` en `index.html`, modelo `assets/robot.rag.json` (13 cuerpos, clips `walk`, `jump`, `dead`, `punch`, `aim`, `run_2`).

## 3.1 Movimiento ✅

| Acción | Cómo funciona | Valores |
|---|---|---|
| Caminar | Fija la velocidad horizontal de la raíz. Sin input, frena ×0,85 por paso. Pegado (miel, ✅ #41): frena ×0,5 (hoy, con miel, ×0,95) | 6 m/s; pegado 0,6 m/s (`STICKY.speed` 0,1; hoy 3 con miel). Medido: el torso avanza 0,74 m en 1 s con el stick (el clip de caminar aporta ~0,64 m/s aun con `speed` en 0), 0,19 × lo que sin miel |
| Saltar (dirección arriba) | Solo apoyado: piso por raycast desde los pies ([08-raycast](08-raycast.md)). Se aplica la velocidad a **todos** los cuerpos | 9 m/s (≈ 4 m de altura); pegado 2,7 m/s (`STICKY.jump` 0,3) con 2 g, ≈ 0,18 m (hoy 3 m/s con miel); hace falta estar apoyado 5 pasos seguidos |
| Pegado (miel) ✅ #41 | Estado `stickyTimer` (s), renovado por `stick()` cada paso que toca miel y 0,3 s después. Suma gravedad extra a todas las piezas | `STICKY` en `js/ActiveRagdoll.js`: `speed` 0,1, `brake` 0,5, `jump` 0,3, `down` 10 m/s², `grace` 0,3 s. Reemplaza `honeyTimer`. Regla en [04-fluidos](04-fluidos.md#miel-pegajosa-regla-compartida--41) |
| Girar | Al cambiar el lado de la mira, se vuelve a generar el ragdoll espejado (`flipX`), conservando posición, velocidades y estado. RagImporter no permite espejar una instancia viva | — |
| Caminar hacia atrás | Si se camina en contra de la mira, se reproduce `walk_back`: una copia de `walk` con las claves invertidas, generada al cargar (`js/clips.js`) | Provisorio hasta Gann4Life/RagAssembler2D#231 |
| Apuntar | El hombro (`joint_11`) gira para que **la línea del cañón** pase por el objetivo (corrige el paralaje). El codo queda en reposo y el override va con fuerza 1, así que ningún clip mueve la cadena del arma | Error medido: 0,3–0,9° quieto, ~4,5° de media caminando, ≤ 12° en el salto (✅ #57, ver abajo). Exacto: #8 |
| Animación | Máquina de estados: `dead` > `punch` > `jump` > `walk` / `walk_back` > reposo. Los cambios son sin fundido (la librería aún no los tiene) | — |

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

- **Acción:** X (gamepad), F (J1) o Shift derecho (J2). Reproduce el clip `punch`, que suelta los overrides de mira mientras dura.
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
- los fluidos densos, porque transfieren cantidad de movimiento (acople bidireccional de LiquidFun) ✅.
