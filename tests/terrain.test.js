/**
 * Terreno de densidad (#346, docs/design/05-escenario.md §5.5) con LiquidFun real: la grilla de cada tramo, su forma en el
 * Clásico y en el Infinito, el tope de reconstrucciones por frame y la reconstrucción forzada bajo un robot parado.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadGame } from "./helpers/game.js";

const require = createRequire(import.meta.url);
globalThis.Box2D ??= require("../vendor/liquidfun.js");

const { LEVEL, buildLevel, SOLID_FRICTION } = await import("../src/level/level.js");
const { Climb } = await import("../src/level/climb.js");
const { Terrain, TERRAIN } = await import("../src/level/terrain.js");
const { DensityGrid, DENSITY_CELL_SIZE } = await import("../src/level/densityGrid.js");
const { OneWayPlatforms, ONE_WAY } = await import("../src/level/platforms.js");
const { Pickups } = await import("../src/level/pickups.js");
const { fixtureBounds } = await import("../src/core/engine/box2d.js");
const { mergeBounds } = await import("../src/core/math/geometry.js");

/** Distancia máxima entre un vértice del contorno y la esquina de su rectángulo, en m (1 µm). */
const RING_TOLERANCE = 1e-6;
/** Diferencia máxima entre las cajas físicas de la forma nueva y la caja de antes, en m (un `float` de 32 bits a unos 250 m resuelve 3e-5). */
const BOUNDS_TOLERANCE = 1e-4;
const FRICTION_TOLERANCE = 1e-6;
const CORNERS = 4;
const COMPONENTS_PER_VERTEX = 2;
/** Diferencia máxima entre una grilla y su rectángulo, en m: el ancho y el alto son un número entero de celdas. */
const GRID_EXACTNESS = 1e-12;
/** Desvío relativo máximo del tamaño de celda respecto de 5 cm en una grilla de al menos dos celdas: redondear el número de celdas cambia el tamaño a lo sumo en media celda de cada dos. */
const CELL_SIZE_RELATIVE_TOLERANCE = 0.25;
const MINIMUM_CELLS_FOR_SIZE_CHECK = 2;
const CROWD_COUNT = 10;
const CROWD_SPACING = 10;
const INFINITE_PLATFORMS = 200;
const INFINITE_SEED = 5;
const GENERATION_STEP = 30;
const FIRST_GENERATION_TOP = 60;
const FORCED_REBUILDS = 300;
const SETTLE_FRAMES = 60;
/** Lo máximo que se puede mover un robot parado cuando se rehace el tramo que pisa, en m (1 cm). */
const STANDING_TOLERANCE = 0.01;
const PROBE_BYTES = 1 << 20;
/** Deriva tolerada del tope del heap: crear y destruir fixtures deja unos 16 B por elemento y el heap crece de a 16 KiB. */
const HEAP_DRIFT = 2 * (16 * 1024 + 16);
const STEP_X = 4.5;
const ISLAND_TOP = 4;
const BUTTON_A = 0;

function newWorld() {
    const gravity = new Box2D.b2Vec2(0, -10);
    const world = new Box2D.b2World(gravity);
    Box2D.destroy(gravity);
    return world;
}

function heapTop() {
    const pointer = Box2D._malloc(PROBE_BYTES);
    Box2D._free(pointer);
    return pointer;
}

/** Rectángulo `{ x, y, w, h }` (centro y tamaño) que cubre la grilla de un tramo. */
function rectangleOf({ grid }) {
    return { x: grid.originX + grid.width / 2, y: grid.originY + grid.height / 2, w: grid.width, h: grid.height };
}

/** Caja que ocupaba un sólido cuando era una caja de Box2D (`SetAsBox`), medida en un cuerpo de prueba. */
function oldBoxBounds(world, { x, y, w: width, h: height }) {
    const definition = new Box2D.b2BodyDef();
    const body = world.CreateBody(definition);
    Box2D.destroy(definition);
    const shape = new Box2D.b2PolygonShape();
    const center = new Box2D.b2Vec2(x, y);
    shape.SetAsBox(width / 2, height / 2, center, 0);
    const bounds = fixtureBounds(body.CreateFixture(shape, 0), { minX: 0, minY: 0, maxX: 0, maxY: 0 });
    Box2D.destroy(center);
    Box2D.destroy(shape);
    world.DestroyBody(body);
    return bounds;
}

