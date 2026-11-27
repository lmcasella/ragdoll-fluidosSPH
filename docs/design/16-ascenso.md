# 16. Ascenso infinito (#25)

Estado: implementado (#25 y #169, natural y en movimiento). Decisiones de juego del game designer (19/11); diseño técnico de `architect`. Es el brief de `developer`: lo que no está acá no se decide en la implementación, se pregunta.

Código nuevo: `src/level/climb.js` (`CLIMB`, `ClimbGenerator`, `Climb`) y `RisingFlood` en `src/water/flood.js`. Cambios en `water.js`, `immersion.js`, `buoyancy.js`, `src/render/`, `pickups.js`, `bot.js`, `damage.js`, `camera.js`, `menu.js`, `index.js` y `tests/helpers/game.js`.

## 16.1 Qué es

- Mapa **Infinito** en la fila Mapa del menú: habilitado y default. **Clásico** no cambia y queda como mapa de testing. Rondas y partida sin cambios ([02](02-partida.md)).
- **Nocaut (#275):** la vida es la misma que en el Clásico (100, mismas fuentes y valores de daño). Con la vida en 0 el robot no muere: queda inconsciente con el clip `land_hurt`: el primer nocaut de la ronda dura `KNOCKOUT.time` = 3 s y cada uno siguiente `KNOCKOUT.step` = 3 s más, hasta `KNOCKOUT.maxTime` = 18 s, sin responder a ningún control (moverse, saltar, rodar, disparar, golpear, bloquear; el bot tampoco lo maneja), pero los golpes y los fluidos lo siguen empujando. Más daño en nocaut no reinicia ni alarga el contador. Al terminar se levanta con `getup_front` o `getup_back` (según cómo quedó el torso) y con `KNOCKOUT.reviveHp` = 50 de vida. La tuerca (y el premio por etapa) dejan la vida en 100 y, si el robot está en nocaut, lo levantan en el acto. Solo el agua saca al robot de la partida, también en nocaut. El HUD muestra la barra y el número de vida como en el Clásico y el contador de segundos del nocaut sobre el robot ([18](18-interfaz.md) §3.6).
- **Sin mapa sólido abajo:** no hay islas, pileta, piso ni plataformas del clásico. Solo hay paredes a los costados y plataformas atravesables en el medio. El agua del campo arranca en y = 2 m sobre todo el ancho, con lecho plano en 0.
- **Etapas** de 15 m (etapa `n` = altura local `y` ∈ [15n, 15n + 15)) con paredes propias y plataformas atravesables generadas con semilla, **por ramas**: altura, ancho e irregularidad variables y sin justicia entre lados.
- **Aparición cercana:** cada jugador arranca sobre una plataforma al azar de la etapa 0, a 4–10 m del otro.
- **El mapa baja:** todas las plataformas y paredes son fixtures de un solo cuerpo cinemático que baja a `CLIMB.scroll`. El agua sube con `RisingFlood` (ritmo bajado porque el descenso suma subida relativa) y se genera hacia arriba y se libera lo que queda hundido.
- **Coordenadas locales:** las alturas de la tabla, del generador, de las etapas, de las armas, del premio y del grafo del bot son locales al cuerpo; la altura en el mundo es `local + offsetY` (`offsetY` = posición del cuerpo).

## 16.2 Tabla `CLIMB` (`src/level/climb.js`, patrón Datos en tablas)

| Clave | Valor | Uso |
|---|---|---|
| `centerX` | 28 | Eje de las paredes (m) |
| `stageHeight` | 15 | Alto de etapa (m) |
| `width` | `{ first: 56, base: 40, perStage: 4, min: 24 }` | `W(0) = first`; `W(n) = max(min, base − perStage · n)` para `n ≥ 1`; media `half(n) = W(n)/2` |
| `wallOuter`, `wallBelow` | 20, 20 | Las paredes van de `centerX ± half(n)` hacia afuera hasta x = −20 y x = 76; las de la etapa 0 llegan 20 m bajo y = 0 |
| `branches` | ver 16.3 | Generador por ramas |
| `spawn` | `{ distance: [4, 10], dy: 3, inset: 0.8, tries: 400, maxTop: 7 }` | Aparición (16.6) |
| `scroll` | `{ base: 0.15, perStage: 0.02 }` | Velocidad de descenso (m/s) del cuerpo: `base + perStage · etapa más alta alcanzada` por un jugador |
| `reach` | `BOT.reach` importado de `src/ai/bot.js` (`up: { dy: 3.3, gap: 2 }`, `short: { dy: 2, gap: 3.5 }`) | El grafo del bot usa la regla completa |
| `pickupLift` | 0.6 | Altura del ícono sobre el tope (m) |
| `pickups` | `[{ period: 9, weights: { WATER: 1 } }, { period: 9, weights: { WATER: 0.45, HONEY: 0.45, LAVA: 0.1 } }, { period: 6, weights: { LAVA: 1 } }, { period: 3, weights: { ACID: 0.5, LAVA: 0.5 } }]` | Entrada `min(n − 1, 3)` para la etapa `n ≥ 1`; una arma sobre una de cada `period` plataformas de la etapa. Claves = nombres de `FLUID` |
| `repairPerStage` | `1` | Ítems de reparación por etapa `n ≥ 1` (16.4) |
| `flood` | `{ surface: 2, start: 5, speed: 0.25, perStage: 0.04, catchUp: { gap: 6, rate: 0.5, max: 3 }, depth: 6, sinkBelow: 5 }` | 16.5 y 16.6 |
| `ahead` | 30 | Se genera hasta `top de cámara + ahead` (m, locales) |
| `loadout` | `{ weapon: null, weapons: [] }` | Equipo inicial del mapa (16.10) |
| `stagePrize` | `{ banner: 1.5, repair: "full", refill: true }` | Premio por etapa (16.10) |

## 16.3 Geometría y generador por ramas

**Paredes.** Por etapa `n`, dos rectángulos `kind: "wall"` sin `oneWay`: izquierda x ∈ [−20, 28 − half(n)], derecha x ∈ [28 + half(n), 76], y ∈ [15n, 15n + 15] (la etapa 0, desde −20).

**Generador** (`ClimbGenerator(seed, config)`, JS puro, `createSeededRandom` de `src/core/math/random.js`). Una sola secuencia consumida fila por fila: el mapa no depende de cuándo se genera. Tabla `branches`: `thickness` 0,4; `dy` [1,5; 3,3] (solo la fila de respaldo); `air` 1,8; `separation` 1; `sameHeight` 0,8; `rows` `{ spacing: [2.2, 3.2], counts: { first: { 1: 0.35, 2: 0.5, 3: 0.15, 4: 0 }, last: { 1: 0.1, 2: 0.25, 3: 0.35, 4: 0.3 } }, shift: 0.4, maxRun: 2, singleWidth: { first: [10, 14], last: [4, 5.5] } }`; `tries` 300; `transition` 3,5; `minWidth` 1,6; `tail` `{ chance: 0.1, long: 1.5, short: 0.6 }`; `window` 12; `width` `{ first: [8, 14], last: [2, 4], stages: 5 }`; `base` `{ count: [3, 5], top: [4, 7] }`.

- **Base:** la etapa 0 arranca con 3 a 5 plataformas anchas (ancho de la etapa 0), una por celda del ancho de 56 m, con tope al azar entre 4 y 7 m.
- **Fila:** cada fila queda de 2,2 a 3,2 m sobre la anterior y lleva de 1 a 4 plataformas (pesos `rows.counts`, interpolados por etapa entre `first` y `last` como el ancho: pocas al principio, más al subir; nunca más de `rows.maxRun` filas seguidas con la misma cantidad); cada plataforma se corre en vertical a ± `rows.shift` de la altura de su fila. La plataforma de una fila de 1 tiene ancho `rows.singleWidth`, interpolado igual (un descanso largo al principio que deja alcanzar dos en la fila siguiente). Una plataforma vale si se alcanza desde otra de la fila anterior o de su misma fila con el salto real del robot, la misma regla de `BOT.reach` que usa `buildNav` (`canReach` de `src/ai/bot.js`: `dy` ≤ 3,3 m con hueco ≤ 2 m, o `dy` ≤ 2 m con hueco ≤ 3,5 m; a nivel o hacia abajo, hueco ≤ 3,5 m); ya no se exige solapamiento ni subir en vertical.
- **Rechazo:** `air` (de tope a tope) con otra que la cubra en x; `separation` con otra a su altura (± `sameHeight`); dentro de las paredes (`half(stageOf(top + transition))`, y a lo sumo el ancho de la etapa siguiente más `reach.up.gap` cuando `top + transition + dy` ya cambia de etapa).
- **Alcance por construcción:** la x de cada plataforma sale de intervalos, no de sortear y rechazar: la unión de los alcances de las plataformas de las que puede saltarse, dentro de su celda del ancho entre paredes (si ahí no hay lugar, en todo el ancho), intersectada con el alcance de una plataforma de abajo sin vecina arriba que ya no llegaría a la fila siguiente (su tope se limita para que llegue), menos las zonas que violan `air` y `separation`. Una fila se vuelve a sortear (hasta `tries`) si alguna de esas plataformas queda sin vecina arriba, o si la que cierra una racha de `maxRun` no deja una fila siguiente posible. Así toda plataforma tiene una vecina alcanzable arriba y otra a su altura o abajo (`canReach`).
- **Ancho por etapa `n`:** rango lineal de `[8, 14]` en la 0 (plataformas largas para no morir en los primeros segundos) a `[2, 4]` en la 5, y ahí queda; con probabilidad `tail.chance` el ancho se multiplica por `tail.long` o `tail.short` (mínimo `minWidth`).
- **Armas:** etapa ≥ 1, una arma sobre la plataforma (`x`, tope + `pickupLift`) cada `period` plataformas de la etapa, sorteada por `weights`.
- **Salida:** `base` = `[{ x, w, y }]` (`y` = tope) y `next()` → `{ index, row, x, w, y, stage, pickups: [{ x, y, weapon }] }`; `front` es el tope más alto generado.

**Semilla.** Nueva por ronda (`Math.random`). Con `?seed=N` (el mismo parámetro de los bots, `botSeed` en `index.js`) **todas las rondas usan N**: el mapa es reproducible.
## 16.4 Armas e ítem de reparación

- Armas por etapa: etapa 0, ninguna (ni los puntos de `LEVEL.pickups` del clásico ni plataformas generadas de 10 a 15 m locales); etapa 1, agua; etapa 2, agua y miel con lava ocasional; etapa 3, lava; etapa 4 en adelante, ácido y lava.
- Etapa `n ≥ 1`: una plataforma lleva un arma si `índice de la plataforma dentro de su etapa % period === 0`, en `(x de la plataforma, tope + 0,6)` (un sorteo con `weights`).
- Reparación ✅ #156: un ítem por etapa `n ≥ 1` (`repairPerStage`), sobre la primera plataforma generada de la etapa cuyo tope llega a la mitad de la etapa (fila central), en `(x, tope + 0,6)`; esa plataforma no lleva arma. Deja la vida en 100 (en el Clásico suma 35) y levanta al robot en nocaut (#275); reaparece a los 20 s (`docs/design/04-fluidos.md` §4.2).
- Plataformas rompibles (#301, [5.4](05-escenario.md#54-plataformas-rompibles-301)): desde la etapa 2, con 3 s de cuenta. La probabilidad de que una plataforma sea rompible es 20 % en la etapa 2 y sube 10 % por etapa hasta un tope de 90 % (etapa 9 en adelante), para que el ascenso sea cada vez más difícil. Las plataformas con arma o reparación nunca son rompibles.

## 16.5 Agua

### `RisingFlood` (`src/water/flood.js`)

Misma interfaz que `Flood` (`active`, `level`, `config.start`, `step(roundTime, dt)`, `reset()`, `dispose()`) más el getter `floor`. JS puro: no crea partículas.

- **Curva:** `η*` (mundo) = `flood.surface` (2 m) hasta `start`; después, en cada paso fijo, `η* += v · dt` con `v = speed + perStage · stageOf(η* − offsetY) + alcance` (`offsetY`: función que pasa la raíz; el mapa baja). **Alcance** (#271): con `d = y_apoyo − η*` y `alcance = min(catchUp.max, catchUp.rate · max(0, d − catchUp.gap))`. `y_apoyo` (función que pasa la raíz; sin robots vivos, `−∞` y alcance 0) es el mínimo entre los robots vivos de su altura de apoyo: el punto más bajo del robot mientras está `grounded`; en el aire, `min(último apoyo, punto más bajo actual)`. Así un salto no acelera el agua y una caída cuenta enseguida. Cerca del agua la velocidad es la de siempre. Si los jugadores se escapan, el alcance trae el agua hasta ~`gap` = 6 m bajo sus pies, justo debajo del borde inferior de la cámara (`MARGIN_Y` = 4 m), y desde ahí entra a la vista a la velocidad base. Con `gap` = 6 m, bajar una o dos filas de plataformas (2,2 a 3,2 m cada una) no ahoga; con `gap` = 3 m los bots se ahogaban al bajar una fila. `level` vale `η*` si `active`, si no `−Infinity` (como `Flood`).
- **`floor`** = `max(0, η* − depth)`: el fondo efectivo.
- **`step`**, una vez por paso fijo y antes de `stepWorld` (mismo lugar que `flood.step`), en este orden:
  1. `water.setSpan(28 − half(stageOf(η* − offsetY)), 28 + half(stageOf(η* − offsetY)))`;
  2. `water.raiseFloor(floor)`;
  3. `water.rise(v · dt, η*)`.
- **Sin lluvia en Infinito.** Con caudal `v · W` serían hasta 2.000 gotas/s cayendo desde la cámara: miles de partículas vivas sobre el tope de 12.000, y el recorte por rendimiento (#160) las borraría y rompería la curva. La fuente en el campo cuesta O(N) y entra en el libro de masa.

### Cambios en `ShallowWater` (`src/water/water.js`)

- **`bed0`:** copia del lecho estático del constructor. `reset()` restaura `b` desde `bed0`, el span completo y los contadores nuevos. `setStart(start)`: `null` (lecho del nivel y pileta) o `{ surface }` (lecho plano en 0 y agua hasta `surface` en todo el ancho, el mapa Infinito); reinicia el campo.
- **Span activo `[i0, i1)`** (por defecto `[0, N)`). `setSpan(x1, x2)` solo lo angosta. Las columnas de afuera quedan **congeladas**: conservan su contenido (`volume()` y las demás sumas siguen recorriendo `[0, N)`), pero no se integran, no se muestrean ni reciben depósitos. Las caras `i0` e `i1` son paredes reflectivas, iguales a los bordes actuales `f = 0` y `f = N`. `evaluate`, `attempt`, `settle`, `friction`, `consolidate`, `maxSpeed` y `step` operan solo sobre el span. `sample` y `deposit` recortan el índice al span en vez de a `[0, N)`.
- **`raiseFloor(y)`:** para cada columna del span con `b[i] < y`: `Δ = y − b[i]`, `b[i] = y`, `cut = min(h[i], Δ)`. Si `h[i] > 0`, `h`, `q`, `E`, `M` y `A` se multiplican por `1 − cut/h[i]`, y lo quitado se suma a `stats.floorCut = { volume, momentum, energy, honey, acid }`. Mantiene `η` donde `h ≥ Δ`.
- **`rise(dh, eta)`:** para cada columna del span con `b[i] < eta`: `h[i] += dh` y `E[i] += SIGMA_W · c_agua · dh · ambientT`. Suma `dh · dx` por columna a `stats.sourced` (m²). Una columna de lecho `b` recibe en total `η* − b`, que es justo la profundidad que le corresponde.
- **Libro de masa en Infinito:** volumen del campo = inicial + absorbido + `sourced` − `floorCut.volume` (más los términos de siempre de [14.16 G](14-agua.md#g-invariantes-globales-108)). Los tests de G corren en Clásico y no cambian.

### Lectores del campo que pasan a respetar el span

- `immersion.js`: el rango de x es `[x0 + i0·dx, x0 + i1·dx)` en vez de `[x0, x0 + N·dx)`, y los índices de columna se recortan a `[i0, i1 − 1]`.
- `buoyancy.js`: `c0`, `c1` y el rango de descarte, recortados al span.
- `src/render/waterView.js`: `waterOutline` y el degradado recorren solo el span. `WaterView.draw` recibe un argumento opcional `deep = { floor, bottom }`: si `floor > 0`, pinta además un rectángulo del color del agua entre las caras del span, desde `floor` hasta `bottom` (borde inferior de la cámara). Así no se ve el fondo efectivo. I3f no aplica a ese rectángulo.

### Regla de ahogo

- En Infinito no hay sensor de pileta: `damage.killSensors` queda vacío.
- **`DamageSystem.drownSurface`:** función `(x) => η` o `null` (Clásico). En `process`, antes del mojado, para cada robot vivo: si el tope del torso (máximo `GetAABB(0).get_upperBound().get_y()` de las fixtures de `player.torso`) está por debajo de `drownSurface(x del torso)`, se aplica `player.drown(now)`.
- La raíz pasa `(x) => water.depthAt(x) > water.config.hDry ? water.surfaceAt(x) : −Infinity`, que vale siempre, también antes de los 5 s: la pileta ahoga igual que hoy.

## 16.6 Generar y liberar (`Climb`, `src/level/climb.js`)

```
new Climb({ world, platforms, pickups, config = CLIMB, base = LEVEL })
reset(seed)                      // destruye todo, cuerpo a (0, 0), crea la base, genera hasta y = 60 y sortea la aparición
update({ top, level, reached })  // alturas del mundo → { created, destroyed } (cantidades)
cameraBounds(y)                  // y del mundo → { minX: 28 − half, maxX: 28 + half, minY: 0, maxY: Infinity }
get level                        // { solids }: sólidos vivos como datos locales (render y buildNav)
get offsetY                      // posición del cuerpo (≤ 0 al bajar)
get spawns                       // [{ x, y, flipX }, ...] en el mundo
dispose()
```

- **Un solo cuerpo cinemático** (`b2_kinematicBody`, sin sueño) con una fixture de caja por elemento (pared o plataforma; fricción 0,8, como `buildLevel`). `SetLinearVelocity(0, −scroll)` con `scroll = CLIMB.scroll.base + perStage · etapa más alta alcanzada` (`reached`, altura del mundo del jugador más alto). Crear y destruir es `CreateFixture` y `DestroyFixture` sobre ese cuerpo (Memoria nativa: el `b2PolygonShape` y los `b2Vec2` de trabajo se crean en el constructor y se liberan en `dispose`; ningún `new Box2D.*` por elemento). Las plataformas se registran con `platforms.addPlatform(fixture, { moving: true })`.
- **Verificado en Node con LiquidFun real:** un robot apoyado en una fixture del cuerpo que baja la acompaña sin atravesarla (pies a 0,01 m del tope durante todo el descenso) y las partículas se apoyan igual que sobre un cuerpo quieto.
- **Generar** (`update`): mientras `front < top − offsetY + ahead`, `generator.next()`; se crean las paredes de cada etapa nueva que toque una plataforma o ese límite. Cada arma se agrega con `pickups.add({ x, y local, weapon })`.
- **Liberar** (`update`): todo elemento cuyo tope local quede por debajo de `level − offsetY − sinkBelow` (`level` = `flood.level`, la curva) se destruye en este orden: `platforms.removePlatform(fixture)` si es plataforma, `pickups.remove(point)` si es arma, `body.DestroyFixture(fixture)`. Incluye la etapa 0. Con `level = −Infinity` no libera nada.
- **Aparición:** en `reset`, dos plataformas de la base (tope local ≤ `spawn.maxTop` = 7 m) de las que se puede seguir subiendo (alguna otra a ≤ 3,3 m encima con solapamiento ≥ 1,5 m), con `pickSpawns`: distancia horizontal `spawn.distance`, `|dy| ≤ spawn.dy`, x al azar a `spawn.inset` de los bordes, mirándose; un sorteo con `seededRandom(seed ^ 0x9e3779b9)`. Si ningún sorteo vale, recorre todos los pares (también una misma plataforma) y usa el que menos se aleja. Los jugadores quedan parados sobre el tope (sin rayo desde el techo).
- **Fuera de callbacks:** `update` y `reset` se llaman solo desde el loop, después de los pasos del frame, nunca dentro de `stepWorld` ni de un callback.
- **Después de destruir:** la raíz llama a `wallContact.invalidate()` (el buffer de contactos partícula–cuerpo guarda punteros hasta el próximo `Step`) y a `bot.setNav(climb.level)` de cada bot.
### Cambios en otros módulos

- **`Pickups`:** `add({ x, y, weapon })` → punto (`y` local; crea el cuerpo en `y + offsetY` y el hook como hoy el constructor), `shift(offsetY)` (mueve los cuerpos con el mapa) y `remove(point)` (quita el hook, descarta lo encolado de ese punto, `DestroyBody` y lo saca de `points`). El constructor y `dispose` pasan a usarlos.
- **`Bot`:** el grafo es local: `update` toma `game.offsetY` (`this.offsetY`) y las alturas del mundo que se comparan con un nodo se llevan a local (`supportOf`, `minTop`, la altura del rival, `airControl`); así `setNav` y la meta no cambian por el desplazamiento. Salta en vertical solo con velocidad horizontal ≤ `jump.settle` y, encajado `stuck.time` s sin apoyo, salta de un lado a otro. `setNav(level)` = `this.nav = buildNav(level, this.config)`, traduce `committed`, `goal` y `foeNode` (son índices de nodo) al nodo igual del grafo nuevo, o los anula si ya no existe, y pone `replanAt = 0`; así un salto en el aire no pierde su destino cuando se genera o libera una fila. El bot sube de preferencia en vertical: las aristas con solapamiento ≥ `BOT.through.overlap` y desnivel ≤ `reach.up.dy` cuestan `BOT.cost.through` (0,6) contra `BOT.cost.jump` (1) de las demás, y la ruta es de costo mínimo (Dijkstra). El constructor ya acepta `level`.
- **`Camera`:** `setBounds(bounds)` (no toca `x`, `y` ni `zoom`) y el getter `top` (`y + viewH / (2 · scale)`). Con `maxY: Infinity` la cuenta actual ya funciona: `fitWorld` queda dado por el ancho.
- **`src/render/`:** `collectSurfaces(players, solids, reach, offsetY)` (`fluidSurfaces.js`) suma `offsetY` a los sólidos locales; `LevelView` y `PickupView` ponen `offsetY` como posición de su contenedor.
- **`menu.js`:** `map.default = "infinite"`; Infinito sin `disabled` ni `note`.
- **`tests/helpers/game.js`:** `options.map`, default `"classic"`, se escribe en `game.menu.values.map` antes de `arrancarPartida()`. Los tests existentes siguen en Clásico.

### Raíz de composición (`index.js`)

- **`aplicarMapa(map)`**, llamada en `arrancarPartida` antes de `ponerBots`. Si el mapa no cambió, no hace nada.
  - Clásico → Infinito: `removePlatform` de cada fixture de `buildLevel`, `world.DestroyBody(ground)`, `damage.killSensors.clear()`, `pickups.dispose()` y `new Pickups(world, damage, [])`, `flood.dispose()`, `water.setStart({ surface: 2 })` y `flood = new RisingFlood(water, LEVEL, CLIMB, () => climb.offsetY)`, `climb = new Climb(...)`, `damage.drownSurface = ...` y `wallContact.invalidate()`.
  - Infinito → Clásico: lo inverso, con `buildLevel` y `new Flood(store, water)`.
- **`ponerBots`** crea los bots con `level: climb ? climb.level : LEVEL`.
- **`reiniciarRonda`**: en Infinito, `climb.reset(seed)` **antes** de `spawnRobot`, que usa `climb.spawns`.
- **`spawnOnGround`**: en Infinito la superficie es el tope de la plataforma sorteada (sin rayo); en Clásico, el rayo desde `LEVEL.bounds.maxY`.
- **`limpiarParticulas`**: `minY` = `flood.floor` en Infinito y `LEVEL.bounds.minY` en Clásico. x sigue en 0–56.
- **Dibujo:** `LevelView` y `PickupView` reciben `offsetY` y lo ponen como posición de su contenedor, `collectSurfaces(players, solids, reach, offsetY)`, y el HUD HTML recibe `flood.config.start` en sus datos del frame.
- **`__TEST_HOOKS__`:** `flood`, `pickups`, `climb` y `map` como getters, porque cambian con el mapa.

### Orden en el frame (Infinito)

Pasos fijos como hoy (`flood.step` = `RisingFlood.step` antes de `buoyancy.apply` y `stepWorld`; `damage.process` aplica el ahogo después). Después de los pasos: `sonarEventos` → `limpiarParticulas` → `store.trim` → `camera.setBounds(climb.cameraBounds(y del torso más bajo))` → `camera.update` → `climb.update({ top: camera.top, level: flood.level, reached: y del torso más alto })` → `invalidate`/`setNav` si hubo cambios → dibujo.

## 16.7 Riesgos técnicos y decisiones

| Riesgo | Decisión |
|---|---|
| **CFL del campo con el nivel sin techo** | **Fondo efectivo que acompaña** (`depth` = 6 m, `raiseFloor`). Sin fondo, a 150 m (etapa 5) `c = √(g h)` = 38,7 m/s, unos 16 subpasos, contra 4,56 medidos en Clásico (W6). Además, Saint-Venant vale solo para `h ≪ λ`: a 150 m daría ondas cortas a 39 m/s, cuando las reales en aguas profundas no dependen de `h`. `U_MAX` también supone `h ≤ 15 m`. Con 6 m: `c` = 7,7 m/s, unos 4 subpasos, costo constante en cualquier etapa. Lo que está a más de 5 m bajo la superficie se destruye, así que nadie vivo lo nota. `buoyancy.js` solo recorta los polígonos por arriba en `η` e `immersion.js` compara con `η`: un cuerpo o una partícula bajo el fondo efectivo sigue flotando y sumergido (*verificado leyendo* el código) |
| **Columnas fuera de las paredes que se angostan** | Span activo con columnas congeladas (16.5): no se integran, no se leen ni se dibujan, y conservan su volumen (sin sumidero nuevo). El agua bajo el voladizo de la pared queda atrapada, que es lo físico |
| **Partículas fuera del ancho** | No pueden estar fuera de las paredes (sólidas, hasta x = −20 y 76). Las que caen bajo el fondo efectivo (inmiscibles que se hunden, o lo que cae por donde había pisos destruidos) se destruyen con `SINK.OUT` cuando `y < flood.floor − 1`. Las miscibles bajo el agua ya las absorbe `Immersion` |
| **Precisión de float** | Box2D y LiquidFun en float32: a 256–512 m el ulp es 3·10⁻⁵ m, contra `linearSlop` 0,005: sin problema. El límite de la grilla de LiquidFun (`computeTag`, 12 bits para `y / diámetro`: costuras en `y = 245,76 + 491,52 k` m con `r` = 0,06, donde se pierden contactos de las fixtures que las cruzan) es de la altura **del mundo**, y con el mapa bajando la acción se queda cerca del agua (en el mundo, bajo ~50 m en una ronda de varios minutos): se quitó el manejo de costuras (partir paredes, bajar plataformas). Si una ronda llegara a 245 m de mundo, volver a pedirlo. Sin origen flotante |
| **`LEVEL.bounds`, cámara y `buildLevel`** | `LEVEL` no se muta y sigue siendo el clásico, y la x del campo y la limpieza (0–56). Infinito no usa `buildLevel`: `Climb` construye la base con el generador. La cámara recibe `cameraBounds` con `maxY: Infinity`. `floodLevel`, `freeWidth` y `levelOfArea` (`maxY` = 32) son solo de `Flood` |
| **Sensor de la pileta** | No se crea en Infinito. Lo reemplaza la regla de ahogo por superficie (16.5), en todo el mapa y desde el segundo 0 |
| **Aparición** | Sin rayo: el tope de la plataforma sorteada es el dato (16.6) |
| **Memoria nativa** | Un cuerpo cinemático con unas 40 fixtures vivas a la vez, creadas y destruidas simétricamente. El árbol dinámico y el `b2BlockAllocator` reutilizan lo liberado. Ningún temporal por elemento. Medido en C2: +9 KB de tope del heap en 6 etapas |
| **Grilla de dibujo fija (64 × 40 m)** | Los sólidos se suman con `offsetY` y quedan en el mundo (bajo ~50 m); lo que cae fuera de la grilla cae en la celda del borde |

### Verificado leyendo el código (19/11)

- `ShallowWater`: los bordes `f = 0` y `f = N` son reflectivos por espejo (la base del span). `deposit` y `sample` recortan a `[0, N)`, y `volume()` suma `[0, N)`.
- `Immersion.step` absorbe con `y ≤ η + r` sin mirar la profundidad, y `Buoyancy` recorta solo en `η`.
- `OneWayPlatforms.addPlatform`/`removePlatform` existen; `removePlatform` limpia bajadas y pares.
- `Bot.nav` usa índices de nodo en `committed`, `goal` y `foeNode`.
- `WallContact.invalidate` hace falta al destruir cuerpos.
- `Menu.load` hace que la elección guardada gane sobre el default.
- `tests/helpers/game.js` arranca con la elección del menú: sin `options.map`, todos los tests pasarían a Infinito.

### Verificado en ejecución (#169)

- Un robot apoyado en una fixture de un cuerpo cinemático que baja la acompaña sin atravesarla, y las partículas se apoyan igual que con el cuerpo quieto.
- Un robot puede quedar encajado en una plataforma con el par sólido tras un aterrizaje rápido con la pierna extendida; el bot lo resuelve con `BOT.stuck` (16.6). Queda pendiente investigarlo como bug de `OneWayPlatforms`.

## 16.8 Criterios para `developer` (Node, LiquidFun real)

| Id | Criterio | Esperado |
|---|---|---|
| C1 | Invariante de alcance y variedad: `ClimbGenerator` con semillas 1–50 hasta 300 m. Toda plataforma alcanzable desde otra de abajo (`canReach`), dentro de las paredes, sin pisar ni quedar a menos de 1,8 m de aire ni de 1 m a su altura; dos vecinas alcanzables y ≥ 4 plataformas en pantalla a 1366×768 (#180); filas de 1 a 4 plataformas, cada cantidad en ≥ 10 % de las filas y nunca 3 seguidas iguales (#227); desviación media de alturas en tramos de 3 m > 0,4 m; el ancho medio baja con la etapa; armas por `period` y de `weights`; misma semilla, mismas plataformas | 0 violaciones; 0 plataformas de respaldo |
| C2 | Heap: `Climb` con mundo propio, `level` y `top` subiendo hasta generar y liberar 5 etapas, con el mundo avanzando. `heapTop()` tras la etapa 1 y tras la etapa 6 | No sube más que 2 trozos de 16 KiB; `platforms.platforms.size` y `pickups.points.length` iguales a los vivos; fixtures del cuerpo = sólidos de `climb.level` |
| C3 | Costo del campo: `ShallowWater` + `RisingFlood` (JS puro) con `CLIMB.flood` ×10 en velocidad hasta `η*` ≥ 150 m; se miden los últimos 600 pasos | Subpasos medios ≤ 6, `capHits` = 0, `halvings` = 0, `min h ≥ 0`; ms por `water.step` ≤ 1,5 × el de Clásico con el agua en 15 m (misma máquina, se imprimen los dos) |
| C4 | Bot que sube: Infinito, `?bot=2`, semillas 1, 2 y 3; J1 sin input e inmortal (el test reemplaza `drown`, `hurt`, `burn` y `takeDamage` de J1 por no-op) | El torso de J2 pasa 60 m locales (`y − offsetY`) vivo, en ≤ 240 s simulados, en 3 de 3 semillas |
| C5 | Ronda que termina por agua: Infinito, sin pads | Los dos robots mueren por `drown` y `match` pasa a `roundOver` antes de los 30 s de ronda |
| C6 | Menú: `new Menu({ storage: null }).choice.map` | `"infinite"`; Infinito no está deshabilitado |
| C7 | Libro del campo: en C3 y en C5, en cada paso | `volume()` = inicial + absorbido + `sourced` − `floorCut.volume`, error < 10⁻⁶ relativo |
| C8 | Sin regresiones | `node --test tests/` en verde con los tests existentes en Clásico |
| C10 | Mapa que baja | El cuerpo baja a `CLIMB.scroll` (±0,01 m/s); un robot apoyado baja con la plataforma sin atravesarla (pies entre 0,00 y 0,4 m sobre el tope); saltar desde abajo la atraviesa |
| C11 | Aparición | En 50 semillas, dos plataformas de la etapa 0 con distancia horizontal 4–10 m y `|dy| ≤ 3 m`; en la partida, los robots quedan apoyados y mirándose |
| C12 | Bot contra bot desde el arranque | Semillas 1 a 3: el que va adelante sube ≥ 30 m locales |

## 16.9 Orden de recorte (si no entra para el 24/11)

No recortable: generador con su invariante (C1), `RisingFlood` con fondo efectivo y span, regla de ahogo, generar y liberar, `setNav` del bot, menú y helper de tests.

Recortable, en este orden (se recorta primero lo de arriba):

1. (Quitado: costuras de LiquidFun; ver 16.7.)
2. **Relleno de agua profunda** (`deep` en `drawWater`). Sin él, se ve el fondo efectivo cuando la cámara baja a más de 6 m bajo la superficie.
3. **Densidad progresiva de armas:** `period` fijo en 2 para toda etapa ≥ 1, con los mismos `weights` por etapa.
4. **Span activo del campo:** el campo queda en x 0–56 y `drawLevel` se dibuja después de `drawWater`. Hay agua dentro de las paredes, aunque oculta, y sube el costo (C3 se mide igual).
5. **Cámara acotada al ancho de la etapa:** queda en `{ 0, 56, 0, Infinity }`.

## 16.10 Equipo inicial, bot y premio por etapa (decisiones del game designer, 19/11)

- **Sin líquidos al empezar.** En Infinito cada robot arranca con `CLIMB.loadout` (`weapon: null`, sin tanques): solo melee. Sin arma, el gatillo no hace nada, no se dibuja la mira láser, la rueda de armas no se abre y el HUD no muestra tanque. Recoger un punto de aparición da el arma con el tanque lleno y, si el robot no tenía arma equipada, la equipa. `equipLoadout(player, loadout = LOADOUT)` recibe el equipo del mapa.
- **El bot busca armas.** Sin arma, o con todos los tanques vacíos, si hay un punto de aparición listo en un nodo sobre la línea segura y a `BOT.pickupReach` (3) aristas o menos de la ruta de menor costo, su meta es ese punto (el más barato). Si no, sigue como antes. El golpe contra un rival cercano (< 2 m) sigue teniendo prioridad.
- **Premio por etapa.** El primer robot que se apoya en una plataforma de la etapa `n ≥ 1` (tope local ≥ base de la etapa; `StagePrizes.detect(players, solids, offsetY)`) gana el premio de esa etapa, una vez por etapa y por ronda: según `stagePrize`, la vida al máximo (`repair: "full"`) y todos sus tanques llenos (`refill`). `StagePrizes.detect` solo anota eventos `{ k, stage }` después de `stepWorld` y `StagePrizes.apply` es el único lugar que los aplica (#162 cambiará la vida al máximo por daño % a 0 acá). Un cartel chico arriba, `ETAPA n · J1`, dura `banner` s y suena el efecto `pickup`.
- **Controles (#163).** El cartel de controles ya no se dibuja durante la partida: `drawMenu` lo dibuja (`CONTROLS_HELP`) debajo de las filas, solo en el menú principal.
