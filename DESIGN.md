# Documento de diseño — ragdoll-fluidosSPH

Estado: borrador vivo. Describe lo que el juego **es hoy** (§2–§5) y lo que **falta decidir o construir** (§6–§7).
Lo marcado como **Propuesta** no está acordado: es un punto de partida para discutir.

## 1. Visión

Juego de pelea local 1 contra 1 en 2D. Dos robots ragdoll con física activa se disparan fluidos (ácido, lava, miel) en un escenario con plataformas. La gracia está en la física: los fluidos empujan, se pegan y fluyen de verdad (partículas SPH de LiquidFun), y los cuerpos reaccionan como ragdolls que intentan mantenerse en pie.

- **Plataforma:** navegador (escritorio), publicado en GitHub Pages.
- **Jugadores:** 2 en la misma pantalla, teclado y/o gamepad.
- **Pilares:** física legible y divertida antes que precisión; partidas cortas; cero instalación.

## 2. Estado actual (v0.1.0)

| Área | Hoy |
|---|---|
| Jugadores | 2 robots iguales (`assets/robot.rag.json`), J1 a la izquierda, J2 a la derecha mirándolo |
| Movimiento | Caminar, saltar (arriba), girar hacia donde se apunta o camina |
| Armas | 3 fluidos, cambio por tecla o LB/RB; un disparo por pulsación |
| Vida | 100 por jugador; al llegar a 0 se reproduce el clip `dead` (queda flojo) |
| Escenario | Piso y dos paredes al borde de la pantalla |
| Partida | **No hay** condición de victoria, rondas ni reinicio: se recarga la página |
| Presentación | Formas geométricas en Canvas 2D; fluidos con filtro *goo* (metaballs); sin sonido |

## 3. Mecánicas

### 3.1 Movimiento (`js/ActiveRagdoll.js`)

| Parámetro | Valor | Con miel |
|---|---|---|
| Velocidad horizontal | 6 m/s | 3 m/s |
| Velocidad de salto (a todos los cuerpos) | 6 m/s (≈ 1,8 m) | 3 m/s |
| Frenado sin input | ×0,85 por paso | ×0,95 por paso |
| Salto disponible | tras 15 pasos (0,25 s) con velocidad vertical < 1 m/s | igual |

Los clips del robot se eligen por estado: `walk` al moverse, `jump` en el aire, `dead` sin vida. Los hombros (`joint_11`, `joint_11_copy`) se sobrescriben para apuntar el brazo con el arma.

**Giro:** al cambiar de lado se vuelve a generar el ragdoll espejado (`flipX`), conservando posición, velocidades y miel. RagImporter no permite espejar una instancia existente.

### 3.2 Armas de fluido (`index.html`)

Cada disparo crea un grupo circular de partículas (radio 0,375 m) a 1,5 m de la raíz, en la dirección de la mira, a 20 m/s. Las partículas tienen radio 0,15 m y desaparecen al salir por abajo de la pantalla.

| Arma | Tipo LiquidFun | Efecto al tocar la raíz (radio 0,625 m) |
|---|---|---|
| Ácido (verde) | `water` | −2 de vida por partícula; la partícula se consume |
| Lava (naranja) | `tensile` | −0,1 de vida por partícula y por frame mientras toque; no se consume |
| Miel (amarillo) | `viscous` | Ralentiza 60 pasos (1 s); la partícula se consume |

El daño se detecta comparando el **color** de la partícula y la distancia a la **raíz** (pelvis): un impacto en la cabeza o el brazo no cuenta.

### 3.3 Controles

Detalle en el `README.md`. Resumen: J1 WASD + Espacio (+ mouse), J2 flechas + Enter, gamepads por orden de conexión. Arriba es saltar en todos los esquemas.

## 4. Arquitectura técnica

