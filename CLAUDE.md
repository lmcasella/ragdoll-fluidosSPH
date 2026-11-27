# CLAUDE.md

Guía para trabajar en este repositorio. Aplica a personas y agentes por igual.

## Proyecto

Juego web 1v1 de robots ragdoll que pelean con fluidos SPH, para la materia Simulación 1 (UNAHUR). Usa Box2D/LiquidFun, SPH y raycast. Se publica en GitHub Pages.

- **Entrega:** 24/11/2026, con el juego cerrado y funcionando en la URL pública.
- **Presentación:** 1/12/2026.
- **Prioridad:** juego completo antes que detalles.

## Fuentes de verdad

| Archivo | Rol |
|---|---|
| `DESIGN.md` | **Índice del GDD.** El diseño vive en `docs/design/`, un archivo por tema (`DESIGN.md` §N es el archivo listado para N). Leer solo el archivo que hace falta. Los cambios de comportamiento empiezan acá. |
| Issues de GitHub | **Backlog.** Una tarea por issue y un milestone por hito del cronograma (`DESIGN.md` §11). Los decide `planner` con la taxonomía de abajo y los opera `github-clerk`. |
| `CHANGELOG.md` | Cambios visibles para el usuario ([Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)). Define la versión del deploy. **Cada PR suma su entrada; cada release le pone versión.** |
| `README.md` | Cómo correr, probar y jugar. |
| `docs/referencias.md` | Material de estudio: índice en tablas de matemáticos, conceptos, leyes y algoritmos usados o descartados, con dónde se usan y un enlace para leer más. Durante la entrega se pone al día en una sola pasada antes de la presentación. |

### Reparto de la documentación

Cada dato tiene un solo dueño. Los demás lugares lo nombran o lo enlazan, pero no lo copian. El GDD y los docstrings no se contradicen ni se repiten.

| Dónde | Qué explica | Qué no pone |
|---|---|---|
| GDD (`docs/design/`) | Qué hace cada subsistema y por qué, con detalle y en palabras del juego: lo que se ve, las reglas, las decisiones y los criterios medibles. | Nombres de funciones o variables, detalles de implementación ni desarrollos matemáticos. Solo lleva la fórmula que define un criterio. |
| Docstrings | Cómo lo resuelve ese código, de forma breve y concreta: qué recibe y devuelve, unidades, cuándo se llama, por qué está hecho así y qué limitación del motor esquiva. | Reglas del juego ni el porqué del diseño: remiten a la sección del GDD (por ejemplo, "ver `14-agua.md` §14.6"). |
| `docs/referencias.md` | Leyes, algoritmos y autores, con dónde se usan y un enlace para leer más. | Historia ni diseño. |
| Tablas de datos del código | Los valores de balance. | — (el GDD nombra la tabla y repite el número solo si es un criterio). |

`architect` es dueño del GDD, `developer` escribe los docstrings con el código y `doc-writer` controla que no se contradigan.

### Formato de `docs/referencias.md`

Es un índice en tablas, una por sección, que se lee de un vistazo:

| Concepto | Autor | Qué es | Dónde se usa | Para leer |
|---|---|---|---|---|

- **Qué es:** una línea. Lleva fórmula solo si es la idea central.
- **Dónde se usa:** `ruta:línea`; si son varias, separadas por coma.
- **Para leer:** un enlace a una fuente pública (Wikipedia en español si existe, si no en inglés, o el artículo original). Lleva "—" si es un diseño propio.

Lo descartado va en su propia tabla: `| Descartado | Autor | Se optó por | Motivo | Dónde se decidió | Para leer |`.

Los ejemplos de implementación van solo como último recurso, cuando la línea de código no alcanza para entender la entrada. Se ponen al final del archivo, después de un `<hr>`, con el nombre de su fila.

Si el código y `DESIGN.md` no coinciden, se resuelve antes de seguir: o se corrige el código, o `architect` actualiza el GDD.

### Taxonomía del backlog

