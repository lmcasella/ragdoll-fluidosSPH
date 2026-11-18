# 9. Arquitectura y rendimiento

Los **patrones** que sigue el código (raíz de composición, paso fijo, juntar y actuar, sistemas por módulo, intención en lugar de dispositivo, máquinas de estado, datos en tablas, memoria nativa, contrato de RagImporter) están en `CLAUDE.md`. Esta sección describe los módulos y el rendimiento.

## 9.1 Módulos

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Raíz de composición: crea mundo, sistemas y jugadores; loop; giro y golpe. Desde #13 ✅, el disparo es de `ShotEmitter`: `index.html` crea el sistema de disparos (radio 0,1 m, `maxCount` 1.500, `destroyByAge(false)`), carga el inventario con `equipLoadout` al crear cada robot, convierte `state.weapon` / `weaponStep` en el `id` del arma y llama a `emitter.fire` una vez por frame. Desde #39 ✅ crea `Immersion` después de `Flood`, llama a `immersion.step(dt)` en cada paso entre `stepWorld` y `damage.process`, y lo suma a `globalThis.game`. `limpiarParticulas` deja de borrar los disparos que entran al agua. ✅ #41: `limpiarParticulas` no vence las armas con `persist` y aplica `PERSIST_MAX`; `move(inputs[k], STEP_SETTINGS.dt)` |
| `js/ActiveRagdoll.js` | Un jugador: vida, estados (miel, quemadura, aturdido, ahogado; mojado ✅ #22), movimiento, mira, golpe, clips. Desde #13 ✅ también guarda el inventario (`weapon`, `tanks`), que copia en `copyStateFrom`, pero no conoce la tabla de armas. ✅ #41: la miel pasa a ser el estado `pegado` (`stick()`, `stickyTimer` en s, datos `STICKY`), `move(input, dt)` recibe el `dt` del paso y `fixtureBoxes()` devuelve las cajas de sus fixtures en un `Float32Array` reutilizado |
| `js/weapons.js` ✅ #13 | Armas como datos y emisor de chorros. Exporta `FLUID` (se movió desde `damage.js`), `WEAPONS` (tabla, [04-fluidos](04-fluidos.md#tabla-de-armas-datos-en-weapons-jsweaponsjs)), `LOADOUT`, `weaponById(id)`, `cycleWeapon(player, step)`, `equipLoadout(player)`, `particleDamage(weapon)` (`dps / rate`) y `ShotEmitter`. `ShotEmitter(system, damage, weapons = WEAPONS)` crea los objetos nativos de trabajo una vez, `fire(k, player, wants, dt, now)` emite y descuenta el tanque, `reset()` borra los créditos y exige soltar el botón, y `dispose()` libera los nativos. Recibe `DamageSystem` por constructor y usa el `Box2D` global. Desde #40 ✅ suma `SHOT_SYSTEM` (radio, tope y fuerzas del sistema de disparos) y **solo importa `particles.js`** (flags). ✅ #41: columna `persist` en `WEAPONS` y `PERSIST_MAX` (300), que usa `limpiarParticulas` en `index.html` |
| `js/particles.js` ✅ #40 | Creación de sistemas de partículas a partir de datos. `PARTICLE` (flags de LiquidFun usadas por el juego) y `createParticleSystem(world, params)`: aplica cada clave con su `set_` del `b2ParticleSystemDef`, falla ante una clave desconocida y libera el def. **No importa nada.** Es el único módulo que conoce `b2ParticleSystemDef` ([07-sph §7.5](07-sph.md#75-parámetros-por-sistema--40)) |
| `js/Input.js` | Gamepad y teclado → estado por jugador. Desde #13 ✅ suma `fire` (mantenido) a `action` (flanco) |
| `js/camera.js` | Encuadre compartido y conversión pantalla ↔ mundo |
| `js/level.js` | Datos del nivel, sólidos, sensor y agua de la pileta. Desde #40 ✅: `LEVEL.pool.flags` y `LEVEL.pool.physics` (fuerzas del agua del nivel); `fillPool` crea el sistema con `createParticleSystem` y `fillPoolWater` aplica las flags al grupo. Importa solo `particles.js` |
| `js/raycast.js` | Rayos con callback reutilizado, uno por mundo |
| `js/damage.js` | Contact listener: impactos, partículas, pileta → daño; robots bajo el nivel de la inundación → mojado (✅ #22). Desde #13 ✅: tramos de disparo (`shotId`, `tagParticle`, `liveShotFloor`, `SHOT_SLICE` 0,1 s, `SHOT_LIFETIME` 6 s) y daño del ácido por caudal. Importa de `weapons.js` solo datos (`FLUID`, `WEAPONS`). Desde #18 ✅: agua → `soak()` sin consumir la partícula. Desde #39 ✅, `fluidFromColor` pasa a `weapons.js` (derivado de la tabla) y `damage.js` lo importa. ✅ #41: en `process`, consulta por cercanía (sin callbacks) de las partículas de miel (`fluidFromColor`) contra `fixtureBoxes()` de cada robot → `stick()`; la miel deja de encolarse en el callback y no se consume |
| `js/immersion.js` ✅ #39 | Puente agua del nivel → disparos ([07-sph §7.6](07-sph.md#76-puente-agua--disparos--39)). `Immersion(shotSystem, levelWater, { weapons = WEAPONS, bounds = LEVEL.bounds, gravity = 10, ...IMMERSION })`. `IMMERSION` (exportado) = `{ cell: 0.5, calmSpeed: 4, minNeighbors: 4, fullDepth: 0.5 }`. `step(dt)`, una vez por paso después de `stepWorld`: arma la grilla de agua tranquila, escribe la velocidad de los disparos sumergidos según `WEAPONS[].immersion` y llena `submerged`/`kinds`/`count` (para #30). `reset()` deja `count` en 0. **Solo importa datos**: `weapons.js` (`WEAPONS`, `fluidFromColor`) y `level.js` (`LEVEL`). No crea objetos de `Box2D.*`: buffers JS tipados creados en el constructor y lectura y escritura directa en `HEAPF32`/`HEAPU8`, con punteros releídos en cada paso. Un solo motivo de cambio: la interacción entre los dos sistemas de partículas. No va en `flood.js` (la pileta existe sin inundación) ni en `damage.js` (no es daño) |
| `js/round.js` | Rondas, victorias, cámara lenta, revancha; reloj de ronda (`roundTime`, ✅ #22) |
| `js/flood.js` ✅ #22 | Inundación: nivel objetivo según el tiempo de ronda, emisión de lluvia en el agua del nivel, escurrido de charcos altos y reinicio. Importa solo `level.js` (datos). No aplica daño: expone `level` (curva) y `surfaceAt(x)` (superficie real) y `DamageSystem` moja. Desde #40 ✅ aplica `LEVEL.pool.flags` a su `b2ParticleDef`, para que la lluvia tenga las mismas flags que la pileta |
| `js/render.js` | Dibujo del nivel, robots, fluidos, mira, golpes y HUD. Desde #13 ✅, barra de tanque (recibe la tabla de armas como parámetro y no la importa). Desde #18 ✅, chispas de mojado |
| `js/clips.js` | Transformaciones de clips antes de `parse` (`walk_back`) |
| `lib/` | RagImporter, copiado de ragassembler2d `d067775`; no se edita acá |
| `assets/*.rag.json` | Rigs (robot en uso; dino sin uso) |
| `tests/` | Tests de humo, que corre el CI antes de cada deploy (PR #3) |

Previsto: un módulo de métricas (#29).

**Dependencias de `js/weapons.js`** (#13, con el cambio de #40):
- `damage.js` → `weapons.js`: solo datos. No hay ciclo: `weapons.js` solo importa `particles.js`, que no importa nada.
- `weapons.js` → `particles.js` y `level.js` → `particles.js` (#40).
- `index.html` → `weapons.js`.
- `immersion.js` → `weapons.js` y `level.js` (#39): solo datos y sin ciclos, porque ninguno de los dos importa `immersion.js`.
- `render.js` y `ActiveRagdoll.js` no lo importan: reciben datos.

**Prueba de gameplay en Node** (#13): `tests/helpers/game.js` carga el `<script type="module">` de `index.html` con LiquidFun real y stubs de DOM: canvas con contexto no-op, `window`, `fetch` de archivos locales, `requestAnimationFrame` manual, `performance.now` controlado y `navigator.getGamepads` simulado.
- Para medir, `index.html` deja un handle de solo lectura en `globalThis.game` (`players`, `particleSystem`, `damage`, `emitter`, `match`; con #39, `immersion`). Es parte de la raíz de composición y ningún módulo de `js/` lo lee.
- Los tests que necesitan otra disposición modifican `LEVEL.spawns` importando `js/level.js` antes de cargar el script. Es la misma instancia del módulo.

## 9.2 Rendimiento medido

| Escenario | Física + lógica por frame |
|---|---|
| Dos robots, pileta (726 partículas) | ~1,4 ms (Node, 18/11) |
| Dos robots, inundación al nivel máximo (4.430 partículas: 3.953 gotas + 477 de la pileta) | ~5,0 ms: `stepWorld` + `flood.step` + `damage.process` + `move`/`updateStatus` (Node, 300 frames, `tests/flood.test.js`) |
| Ídem con #40 (presión estática en el agua del nivel; 4.368 partículas) | ~7,2 ms ([07-sph §7.5](07-sph.md#75-parámetros-por-sistema--40)) |
| Ídem con #39 ✅ y los dos jugadores disparando agua al agua (4.368 partículas de agua, hasta 476 disparos, ~225 sumergidos de media) | ~8,2 ms (8,9 con la suite en paralelo) de física y lógica por frame: `world.Step` 7,91 + `flood.step` 0,10 + `immersion.step` 0,135 (un paso por frame, 0,135 ms/paso) + `damage.process` 0,10 (Node, 300 frames, `tests/immersion.test.js`). El puente cuesta ~0,14 ms, dentro de lo estimado; la meta de 8 ms queda apenas superada por `world.Step`, no por el puente |
| Consulta de miel #41 ✅ (`DamageSystem.stickHoney`: lectura de color de las partículas del sistema de disparos y cajas de 2 robots), con 300 partículas de miel | ~0,02 ms por paso, de los cuales 0,004 ms son `fixtureBoxes()` de los dos robots (Node, 3.000 llamadas) |

El dibujo todavía no está medido: se mide con el panel de métricas (#29).

## 9.3 Presupuestos y métricas

- **Memoria:** el heap de LiquidFun es **fijo de 16 MiB**. Se fija un tope por sistema con `maxCount`. Con 20.000 partículas todavía entra (medido).
- **Tiempo:** un frame a 60 FPS dura 16,6 ms. Meta: física ≤ ~8 ms, el resto para el render.

**Benchmark de partículas** (18/11, Node, mismo build; agua en reposo en una caja de 60 m):

| Partículas | 1 paso por frame | 8 subpasos por frame (`stepWorld`) |
|---|---|---|
| 2.000 | 0,5 ms | 2,0 ms |
| 5.000 | 0,9 ms | 4,5 ms |
| 10.000 | 1,2 ms | 8,8 ms |
| 20.000 | 1,9 ms | 14,4 ms |

**Lectura:**
- El costo crece casi lineal con N: LiquidFun ordena las partículas por celda y solo arma pares entre vecinas.
- Lo que más pesa son los **8 subpasos**, que exige RagImporter para la estabilidad de los ragdolls.
- Techo razonable: **8.000–10.000 partículas** en total.

**Presupuesto de la inundación** (#22):
- **Partículas:** a nivel máximo (15 m) hay ~636 m² de agua sobre la pileta → ~4.000 gotas a 6,4/m² (calibrado), más 477 de la pileta (medido): **~4.500** en el agua del nivel (medido: 4.430 con el nivel al tope). Tope `maxCount` = 5.500. Con los disparos, el total queda por debajo del techo de 8.000.
- **Tiempo esperado:** ~4,5 ms de física con 5.000 partículas (tabla de arriba) más robots y disparos: **~6 ms**, dentro de los 8 ms. Con radio 0,2 m serían ~7.800 partículas y no entraría.
- **Memoria:** 5.500 partículas están muy por debajo de las 20.000 medidas dentro de los 16 MiB.
- **Código por paso sin memoria nativa nueva:** `Flood` crea en el constructor un `b2ParticleDef`, dos `b2Vec2` y un `b2ParticleColor`, los reutiliza en cada gota y los libera en `dispose()`. Las posiciones, velocidades y marcas se leen directo del heap (`HEAPF32`/`HEAP32`), como `limpiarParticulas`.

**Medición** (verificación de #22): un test en Node con LiquidFun real que arma el nivel, la pileta, dos robots y la inundación con `roundTime` forzado al tope, deja asentar el agua y mide el promedio de ms de `stepWorld` + `flood.step` + `damage.process` en 300 frames. El valor se anota en 9.2 junto con la cantidad de partículas. Se repite con #40 si cambian las fuerzas o las flags del agua del nivel (sobre todo con `staticPressure`, [07-sph §7.5](07-sph.md#75-parámetros-por-sistema--40)). El test solo falla por encima de 16 ms (para no ser frágil en CI); la meta de 8 ms se revisa a mano con el número anotado. Si no entra, se aplican las optimizaciones de abajo desde la 2.

**Presupuesto del sistema de disparos** (✅ #13):
- **Partículas:** `maxCount` = 1.500 y `destroyByAge(false)`. Con todos los tanques llenos, un jugador emite como mucho 600 partículas (300 + 135 + 90 + 75). Cada partícula vive como máximo 6 s (`SHOT_LIFETIME`), así que dos jugadores dejan ~1.200 vivas en el peor caso. Desde #41 🔨, la miel no vence y tiene su propio tope (`PERSIST_MAX` = 300): 1.200 + 300 = 1.500, el `maxCount`. Con el agua del nivel (5.500), el total queda en ~7.000, por debajo del techo de 8.000.
- **Tope:** el emisor no crea partículas por encima del tope y en ese caso no descuenta el tanque. No se usa el reciclado por edad del motor: hace falta `lifetime` por partícula y el build no expone su control en el sistema ([04-fluidos](04-fluidos.md#tope-de-partículas-del-sistema-de-disparos)).
- **Sin memoria nativa por frame:** `ShotEmitter` crea en el constructor un `b2ParticleDef`, dos `b2Vec2` y un `b2ParticleColor` por arma, y los libera en `dispose()`. `userData` y las posiciones se leen y escriben directo en el heap.

**Presupuesto del puente agua → disparos** (✅ #39):
- **Tiempo:** con la inundación al tope ya se usan ~7,2 ms (#40), así que al puente le quedan **~0,8 ms**. Estimado: ~0,1–0,15 ms por paso (una pasada por ≤ 5.500 partículas de agua, ~3 pasadas por una grilla de 7.168 celdas y una por ≤ 1.500 disparos), ≤ 0,3 ms por frame. Si la medición supera 0,5 ms, primero se recorre solo la caja que cubre a los disparos y después se arma la grilla un paso sí y otro no.
- **Memoria:** sin objetos nativos. Arrays tipados de JS (~7.168 × 6 valores, < 200 KiB) creados en el constructor y fuera del heap de 16 MiB.

**Optimizaciones previstas para la inundación**, en orden y midiendo cada una:
1. Partículas más grandes en un sistema propio (radio 0,25 m: ~1,6 veces menos partículas que a 0,2 m y ~6 veces menos que a 0,1 m para el mismo volumen). **Adoptada en #22.**
2. Pausar ese sistema (`SetPaused`) en parte de los subpasos, compensando el tiempo. Ojo: pausa también la pileta, porque comparten sistema.
3. Reemplazar el agua quieta del fondo por un bloque estático con sensor (híbrido: "cuándo usar qué").
4. Render en GPU (#26).

**Panel de métricas** 🔨 #29: partículas por sistema, ms de física y de render, rayos por frame, contactos partícula↔cuerpo y FPS. Base de los benchmarks de la defensa.