- **Sin build:** `index.html` carga `vendor/pixi.min.js` y `vendor/liquidfun.js` con `<script>` y el juego como módulo ES. Requiere servidor HTTP.
- **Física:** LiquidFun (build Emscripten, namespace `Box2D`, heap fijo de 16 MiB). Mundo en metros, **Y hacia arriba**, gravedad −10 m/s². Render a 40 px/m.
- **Ragdolls:** RagImporter (`lib/`, copiado de ragassembler2d `d067775`). Los rigs se editan en el editor de ragassembler2d y se exportan como `.rag.json` v4.
- **Paso de simulación:** fijo, con `stepWorld` (1/60 s en 8 subpasos). El movimiento se aplica en cada paso; disparo y cambio de arma, una vez por frame.
- **Memoria nativa:** todo `new Box2D.*` temporal se libera con `Box2D.destroy` (regla 7.4 de RagImporter). Una fuga de este tipo termina abortando el juego.

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Escenario, disparos, daño, render, loop |
| `js/ActiveRagdoll.js` | Jugador: vida, miel, movimiento, mira, clips |
| `js/Input.js` | Teclado por jugador y Gamepad API |
| `assets/*.rag.json` | Rigs (robot en uso; dino sin uso) |
| `tests/` | Tests de humo (`node --test tests/`) |

## 5. Flujo de trabajo

- Ramas con [Conventional Branch](https://conventional-branch.github.io/) (`feature/…`, `bugfix/…`, `chore/…`), commits con [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/), PR a `main`.
- Cada merge a `main` despliega a GitHub Pages (`.github/workflows/pages.yml`). Para publicar una versión nueva, sumar la entrada en `CHANGELOG.md`.

## 6. Preguntas abiertas

1. **Condición de victoria.** ¿Gana el último en pie? ¿Al mejor de N rondas? ¿Con límite de tiempo?
2. **Muerte y reinicio.** ¿Qué pasa tras `dead`: fin de ronda, reaparición, cámara lenta?
3. **Fuego amigo.** Hoy un jugador puede dañarse con sus propios disparos. ¿Se mantiene?
4. **Zona de impacto.** ¿El daño debería contar en cualquier cuerpo del ragdoll, no solo en la raíz? ¿Más daño a la cabeza?
5. **Munición.** Hoy se dispara sin límite. ¿Cadencia mínima, munición por arma, recarga?
6. **Equilibrio de armas.** La lava casi no daña (0,1) comparada con el ácido (2). ¿Rol de cada fluido: daño, control, empuje?
7. **Escenario.** ¿Uno solo o varios? La rama `feature/plataformas-escenario-dinamico` agrega plataformas fijas; ¿"dinámico" son plataformas móviles o destructibles?
8. **Cámara y tamaño.** El escenario depende del tamaño de la ventana. ¿Mundo fijo con cámara que escala?
9. **Estilo visual y sonido.** ¿Sprites para el robot (RagImporter los soporta)? ¿Música y efectos?

## 7. Backlog

Prioridad propuesta (**Propuesta**: ordenar en conjunto).

| # | Tarea | Por qué |
|---|---|---|
| 1 | Revisar y mergear plataformas (`feature/plataformas-escenario-dinamico`) | Ya está hecha; sube el salto a 9 m/s, verificar que se sienta bien |
| 2 | Bucle de partida: victoria, pantalla de resultado, reinicio sin recargar | Sin esto no es un juego completo (§6.1, §6.2) |
| 3 | Daño por cuerpo impactado en vez de distancia a la raíz | Hoy los impactos en cabeza o brazos no cuentan (§6.4) |
| 4 | Cadencia de disparo y/o munición | Evita spamear disparos (§6.5) |
| 5 | Balance de armas | §6.6 |
| 6 | Mundo de tamaño fijo con cámara | Partidas iguales en cualquier pantalla (§6.8) |
| 7 | Fundidos entre clips (actualizar `lib/` cuando RagImporter los implemente) | Hoy los cambios de animación son bruscos |
| 8 | Teclas de arma del J2 sin teclado numérico | Notebooks sin teclado numérico |
| 9 | Igualar controles entre jugadores (el mouse solo maneja al J1) | Ventaja del J1 |
| 10 | Usar o eliminar `assets/ragdino.rag.json` | Asset sin uso |
| 11 | Sonido y sprites | §6.9 |