- **Milestones**, con fecha de vencimiento:

  | Milestone | Vence |
  |---|---|
  | `M2 – Armas y fluidos` | 21/11 |
  | `M3 – Escenario e inundación` | 22/11 |
  | `M4 – Cierre de entrega` | 24/11 |
  | `M5 – Pulido y defensa` | 1/12 |

  M1 (combate) ya está en `main`.
- **Labels** (un tipo, un scope y una prioridad por issue):

  | Grupo | Labels |
  |---|---|
  | Tipo | `type:feature`, `type:bug`, `type:chore`, `type:docs` |
  | Scope | `scope:gameplay`, `scope:fluids`, `scope:physics`, `scope:input`, `scope:level`, `scope:render`, `scope:infra`, `scope:docs` (los mismos de los commits) |
  | Prioridad | `priority:high`, `priority:medium`, `priority:low` |
  | Estado | `status:ready`, `status:blocked` |

## Reglas

1. **Gamepad primero.** Cada mecánica se diseña para stick y botones (Gamepad API, mapeo "standard"). El teclado y el mouse son respaldo, nunca la fuente principal: un input de respaldo no puede pisar al gamepad.
2. **Sin atribución de IA** en commits, PRs, código ni documentos.
3. **Idioma:**
   - **En inglés, sin ñ ni acentos:** los identificadores del código (variables, constantes, funciones, métodos, clases, propiedades, claves de las tablas de datos), los nombres de archivos y carpetas, y los nombres de ramas.
   - **En español:** los docstrings, los documentos (`docs/`, `README.md`, `CHANGELOG.md`), los issues, los mensajes de commit, los PRs y todo lo que el jugador lee en pantalla (menús, HUD, carteles, nombres de armas).
4. **Comentarios:** el código no se comenta. Lo que haga falta explicar (una decisión, una limitación del motor, una unidad) va en docstrings JSDoc válidos (`/** … */`) de funciones, clases, constantes exportadas y tablas de datos, breves y con lo que dice el "Reparto de la documentación". Nada de comentarios de línea (`//`) ni de bloque sueltos, nada de código comentado ni TODOs: el trabajo pendiente va a un issue.
5. **Confidencialidad:** sin credenciales, tokens ni datos privados en el repo.
6. **Assets:** solo propios o con licencia libre. Las referencias de estilo (por ejemplo, Unreal Tournament) se usan como inspiración, nunca copiando archivos.

### Reglas de código

Valen para todo lo nuevo y para todo lo que se toca, aunque el código de alrededor no las cumpla.

- **Código para personas:** se escribe para que lo lea un compañero, no para que sea corto.
- **Sin números mágicos:** un número es mágico si el contexto no dice qué es. Va en una constante con nombre y unidad. Varios números seguidos (por ejemplo, los argumentos de una llamada) pasan a parámetros con nombre.
- **Identificadores claros** (variables, funciones, métodos, clases): sin abreviaciones ni nombres de uno o dos caracteres, salvo índices de bucle cortos y coordenadas (`x`, `y`).
- **KISS, DRY y SOLID:** la solución más simple que funcione, sin lógica duplicada y con una sola responsabilidad por módulo y por función.
- **Composición antes que herencia.**
- **Patrones de diseño con nombre:** si se usa uno, se lo nombra en el docstring y, si es de arquitectura, en la tabla de patrones.
- **Archivos chicos por subsistema:** sin tope fijo de líneas, pero un archivo que hace varias cosas se parte.
- **Cálculos comunes en `src/core/`:** matemática, geometría, numérica, azar, constantes y fórmulas físicas y el adaptador de Box2D viven ahí y no se repiten en cada módulo.
- **Librerías de terceros:** solo si ahorran código contando sus dependencias y están mejor hechas que lo propio. Se marcan como de terceros en el docstring y en `docs/referencias.md`.
- **Docstrings breves:** lo que dice la regla 4 y el "Reparto de la documentación", en pocas líneas.
- **Render solo con PIXI en un solo canvas.** El HUD y los menús quedan en HTML + CSS (`docs/design/18-interfaz.md`).

