# Waterbots

**Waterbots**: pelea 1 contra 1 de robots ragdoll que se disparan fluidos SPH, en el navegador. Proyecto de Simulación 1 (UNAHUR): Box2D (LiquidFun), SPH y raycast.

## Cómo jugar

Gana la ronda el último robot en pie; la partida es al mejor de 3. Caer a la pileta del centro destruye al robot. A los 60 s de ronda empieza la inundación: llueve desde el techo y el agua sube desde la pileta. El agua es un volumen continuo (un campo de alturas, no gotas): lo que cae en ella se suma y levanta olas, y la lava que cae se hunde despacio. El agua empuja a cada pieza de los robots (empuje de Arquímedes y arrastre): los robots tienen flotación neutra, así que ni se hunden ni suben solos, y además el agua los moja. El robot con alguna parte bajo el agua se moja y pierde 3 de vida por segundo (hasta 3 s después de salir), y se ve con un tinte cian. El reloj de ronda y el aviso "Inundación en N" (desde los 50 s) aparecen en el HUD.

**Modo Infinito.** Es el mapa predeterminado. No hay piso, islas ni pileta: solo paredes a los costados y plataformas atravesables en el medio, con altura, ancho e irregularidad variables y sin lados "justos" (los dos robots se mueven por todo el mapa). Cada robot arranca en una plataforma al azar de la primera etapa, a entre 4 y 10 m del otro. Las plataformas arrancan anchas (5 a 9 m) y se acortan etapa a etapa hasta 2 a 4 m desde la 5; hay de 3 a 7 por cada 10 m de altura y cada una se alcanza saltando en vertical a través de otra de apoyo. Etapas de 15 m con paredes de 36 m de ancho que se angostan 4 m por etapa (mínimo 24 m). Todo el mapa baja despacio (0,15 m/s, 0,02 m/s más por etapa alcanzada) mientras el agua, que arranca a 2 m, empieza a subir a los 5 s (0,25 m/s, 0,04 m/s más en cada etapa): hay que trepar para no ahogarse, y el robot se ahoga cuando el agua le cubre el torso. Lo que queda hundido desaparece y arriba se genera más mapa; una de cada pocas plataformas de las etapas 1 en adelante trae un arma y cada etapa trae una tuerca de reparación (+35 de salud; con la salud llena no se recoge). En Infinito los robots **arrancan sin armas, solo con golpes**: el gatillo no hace nada, no hay mira láser ni tanque en el HUD hasta tocar el ícono de un arma (que queda equipada con el tanque lleno); el bot sin arma, o con el tanque vacío, va a buscar un ícono cercano que esté sobre la línea segura. El primer robot que se apoya en una plataforma de una etapa nueva (la 1 en adelante) recupera toda la vida y llena todos sus tanques, una sola vez por etapa y por ronda, y un cartel chico arriba dice "ETAPA n · J1" (o J2) durante 1,5 s. Las alturas de etapa, armas y premio son las del mapa, no las del mundo. Cada ronda tiene un mapa nuevo; con `?seed=N` en la URL todas las rondas repiten el mismo. Clásico sigue en el menú, con la pileta y la inundación de los 60 s descritas arriba.

| | Mover | Saltar | Bajar | Apuntar | Disparar | Golpe | Gancho | Arma |
|---|---|---|---|---|---|---|---|---|
| Gamepad | stick izq. | A | stick abajo + A | stick der. | RT | B | X | LB (toque corto) anterior, LB mantenido + stick der. rueda de armas (soltar LB equipa; stick al centro cancela), RB siguiente, cruceta directa (arriba 1, derecha 2, abajo 3, izquierda 4) |
| J1 teclado | A / D | W | S + W | hacia donde camina (S: abajo) o mouse (si se movió después de usar el stick) | Espacio (o clic) | F | E (o botón derecho) | Q anterior (mantenida + mouse: rueda), R siguiente, 1 / 2 / 3 / 4 directa |
| J2 teclado | ← / → | ↑ | ↓ + ↑ | hacia donde camina (↓: abajo) | Enter | Num 5 | Num 0 | Ctrl der. anterior, Num + siguiente, Num 1 / 2 / 3 / 4 directa |

