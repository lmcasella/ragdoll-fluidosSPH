# ragdoll-fluidosSPH

<!-- Prueba -->

## Ragdolls

Los ragdolls se cargan con RagImporter (`lib/`, copiado de [ragassembler2d](https://github.com/Gann4Life/ragassembler2d) commit `d067775`) desde archivos `.rag.json` (formato v4) en `assets/`:

- `assets/robot.rag.json`: los dos jugadores (robot de 13 cuerpos con clips `walk`, `jump` y `dead`), manejados por `js/ActiveRagdoll.js`. El mapeo del rig (cuerpo raíz, hombros que apuntan, clips) está en `ROBOT_RIG` de `index.html`.
- `assets/ragdino.rag.json`: el dino, migrado de formato v1 a v4 con `lib/migrate.js` (sin uso por ahora).

`vendor/liquidfun.js` (build Emscripten, namespace `Box2D`) y `vendor/pixi.min.js` son los que exige RagImporter. El mundo usa Y hacia arriba y se avanza con `stepWorld`.

Requiere servidor HTTP (módulos ES): `npx http-server -c-1 .`

## Tests y deploy

- Tests: `node --test tests/` (Node 24, sin dependencias).
- Cada push a `main` (merge de PR) corre `.github/workflows/pages.yml`: tests → build → deploy a GitHub Pages (https://lmcasella.github.io/ragdoll-fluidosSPH/). Los PRs a `main` corren solo los tests.
- La versión sale del primer `## [x.y.z]` de `CHANGELOG.md`. Si es nueva, se crea el tag `vX.Y.Z` con su release; si ya existe, se publica igual, sin release nueva.
- `version.json` en el sitio publicado indica versión y commit.

## Controles

| | Mover | Saltar | Apuntar | Disparar | Arma |
|---|---|---|---|---|---|
| J1 teclado | A / D | W | hacia donde mira (S: abajo) o mouse | Espacio (o clic) | 1 / 2 / 3 |
| J2 teclado | ← / → | ↑ | hacia donde mira (↓: abajo) | Enter | Num 1 / 2 / 3 |
| Gamepad | stick izq. / cruceta | arriba | stick der. | A / RT | LB / RB |

Los gamepads se asignan por orden de conexión (1.º → J1, 2.º → J2) y se combinan con el teclado del mismo jugador.