## Arquitectura y patrones

Antes de implementar una funcionalidad, ubicarla en estos patrones. Si no encaja, consultar a `architect`.

| Patrón | Dónde | Regla |
|---|---|---|
| **Raíz de composición** | `index.js` | Crea el mundo, los sistemas y los jugadores, y los conecta en el loop. Los módulos de `src/` nunca importan desde `index.js` ni dependen de su estado global. |
| **Paso fijo** | loop de `index.js` | La simulación avanza con `stepWorld` de RagImporter (1/60 s en 8 subpasos). El input de movimiento se aplica una vez por paso; disparos, golpes y cambios de arma, una vez por frame. El emisor de disparos recibe el tiempo físico de los pasos del frame anterior, no el `dt` del frame, para no crear partículas encimadas en frames sin paso. Nada de `world.Step` directo. Box2D borra las fuerzas en cada subpaso: lo que actúa durante todo el paso desde fuera de `stepWorld` se aplica como impulso (`F · dt`). El campo de alturas avanza una vez por paso, con sus propios subpasos por CFL. Lo que tiene que correr en cada subpaso (el contorno inelástico de `wallContact`) se registra como pseudo-instancia de `stepWorld`: un objeto con `update(substep)`. |
| **Juntar durante el paso, actuar después** | `src/combat/damage.js` | Los callbacks de Box2D (contactos, partículas) solo encolan eventos. El daño y la destrucción se aplican después de `stepWorld`. Nunca se crea ni se destruye nada dentro de un callback. |
| **Sistemas por módulo** | `src/<subsistema>/*.js` | Cada sistema tiene un solo motivo de cambio: `camera`, `level`, `raycast`, `damage`, `round`, `flood`, `weapons`, `immersion`, `render`, `Input`, `breakable` (plataformas rompibles, `docs/design/05-escenario.md` §5.4), `ActiveRagdoll`, `melee`, `climb` (mapa Infinito, `docs/design/16-ascenso.md`: genera y libera geometría solo desde el loop, después de los pasos) (con #62 se suman `water`, `particleStore`, `buoyancy`, `contacts`, `evaporation`, `grapple`, `thermal`, `viscosity`, `mixing`, `adhesion`, `debug`, `materials`, `bodyShapes`; ver `docs/design/14-agua.md`). Si una funcionalidad no entra en ninguno, se crea un módulo nuevo. |
| **Identidad estable de partículas** | `src/fluids/particleStore.js` (#62) | `userData` guarda solo un slot estable (`slot + 1`), y el estado por partícula (material, disparo, entalpía, concentración) vive en arreglos por slot. Solo `ParticleStore` llama a `CreateParticle` y `DestroyParticle`. El slot de una partícula destruida se libera después del siguiente `stepWorld`, y los recorridos saltan los slots no vivos. Nunca se identifica un fluido por color. Toda destrucción declara su causa (`SINK`) y `ParticleStore` lleva el libro de creadas y destruidas por material y causa (invariantes de masa, `docs/design/14-agua.md` §14.16 G). El material (`kind`) no cambia después de `create` salvo por una fila de `REACTIONS`. |
| **Campo + partículas** | `src/water/water.js`, `src/water/immersion.js` (#62) | El agua masiva del nivel es un campo de alturas (Saint-Venant 1D, JS puro); las partículas son solo lo que vuela o lo que no se mezcla. Toda partícula miscible que toca el campo se absorbe y le suma su volumen, cantidad de movimiento, energía y soluto. Las inmiscibles reciben empuje y arrastre del campo, con reacción sobre la columna. |
| **Intención, no dispositivo** | `src/input/Input.js` | `Input` traduce gamepad y teclado a un estado por jugador (`left`, `right`, `up`, `aim`, `action`…). El juego consume ese estado y nunca lee dispositivos directamente. |
| **Máquinas de estado** | `ActiveRagdoll` (clips), `Match` (rondas) | Los estados son explícitos y las transiciones están en un solo lugar. Para un estado nuevo, se agrega a esa máquina. |
| **Datos en tablas** | `LEVEL`, `CLIMB`, `ROBOT_RIG`, tabla de armas, `MELEE`, `MATERIALS` y `REACTIONS` | El contenido (niveles, rigs, armas, materiales con su composición en especies, reacciones, valores de balance) se define como datos y el código lo interpreta. Agregar un arma o una plataforma no debería requerir lógica nueva. Un material solo pasa a otro por una fila de `REACTIONS` (`src/fluids/materials.js`). |
| **Vistas de PIXI (modo retenido)** | `src/render/*View.js`, `src/render/fluidLayers.js`, `src/ragdoll/Ragdoll*.js` | Cada vista recibe su contenedor padre y los px por metro al construirse, y crea una sola vez sus `Graphics`, `Text` o partículas (Object Pool). En cada frame recibe datos planos en metros y solo actualiza posición, escala, giro y color. No importa sistemas del juego, no lee Box2D salvo los buffers del heap y no modifica lo que recibe. Lo que sigue a la cámara cuelga de `world`. Un filtro sobre un `ParticleContainer` necesita `boundsArea`, porque PIXI v8 lo saltea si no tiene área (`docs/design/07-sph.md` §7.4). |
| **Servicio compartido por mundo** | `getRaycaster(world)` | Un solo objeto por mundo, con buffers reutilizados. |
| **Memoria nativa** | todo lo que use `Box2D.*` | El heap es fijo de 16 MiB. Cada `new Box2D.*` temporal se libera con `Box2D.destroy`. En código que corre cada frame se reutilizan vectores de trabajo y no se crea nada nativo. Lo que es del mundo (cuerpos, fixtures, joints) nunca se destruye con `Box2D.destroy`. Las estructuras nativas sin binding (el buffer de contactos partícula↔partícula) se leen solo en `src/fluids/contacts.js`, en solo lectura, con el offset buscado y validado al arrancar, nunca fijo. |
| **Contrato de RagImporter** | `lib/` | `lib/` es una copia de ragassembler2d y no se edita acá. El juego no destruye joints ni fixtures de una instancia, ni escribe motores. Los joints que crea el juego sobre cuerpos de una instancia (el gancho) son del juego: se destruyen con `world.DestroyJoint` antes de destruir la instancia (giro, ronda nueva), porque Box2D los borra con el cuerpo y dejaría el handle colgado. Se permite `Fixture.Refilter()` sobre fixtures de una instancia (plataformas atravesables): no cambia sus datos, solo recalcula contactos. Lo que le falte a la librería se registra como issue del juego y se propone al usuario antes de tocar ragassembler2d. |

**Unidades:** metros, radianes y Y hacia arriba en datos y física. Píxeles solo al dibujar (`src/render/` con la cámara) y en el HUD.

## Convenciones de Git

### Ramas: [Conventional Branch](https://conventional-branch.github.io/)

- **Flujo `main ← dev ← rama de trabajo`:**
  - `main` es la **rama de producción**: lo que está publicado. Solo recibe merges de `dev` (o un `hotfix/`).
  - `dev` es la **rama de integración**: todas las ramas de trabajo salen de `dev` actualizado y sus PRs van a `dev` (`gh pr create --base dev`).
  - Nunca se commitea directo en `main` ni en `dev`.
- **Un issue, una rama** de trabajo.
- **Cerrar issues a mano:** GitHub solo cierra con `Closes #<n>` al mergear en la rama por defecto (`main`). Al mergear en `dev`, el issue se cierra con `gh issue close <n> --comment "Mergeado en dev (#<pr>)"`.
- **Release:** cada merge de `dev` a `main` es un deploy y cada deploy es un release con su tag. Se hace con un PR `dev → main` titulado `chore(infra): release vX.Y.Z`, que en `dev` pasa el `## [Unreleased]` del changelog a `## [X.Y.Z] - AAAA-MM-DD`. Al mergearlo, el CI crea el tag `vX.Y.Z`, el release de GitHub y el deploy. Si el tag ya existe, el CI falla y no publica.
- **Hotfix:** sale de `main`, va a `main` con su versión de parche y después se mergea `main` en `dev`.
- Formato: `<tipo>/issue-<número>-<descripcion-corta>`, en inglés, minúsculas y guiones.

| Tipo | Uso |
|---|---|
| `feature/` | Funcionalidad nueva, por ejemplo `feature/issue-14-hold-to-fire-stream` |
| `bugfix/` | Corrección, por ejemplo `bugfix/issue-12-mouse-overrides-gamepad-aim` |
| `hotfix/` | Corrección urgente sobre lo publicado |
| `chore/` | Documentación, herramientas, refactors sin cambio de comportamiento |

### Commits: [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/)

- Formato `<tipo>(<scope>): <descripción>`, en imperativo, minúscula y sin punto final. Ejemplo: `feat(fluids): disparo continuo con tanque`.
- **Tipos:** `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `ci`, `chore`.
- **Scopes:**

  | Scope | Qué cubre |
  |---|---|
  | `gameplay` | Rondas, reglas, daño, golpe |
  | `fluids` | Partículas, armas, reacciones |
  | `physics` | Robots, ragdoll, contactos, raycast |
  | `input` | Gamepad y teclado |
  | `level` | Mapa y peligros |
  | `render` | Dibujo, cámara, HUD |
  | `infra` | CI, deploy, herramientas |
  | `docs` | Documentación |

- Mensajes cortos: qué cambió y por qué.

### Changelog y versión

Cada PR a `dev` agrega su entrada en `CHANGELOG.md` bajo `## [Unreleased]`, sin versión. El PR de release (`dev → main`) convierte ese bloque en `## [x.y.z] - AAAA-MM-DD`, que define el tag del deploy. La versión sale de lo que junta el release:

| El release incluye | Sube |
|---|---|
| Al menos un `feat` | La versión menor |
| Solo otros tipos | El parche |

## Flujo de trabajo

Una tarea es un issue. Se **cierra cuando su PR se mergea en `dev`**, a mano (ver "Convenciones de Git").

**Etapa actual: prototipado y entrega (hasta el 24/11).** El objetivo es un juego completo y jugable, no un producto pulido. Cada tarea gasta lo mínimo: **un solo agente (`developer`) por tarea**; todo lo demás lo hace la sesión principal directamente.

1. **Elegir:** `/next` recomienda un issue y crea su rama al confirmar.
2. **Diseño corto:** la sesión principal (game designer, en Opus) decide y escribe el diseño en el brief de `developer`: qué hace, controles, valores y criterios medibles. Si cambia el GDD, lo edita ella misma con un cambio mínimo en `docs/design/`. No se lanzan `architect`, `chemist` ni `physics-analyst`, salvo que la tarea cree un módulo nuevo o rompa un patrón, y en ese caso una sola pasada acotada.
3. **Implementar** con `developer`, un agente nuevo con brief corto. Cada punto de control es un commit convencional. Escribe también la entrada de `CHANGELOG.md` bajo `## [Unreleased]` y lo mínimo de `README.md`.
4. **Verificar:** la suite rápida mientras se trabaja y la completa (`node --test "tests/**/*.test.js"`) en verde antes del PR, sin regresiones de lo que funcionaba en `dev`. Para gameplay, una prueba en Node con LiquidFun real y gamepad simulado. Las fallas que reporta el usuario se reproducen primero en un test.
5. **Revisión de reglas:** antes de cada PR, la sesión principal revisa el diff contra las "Reglas de código" y lo devuelve a `developer` si no cumple.
6. **PR y merge:** push y PR a `dev` con título igual al commit convencional, `Closes #<n>`, merge commit y se borra la rama. Después del merge se cierra el issue a mano y se comprueba con `gh issue view <n>` que quedó cerrado. `Refs #<n>` solo para issues paraguas; si un issue queda abierto a propósito (arreglo parcial, falta la prueba del usuario), se avisa al usuario en ese momento y se anota en el issue.
7. **Avisar al usuario cuando hay algo para probar.** Prueba todo junto en `dev` (local); lo publicado en `main` se toca solo con un release.

**Trabajo nuevo** que aparece durante una tarea no se hace en la rama actual: la sesión principal crea el issue con `gh`.

**Queda para después de la entrega (pulido, M5):** `/code-review`, validación de `physics-analyst` sobre secuencias de frames, `chemist`, `doc-writer`, la actualización de `docs/referencias.md` en cada merge y la sincronización completa del GDD. `docs/referencias.md` y el estado del GDD se ponen al día en una sola pasada antes de la presentación.

### Definición de terminado

- El juego hace lo que pide el issue y lo que decidió el game designer.
- Los tests pasan, sin regresiones, y la funcionalidad se ejercitó en Node con gamepad simulado.
- Respeta los patrones de arquitectura y las reglas de memoria nativa.
- `CHANGELOG.md` tiene la entrada bajo `## [Unreleased]`.
- La rama, los commits y el título del PR siguen las convenciones, el PR va a `dev` y el issue quedó cerrado.

## Agentes y skills

| Nombre | Tipo | Uso |
|---|---|---|
| `planner` | agente | Decide el backlog: división en issues, labels, milestones, prioridades y dependencias. Entrega la especificación; no opera GitHub. |
| `github-clerk` | agente | Ejecuta en GitHub lo que decidió `planner` o el usuario (issues, labels, milestones, asignaciones). No decide. |
| `scout` | agente | Lectura rápida de código, GDD y GitHub; devuelve un resumen con rutas y líneas. Solo lectura. |
| `architect` | agente | Dueño del GDD (`DESIGN.md` y `docs/design/`) y de los patrones; revisa funcionalidades y módulos nuevos antes de implementar. |
| `developer` | agente | Implementa un issue con sus tests y verificación. |
| `doc-writer` | agente | Mantiene `CHANGELOG.md`, `README.md` y el estado del GDD. |
| `chemist` | agente | Informa cómo interactúan de verdad las sustancias (reacciones, mezcla, cambios de fase, calor, productos, color), con referencias. No decide jugabilidad. |
| `ui-ux-designer` | agente | Revisa y diseña la interfaz (menús, HUD, carteles, selector de controles) con criterios de videojuegos y entrega una maqueta HTML + CSS con su especificación. Toda interfaz nueva o rehecha pasa por él antes de implementarse. |
| `physics-analyst` | agente | Modela los fenómenos que decide el game designer y valida el resultado contra la física, los invariantes globales y los escenarios del usuario; su aprobación es obligatoria para mergear cambios de simulación. |
| `/next` | skill | Elige el próximo issue y crea su rama. |
| `/code-review`, `/simplify` | skills incluidos | Revisar un diff; limpiar después de una funcionalidad. |

**Modelos:** `opus` para los agentes que planifican, deciden y validan (`planner`, `architect`, `chemist`, `physics-analyst`, `ui-ux-designer`); `sonnet` para los que ejecutan lo ya decidido (`developer`, `doc-writer`, `github-clerk`); `haiku` para la lectura (`scout`).

**Solo Opus decide.** Los agentes en `sonnet` y `haiku` no eligen entre alternativas ni completan lo que falta: si algo no está especificado, se detienen e informan la pregunta. Para no leer archivos enteros ni listados largos en Opus, la búsqueda se delega a `scout`.

**Un agente que entregó su informe pero sigue con trabajo en segundo plano no terminó:** se lo frena antes de lanzar el siguiente. Los agentes no dejan procesos corriendo al responder.

Los agentes y skills son genéricos: no repiten reglas ni datos del proyecto. Todo lo específico vive en este archivo.

## Comandos

```powershell
npx http-server -c-1 .     # juego en http://localhost:8080
node --test "tests/*.test.js"        # suite rápida (< 30 s), día a día
node --test "tests/slow/*.test.js"   # solo los tests largos
node --test "tests/**/*.test.js"     # suite completa (antes del PR y en CI)
```

Un test que tarda 10 s o más va en `tests/slow/`.
