/**
 * Monitor de física (#29, docs/design/14-agua.md §14.12) y menú de debug (#258): D1 menú con un solo botón, teclado y
 * gamepad simulado, y pausa; D2 costo por frame con canvas falso; D3 deriva de volumen igual a la del test W1; D4 capas
 * por separado; D5 modo de fluidos en puntos y memoria nativa.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";
import { Debug, DEBUG_ROWS, FLUID_MODES, relativeError } from "../src/core/debug.js";
import { ShallowWater, WATER_FIELD } from "../src/water/water.js";
import { SIGMA_W, MATERIALS } from "../src/fluids/materials.js";
import { newWorld, addSolids, wallFor, DT } from "./helpers/water-bench.js";

const { stepWorld } = await import("../lib/ragimporter.js");
const { createParticleSystem } = await import("../src/fluids/particles.js");
const { SHOT_SYSTEM, FLUID, WEAPONS } = await import("../src/combat/weapons.js");
const { ParticleStore, ORIGIN } = await import("../src/fluids/particleStore.js");

/** `performance.now` real: `loadGame` reemplaza el global por un reloj falso. */
const realNow = performance.now.bind(performance);
const key = (code) => ({ code, repeat: false, preventDefault() {} });
const DEBUG_PAD = [10, 11];
const SELECT = 8;
const A = 0;
const DPAD = { up: 12, down: 13, left: 14, right: 15 };
const hasMenu = (game) => game.hudTexts.some((text) => text.includes("Estadísticas"));
const hasStats = (game) => game.hudTexts.some((text) => text.startsWith("FPS"));

/** Un toque de la tecla `code`: baja, deja pasar un frame y sube. */
function tapKey(game, code) {
    game.emit("keydown", key(code));
    game.frames(2);
    game.emit("keyup", key(code));
    game.frames(2);
}

/** Un toque del botón `button` (o de varios a la vez, si es un arreglo) del gamepad `k`. */
function tapButton(game, k, button) {
    game.setPad(k, { buttons: [].concat(button) });
    game.frames(2);
    game.setPad(k);
    game.frames(2);
}

test("D1 F3 y L3 + R3 abren y cierran el menú sin recargar, y el menú dibuja sus seis filas", async () => {
    const game = await loadGame();
    const { debug } = game.state;
    game.setPad(0);
    game.setPad(1);
    game.frames(2);
    assert.equal(debug.open, false);
    assert.equal(hasMenu(game), false);

    tapKey(game, "F3");
    assert.equal(debug.open, true);
    assert.equal(hasMenu(game), true, "el menú dibuja texto en el HUD");
    for (const row of DEBUG_ROWS) assert.ok(game.hudTexts.some((t) => t.includes(row.label)), row.label);
    assert.equal(hasStats(game), false, "Estadísticas arranca en no");
    tapKey(game, "F3");
    assert.equal(debug.open, false);
    assert.equal(hasMenu(game), false);

    tapButton(game, 0, SELECT);
    tapButton(game, 0, 10);
    tapButton(game, 0, 11);
    assert.equal(debug.open, false, "Select, L3 o R3 solos no abren el menú");
    tapButton(game, 0, DEBUG_PAD);
    assert.equal(debug.open, true);
    tapButton(game, 1, DEBUG_PAD);
    assert.equal(debug.open, false, "L3 + R3 de cualquier gamepad real");
    tapButton(game, 0, DEBUG_PAD);
    tapKey(game, "Escape");
    assert.equal(debug.open, false, "atrás (Escape) cierra");
    tapButton(game, 0, DEBUG_PAD);
    tapButton(game, 0, 1);
    assert.equal(debug.open, false, "atrás (B) cierra");
});

