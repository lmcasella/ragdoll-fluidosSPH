# 16. Ascenso infinito (#25)

Estado: diseñado, pendiente (#25). Decisiones de juego del game designer (19/11); diseño técnico de `architect`. Es el brief de `developer`: lo que no está acá no se decide en la implementación, se pregunta.

Código nuevo: `js/climb.js` (`CLIMB`, `ClimbGenerator`, `Climb`) y `RisingFlood` en `js/flood.js`. Cambios en `water.js`, `immersion.js`, `buoyancy.js`, `render.js`, `pickups.js`, `bot.js`, `damage.js`, `camera.js`, `menu.js`, `index.html` y `tests/helpers/game.js`.

## 16.1 Qué es

- Mapa **Infinito** en la fila Mapa del menú: habilitado y default. **Clásico** no cambia y queda como mapa de testing. Rondas, reglas y partida sin cambios ([02](02-partida.md)).
- **Etapa 0** = el clásico reducido a sus plataformas bajas: pisos, islas, pileta y solo las plataformas de `LEVEL.solids` con tope ≤ `baseMaxTop` (8 m) y las armas de `LEVEL.pickups` sobre ellas, aparición de siempre, sin las paredes de `LEVEL` ni el sensor de la pileta. El clásico tiene plataformas altas (tope 10,3 y 13,6) que no se alcanzan desde ninguna otra, y así nadie llegaría a las filas generadas.
- Encima, **etapas** de 15 m (etapa `n` = `y` ∈ [15n, 15n + 15)) con paredes propias y filas de plataformas atravesables generadas con semilla.
- El agua sube sin techo desde los 5 s. Se genera hacia arriba y se libera lo que queda hundido.

## 16.2 Tabla `CLIMB` (`js/climb.js`, patrón Datos en tablas)

| Clave | Valor | Uso |
|---|---|---|
| `centerX` | 28 | Eje de simetría (m) |
| `stageHeight` | 15 | Alto de etapa (m) |
| `width` | `{ first: 56, base: 40, perStage: 4, min: 24 }` | `W(0) = first`; `W(n) = max(min, base − perStage · n)` para `n ≥ 1`; media `half(n) = W(n)/2` |
| `baseMaxTop` | 8 | Tope máximo (m) de las plataformas del clásico que entran en la etapa 0 |
| `wallOuter` | 20 | Las paredes van de `centerX ± half(n)` hacia afuera hasta x = −20 y x = 76 (solo para que la cámara no muestre vacío; el campo y la limpieza siguen en x 0–56) |
| `rows` | `{ gap: [2.5, 3.2], count: [2, 4], width: [3, 6], thickness: 0.4, separation: 1.5, overlap: 1.5, fairness: 0.2, tries: 50, transition: 3.5 }` | Generador (16.3) |
| `reach` | `BOT.reach` importado de `js/bot.js` (`up: { dy: 3.3, gap: 2 }`, `short: { dy: 2, gap: 3.5 }`) | `up.dy` es el desnivel máximo del invariante de alcance; el grafo del bot usa la regla completa |
| `pickupLift` | 0.6 | Altura del ícono sobre el tope (m), como en `LEVEL.pickups` |
| `pickups` | `[{ period: 3, weights: { WATER: 0.4, HONEY: 0.4, LAVA: 0.2 } }, { period: 2, weights: { LAVA: 1 } }, { period: 1, weights: { ACID: 0.5, LAVA: 0.5 } }]` | Entrada `min(n − 1, 2)` para la etapa `n ≥ 1`. Claves = nombres de `FLUID` |
| `repair` | `{ perStage: 1, item: null }` | Prevista para #156. Con `item: null`, `Climb` la ignora. No se implementa acá |
| `flood` | `{ start: 5, speed: 0.4, perStage: 0.06, depth: 6, sinkBelow: 5 }` | 16.5 y 16.6 |
| `ahead` | 30 | Se genera hasta `top de cámara + ahead` (m) |
| `spawnRayTop` | 9 | Inicio del rayo de aparición en Infinito (m), por debajo de la primera fila generada (≥ 9,9 m de cara inferior) |
| `seamMargin` | 0.2 | 16.9, costuras de LiquidFun |
| `loadout` | `{ weapon: null, weapons: [] }` | Equipo inicial del mapa (16.10); Clásico usa `LOADOUT` de `js/weapons.js` |
| `stagePrize` | `{ banner: 1.5, repair: "full", refill: true }` | Premio por etapa (16.10) |

## 16.3 Geometría y generador

**Paredes.** Por etapa `n`, dos rectángulos `kind: "wall"` sin `oneWay`: izquierda x ∈ [−20, 28 − half(n)], derecha x ∈ [28 + half(n), 76], y ∈ [15n, 15n + 15]. La etapa 0 también usa paredes de `CLIMB` (half = 28: caras en x = 0 y 56, como el clásico).

**Filas.** La fila −1 es el conjunto de plataformas bajas de la etapa 0 (tope ≤ `baseMaxTop`: 7,0, 5,8 y 7,8 m), cada una con su propio tope; la fila 0 está a `U(gap)` sobre la más alta (7,8 m). Cada fila `k` tiene un tope `y_k = y_{k−1} + U(gap)`; todas sus plataformas comparten `y_k`, son `kind: "platform"`, `oneWay: true`, alto 0,4.

- **Ancho de colocación:** `half(stageOf(y_k + transition))`. Una fila a menos de 3,5 m bajo un cambio de etapa ya usa el ancho de la etapa de arriba, así nadie queda bajo el voladizo de la pared.
- **Composición** (`count` uniforme en {2, 3, 4}): cada plataforma se sortea con ancho uniforme en [3, 6] y una x al azar dentro de las paredes que solape `overlap` con alguna plataforma de la fila `k − 1`. No hay espejo.
- **Válida si:** todas caben (`|x − 28| + w/2 ≤ half`), hay ≥ `separation` (1,5 m) entre plataformas de la fila, **cada** plataforma tiene en la fila `k − 1` (la −1 para la primera fila) una con **solapamiento horizontal ≥ `overlap`** (1,5 m) y desnivel ≤ `reach.up.dy` (3,3 m), y hay **justicia**: el ancho total de plataformas a la izquierda y a la derecha de x = 28 difiere ≤ `fairness` (20 %) del mayor; una plataforma que cruza el centro cuenta por partes.
- **Alcance:** el solapamiento reemplaza al salto diagonal como garantía: cada plataforma se alcanza saltando en vertical a través de ella. `reachable(a, b, reach)` (función pura exportada, la regla diagonal de `buildNav`) sigue en el grafo del bot como arista opcional.
- **Intentos:** hasta `tries` sorteos de la fila completa. Si ninguno vale, **fila de respaldo:** la fila `k − 1` recortada al ancho de la etapa (para la primera fila, un par de ancho 3 en 28 ± 2,25 sobre la plataforma de 7,8 m). Solapa por completo con su referencia; se midieron 2 respaldos en 7.000 filas (50 semillas).
- **Determinismo:** `ClimbGenerator(seed, config, base)` es JS puro (sin `Box2D`), con `seededRandom` de `js/bot.js`. Una sola secuencia, consumida fila por fila en orden de `y` (forma, armas, todo): el mapa no depende de cuándo se genera cada fila. `next()` devuelve `{ index, y, stage, platforms: [{ x, w }], pickups: [{ x, y, weapon }] }`.

**Semilla.** Nueva por ronda (`Math.random`). Con `?seed=N` (el mismo parámetro de los bots, `botSeed` en `index.html`) **todas las rondas usan N**: el mapa es reproducible.

## 16.4 Armas e ítem de reparación

- Etapa 0: solo `LEVEL.pickups`. Las filas generadas dentro de la etapa 0 (de 10,3 a 15 m) no llevan armas.
- Etapa `n ≥ 1`: la fila lleva un par de armas si `índice de la fila dentro de su etapa % period === 0`. Van sobre las plataformas más a la izquierda y más a la derecha de la fila, en `(x de la plataforma, y_k + 0,6)`, con **la misma arma** en las dos (un sorteo por par con `weights`).
- Reparación: solo la entrada `repair` de la tabla (16.2). #156 decide qué es y dónde va.

## 16.5 Agua

### `RisingFlood` (`js/flood.js`)

Misma interfaz que `Flood` (`active`, `level`, `config.start`, `step(roundTime, dt)`, `reset()`, `dispose()`) más el getter `floor`. JS puro: no crea partículas.

- **Curva:** `η*` = `LEVEL.pool.surface` (3 m) hasta `start`; después, en cada paso fijo, `η* += v · dt` con `v = speed + perStage · stageOf(η*)`. `level` vale `η*` si `active`, si no `−Infinity` (como `Flood`).
- **`floor`** = `max(0, η* − depth)`: el fondo efectivo.
- **`step`**, una vez por paso fijo y antes de `stepWorld` (mismo lugar que `flood.step`), en este orden:
  1. `water.setSpan(28 − half(stageOf(η*)), 28 + half(stageOf(η*)))`;
  2. `water.raiseFloor(floor)`;
  3. `water.rise(v · dt, η*)`.
- **Sin lluvia en Infinito.** Con caudal `v · W` serían hasta 2.000 gotas/s cayendo desde la cámara: miles de partículas vivas sobre el tope de 12.000, y el recorte por rendimiento (#160) las borraría y rompería la curva. La fuente en el campo cuesta O(N) y entra en el libro de masa.

### Cambios en `ShallowWater` (`js/water.js`)

- **`bed0`:** copia del lecho estático del constructor. `reset()` restaura `b` desde `bed0`, el span completo y los contadores nuevos.
- **Span activo `[i0, i1)`** (por defecto `[0, N)`). `setSpan(x1, x2)` solo lo angosta. Las columnas de afuera quedan **congeladas**: conservan su contenido (`volume()` y las demás sumas siguen recorriendo `[0, N)`), pero no se integran, no se muestrean ni reciben depósitos. Las caras `i0` e `i1` son paredes reflectivas, iguales a los bordes actuales `f = 0` y `f = N`. `evaluate`, `attempt`, `settle`, `friction`, `consolidate`, `maxSpeed` y `step` operan solo sobre el span. `sample` y `deposit` recortan el índice al span en vez de a `[0, N)`.
- **`raiseFloor(y)`:** para cada columna del span con `b[i] < y`: `Δ = y − b[i]`, `b[i] = y`, `cut = min(h[i], Δ)`. Si `h[i] > 0`, `h`, `q`, `E`, `M` y `A` se multiplican por `1 − cut/h[i]`, y lo quitado se suma a `stats.floorCut = { volume, momentum, energy, honey, acid }`. Mantiene `η` donde `h ≥ Δ`.
- **`rise(dh, eta)`:** para cada columna del span con `b[i] < eta`: `h[i] += dh` y `E[i] += SIGMA_W · c_agua · dh · ambientT`. Suma `dh · dx` por columna a `stats.sourced` (m²). Una columna de lecho `b` recibe en total `η* − b`, que es justo la profundidad que le corresponde.
- **Libro de masa en Infinito:** volumen del campo = inicial + absorbido + `sourced` − `floorCut.volume` (más los términos de siempre de [14.16 G](14-agua.md#g-invariantes-globales-108)). Los tests de G corren en Clásico y no cambian.

### Lectores del campo que pasan a respetar el span

- `immersion.js`: el rango de x es `[x0 + i0·dx, x0 + i1·dx)` en vez de `[x0, x0 + N·dx)`, y los índices de columna se recortan a `[i0, i1 − 1]`.
- `buoyancy.js`: `c0`, `c1` y el rango de descarte, recortados al span.
- `render.js`: `waterOutline` y el degradado recorren solo el span. `drawWater` recibe un argumento opcional `deep = { floor, bottom }`: si `floor > 0`, pinta además un rectángulo del color del agua entre las caras del span, desde `floor` hasta `bottom` (borde inferior de la cámara). Así no se ve el fondo efectivo. I3f no aplica a ese rectángulo.

### Regla de ahogo

- En Infinito no hay sensor de pileta: `damage.killSensors` queda vacío.
- **`DamageSystem.drownSurface`:** función `(x) => η` o `null` (Clásico). En `process`, antes del mojado, para cada robot vivo: si el tope del torso (máximo `GetAABB(0).get_upperBound().get_y()` de las fixtures de `player.torso`) está por debajo de `drownSurface(x del torso)`, se aplica `player.drown(now)`.
- La raíz pasa `(x) => water.depthAt(x) > water.config.hDry ? water.surfaceAt(x) : −Infinity`, que vale siempre, también antes de los 10 s: la pileta ahoga igual que hoy.

## 16.6 Generar y liberar (`Climb`, `js/climb.js`)

```
new Climb({ world, platforms, pickups, config = CLIMB, base = LEVEL })
reset(seed)                      // destruye todo, crea la etapa 0 y genera hasta y = 60
update({ top, level })           // → { created, destroyed } (cantidades)
cameraBounds(y)                  // → { minX: 28 − half(stageOf(y)), maxX: 28 + half(stageOf(y)), minY: 0, maxY: Infinity }
get level                        // { solids, pool: base.pool }: sólidos vivos como datos (render y buildNav)
dispose()
```

- **Un cuerpo estático por elemento** (pared, piso o plataforma), con una sola fixture de caja (fricción 0,8, como `buildLevel`). Un `b2BodyDef`, un `b2PolygonShape` y un `b2Vec2` de trabajo se crean en el constructor y se liberan en `dispose` (Memoria nativa: ningún `new Box2D.*` por elemento).
- **Generar** (`update`): mientras `última fila.y < top + ahead`, `generator.next()`; se crean las paredes de cada etapa nueva que toque una fila o `top + ahead`. Cada plataforma se registra con `platforms.addPlatform(fixture)` y cada arma con `pickups.add(point)`.
- **Liberar** (`update`): todo elemento cuyo tope (de la caja; para un arma, su `y`) quede por debajo de `level − sinkBelow` (`level` = `flood.level`, la curva) se destruye en este orden: `platforms.removePlatform(fixture)` si es plataforma, `pickups.remove(point)` si es arma, `world.DestroyBody(body)`. Incluye la etapa 0. Con `level = −Infinity` no libera nada.
- **Fuera de callbacks:** `update` y `reset` se llaman solo desde el loop, después de los pasos del frame, nunca dentro de `stepWorld` ni de un callback.
- **Después de destruir:** la raíz llama a `wallContact.invalidate()` (el buffer de contactos partícula–cuerpo guarda punteros hasta el próximo `Step`) y a `bot.setNav(climb.level)` de cada bot.

### Cambios en otros módulos

- **`Pickups`:** `add({ x, y, weapon })` → punto (crea el cuerpo y el hook como hoy el constructor) y `remove(point)` (quita el hook, descarta lo encolado de ese punto, `DestroyBody` y lo saca de `points`). El constructor y `dispose` pasan a usarlos.
- **`Bot`:** `setNav(level)` = `this.nav = buildNav(level, this.config)`, traduce `committed`, `goal` y `foeNode` (son índices de nodo) al nodo igual del grafo nuevo, o los anula si ya no existe, y pone `replanAt = 0`; así un salto en el aire no pierde su destino cuando se genera o libera una fila. El bot sube de preferencia en vertical: las aristas con solapamiento ≥ `BOT.through.overlap` y desnivel ≤ `reach.up.dy` cuestan `BOT.cost.through` (0,6) contra `BOT.cost.jump` (1) de las demás, y la ruta es de costo mínimo (Dijkstra). El constructor ya acepta `level`.
- **`Camera`:** `setBounds(bounds)` (no toca `x`, `y` ni `zoom`) y el getter `top` (`y + viewH / (2 · scale)`). Con `maxY: Infinity` la cuenta actual ya funciona: `fitWorld` queda dado por el ancho.
- **`render.js`:** la grilla de superficies sigue a la cámara. `collectSurfaces(players, solids, reach, originY)` pone `GRID_Y0 = floor(originY) − 2`, con `originY` el borde inferior de la cámara, y `GRID_H` = 64. Lo que cae fuera de la grilla no se anota, y `skinPosition` devuelve la posición real fuera de la grilla, en vez de recortar al borde.
- **`menu.js`:** `map.default = "infinite"`; Infinito sin `disabled` ni `note`.
- **`tests/helpers/game.js`:** `options.map`, default `"classic"`, se escribe en `game.menu.values.map` antes de `arrancarPartida()`. Los tests existentes siguen en Clásico.

### Raíz de composición (`index.html`)

- **`aplicarMapa(map)`**, llamada en `arrancarPartida` antes de `ponerBots`. Si el mapa no cambió, no hace nada.
  - Clásico → Infinito: `removePlatform` de cada fixture de `buildLevel`, `world.DestroyBody(ground)`, `damage.killSensors.clear()`, `pickups.dispose()` y `new Pickups(world, damage, [])`, `flood.dispose()` y `flood = new RisingFlood(water)`, `climb = new Climb(...)`, `damage.drownSurface = ...` y `wallContact.invalidate()`.
  - Infinito → Clásico: lo inverso, con `buildLevel` y `new Flood(store, water)`.
- **`ponerBots`** crea los bots con `level: climb ? climb.level : LEVEL`.
- **`reiniciarRonda`**: en Infinito, `climb.reset(seed)` **antes** de `spawnRobot`, porque el rayo necesita la etapa 0.
- **`spawnOnGround`**: el rayo sale de `CLIMB.spawnRayTop` en Infinito y de `LEVEL.bounds.maxY` en Clásico.
- **`limpiarParticulas`**: `minY` = `flood.floor` en Infinito y `LEVEL.bounds.minY` en Clásico. x sigue en 0–56.
- **Dibujo:** `drawLevel(ctx, climb ? climb.level : LEVEL, scale)`, `collectSurfaces(players, solids, reach, camera bottom)` y `drawHud(..., flood.config.start)`.
- **`__TEST_HOOKS__`:** `flood`, `pickups`, `climb` y `map` como getters, porque cambian con el mapa.

### Orden en el frame (Infinito)

Pasos fijos como hoy (`flood.step` = `RisingFlood.step` antes de `buoyancy.apply` y `stepWorld`; `damage.process` aplica el ahogo después). Después de los pasos: `sonarEventos` → `limpiarParticulas` → `store.trim` → `camera.setBounds(climb.cameraBounds(y del torso más bajo))` → `camera.update` → `climb.update({ top: camera.top, level: flood.level })` → `invalidate`/`setNav` si hubo cambios → dibujo.

## 16.7 Riesgos técnicos y decisiones

| Riesgo | Decisión |
|---|---|
| **CFL del campo con el nivel sin techo** | **Fondo efectivo que acompaña** (`depth` = 6 m, `raiseFloor`). Sin fondo, a 150 m (etapa 5) `c = √(g h)` = 38,7 m/s, unos 16 subpasos, contra 4,56 medidos en Clásico (W6). Además, Saint-Venant vale solo para `h ≪ λ`: a 150 m daría ondas cortas a 39 m/s, cuando las reales en aguas profundas no dependen de `h`. `U_MAX` también supone `h ≤ 15 m`. Con 6 m: `c` = 7,7 m/s, unos 4 subpasos, costo constante en cualquier etapa. Lo que está a más de 5 m bajo la superficie se destruye, así que nadie vivo lo nota. `buoyancy.js` solo recorta los polígonos por arriba en `η` e `immersion.js` compara con `η`: un cuerpo o una partícula bajo el fondo efectivo sigue flotando y sumergido (*verificado leyendo* el código) |
| **Columnas fuera de las paredes que se angostan** | Span activo con columnas congeladas (16.5): no se integran, no se leen ni se dibujan, y conservan su volumen (sin sumidero nuevo). El agua bajo el voladizo de la pared queda atrapada, que es lo físico |
| **Partículas fuera del ancho** | No pueden estar fuera de las paredes (sólidas, hasta x = −20 y 76). Las que caen bajo el fondo efectivo (inmiscibles que se hunden, o lo que cae por donde había pisos destruidos) se destruyen con `SINK.OUT` cuando `y < flood.floor − 1`. Las miscibles bajo el agua ya las absorbe `Immersion` |
| **Precisión de float** | Box2D y LiquidFun en float32: a 256–512 m el ulp es 3·10⁻⁵ m, contra `linearSlop` 0,005: sin problema hasta miles de metros. El campo es Float64. **El límite real es la grilla de LiquidFun:** `computeTag` (fuente de LiquidFun 1.1, `b2ParticleSystem.cpp`) usa 12 bits para `y / diámetro` con un corrimiento de 2048, y da la vuelta cada 4096 celdas. Con `r` = 0,06 hay **costuras** en `y_s = 245,76 + 491,52 k` m. Ahí se pierden los contactos partícula–partícula, y los partícula–cuerpo de toda fixture cuya caja cruza la costura (el enumerador queda vacío). **Decisión:** ningún sólido generado cruza una costura. Las paredes se parten en dos cuerpos en `y_s`. Si una plataforma (tope a tope − 0,4) quedaría a menos de `seamMargin` de `y_s`, la fila baja hasta quedar entera debajo, con `dy ≥ 1,7` y el alcance intacto. Los contactos entre partículas en la costura se aceptan como defecto. Sin origen flotante: mover mundo, partículas y campo cuesta demasiado para el 24/11 y el agua tarda unos 9 min en llegar a 245 m. Las costuras se calculan con el radio float32 del sistema en tiempo de ejecución |
| **`LEVEL.bounds`, cámara y `buildLevel`** | `LEVEL` no se muta y sigue siendo el clásico, y la x del campo y la limpieza (0–56). Infinito no usa `buildLevel`: `Climb` construye la etapa 0 desde `LEVEL.solids`, sin las paredes y solo con las plataformas con tope ≤ `baseMaxTop`. La cámara recibe `cameraBounds` con `maxY: Infinity`. `floodLevel`, `freeWidth` y `levelOfArea` (`maxY` = 32) son solo de `Flood` |
| **Sensor de la pileta** | No se crea en Infinito. Lo reemplaza la regla de ahogo por superficie (16.5), en todo el mapa y desde el segundo 0 |
| **Rayo de aparición** | En Infinito sale de `spawnRayTop` = 9 m: debajo de toda fila generada y encima de lo que hay sobre x = 7,5 y 48,5 en el clásico (islas, tope 4). Desde `bounds.maxY` pegaría en una fila generada |
| **Memoria nativa** | Cuerpos estáticos de una fixture, creados y destruidos simétricamente. Unos 110 vivos a la vez (unos 40 KB). El árbol dinámico y el `b2BlockAllocator` reutilizan lo liberado. Ningún temporal por elemento |
| **Grilla de dibujo fija (64 × 40 m)** | Sigue a la cámara (16.6). Si no, arriba de 38 m todo cae en la fila del borde |

### Verificado leyendo el código (19/11)

- `ShallowWater`: los bordes `f = 0` y `f = N` son reflectivos por espejo (la base del span). `deposit` y `sample` recortan a `[0, N)`, y `volume()` suma `[0, N)`.
- `Immersion.step` absorbe con `y ≤ η + r` sin mirar la profundidad, y `Buoyancy` recorta solo en `η`.
- `OneWayPlatforms.addPlatform`/`removePlatform` existen; `removePlatform` limpia bajadas y pares.
- `Pickups` no tiene alta ni baja por punto.
- `Bot.nav` usa índices de nodo en `committed`, `goal` y `foeNode`.
- `WallContact.invalidate` hace falta al destruir cuerpos.
- `Menu.load` hace que la elección guardada gane sobre el default.
- `tests/helpers/game.js` arranca con la elección del menú: sin `options.map`, todos los tests pasarían a Infinito.

### Por verificar en ejecución (no se pudo correr código en esta pasada)

- **Costura de LiquidFun:** soltar 50 partículas sobre una plataforma de prueba con tope en `y_s + 1` y otras 50 sobre una que cruza `y_s`. Las primeras quedan apoyadas y las segundas la atraviesan. Si las primeras también la atraviesan, el límite es más bajo de lo que dice el fuente: se informa antes de seguir.

## 16.8 Criterios para `developer` (Node, LiquidFun real)

| Id | Criterio | Esperado |
|---|---|---|
| C1 | Invariante de alcance: `ClimbGenerator` con semillas 1–50 hasta y = 400 m. Cada plataforma con solapamiento horizontal ≥ 1,5 m y desnivel ≤ 3,3 m con alguna de la fila anterior (o de la base), dentro de las paredes, a ≥ 1,5 m de sus vecinas, justicia ±20 % entre lados; filas con `dy` ∈ [2,5; 3,2] (o [1,7; 3,2] junto a una costura); ninguna plataforma ni pared cruza una costura; pares de armas por etapa según `period` y armas solo de `weights` | 0 violaciones; misma semilla, mismas filas |
| C2 | Heap: `Climb` con mundo propio, `level` y `top` subiendo hasta generar y liberar 5 etapas. `heapTop()` (como en `one-way-platforms.test.js`) medido tras la etapa 1 y tras la etapa 6 | No sube; `world.GetBodyCount()` ≤ 200 en todo momento; `platforms.platforms.size` y `pickups.points.length` iguales a los vivos de `climb.level`. Se acepta la deriva de ~16 B por cuerpo del `b2BlockAllocator` (propia de Box2D, también en un lazo sin código del juego), con un margen de 2 trozos de 16 KiB |
| C3 | Costo del campo: `ShallowWater` + `RisingFlood` (JS puro) con `CLIMB.flood` ×10 en velocidad hasta `η*` ≥ 150 m; se miden los últimos 600 pasos | Subpasos medios ≤ 6, `capHits` = 0, `halvings` = 0, `min h ≥ 0`; ms por `water.step` ≤ 1,5 × el de Clásico con el agua en 15 m (misma máquina, se imprimen los dos) |
| C4 | Bot que sube: Infinito, `?bot=2`, semillas 1, 2 y 3; J1 sin input e inmortal (el test reemplaza `drown`, `hurt`, `burn` y `takeDamage` de J1 por no-op, para que no muera al caer cuando se hunde la base) | El torso de J2 pasa y = 60 m vivo, en ≤ 240 s simulados, en 3 de 3 semillas |
| C5 | Ronda que termina por agua: Infinito, sin pads | Los dos robots mueren por `drown` y `match` pasa a `roundOver` antes de los 30 s de ronda |
| C6 | Menú: `new Menu({ storage: null }).choice.map` | `"infinite"`; Infinito no está deshabilitado |
| C7 | Libro del campo: en C3 y en C5, en cada paso | `volume()` = inicial + absorbido + `sourced` − `floorCut.volume`, error < 10⁻⁶ relativo |
| C8 | Sin regresiones | `node --test tests/` en verde con los tests existentes en Clásico |
| C9 | Costura (16.7, por verificar) | Como está descrito; si falla, se informa |

## 16.9 Orden de recorte (si no entra para el 24/11)

No recortable: generador con su invariante (C1), `RisingFlood` con fondo efectivo y span, regla de ahogo, generar y liberar, `setNav` del bot, menú y helper de tests.

Recortable, en este orden (se recorta primero lo de arriba):

1. **Costuras de LiquidFun** (partir paredes, bajar filas) y C9: solo importa arriba de 245 m.
2. **Relleno de agua profunda** (`deep` en `drawWater`). Sin él, se ve el fondo efectivo cuando la cámara baja a más de 6 m bajo la superficie.
3. **Densidad progresiva de armas:** `period` fijo en 2 para toda etapa ≥ 1, con los mismos `weights` por etapa.
4. **Span activo del campo:** el campo queda en x 0–56 y `drawLevel` se dibuja después de `drawWater`. Hay agua dentro de las paredes, aunque oculta, y sube el costo (C3 se mide igual).
5. **Cámara acotada al ancho de la etapa:** queda en `{ 0, 56, 0, Infinity }`.

## 16.10 Equipo inicial, bot y premio por etapa (decisiones del game designer, 19/11)

- **Sin líquidos al empezar.** En Infinito cada robot arranca con `CLIMB.loadout` (`weapon: null`, sin tanques): solo melee. Sin arma, el gatillo no hace nada, no se dibuja la mira láser, la rueda de armas no se abre y el HUD no muestra tanque. Recoger un punto de aparición da el arma con el tanque lleno y, si el robot no tenía arma equipada, la equipa. `equipLoadout(player, loadout = LOADOUT)` recibe el equipo del mapa.
- **El bot busca armas.** Sin arma, o con todos los tanques vacíos, si hay un punto de aparición listo en un nodo sobre la línea segura y a `BOT.pickupReach` (3) aristas o menos de la ruta de menor costo, su meta es ese punto (el más barato). Si no, sigue como antes. El golpe contra un rival cercano (< 2 m) sigue teniendo prioridad.
- **Premio por etapa.** El primer robot que se apoya en una plataforma de la etapa `n ≥ 1` (tope ≥ base de la etapa) gana el premio de esa etapa, una vez por etapa y por ronda: según `stagePrize`, la vida al máximo (`repair: "full"`) y todos sus tanques llenos (`refill`). `StagePrizes.detect` solo anota eventos `{ k, stage }` después de `stepWorld` y `StagePrizes.apply` es el único lugar que los aplica (#162 cambiará la vida al máximo por daño % a 0 acá). Un cartel chico arriba, `ETAPA n · J1`, dura `banner` s y suena el efecto `pickup`.
- **Controles (#163).** El cartel de controles ya no se dibuja durante la partida: `drawMenu` lo dibuja (`CONTROLS_HELP`) debajo de las filas, solo en el menú principal.
