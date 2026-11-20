/**
 * Monitor de física (#29, docs/design/14-agua.md §14.12): D1 conmutación con teclado y gamepad simulado, D2 costo por
 * frame con canvas falso y D3 deriva de volumen igual a la del test W1.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";
import { TAP_MAX } from "../js/Input.js";
import { Debug, relativeError } from "../js/debug.js";
import { ShallowWater, WATER_FIELD } from "../js/water.js";
import { SIGMA_W, MATERIALS } from "../js/materials.js";
import { newWorld, addSolids, wallFor, DT } from "./helpers/water-bench.js";

const { stepWorld } = await import("../lib/ragimporter.js");
const { createParticleSystem } = await import("../js/particles.js");
const { SHOT_SYSTEM, FLUID } = await import("../js/weapons.js");
const { ParticleStore, ORIGIN } = await import("../js/particleStore.js");

/** `performance.now` real: `loadGame` reemplaza el global por un reloj falso. */
const realNow = performance.now.bind(performance);
const key = (code) => ({ code, repeat: false, preventDefault() {} });
const SELECT = 8;
const LB = 4;
const RB = 5;
const hasPanel = (game) => game.hudTexts.some((text) => text.startsWith("FPS"));

test("D1 F3 y F4 con el teclado prenden y apagan el panel y la capa sin recargar", async () => {
    const game = await loadGame();
    const { debug } = game.state;
    game.frames(2);
    assert.equal(debug.panelOn, false);
    assert.equal(hasPanel(game), false);

    game.emit("keydown", key("F3"));
    game.frames(2);
    assert.equal(debug.panelOn, true);
    assert.equal(hasPanel(game), true, "el panel dibuja texto en el HUD");
    game.emit("keyup", key("F3"));
    game.emit("keydown", key("F3"));
    game.frames(2);
    assert.equal(debug.panelOn, false);
    assert.equal(hasPanel(game), false);

    game.emit("keydown", key("F4"));
    game.frames(2);
    assert.equal(debug.layerOn, true);
    assert.equal(debug.panelOn, false, "F4 no toca el panel");
    game.emit("keyup", key("F4"));
    game.emit("keydown", key("F4"));
    game.frames(2);
    assert.equal(debug.layerOn, false);
});

test("D1 Select+LB y Select+RB prenden y apagan el panel y la capa, y con Select apretado LB no abre la rueda", async () => {
    const game = await loadGame();
    const { debug, input } = game.state;
    game.setPad(0);
    game.setPad(1);
    game.frames(2);

    game.setPad(0, { buttons: [SELECT, LB] });
    game.frames(Math.ceil((TAP_MAX + 0.2) * 60));
    assert.equal(debug.panelOn, true);
    assert.equal(input.states[0].wheel, null, "con Select apretado LB mantenido no abre la rueda");
    game.setPad(0);
    game.frames(2);
    game.setPad(0, { buttons: [SELECT, LB] });
    game.frames(2);
    assert.equal(debug.panelOn, false);
    game.setPad(0);
    game.frames(2);

    game.setPad(0, { buttons: [SELECT, RB] });
    game.frames(2);
    assert.equal(debug.layerOn, true);
    assert.equal(debug.panelOn, false);
    game.setPad(0);
    game.frames(2);
    game.setPad(0, { buttons: [SELECT, RB] });
    game.frames(2);
    assert.equal(debug.layerOn, false);
    game.setPad(0);
    game.frames(2);

    game.setPad(0, { buttons: [LB] });
    game.frames(Math.ceil((TAP_MAX + 0.1) * 60));
    assert.notEqual(input.states[0].wheel, null, "sin Select, LB mantenido sigue abriendo la rueda");
    assert.equal(debug.panelOn, false);
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
    return { refs, wall };
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

/** Un frame completo de uso del monitor: lo que `index.html` le pide en el loop. */
function frameOf(debug, ctx, refs, data) {
    debug.begin();
    for (let i = 0; i < 15; i++) debug.mark("x");
    debug.frame(data);
    debug.drawLayer(ctx, 40, refs);
    debug.drawPanel(ctx, 1280, 720);
}

test("D2 costo por frame: apagado < 0,05 ms y encendido (panel + capa) <= 1 ms", (t) => {
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
    on.toggle({ panel: true, layer: true });
    const onMs = measure(on, 500);
    t.diagnostic(`D2: apagado ${off.toFixed(5)} ms por frame; encendido ${onMs.toFixed(4)} ms por frame (${refs.particles.count} partículas, ${refs.pieces.length} piezas)`);
    wall.dispose();
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
    debug.toggle({ panel: true, layer: false });
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
