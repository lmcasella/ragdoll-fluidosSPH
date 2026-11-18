# ragdoll-fluidosSPH

Pelea 1 contra 1 de robots ragdoll que se disparan fluidos SPH, en el navegador. Proyecto de Simulación 1 (UNAHUR): Box2D (LiquidFun), SPH y raycast.

## Cómo jugar

Gana la ronda el último robot en pie; la partida es al mejor de 3. Caer a la pileta del centro destruye al robot.

| | Mover | Saltar | Apuntar | Disparar | Golpe | Arma |
|---|---|---|---|---|---|---|
| Gamepad | stick izq. / cruceta | arriba | stick der. | A / RT | X | LB / RB |
| J1 teclado | A / D | W | hacia donde camina (S: abajo) o mouse (si se movió después de usar el stick) | Espacio (o clic) | F | 1 / 2 / 3 |
| J2 teclado | ← / → | ↑ | hacia donde camina (↓: abajo) | Enter | Shift der. | Num 1 / 2 / 3 |

El juego está pensado para gamepad; el teclado es respaldo. Los gamepads se asignan por orden de conexión (1.º → J1, 2.º → J2) y se combinan con el teclado del mismo jugador. Al final de la partida, disparar inicia la revancha.

## Correr

Requiere servidor HTTP (módulos ES):

```powershell
npx http-server -c-1 .     # http://localhost:8080
node --test tests/          # tests (Node 24, sin dependencias)
```

## Documentación

- [`DESIGN.md`](DESIGN.md): índice del GDD (`docs/design/`, un archivo por tema).
- [`CLAUDE.md`](CLAUDE.md): guía de trabajo, patrones de arquitectura y convenciones.
- [`CHANGELOG.md`](CHANGELOG.md): cambios por versión.
- Backlog: issues y milestones de GitHub.

## Ragdolls

Los ragdolls se cargan con RagImporter (`lib/`, copiado de [ragassembler2d](https://github.com/Gann4Life/ragassembler2d) commit `d067775`) desde archivos `.rag.json` (formato v4) en `assets/`:

- `assets/robot.rag.json`: los dos jugadores (robot de 13 cuerpos con clips `walk`, `jump`, `dead` y `punch`), manejados por `js/ActiveRagdoll.js`. El mapeo del rig (cuerpo raíz, hombros que apuntan, pies, arma, clips) está en `ROBOT_RIG` de `index.html`.
- `assets/ragdino.rag.json`: el dino, migrado de formato v1 a v4 con `lib/migrate.js` (sin uso por ahora).

`vendor/liquidfun.js` (build Emscripten, namespace `Box2D`) y `vendor/pixi.min.js` son los que exige RagImporter. El mundo usa metros con Y hacia arriba y se avanza con `stepWorld`.
