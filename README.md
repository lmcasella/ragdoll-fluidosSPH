# Waterbots

**Waterbots**: pelea 1 contra 1 de robots ragdoll que se disparan fluidos SPH, en el navegador. Proyecto de Simulación 1 (UNAHUR): Box2D (LiquidFun), SPH y raycast.

**Jugar online:** https://lmcasella.github.io/ragdoll-fluidosSPH/

## Cómo jugar

Gana la ronda el último robot en pie; la partida es al mejor de 3. Caer a la pileta del centro destruye al robot. A los 60 s de ronda empieza la inundación: llueve desde el techo y el agua sube desde la pileta. El agua es un volumen continuo (un campo de alturas, no gotas): lo que cae en ella se suma y levanta olas, y la lava que cae se hunde despacio. El agua empuja a cada pieza de los robots (empuje de Arquímedes y arrastre): los robots tienen flotación neutra, así que ni se hunden ni suben solos, y además el agua los moja. El robot con alguna parte bajo el agua se moja y pierde 3 de vida por segundo (hasta 3 s después de salir), y se ve con un tinte cian. El reloj de ronda y el aviso "Inundación en N" (desde los 50 s) aparecen en el HUD.

**Modo Infinito.** Es el mapa predeterminado. No hay piso, islas ni pileta: solo paredes a los costados y plataformas atravesables en el medio, con altura, ancho e irregularidad variables y sin lados "justos" (los dos robots se mueven por todo el mapa). Cada robot arranca en una plataforma al azar de la primera etapa, a entre 4 y 10 m del otro. Las plataformas arrancan anchas (5 a 9 m) y se acortan etapa a etapa hasta 2 a 4 m desde la 5; hay de 3 a 7 por cada 10 m de altura y cada una se alcanza saltando en vertical a través de otra de apoyo. Etapas de 15 m con paredes de 36 m de ancho que se angostan 4 m por etapa (mínimo 24 m). Todo el mapa baja despacio (0,15 m/s, 0,02 m/s más por etapa alcanzada) mientras el agua, que arranca a 2 m, empieza a subir a los 5 s (0,25 m/s, 0,04 m/s más en cada etapa): hay que trepar para no ahogarse, y el robot se ahoga cuando el agua le cubre el torso. Lo que queda hundido desaparece y arriba se genera más mapa; una de cada pocas plataformas de las etapas 1 en adelante trae un arma y cada etapa trae una tuerca de reparación (deja la vida en 100 y levanta al robot inconsciente; con la vida llena no se recoge). En Infinito los robots **arrancan sin armas, solo con golpes**: el gatillo no hace nada, no hay mira láser ni tanque en el HUD hasta tocar el ícono de un arma (que queda equipada con el tanque lleno); el bot sin arma, o con el tanque vacío, va a buscar un ícono cercano que esté sobre la línea segura. El primer robot que se apoya en una plataforma de una etapa nueva (la 1 en adelante) deja la vida en 100 y llena todos sus tanques, una sola vez por etapa y por ronda, y un cartel chico arriba dice "ETAPA n · J1" (o J2) durante 1,5 s. Las alturas de etapa, armas y premio son las del mapa, no las del mundo. En Infinito la vida es la misma de 100 que en el Clásico, pero con la vida en 0 el robot no muere: queda inconsciente 5 s el primer nocaut de la ronda y 3 s más en cada nocaut siguiente, hasta 18 s (sin responder a los controles, aunque los golpes y los fluidos lo siguen empujando; se ve un contador de segundos sobre él) y se levanta con 50 de vida. Solo el agua saca a un robot de la partida. Cada ronda tiene un mapa nuevo; con `?seed=N` en la URL todas las rondas repiten el mismo. Clásico sigue en el menú, con la pileta y la inundación de los 60 s descritas arriba.

| | Mover | Saltar | Bajar | Apuntar | Disparar | Golpe | Gancho | Arma |
|---|---|---|---|---|---|---|---|---|
| Gamepad | stick izq. | A | stick abajo + A | stick der. | RT | B | X | LB (toque corto) anterior, LB mantenido + stick der. rueda de armas (soltar LB equipa; stick al centro cancela), RB siguiente, cruceta directa (arriba 1, derecha 2, abajo 3, izquierda 4) |
| Teclado y mouse (un solo jugador) | A / D | Espacio | S + Espacio | hacia donde camina (S: abajo) o mouse (si se movió después de usar el stick) | clic izquierdo | F (S + F patea) | E o clic derecho | Q anterior (mantenida + mouse: rueda), R siguiente, 1 / 2 / 3 / 4 directa |

Combate cuerpo a cuerpo: en el gamepad, B repetido dentro de la ventana del golpe encadena el combo de tres golpes, LT (mantenido) bloquea los golpes, LT + A rueda y, en el aire, B golpea y stick abajo + B patea. El bloqueo frena solo golpes, no los fluidos.