test("D1 las filas se recorren y cambian con teclado y con gamepad simulado, y los valores por defecto son los del juego", async () => {
    const game = await loadGame();
    const { debug } = game.state;
    game.setPad(0);
    game.setPad(1);
    game.frames(2);
    assert.deepEqual(DEBUG_ROWS.map((r) => r.id), ["stats", "fluidos", "velocidades", "fuerzas", "columnas", "bots"]);
    assert.equal(debug.stats, false);
    assert.equal(debug.fluidMode, "metaball");
    assert.deepEqual(debug.layers, { velocidades: false, fuerzas: false, columnas: false, bots: false });

    tapKey(game, "F3");
    assert.equal(debug.cursor, 0);
    tapKey(game, "ArrowUp");
    assert.equal(debug.cursor, DEBUG_ROWS.length - 1, "arriba desde la primera fila da la vuelta");
    tapKey(game, "ArrowDown");
    assert.equal(debug.cursor, 0, "abajo desde la última fila da la vuelta");

    tapKey(game, "ArrowRight");
    assert.equal(debug.stats, true);
    assert.equal(hasStats(game), true, "con Estadísticas en sí se ven bajo las filas del menú");
    tapKey(game, "ArrowLeft");
    assert.equal(debug.stats, false);

    tapKey(game, "ArrowDown");
    assert.deepEqual(
        [1, 2, 3].map(() => (tapKey(game, "ArrowRight"), debug.fluidMode)),
        ["puntos", "ambos", "metaball"],
        "Fluidos cicla metaball, puntos, ambos",
    );
    tapKey(game, "ArrowLeft");
    assert.equal(debug.fluidMode, "ambos");

    for (const [i, id] of ["velocidades", "fuerzas", "columnas", "bots"].entries()) {
        tapButton(game, 0, DPAD.down);
        assert.equal(debug.cursor, 2 + i);
        tapButton(game, 0, A);
        assert.equal(debug.layers[id], true, `A alterna ${id}`);
        tapButton(game, 0, DPAD.right);
        assert.equal(debug.layers[id], false, `derecha alterna ${id}`);
        tapButton(game, 0, DPAD.left);
        assert.equal(debug.layers[id], true);
    }
    tapButton(game, 0, DPAD.up);
    assert.equal(debug.cursor, 4);
    tapButton(game, 0, DPAD.down);
    tapButton(game, 0, DPAD.down);
    assert.equal(debug.cursor, 0);
});

test("D1 con el menú abierto la simulación está en pausa y la cruceta no cambia de arma; al cerrar sigue", async () => {
    const game = await loadGame();
    const { debug, players, match } = game.state;
    game.setPad(0);
    game.setPad(1);
    players[0].tanks.set(WEAPONS[1].id, 100);
    const first = players[0].weapon;
    game.frames(30);

    tapKey(game, "F3");
    const time = match.roundTime;
    const x = players[1].torso.GetPosition().get_x();
    game.setPad(1, { axes: [1, 0, 0, 0] });
    tapButton(game, 0, DPAD.right);
    game.frames(60);
    assert.equal(match.roundTime, time, "el reloj de la ronda no avanza");
    assert.equal(players[1].torso.GetPosition().get_x(), x, "el input del jugador no se aplica");
    assert.equal(players[0].weapon, first, "la cruceta no cambia de arma");

    game.setPad(1);
    tapKey(game, "F3");
    game.frames(30);
    assert.ok(match.roundTime > time, "al cerrar, el reloj sigue");
    game.setPad(1, { axes: [1, 0, 0, 0] });
    game.frames(30);
    assert.notEqual(players[1].torso.GetPosition().get_x(), x, "al cerrar, el robot vuelve a moverse");
    game.setPad(1);
    tapButton(game, 0, DPAD.right);
    assert.notEqual(players[0].weapon, first, "sin menú, la cruceta cambia de arma como siempre");
});

test("D1 en el título, L3 + R3 no abren el menú de debug", async () => {
    const game = await loadGame({ intro: true });
    game.setPad(0);
    game.frames(2);
    tapButton(game, 0, DEBUG_PAD);
    assert.equal(game.state.debug.open, false);
});

test("D1 las opciones elegidas siguen activas con el menú cerrado y sus trazos se dibujan", async () => {
    const game = await loadGame();
    const { debug, store } = game.state;
    game.frames(5);
    const def = new Box2D.b2ParticleDef();
    const at = new Box2D.b2Vec2(0, 0);
    for (let k = 0; k < 20; k++) {
        at.set_x(k * 0.1);
        at.set_y(5);
        def.set_position(at);
        store.create(def, { kind: FLUID.WATER, origin: ORIGIN.SHOT });
    }
    Box2D.destroy(def);
    Box2D.destroy(at);
    game.frames(2);
    const base = game.laserMoves;

    tapKey(game, "F3");
    tapKey(game, "ArrowDown");
    tapKey(game, "ArrowDown");
    tapKey(game, "ArrowRight");
    tapKey(game, "F3");
    assert.equal(debug.open, false);
    assert.equal(debug.layers.velocidades, true);
    game.frames(2);
    assert.ok(game.laserMoves >= base + 20, `velocidades dibuja flechas (${game.laserMoves} contra ${base})`);
    assert.equal(hasMenu(game), false);
    assert.equal(hasStats(game), false, "las estadísticas solo se ven con el menú abierto");
});