El juego está pensado para gamepad; el teclado es respaldo. Los gamepads se asignan por orden de conexión (1.º → J1, 2.º → J2) y se combinan con el teclado del mismo jugador. El salto es variable: un toque de A (o de la tecla de salto) da un salto bajo de unos 1,5 m y mantenerlo da el salto completo; con el stick abajo (o la tecla abajo) la caída es más rápida. Las plataformas se atraviesan desde abajo: saltá y quedás parado arriba. Para bajar de una, apretá **abajo + A** parado sobre ella (en el piso, abajo + A salta); el gancho todavía no tiene efecto. Disparar es **mantener** el botón: sale un chorro continuo hasta soltarlo o vaciar el tanque. En Clásico, cada robot arranca con **agua** (moja al rival y lo deja en cortocircuito, con chispas); el ácido, la lava y la miel se **recogen** tocando sus íconos en el mapa (reaparecen a los 15 s; tocar un arma que ya tenés rellena su tanque, y el agua tiene su propio punto de recarga). Cada arma tiene su tanque, que no se recarga solo; al empezar cada ronda volvés a tener solo el agua llena; la barra del HUD muestra lo que queda ("VACÍO" en rojo si se acaba). Después de reiniciar la ronda o de una revancha hay que soltar el botón antes de volver a disparar. El juego arranca en el menú principal (ver abajo); al elegir Jugar hay 3 s de cuenta regresiva antes de cada ronda. Al final de la partida, A o disparar inicia la revancha y Start (Escape en el teclado) vuelve al título.

**Menú principal.** Tiene cuatro filas: Modo (1v1, Contra el bot, Bot contra bot), Dificultad (Fácil, Normal, Difícil; solo con bot), Mapa (Infinito, el predeterminado, o Clásico) y Jugar. Con el gamepad: stick izquierdo o cruceta arriba/abajo elige la fila, izquierda/derecha cambia el valor, y A o Start sobre Jugar arranca. Con el teclado: flechas o WASD, y Enter para arrancar. El cursor empieza en Jugar, así que A o Enter arrancan con la última elección, que se recuerda en el navegador. Start (Escape en el teclado) al final de la partida vuelve al menú. Si el navegador no guarda datos, el menú arranca con 1v1, Normal e Infinito. Los controles se muestran solo acá, debajo de las opciones, y no durante la partida.

El bot juega con un gamepad virtual: en Contra el bot maneja a J2 y en Bot contra bot a los dos. Si hay un gamepad real conectado para ese jugador, el bot no escribe. `?bot=2` o `?bot=1,2` en la URL (por ejemplo `http://localhost:8080/?bot=2`) preseleccionan el modo. Los valores del bot (distancias, demora de reacción, error de puntería) están en la tabla `BOT` de `js/bot.js`, y los presets de dificultad en `DIFFICULTY`.

El juego tiene sonido y música (archivos en `audio/`): el navegador no lo deja arrancar hasta que se toca una tecla, se hace clic o se aprieta un botón del gamepad. Los disparos y los fluidos todavía no suenan.

## Correr

Requiere servidor HTTP (módulos ES):

```powershell
npx http-server -c-1 .     # http://localhost:8080
node --test tests/          # tests (Node 24, sin dependencias)
```

La suite incluye los invariantes de fluidos (`tests/invariants.test.js`): miden una ronda completa y suman unos 42 s por corrida. Algunos salen como `todo` esperados: son lo que hoy falla y tiene issue (ver `docs/design/14-agua.md`, §14.16 G); no hacen fallar la suite, y cuando un arreglo los resuelve hay que quitarles el `todo`.

La térmica (`tests/thermal.test.js`) simula la conducción real entre dos partículas de basalto (L2, unas 220 h simuladas con pasos de 5 s, solo la térmica) y suma unos 5 s por corrida. La ebullición (`tests/boil.test.js`) corre en segundos; `tests/boil-invariants.test.js` simula 45 s de ronda y suma unos 15 s.

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

- `assets/robot.rag.json`: los dos jugadores (robot de 13 cuerpos con clips `walk`, `jump`, `dead` y `punch`), manejados por `js/ActiveRagdoll.js`. El mapeo del rig (cuerpo raíz, hombros que apuntan, pies, arma, clips) está en `ROBOT_RIG` de `index.html`. La tabla de armas (caudal, velocidad, tanque) está en `js/weapons.js`.

`vendor/liquidfun.js` (build Emscripten, namespace `Box2D`) y `vendor/pixi.min.js` son los que exige RagImporter. El mundo usa metros con Y hacia arriba y se avanza con `stepWorld`.
