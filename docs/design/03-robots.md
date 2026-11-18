# 3. Robots

Código: `js/ActiveRagdoll.js` (un jugador), rig `ROBOT_RIG` en `index.html`, modelo `assets/robot.rag.json` (13 cuerpos, clips `walk`, `jump`, `dead`, `punch`, `aim`, `run_2`).

## 3.1 Movimiento ✅

| Acción | Cómo funciona | Valores |
|---|---|---|
| Caminar | Fija la velocidad horizontal de la raíz. Sin input, frena ×0,85 por paso (×0,95 con miel) | 6 m/s (3 con miel) |
| Saltar (dirección arriba) | Solo apoyado: piso por raycast desde los pies ([08-raycast](08-raycast.md)). Se aplica la velocidad a **todos** los cuerpos | 9 m/s (≈ 4 m de altura); 3 m/s con miel; hace falta estar apoyado 5 pasos seguidos |
| Girar | Al cambiar el lado de la mira, se vuelve a generar el ragdoll espejado (`flipX`), conservando posición, velocidades y estado. RagImporter no permite espejar una instancia viva | — |
| Caminar hacia atrás | Si se camina en contra de la mira, se reproduce `walk_back`: una copia de `walk` con las claves invertidas, generada al cargar (`js/clips.js`) | Provisorio hasta Gann4Life/RagAssembler2D#231 |
| Apuntar | El hombro (`joint_11`) gira para que **la línea del cañón** pase por el objetivo (corrige el paralaje). El codo queda en reposo y el override va con fuerza 1, así que ningún clip mueve la cadena del arma | Error medido: 0° quieto, ~4,5° de media caminando. Exacto: #8 |
| Animación | Máquina de estados: `dead` > `punch` > `jump` > `walk` / `walk_back` > reposo. Los cambios son sin fundido (la librería aún no los tiene) | — |

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
- **Autodaño:** un disparo no daña a quien lo disparó durante 0,4 s; después sí. Pendiente de decisión: #20.
- **Extremidad inutilizada** (💬, parte de #19): una extremidad muy corroída pierde fuerza con el override `strength`. No se puede romper el joint: el contrato de RagImporter no lo permite.

## 3.4 Empujar

Los robots chocan entre sí, porque cada instancia colisiona con las demás. Además del contacto al caminar, empujan:
- el golpe melee ✅;
- el viento 🔨 #17;
- los fluidos densos, porque transfieren cantidad de movimiento (acople bidireccional de LiquidFun) ✅.