function assertBoundsClose(actual, expected, message) {
    for (const key of ["minX", "minY", "maxX", "maxY"]) {
        assert.ok(Math.abs(actual[key] - expected[key]) <= BOUNDS_TOLERANCE, `${message}: ${key} ${actual[key]} vs ${expected[key]}`);
    }
}

/**
 * Comprueba un sólido entero contra sus tramos: cada tramo tiene un contorno de 4 vértices sobre las esquinas de su
 * rectángulo (a menos de 1 µm), un solo polígono con la fricción del nivel y su registro de atravesable, y los tramos
 * juntos tienen la misma caja que la caja de antes.
 */
function assertSolid(world, platforms, solid, tiles) {
    assert.ok(tiles.length >= 1, "el sólido tiene tramos");
    if (solid.oneWay) assert.equal(tiles.length, 1, "una atravesable es un solo tramo");
    const merged = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const tile of tiles) {
        const rectangle = rectangleOf(tile);
        assert.equal(tile.rings.length, 1, "un solo contorno");
        const ring = tile.rings[0];
        assert.equal(ring.length / COMPONENTS_PER_VERTEX, CORNERS, "el contorno simplificado tiene 4 vértices");
        const corners = [
            [rectangle.x - rectangle.w / 2, rectangle.y - rectangle.h / 2],
            [rectangle.x + rectangle.w / 2, rectangle.y - rectangle.h / 2],
            [rectangle.x + rectangle.w / 2, rectangle.y + rectangle.h / 2],
            [rectangle.x - rectangle.w / 2, rectangle.y + rectangle.h / 2],
        ];
        for (const [cornerX, cornerY] of corners) {
            const nearest = Math.min(...Array.from({ length: CORNERS }, (_, index) => Math.hypot(ring[COMPONENTS_PER_VERTEX * index] - cornerX, ring[COMPONENTS_PER_VERTEX * index + 1] - cornerY)));
            assert.ok(nearest < RING_TOLERANCE, `esquina (${cornerX}, ${cornerY}) a ${nearest} m del contorno`);
        }
        assert.equal(tile.polygons.length, 1, "un solo polígono");
        assert.equal(tile.fixtures.length, 1, "un solo fixture");
        const fixture = tile.fixtures[0];
        assert.ok(Math.abs(fixture.GetFriction() - SOLID_FRICTION) <= FRICTION_TOLERANCE, "misma fricción");
        assert.equal(platforms.platforms.has(Box2D.getPointer(fixture)), Boolean(solid.oneWay), "registro de atravesable");
        mergeBounds(merged, fixtureBounds(fixture, { minX: 0, minY: 0, maxX: 0, maxY: 0 }));
    }
    assertBoundsClose(merged, oldBoxBounds(world, solid), "misma caja que la de antes");
}

test("la grilla ajusta el tamaño de celda para que el ancho y el alto sean múltiplos enteros de celda", () => {
    for (const [width, height] of [[3.6, 4], [12, 0.4], [2.03, 0.4], [0.01, 0.01]]) {
        const grid = new DensityGrid({ originX: 1, originY: 2, width, height });
        assert.ok(Math.abs(grid.columns * grid.cellWidth - width) < GRID_EXACTNESS);
        assert.ok(Math.abs(grid.rows * grid.cellHeight - height) < GRID_EXACTNESS);
        assert.ok(grid.columns >= 1 && grid.rows >= 1);
        if (width >= MINIMUM_CELLS_FOR_SIZE_CHECK * DENSITY_CELL_SIZE) assert.ok(Math.abs(grid.cellWidth / DENSITY_CELL_SIZE - 1) <= CELL_SIZE_RELATIVE_TOLERANCE);
        assert.equal(grid.values.length, grid.columns * grid.rows);
        assert.equal(grid.dirty, false);
    }
});