test("D5 en puntos no se dibuja el metaball y los puntos van a la capa superpuesta, sin el filtro de umbral; ambos dibuja las dos cosas", async () => {
    const game = await loadGame();
    const { debug, store, fluidLayers } = game.state;
    game.frames(5);
    const def = new Box2D.b2ParticleDef();
    const at = new Box2D.b2Vec2(0, 0);
    for (let k = 0; k < 20; k++) {
        at.set_x(k * 0.1);
        at.set_y(5);
        def.set_position(at);
        store.create(def, { kind: FLUID.WATER, origin: ORIGIN.SHOT });
    }
    Box2D.destroy(def);
    Box2D.destroy(at);
    const count = game.state.particleSystem.GetParticleCount();
    const shown = () => [...fluidLayers.layers.values()].filter((entry) => entry.node.visible).length;

    game.frames(2);
    assert.equal(debug.fluidMode, "metaball");
    assert.ok(shown() > 0, "metaball: hay capas de fluido");
    const arcs0 = game.arcs;

    tapKey(game, "F3");
    tapKey(game, "ArrowDown");
    tapKey(game, "ArrowRight");
    tapKey(game, "F3");
    game.frames(2);
    assert.equal(debug.fluidMode, "puntos");
    assert.equal(shown(), 0, "en puntos las capas de metaball quedan ocultas, no congeladas");
    assert.ok(game.arcs >= arcs0 + count, `un círculo por partícula (${game.arcs} contra ${arcs0})`);

    tapKey(game, "F3");
    tapKey(game, "ArrowRight");
    tapKey(game, "F3");
    game.frames(2);
    assert.equal(debug.fluidMode, "ambos");
    assert.ok(shown() > 0, "ambos: también el metaball");
    assert.ok(game.arcs >= arcs0 + count);

    const filtered = [...fluidLayers.layers.values()].every((entry) => entry.node.filters.length === 1);
    assert.ok(filtered, "las capas de fluido llevan el filtro de umbral");
    assert.equal(game.state.scene.overlayLayer.sprite.filters, null, "la capa de los puntos va sin filtro");
});

const fake = () => {
    const stored = {};
    return new Proxy(() => undefined, {
        get: (_, prop) => (prop in stored ? stored[prop] : () => undefined),
        set: (_, prop, value) => {
            stored[prop] = value;
            return true;
        },
    });
};

/** Escena de costo: 2000 partículas de LiquidFun real, campo de alturas lleno, 15 piezas y 2 bots. */
function costScene() {
    const world = newWorld();
    addSolids(world, [{ x: 0, y: -0.5, w: 40, h: 1 }]);
    const system = createParticleSystem(world, SHOT_SYSTEM);
    const store = new ParticleStore(system, SHOT_SYSTEM);
    const wall = wallFor(system, store);
    const def = new Box2D.b2ParticleDef();
    const at = new Box2D.b2Vec2(0, 0);
    for (let k = 0; k < 2000; k++) {
        at.set_x((k % 40) * 0.09);
        at.set_y(0.1 + Math.floor(k / 40) * 0.09);
        def.set_position(at);
        store.create(def, { kind: FLUID.WATER, origin: ORIGIN.SHOT });
    }
    Box2D.destroy(def);
    Box2D.destroy(at);
    for (let s = 0; s < 30; s++) stepWorld(world, [wall]);
    const water = new ShallowWater();
    water.h.fill(0.5);
    const pieces = Array.from({ length: 15 }, (_, i) => ({
        cx: i,
        cy: 1,
        buoyancy: { x: 5, y: 20 },
        drag: { x: -3, y: 1 },
        body: { GetMass: () => 2 },
    }));
    const refs = {
        particles: {
            heap: Box2D.HEAPF32,
            pos: Box2D.getPointer(system.GetPositionBuffer()) >> 2,
            vel: Box2D.getPointer(system.GetVelocityBuffer()) >> 2,
            count: system.GetParticleCount(),
        },
        pieces,
        water,
    };
    return { refs, wall, system };
}

const sampleData = () => ({
    fps: 60,
    ms: { control: 0.1, flotación: 0.2, física: 2, inmersión: 0.1, térmica: 0.1, campo: 0.3, fluidos: 1 },
    particles: { ACID: 0, LAVA: 0, HONEY: 0, WATER: 2000, STONE: 0, STEAM: 0 },
    contacts: 120,
    cflSubsteps: 3,
    volume: { total: 12 },
    bots: [
        { k: 0, from: { x: 0, y: 1 }, goal: { x: 5, y: 2 }, target: { x: 6, y: 2 }, action: "caminar" },
        { k: 1, from: { x: 9, y: 1 }, goal: null, target: null, action: "quieto" },
    ],
});