El juego está pensado para gamepad; el teclado y el mouse son respaldo y valen como un solo dispositivo (el esquema de la tabla): F repetido encadena el combo, Shift bloquea, Shift + Espacio rueda y Escape es Start. Qué dispositivo maneja a cada jugador se elige en la pantalla de asignación de controles (ver abajo); un teclado y un gamepad del mismo jugador se combinan. El salto es variable: un toque de A (o de la tecla de salto) da un salto bajo de unos 1,5 m y mantenerlo da el salto completo; con el stick abajo (o la tecla abajo) la caída es más rápida. Las plataformas se atraviesan desde abajo: saltá y quedás parado arriba. Para bajar de una, apretá **abajo + A** parado sobre ella (en el piso, abajo + A salta); el gancho todavía no tiene efecto. Disparar es **mantener** el botón: sale un chorro continuo hasta soltarlo o vaciar el tanque. En Clásico, cada robot arranca con **agua** (moja al rival y lo deja en cortocircuito, con chispas); el ácido, la lava y la miel se **recogen** tocando sus íconos en el mapa (reaparecen a los 15 s; tocar un arma que ya tenés rellena su tanque, y el agua tiene su propio punto de recarga). Cada arma tiene su tanque, que no se recarga solo; al empezar cada ronda volvés a tener solo el agua llena; la barra del HUD muestra lo que queda ("VACÍO" en rojo si se acaba). Después de reiniciar la ronda o de una revancha hay que soltar el botón antes de volver a disparar. El juego arranca en el menú principal (ver abajo); al elegir Jugar hay 3 s de cuenta regresiva antes de cada ronda. Start (Escape en el teclado) durante la partida abre el menú de pausa (Continuar, Controles y Menú) y la partida queda detenida. Al final de la partida, A (o Espacio) inicia la revancha y Start (Escape en el teclado) vuelve al título.

**Menú de debug.** Un solo botón: F3 en el teclado o L3 + R3 juntos (clic de los dos sticks) en el gamepad lo abre y lo cierra (en el título no). Con el menú abierto la partida queda en pausa y se maneja con arriba/abajo (fila), izquierda/derecha o confirmar (valor) y atrás (B o Escape) o el mismo botón para cerrar. Filas: Estadísticas (FPS, ms por subsistema, partículas, contactos, subpasos del campo, deriva del volumen de agua y estado de los bots; se ven bajo el menú, solo con el menú abierto), Fluidos (metaball, puntos o ambos: los puntos son un círculo por partícula con su radio real) y las capas de vectores Velocidades, Fuerzas, Columnas y Bots, que quedan dibujadas con el menú cerrado.

**Menú principal.** Tiene cuatro filas, todas con íconos y sin texto: Mapa (miniatura del Infinito, el predeterminado, o del Clásico), Bot (la dificultad de los bots: 1, 2 o 3 puntos, o el maniquí), Controles y Jugar. Con el gamepad: stick izquierdo o cruceta arriba/abajo elige la fila, izquierda/derecha cambia el valor, y A sobre Controles o A o Start sobre Jugar abren la pantalla de controles o la de asignación. En la pantalla de controles, LB y RB cambian entre las pestañas de gamepad y de teclado y mouse, y B vuelve. Abajo se ven los glifos del dispositivo que usaste por última vez (gamepad si todavía no tocaste nada). Con el teclado: flechas o WASD, y Enter. El cursor empieza en Jugar y la última elección se recuerda en el navegador. Start (Escape en el teclado) al final de la partida vuelve al menú. Si el navegador no guarda datos, el menú arranca con Normal e Infinito. Los controles se muestran solo en su pantalla y no durante la partida. La interfaz tiene sonidos propios (`audio/sfx/ui_*.ogg`), cuatro de ellos provisorios (`ui_submit3`, `ui_submit4`, `ui_submit6` y `ui_submit7`).

**Asignación de controles.** Al elegir Jugar se abre una pantalla con tres columnas, J1, la bandeja del medio (sin jugar) y J2, y cada dispositivo conectado (teclado y mouse, gamepad 1, gamepad 2) como una ficha en una de ellas; el teclado es solo de J1. Cada dispositivo se mueve con su propio stick o cruceta (el teclado, con A/D o las flechas). Select o A de un gamepad lo suman y lo resaltan; un gamepad que no apretó nada todavía aparece atenuado. Start, Enter o A (en un gamepad ya sumado) empiezan la partida; B o Escape vuelven al menú. Por defecto: sin gamepads, el teclado en J1; con uno, el teclado en J1 y el gamepad en J2; con dos, gamepad 1 en J1, gamepad 2 en J2 y el teclado en J1. Al conectar o desconectar un gamepad la pantalla se actualiza, y la última asignación se recuerda en el navegador. Un jugador sin ningún dispositivo lo maneja el bot con la dificultad del menú; si ninguno tiene dispositivo, juegan dos bots.