test("fillRectangle llena la grilla entera con 1, deja la fracción cubierta en las celdas parciales y marca la grilla sucia", () => {
    const grid = new DensityGrid({ originX: 0, originY: 0, width: 1, height: 1 });
    grid.fillRectangle({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
    assert.equal(grid.dirty, true);
    assert.ok(grid.values.every((value) => value === 1));
    grid.fillRectangle({ minX: 0, minY: 0, maxX: 0.5, maxY: 1 });
    assert.equal(grid.values[0], 1);
    assert.equal(grid.values[grid.columns - 1], 0);
    grid.fillRectangle({ minX: 0, minY: 0, maxX: 1 + grid.cellWidth / 2, maxY: grid.cellHeight / 2 });
    assert.ok(Math.abs(grid.values[0] - 0.5) < 1e-6, "media celda de alto");
    assert.equal(grid.values[grid.columns * 2], 0);
});

test("Clásico: cada tramo entero del piso, las paredes y las plataformas tiene 4 vértices, un polígono y la misma caja, fricción y registro", () => {
    const world = newWorld();
    const platforms = new OneWayPlatforms(world);
    const level = buildLevel(world, LEVEL, { platforms });
    let solidsChecked = 0;
    for (const solid of LEVEL.solids) {
        if (solid.breakable) continue;
        const inside = [...level.terrain.tiles].filter((tile) => {
            const rectangle = rectangleOf(tile);
            return (
                Math.abs(rectangle.x - solid.x) <= solid.w / 2 + RING_TOLERANCE &&
                Math.abs(rectangle.y - solid.y) <= solid.h / 2 + RING_TOLERANCE &&
                rectangle.w <= solid.w + RING_TOLERANCE &&
                rectangle.h <= solid.h + RING_TOLERANCE
            );
        });
        if (!solid.oneWay) for (const tile of inside) assert.ok(rectangleOf(tile).w <= TERRAIN.maxTileSize + RING_TOLERANCE && rectangleOf(tile).h <= TERRAIN.maxTileSize + RING_TOLERANCE, "tramo de hasta 4 m por lado");
        const tileArea = inside.reduce((sum, tile) => sum + rectangleOf(tile).w * rectangleOf(tile).h, 0);
        assert.ok(Math.abs(tileArea - solid.w * solid.h) < 1e-6, `los tramos de ${solid.kind} en (${solid.x}, ${solid.y}) cubren el sólido`);
        assertSolid(world, platforms, solid, inside);
        solidsChecked++;
    }
    assert.equal(solidsChecked, LEVEL.solids.filter((solid) => !solid.breakable).length);
    assert.equal(level.breakableFixtures.length, LEVEL.solids.filter((solid) => solid.breakable).length, "las rompibles siguen siendo cajas");
    for (const { fixture } of level.breakableFixtures) {
        assert.ok(platforms.platforms.has(Box2D.getPointer(fixture)), "la rompible atravesable está registrada");
        assert.ok(![...level.terrain.tiles].some((tile) => tile.fixtures.includes(fixture)), "y no es del terreno");
    }
    assert.equal(level.killSensors.size, 1, "el sensor de la pileta sigue");
    assert.equal(platforms.platforms.size, LEVEL.solids.filter((solid) => solid.oneWay).length);
    level.dispose();
    assert.equal(platforms.platforms.size, 0, "dispose desregistra las atravesables");
    assert.equal(level.terrain.fixtureCount(), 0);
});

test("Infinito: 200 plataformas enteras y las paredes tienen 4 vértices por tramo, un polígono y la misma caja, fricción y registro", () => {
    const world = newWorld();
    const platforms = new OneWayPlatforms(world);
    const climb = new Climb({ world, platforms, pickups: new Pickups(world, { sensorHooks: new Map() }, []) });
    climb.reset(INFINITE_SEED);
    const solidPlatforms = () => climb.items.filter((item) => item.handle && item.oneWay);
    for (let top = FIRST_GENERATION_TOP; solidPlatforms().length < INFINITE_PLATFORMS; top += GENERATION_STEP) {
        climb.update({ top, level: -Infinity });
    }
    let walls = 0;
    for (const item of climb.items.filter((candidate) => candidate.handle)) {
        assertSolid(world, platforms, item.solid, item.handle.tiles);
        if (item.kind === "wall") walls++;
    }
    assert.ok(solidPlatforms().length >= INFINITE_PLATFORMS);
    assert.ok(walls >= 2, "hay paredes");
    for (const item of climb.items.filter((candidate) => candidate.breakable)) {
        assert.ok(item.fixture && !item.handle, "las rompibles son cajas");
    }
    climb.dispose();
    assert.equal(world.GetBodyCount(), 0);
});

test("update rehace como mucho maxRebuildsPerFrame tramos sucios por llamada, deja los demás para la siguiente y mide el costo", () => {
    const world = newWorld();
    const definition = new Box2D.b2BodyDef();
    const body = world.CreateBody(definition);
    Box2D.destroy(definition);
    let clock = 0;
    const terrain = new Terrain({ body, friction: SOLID_FRICTION, now: () => (clock += 5) });
    for (let index = 0; index < CROWD_COUNT; index++) terrain.addSolid({ x: index * CROWD_SPACING, y: 0, w: 3, h: 1 });
    assert.equal(terrain.update(), 0, "sin tramos sucios no rehace nada");
    assert.equal(terrain.lastRebuildMs, 0);
    const fixtures = terrain.fixtureCount();
    for (const tile of terrain.tiles) tile.grid.dirty = true;
    const rebuilt = [terrain.update(), terrain.update(), terrain.update(), terrain.update()];
    assert.deepEqual(rebuilt, [TERRAIN.maxRebuildsPerFrame, TERRAIN.maxRebuildsPerFrame, CROWD_COUNT - 2 * TERRAIN.maxRebuildsPerFrame, 0]);
    assert.equal(terrain.fixtureCount(), fixtures, "rehacer reemplaza los fixtures, no los suma");
    assert.ok([...terrain.tiles].every((tile) => !tile.grid.dirty));
    for (const tile of terrain.tiles) tile.grid.dirty = true;
    terrain.update();
    assert.equal(terrain.lastRebuilds, TERRAIN.maxRebuildsPerFrame);
    assert.equal(terrain.lastRebuildMs, 5, "el costo sale del reloj inyectado");
    assert.deepEqual(terrain.counts(), { grids: CROWD_COUNT, polygons: CROWD_COUNT, vertices: CORNERS * CROWD_COUNT });
    terrain.dispose();
});

test("rehacer una atravesable traspasa a las fixtures nuevas el par y la bajada de cada dueño y desregistra las viejas", () => {
    const world = newWorld();
    const platforms = new OneWayPlatforms(world);
    const definition = new Box2D.b2BodyDef();
    const body = world.CreateBody(definition);
    Box2D.destroy(definition);
    const terrain = new Terrain({ body, platforms, friction: SOLID_FRICTION });
    const handle = terrain.addSolid({ x: 0, y: 0, w: 4, h: 0.4 }, { oneWay: true });
    const [tile] = handle.tiles;
    const [oldFixture] = tile.fixtures;
    const oldPointer = Box2D.getPointer(oldFixture);
    platforms.addOwner("probe", []);
    const owner = platforms.owners.get("probe");
    owner.pairs.set(oldPointer, false);
    owner.drops.set(oldPointer, 1.5);
    tile.grid.dirty = true;
    terrain.update();
    const [newFixture] = tile.fixtures;
    const newPointer = Box2D.getPointer(newFixture);
    assert.equal(platforms.platforms.has(newPointer), true);
    assert.equal(platforms.platforms.size, 1, "las viejas se desregistraron");
    assert.equal(owner.pairs.get(newPointer), false, "sigue sólido");
    assert.equal(owner.drops.get(newPointer), 1.5, "la bajada en curso sigue");
    assert.equal(owner.pairs.size, 1);
    assert.equal(owner.drops.size, 1);
    terrain.removeSolid(handle);
    assert.equal(platforms.platforms.size, 0);
    terrain.dispose();
});

/** Camina con J1 hasta pasar `x` en la dirección `dir` y frena medio segundo. */
function walkTo(game, x, dir) {
    const torsoX = () => game.state.players[0].torso.GetPosition().get_x();
    game.setPad(0, { axes: [dir, 0, dir, 0] });
    for (let frame = 0; frame < 400 && (dir < 0 ? torsoX() > x : torsoX() < x); frame++) game.frame();
    game.setPad(0);
    game.frames(30);
}

/** Juego con J1 parado sobre el piso de la isla izquierda y el tramo de piso que pisa. */
async function standOnFloor() {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(SETTLE_FRAMES);
    const torsoX = game.state.players[0].torso.GetPosition().get_x();
    const tile = [...game.state.terrain.tiles].find(
        ({ grid }) => grid.originX <= torsoX && torsoX < grid.originX + grid.width && Math.abs(grid.originY + grid.height - ISLAND_TOP) < RING_TOLERANCE,
    );
    assert.ok(tile, "hay un tramo de piso bajo J1");
    return { game, tile, stepTop: ISLAND_TOP };
}

/** Juego con J1 parado sobre la plataforma atravesable del escalón izquierdo y el tramo que la forma. */
async function standOnStep() {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(SETTLE_FRAMES);
    walkTo(game, STEP_X + 0.8, -1);
    game.setPad(0, { buttons: [BUTTON_A] });
    game.frames(SETTLE_FRAMES);
    game.setPad(0);
    game.frames(2 * SETTLE_FRAMES);
    const step = LEVEL.solids.find((solid) => solid.oneWay && solid.x === STEP_X);
    const tile = [...game.state.terrain.tiles].find(
        (candidate) => candidate.oneWay && Math.abs(rectangleOf(candidate).x - step.x) < RING_TOLERANCE && Math.abs(rectangleOf(candidate).y - step.y) < RING_TOLERANCE,
    );
    assert.ok(tile, "hay un tramo atravesable en el escalón");
    return { game, tile, stepTop: step.y + step.h / 2 };
}

/**
 * Deja correr `FORCED_REBUILDS` frames con J1 parado y devuelve el recorrido del torso. Con `rebuild`, el tramo `tile` se
 * marca sucio antes de cada frame y se rehace en el loop.
 */
function standingTrace({ game, tile }, rebuild) {
    const { terrain, players } = game.state;
    const torso = players[0].torso;
    const trace = [];
    let grounded = true;
    for (let frame = 0; frame < FORCED_REBUILDS; frame++) {
        if (rebuild) tile.grid.dirty = true;
        game.frame();
        assert.equal(terrain.lastRebuilds, rebuild ? 1 : 0);
        const position = torso.GetPosition();
        trace.push({ x: position.get_x(), y: position.get_y() });
        grounded &&= players[0].grounded;
    }
    return { trace, grounded };
}

/**
 * Compara dos escenas iguales, una sin rehacer nada y otra rehaciendo el tramo en cada frame: el robot parado no se aparta
 * más de 1 cm de donde habría estado, sigue apoyado y el tope del heap no crece. El robot parado oscila por sí solo unos
 * centímetros, así que lo que se mide es la diferencia entre las dos.
 */
async function assertRebuildDoesNotMoveRobot(prepare, label) {
    const control = await prepare();
    const baseline = standingTrace(control, false);
    const forced = await prepare();
    const fixtures = forced.game.state.terrain.fixtureCount();
    const heapBefore = heapTop();
    const rebuilt = standingTrace(forced, true);
    const heapGrowth = heapTop() - heapBefore;
    let apart = 0;
    for (let frame = 0; frame < FORCED_REBUILDS; frame++) {
        apart = Math.max(apart, Math.hypot(rebuilt.trace[frame].x - baseline.trace[frame].x, rebuilt.trace[frame].y - baseline.trace[frame].y));
    }
    console.log(`${label}: ${FORCED_REBUILDS} reconstrucciones, el torso se apartó ${(apart * 1000).toFixed(3)} mm de la escena sin reconstruir; el tope del heap cambió ${heapGrowth} B`);
    assert.ok(apart <= STANDING_TOLERANCE, `se apartó ${apart} m`);
    assert.ok(rebuilt.grounded, "siguió apoyado");
    assert.equal(forced.game.state.terrain.fixtureCount(), fixtures, "rehacer reemplaza los fixtures, no los suma");
    assert.ok(heapGrowth <= HEAP_DRIFT, `el heap creció ${heapGrowth} B`);
    return forced;
}

test("rehacer a la fuerza el tramo del piso bajo un robot parado no lo mueve más de 1 cm ni deja memoria nativa", async () => {
    await assertRebuildDoesNotMoveRobot(standOnFloor, "piso");
});

test("rehacer a la fuerza una plataforma atravesable bajo un robot parado no lo hace caer ni moverse más de 1 cm", async () => {
    const { game, stepTop } = await assertRebuildDoesNotMoveRobot(standOnStep, "escalón");
    const { platforms, players } = game.state;
    const lowest = platforms.measure(platforms.owners.get(0)).low;
    assert.ok(Math.abs(lowest - stepTop) < ONE_WAY.tolerance, "sigue sobre el tope y no lo atravesó");
    assert.equal(players[0].dead, false);
});