/** Un frame completo de uso del monitor: lo que `index.js` le pide en el loop. */
function frameOf(debug, ctx, refs, data) {
    debug.begin();
    for (let i = 0; i < 15; i++) debug.mark("x");
    debug.frame(data);
    debug.drawLayer(ctx, 40, refs);
    debug.drawPanel(ctx, 1280, 720);
}

/** Referencias de `drawPoints` del sistema de la escena de costo. */
function pointRefs(system) {
    return {
        heap: Box2D.HEAPF32,
        bytes: Box2D.HEAPU8,
        pos: Box2D.getPointer(system.GetPositionBuffer()) >> 2,
        color: Box2D.getPointer(system.GetColorBuffer()),
        count: system.GetParticleCount(),
        radius: system.GetRadius(),
    };
}

test("D2 costo por frame: apagado < 0,05 ms y encendido (panel + capa) <= 1 ms (se exige con PERF=1, en corrida aislada)", (t) => {
    const { refs, wall } = costScene();
    const data = sampleData();
    const ctx = fake();
    const measure = (debug, frames) => {
        for (let i = 0; i < 50; i++) frameOf(debug, ctx, refs, data);
        const t0 = realNow();
        for (let i = 0; i < frames; i++) frameOf(debug, ctx, refs, data);
        return (realNow() - t0) / frames;
    };
    const off = measure(new Debug({ now: realNow }), 2000);
    const on = new Debug({ now: realNow });
    Object.assign(on, { open: true, stats: true, layers: { velocidades: true, fuerzas: true, columnas: true, bots: true } });
    const onMs = measure(on, 500);
    t.diagnostic(`D2: apagado ${off.toFixed(5)} ms por frame; encendido ${onMs.toFixed(4)} ms por frame (${refs.particles.count} partículas, ${refs.pieces.length} piezas)`);
    wall.dispose();
    if (process.env.PERF !== "1") return;
    assert.ok(off < 0.05, `apagado ${off} ms`);
    assert.ok(onMs <= 1, `encendido ${onMs} ms`);
});

/** Tanque cerrado de 20 m con una isla, columna de 2 m y lámina de 0,3 m: la escena de W1 (`tests/shallow-water.test.js`). */
function sloshTank() {
    const level = {
        bounds: { minX: 0, maxX: 20, minY: 0, maxY: 32 },
        solids: [
            { x: 10, y: -0.5, w: 20, h: 1, kind: "floor" },
            { x: 14, y: 0, w: 4, h: 1, kind: "floor" },
        ],
    };
    const water = new ShallowWater(level, WATER_FIELD);
    for (let i = 0; i < water.N; i++) {
        const x = water.center(i);
        water.h[i] = Math.max(0, (x < 5 ? 2 : x < 10 ? 0.3 : 0) - water.b[i]);
        const T = 20 + 2 * x;
        water.E[i] = SIGMA_W * MATERIALS.water.c * water.h[i] * T;
        water.M[i] = water.h[i] * (0.5 + 0.4 * Math.sin(x));
    }
    return water;
}

test("D3 la deriva de volumen del monitor coincide con la de W1 en la misma escena", (t) => {
    const water = sloshTank();
    const v0 = water.volume();
    const debug = new Debug({ alpha: 1 });
    debug.stats = true;
    const first = sampleData();
    first.volume.total = v0;
    debug.frame(first);
    let worst = 0;
    let gap = 0;
    for (let s = 1; s <= 600; s++) {
        water.step(DT);
        if (s % 60 !== 0) continue;
        const data = sampleData();
        data.volume.total = water.volume();
        debug.frame(data);
        const w1 = relativeError(water.volume(), v0);
        worst = Math.max(worst, w1);
        gap = Math.max(gap, Math.abs(debug.avg.drift - w1));
    }
    t.diagnostic(`D3: deriva máxima en 10 s ${worst.toExponential(3)} (W1), diferencia con el monitor ${gap.toExponential(3)}`);
    assert.equal(gap, 0);
    assert.ok(worst < 1e-4);
});