El bot juega con un gamepad virtual. Si hay un gamepad real asignado a ese jugador, el bot no escribe. `?bot=2` o `?bot=1,2` en la URL (por ejemplo `http://localhost:8080/?bot=2`) fuerzan los bots y saltan la pantalla de asignación. Los valores del bot (distancias, demora de reacción, error de puntería) están en la tabla `BOT` de `src/ai/bot.js`, y los presets de dificultad en `DIFFICULTY`.

El juego tiene sonido y música (archivos en `audio/`): el navegador no lo deja arrancar hasta que se toca una tecla, se hace clic o se aprieta un botón del gamepad. Los disparos y los fluidos todavía no suenan.

## Correr

Requiere servidor HTTP (módulos ES):

```powershell
npx http-server -c-1 .     # http://localhost:8080
node --test "tests/*.test.js"          # suite rápida (menos de 30 s), para el día a día
node --test "tests/slow/*.test.js"     # solo los tests largos
node --test "tests/**/*.test.js"       # suite completa: antes del PR y en CI (Node 24, sin dependencias)
```

Los tests de costo miden tiempo real y solo exigen su tope en corrida aislada con `PERF=1` (en PowerShell, `$env:PERF="1"; node --test tests/adhesion.test.js`); en la suite lo informan como diagnóstico.

La suite completa incluye los invariantes de fluidos (`tests/slow/invariants.test.js`): miden una ronda completa y suman unos 42 s por corrida. Algunos salen como `todo` esperados: son lo que hoy falla y tiene issue (ver `docs/design/14-agua.md`, §14.16 G); no hacen fallar la suite, y cuando un arreglo los resuelve hay que quitarles el `todo`.

La térmica (`tests/thermal.test.js`) simula la conducción real entre dos partículas de basalto (L2, unas 220 h simuladas con pasos de 5 s, solo la térmica) y suma unos 5 s por corrida. La ebullición (`tests/boil.test.js`) corre en segundos; `tests/slow/boil-invariants.test.js` simula 45 s de ronda y suma unos 15 s.

## Deploy

- Cada push a `main` (merge de PR) corre `.github/workflows/pages.yml`: tests → build → deploy a GitHub Pages (https://lmcasella.github.io/ragdoll-fluidosSPH/). Los PRs a `main` corren solo los tests.
- La versión sale del primer `## [x.y.z]` de `CHANGELOG.md`. Si es nueva, se crea el tag `vX.Y.Z` con su release; si ya existe, se publica igual, sin release nueva.
- `version.json` en el sitio publicado indica versión y commit.

## Grabar un escenario

Para revisar la física sobre secuencias de frames, en un script de Node se carga el juego con `loadGame()` (`tests/helpers/game.js`), se crea `recordGame(game, "nombre")` (`tests/helpers/recorder.js`), se llama a `recorder.capture()` después de cada `game.frame()` y se guarda con `recorder.save("ruta/nombre.json")`. Para verlo, abrir `tests/tools/viewer.html` en el navegador (doble clic o por el servidor de arriba) y elegir el JSON: tiene play/pausa, cuadro a cuadro y velocidad. Cada frame guarda también el perfil `η` del agua (el visor lo dibuja). Ejemplo de uso en `tests/recorder.test.js`. Los escenarios de agua de los videos (`I3`, `I7`) se graban con `node tests/tools/record-water.js <carpeta>`.

## Documentación

- [`DESIGN.md`](DESIGN.md): índice del GDD (`docs/design/`, un archivo por tema).
- [`CLAUDE.md`](CLAUDE.md): guía de trabajo, patrones de arquitectura y convenciones.
- [`CHANGELOG.md`](CHANGELOG.md): cambios por versión.
- Backlog: issues y milestones de GitHub.

## Ragdolls

Los ragdolls se cargan con RagImporter (`lib/`, copiado de [ragassembler2d](https://github.com/Gann4Life/ragassembler2d) commit `d067775`) desde archivos `.rag.json` (formato v4) en `assets/`:

- `assets/robot.rag.json`: los dos jugadores (robot de 13 cuerpos con clips `walk`, `jump`, `dead` y `punch`), manejados por `src/ragdoll/ActiveRagdoll.js`. El mapeo del rig (cuerpo raíz, hombros que apuntan, pies, arma, clips) está en `ROBOT_RIG` de `index.js`. La tabla de armas (caudal, velocidad, tanque) está en `src/combat/weapons.js`.

`vendor/liquidfun.js` (build Emscripten, namespace `Box2D`) y `vendor/pixi.min.js` son los que exige RagImporter. El mundo usa metros con Y hacia arriba y se avanza con `stepWorld`.
