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
| `CHANGELOG.md` | Cambios visibles para el usuario ([Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)). Define la versión del deploy. **Se actualiza en cada merge.** |
| `README.md` | Cómo correr, probar y jugar. |
| `docs/referencias.md` | Material de estudio: matemáticos, conceptos, leyes y algoritmos usados o descartados, con dónde se usan. **Se actualiza en cada merge.** |

### Formato de `docs/referencias.md`

Cada entrada tiene solo esto, sin fechas, historia ni detalles:

- **Nombre** — quién lo inventó o formuló.
- Una línea de descripción.
- Dónde se usa: `ruta:línea` (una o varias).
- Opcional: un ejemplo de implementación corto.

Lo descartado va en su propia sección, con la misma entrada más una línea: "se optó por <otra solución> porque no funcionó (<motivo breve>)".

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
3. **Idioma:** documentos, issues, commits y PRs en español. **Nombres de rama en inglés** y sin caracteres especiales (ni ñ ni acentos). En el código, seguir el idioma y estilo del archivo que se toca.
4. **Comentarios:** el código no se comenta. Lo que haga falta explicar (una decisión, una limitación del motor, una unidad) va en docstrings JSDoc válidos (`/** … */`) de funciones, clases, constantes exportadas y tablas de datos, breves. Nada de comentarios de línea (`//`) ni de bloque sueltos, nada de código comentado ni TODOs: el trabajo pendiente va a un issue.
5. **Confidencialidad:** sin credenciales, tokens ni datos privados en el repo.
6. **Assets:** solo propios o con licencia libre. Las referencias de estilo (por ejemplo, Unreal Tournament) se usan como inspiración, nunca copiando archivos.

## Arquitectura y patrones

Antes de implementar una funcionalidad, ubicarla en estos patrones. Si no encaja, consultar a `architect`.