/** Contexto falso que cuenta `stroke` y `arc` y registra el ancho y los estilos de trazo y de relleno que se le asignan. */
function countingCtx() {
    const log = { strokes: 0, arcs: 0, lineWidth: 0, styles: [], fills: [] };
    const props = {
        stroke: () => log.strokes++,
        arc: () => log.arcs++,
    };
    const ctx = new Proxy(() => undefined, {
        get: (_, prop) => props[prop] ?? (() => undefined),
        set: (_, prop, value) => {
            if (prop === "strokeStyle") log.styles.push(value);
            if (prop === "fillStyle") log.fills.push(value);
            if (prop === "lineWidth") log.lineWidth = value;
            return true;
        },
    });
    return { ctx, log };
}
test("D4 cada capa se dibuja solo si está en sí, con trazo de 1 px y alfa 0,5", (t) => {
    const { refs, wall } = costScene();
    const expected = { velocidades: 1, fuerzas: 2, columnas: 2, bots: 1 };
    const scale = 40;
    const run = (layers) => {
        const debug = new Debug({ now: realNow });
        Object.assign(debug.layers, layers);
        debug.frame(sampleData());
        const { ctx, log } = countingCtx();
        debug.drawLayer(ctx, scale, refs);
        return log;
    };
    assert.equal(run({}).strokes, 0, "todo apagado no dibuja");
    for (const name in expected) {
        const log = run({ [name]: true });
        assert.equal(log.strokes, expected[name], `solo ${name}`);
        assert.equal(log.lineWidth, 1 / scale, "1 px de ancho");
        for (const style of log.styles) assert.match(style, /, 0\.5\)$/, `${name}: ${style}`);
        assert.ok(log.styles.length > 0);
    }
    const all = run({ velocidades: true, fuerzas: true, columnas: true, bots: true });
    assert.equal(all.strokes, 6);
    wall.dispose();
    t.diagnostic("D4: trazos por capa velocidades 1, fuerzas 2, columnas 2, bots 1");
});

test("D4 el menú recorre las filas con cursor cíclico y cambia valores en las dos direcciones", () => {
    const debug = new Debug();
    debug.update({ y: 1 });
    assert.equal(debug.cursor, 0, "cerrado no hace nada");
    debug.toggleOpen();
    debug.update({ y: -1 });
    assert.equal(debug.cursor, DEBUG_ROWS.length - 1);
    debug.update({ y: 1 });
    debug.update({ y: 1 });
    assert.equal(debug.cursor, 1);
    const seen = [];
    for (let i = 0; i < 3; i++) {
        debug.update({ confirm: true });
        seen.push(debug.fluidMode);
    }
    assert.deepEqual(seen, ["puntos", "ambos", "metaball"]);
    debug.update({ x: -1 });
    assert.equal(debug.fluidMode, FLUID_MODES[2]);
    debug.update({ back: true });
    assert.equal(debug.open, false);
});

test("D5 en puntos hay un círculo por partícula con el color del buffer y alfa 0,8; en metaball no hay ninguno", (t) => {
    const { system, wall } = costScene();
    const debug = new Debug();
    const refs = pointRefs(system);
    const { ctx, log } = countingCtx();
    debug.drawPoints(ctx, refs);
    assert.equal(log.arcs, 0, "metaball no dibuja puntos");
    debug.fluidMode = "puntos";
    debug.drawPoints(ctx, refs);
    assert.equal(log.arcs, refs.count);
    assert.ok(log.fills.length > 0 && log.fills.every((f) => f.endsWith(", 0.8)")));
    debug.fluidMode = "ambos";
    debug.drawPoints(ctx, refs);
    assert.equal(log.arcs, 2 * refs.count);
    assert.equal(debug.metaballOn, true);
    debug.fluidMode = "puntos";
    assert.equal(debug.metaballOn, false);
    wall.dispose();
    t.diagnostic(`D5: ${refs.count} círculos por frame`);
});

test("D5 dibujar 1000 frames en puntos no hace crecer el heap nativo", (t) => {
    const { system, wall } = costScene();
    const debug = new Debug();
    debug.fluidMode = "puntos";
    const ctx = fake();
    const top = () => {
        const p = Box2D._malloc(1 << 20);
        Box2D._free(p);
        return p;
    };
    for (let i = 0; i < 20; i++) debug.drawPoints(ctx, pointRefs(system));
    const before = top();
    const size = Box2D.HEAP8.length;
    for (let i = 0; i < 1000; i++) debug.drawPoints(ctx, pointRefs(system));
    const after = top();
    t.diagnostic(`D5: tope del heap antes ${before} y después ${after}; tamaño ${Box2D.HEAP8.length} B`);
    assert.equal(after, before);
    assert.equal(Box2D.HEAP8.length, size);
    wall.dispose();
});
