# ragdoll-fluidosSPH

Pelea 1 contra 1 de robots ragdoll que se disparan fluidos SPH, en el navegador. Proyecto de Simulación 1 (UNAHUR): Box2D (LiquidFun), SPH y raycast.

## Cómo jugar

Gana la ronda el último robot en pie; la partida es al mejor de 3. Caer a la pileta del centro destruye al robot. A los 60 s de ronda empieza la inundación: llueve desde el techo y el agua sube desde la pileta. El agua es un volumen continuo (un campo de alturas, no gotas): lo que cae en ella se suma y levanta olas, y la lava que cae se hunde despacio. Por ahora el agua no empuja ni sostiene a los robots (la flotación llega en otra tarea): solo los moja. El robot con alguna parte bajo el agua se moja y pierde 3 de vida por segundo (hasta 3 s después de salir), y se ve con un tinte cian. El reloj de ronda y el aviso "Inundación en N" (desde los 50 s) aparecen en el HUD.

| | Mover | Saltar | Bajar | Apuntar | Disparar | Golpe | Gancho | Arma |
|---|---|---|---|---|---|---|---|---|
| Gamepad | stick izq. | A | stick abajo + A | stick der. | RT | B | X | LB (toque corto) anterior, LB mantenido + stick der. rueda de armas (soltar LB equipa; stick al centro cancela), RB siguiente, cruceta directa (arriba 1, derecha 2, abajo 3, izquierda 4) |
| J1 teclado | A / D | W | S + W | hacia donde camina (S: abajo) o mouse (si se movió después de usar el stick) | Espacio (o clic) | F | E (o botón derecho) | Q anterior (mantenida + mouse: rueda), R siguiente, 1 / 2 / 3 / 4 directa |
| J2 teclado | ← / → | ↑ | ↓ + ↑ | hacia donde camina (↓: abajo) | Enter | Num 5 | Num 0 | Ctrl der. anterior, Num + siguiente, Num 1 / 2 / 3 / 4 directa |

El juego está pensado para gamepad; el teclado es respaldo. Los gamepads se asignan por orden de conexión (1.º → J1, 2.º → J2) y se combinan con el teclado del mismo jugador. Bajar de una plataforma atravesable todavía no hace nada distinto de saltar (no hay plataformas atravesables); el gancho todavía no tiene efecto. Disparar es **mantener** el botón: sale un chorro continuo hasta soltarlo o vaciar el tanque. Cada robot arranca con **agua** (moja al rival y lo deja en cortocircuito, con chispas); el ácido, la lava y la miel se **recogen** tocando sus íconos en el mapa (reaparecen a los 15 s; tocar un arma que ya tenés rellena su tanque, y el agua tiene su propio punto de recarga). Cada arma tiene su tanque, que no se recarga solo; al empezar cada ronda volvés a tener solo el agua llena; la barra del HUD muestra lo que queda ("VACÍO" en rojo si se acaba). Después de reiniciar la ronda o de una revancha hay que soltar el botón antes de volver a disparar. Al final de la partida, disparar inicia la revancha.

El juego tiene sonido y música (archivos en `audio/`): el navegador no lo deja arrancar hasta que se toca una tecla, se hace clic o se aprieta un botón del gamepad. Los disparos y los fluidos todavía no suenan.

## Correr

Requiere servidor HTTP (módulos ES):

```powershell
npx http-server -c-1 .     # http://localhost:8080
node --test tests/          # tests (Node 24, sin dependencias)
```

La suite incluye los invariantes de fluidos (`tests/invariants.test.js`): miden una ronda completa y suman unos 42 s por corrida. Algunos salen como `todo` esperados: son lo que hoy falla y tiene issue (ver `docs/design/14-agua.md`, §14.16 G); no hacen fallar la suite, y cuando un arreglo los resuelve hay que quitarles el `todo`.

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
- `assets/ragdino.rag.json`: el dino, migrado de formato v1 a v4 con `lib/migrate.js` (sin uso por ahora).

`vendor/liquidfun.js` (build Emscripten, namespace `Box2D`) y `vendor/pixi.min.js` son los que exige RagImporter. El mundo usa metros con Y hacia arriba y se avanza con `stepWorld`.