| Patrón | Dónde | Regla |
|---|---|---|
| **Raíz de composición** | `index.html` | Crea el mundo, los sistemas y los jugadores, y los conecta en el loop. Los módulos de `js/` nunca importan desde `index.html` ni dependen de su estado global. |
| **Paso fijo** | loop de `index.html` | La simulación avanza con `stepWorld` de RagImporter (1/60 s en 8 subpasos). El input de movimiento se aplica una vez por paso; disparos, golpes y cambios de arma, una vez por frame. El emisor de disparos recibe el tiempo físico de los pasos del frame anterior, no el `dt` del frame, para no crear partículas encimadas en frames sin paso. Nada de `world.Step` directo. Box2D borra las fuerzas en cada subpaso: lo que actúa durante todo el paso desde fuera de `stepWorld` se aplica como impulso (`F · dt`). El campo de alturas avanza una vez por paso, con sus propios subpasos por CFL. Lo que tiene que correr en cada subpaso (el contorno inelástico de `wallContact`) se registra como pseudo-instancia de `stepWorld`: un objeto con `update(substep)`. |
| **Juntar durante el paso, actuar después** | `js/damage.js` | Los callbacks de Box2D (contactos, partículas) solo encolan eventos. El daño y la destrucción se aplican después de `stepWorld`. Nunca se crea ni se destruye nada dentro de un callback. |
| **Sistemas por módulo** | `js/*.js` | Cada sistema tiene un solo motivo de cambio: `camera`, `level`, `raycast`, `damage`, `round`, `flood`, `weapons`, `immersion`, `render`, `Input`, `ActiveRagdoll` (con #62 se suman `water`, `particleStore`, `buoyancy`, `contacts`, `evaporation`, `grapple`, `thermal`, `mixing`, `adhesion`, `debug`, `materials`, `bodyShapes`; ver `docs/design/14-agua.md`). Si una funcionalidad no entra en ninguno, se crea un módulo nuevo. |
| **Identidad estable de partículas** | `js/particleStore.js` (#62) | `userData` guarda solo un slot estable (`slot + 1`), y el estado por partícula (material, disparo, entalpía, concentración) vive en arreglos por slot. Solo `ParticleStore` llama a `CreateParticle` y `DestroyParticle`. El slot de una partícula destruida se libera después del siguiente `stepWorld`, y los recorridos saltan los slots no vivos. Nunca se identifica un fluido por color. Toda destrucción declara su causa (`SINK`) y `ParticleStore` lleva el libro de creadas y destruidas por material y causa (invariantes de masa, `docs/design/14-agua.md` §14.16 G). El material (`kind`) no cambia después de `create` salvo por una fila de `REACTIONS`. |
| **Campo + partículas** | `js/water.js`, `js/immersion.js` (#62) | El agua masiva del nivel es un campo de alturas (Saint-Venant 1D, JS puro); las partículas son solo lo que vuela o lo que no se mezcla. Toda partícula miscible que toca el campo se absorbe y le suma su volumen, cantidad de movimiento, energía y soluto. Las inmiscibles reciben empuje y arrastre del campo, con reacción sobre la columna. |
| **Intención, no dispositivo** | `js/Input.js` | `Input` traduce gamepad y teclado a un estado por jugador (`left`, `right`, `up`, `aim`, `action`…). El juego consume ese estado y nunca lee dispositivos directamente. |
| **Máquinas de estado** | `ActiveRagdoll` (clips), `Match` (rondas) | Los estados son explícitos y las transiciones están en un solo lugar. Para un estado nuevo, se agrega a esa máquina. |
| **Datos en tablas** | `LEVEL`, `ROBOT_RIG`, tabla de armas, `MATERIALS` y `REACTIONS` | El contenido (niveles, rigs, armas, materiales con su composición en especies, reacciones, valores de balance) se define como datos y el código lo interpreta. Agregar un arma o una plataforma no debería requerir lógica nueva. Un material solo pasa a otro por una fila de `REACTIONS` (`js/materials.js`). |
| **Servicio compartido por mundo** | `getRaycaster(world)` | Un solo objeto por mundo, con buffers reutilizados. |
| **Memoria nativa** | todo lo que use `Box2D.*` | El heap es fijo de 16 MiB. Cada `new Box2D.*` temporal se libera con `Box2D.destroy`. En código que corre cada frame se reutilizan vectores de trabajo y no se crea nada nativo. Lo que es del mundo (cuerpos, fixtures, joints) nunca se destruye con `Box2D.destroy`. Las estructuras nativas sin binding (el buffer de contactos partícula↔partícula) se leen solo en `js/contacts.js`, en solo lectura, con el offset buscado y validado al arrancar, nunca fijo. |
| **Contrato de RagImporter** | `lib/` | `lib/` es una copia de ragassembler2d y no se edita acá. El juego no destruye joints ni fixtures de una instancia, ni escribe motores. Los joints que crea el juego sobre cuerpos de una instancia (el gancho) son del juego: se destruyen con `world.DestroyJoint` antes de destruir la instancia (giro, ronda nueva), porque Box2D los borra con el cuerpo y dejaría el handle colgado. Se permite `Fixture.Refilter()` sobre fixtures de una instancia (plataformas atravesables): no cambia sus datos, solo recalcula contactos. Lo que le falte a la librería se registra como issue del juego y se propone al usuario antes de tocar ragassembler2d. |

**Unidades:** metros, radianes y Y hacia arriba en datos y física. Píxeles solo al dibujar (`js/render.js` con la cámara) y en el HUD.

## Convenciones de Git

### Ramas: [Conventional Branch](https://conventional-branch.github.io/)

- **Un issue, una rama**, siempre desde `main` actualizado. Nunca commitear directo en `main`.
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

Cada PR agrega su entrada en `CHANGELOG.md` bajo un encabezado `## [x.y.z] - AAAA-MM-DD` nuevo, que define el tag del deploy. La versión sale del tipo del PR:

| Tipo de PR | Sube |
|---|---|
| `feat` | La versión menor |
| Cualquier otro tipo | El parche |

## Flujo de trabajo

Una tarea es un issue. Se **cierra cuando su PR se mergea en `main`**, porque el cuerpo del PR dice `Closes #<n>`.

1. **Elegir:** `/next`. Ordena los issues abiertos (bugs, milestone más cercano, lo que desbloquea, prioridad), recomienda uno y crea su rama al confirmar.
2. **Revisar el diseño:** si la tarea cambia comportamiento o agrega o cambia un módulo, primero pasa por `architect`, que actualiza el archivo de `docs/design/` que corresponda y ubica la funcionalidad en los patrones de arriba. Si toca la simulación (fluidos, interacciones, cambios de fase, contacto con cuerpos), el orden es: `chemist` informa qué pasa en la realidad entre las sustancias involucradas; el game designer (la sesión principal, en Opus) decide cómo entra al juego; `physics-analyst` lo modela y aprueba el diseño antes de implementar. Cada fenómeno se modela con su física, no se imita con reglas de juego, y sus criterios de aceptación son físicos, con referencia y tolerancia.
3. **Implementar** con `developer`. Cada punto de control es un commit convencional en la rama.
4. **Verificar:**
   - correr `node --test tests/`;
   - agregar un test si la lógica se puede probar sin navegador;
   - para gameplay, una prueba en Node que ejecute el script de `index.html` con LiquidFun real y un gamepad simulado, midiendo el resultado (daño, posiciones, estados); después, navegador;
   - para cambios no triviales, `/code-review`;
   - si toca la simulación, `physics-analyst` valida el resultado contra la física y sobre secuencias de frames, no capturas fijas. Sin su aprobación no se mergea;
   - **invariantes globales** (tests permanentes sobre la escena real del juego, en cada PR): la masa de cada material (partículas + campo) se conserva; ningún material cambia de identidad sin una reacción diseñada; el volumen dibujado coincide con el físico; no hay películas de agua más finas que el espesor mínimo del diseño;
   - **escenarios del usuario:** cada falla que reporta el usuario se convierte primero en un test que la reproduce, y no se cierra hasta que pasa;
   - **regresiones:** si algo que funcionaba en `main` cambia sin que el diseño lo pida, no se mergea. No se presenta como "cambio de comportamiento".
5. **Documentar (obligatorio en cada PR):** `doc-writer` agrega la entrada de `CHANGELOG.md`, actualiza `README.md`, actualiza `docs/referencias.md` (entradas nuevas, descartadas y las `ruta:línea` que se movieron) y revisa si el diseño cambió. Si cambió, actualiza el archivo de `docs/design/` correspondiente (estado y valores reales); si cambió una decisión de diseño, la registra `architect`.
6. **PR y merge:** push y PR con título igual al commit convencional de la tarea, cuerpo según la plantilla y `Closes #<n>`. Se mergea con merge commit y se borra la rama.
7. **Avisar al usuario cuando hay algo para probar.** Prueba todo junto en `main`, no rama por rama.

**Trabajo nuevo** que aparece durante una tarea no se hace en la rama actual: `planner` lo especifica y `github-clerk` lo registra como issue.

### Definición de terminado

- El comportamiento coincide con `DESIGN.md`, o `architect` lo actualizó en la rama.
- Los tests pasan y la funcionalidad se ejercitó (en Node con gamepad simulado, y en navegador si toca el render).
- Respeta los patrones de arquitectura y las reglas de memoria nativa.
- `CHANGELOG.md` tiene la entrada de la versión nueva.
- `docs/referencias.md` refleja los algoritmos y modelos del diff (nuevos, descartados y líneas de código vigentes).
- Se revisó si el diseño cambió: `docs/design/` refleja lo que hay en `main` después del merge (estado ✅/🔨 y valores reales), y `README.md` también.
- La rama, los commits y el título del PR siguen las convenciones, y el PR cierra su issue.

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
| `physics-analyst` | agente | Modela los fenómenos que decide el game designer y valida el resultado contra la física, los invariantes globales y los escenarios del usuario; su aprobación es obligatoria para mergear cambios de simulación. |
| `/next` | skill | Elige el próximo issue y crea su rama. |
| `/code-review`, `/simplify` | skills incluidos | Revisar un diff; limpiar después de una funcionalidad. |

**Modelos:** `opus` para los agentes que planifican, deciden y validan (`planner`, `architect`, `chemist`, `physics-analyst`); `sonnet` para los que ejecutan lo ya decidido (`developer`, `doc-writer`, `github-clerk`); `haiku` para la lectura (`scout`).

**Solo Opus decide.** Los agentes en `sonnet` y `haiku` no eligen entre alternativas ni completan lo que falta: si algo no está especificado, se detienen e informan la pregunta. Para no leer archivos enteros ni listados largos en Opus, la búsqueda se delega a `scout`.

Los agentes y skills son genéricos: no repiten reglas ni datos del proyecto. Todo lo específico vive en este archivo.

## Comandos

```powershell
npx http-server -c-1 .     # juego en http://localhost:8080
node --test tests/          # tests
```
