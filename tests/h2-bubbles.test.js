/** Burbujas de H2 y chispas del cortocircuito (docs/design/15-quimica.md §15.5b): solo dibujo, sin física. */
import { test } from "node:test";
import assert from "node:assert/strict";

import { installFakePixi } from "./helpers/fake-pixi.js";

installFakePixi();
const { RagdollEffects, sparkCount, H2_BUBBLES } = await import("../src/ragdoll/RagdollEffects.js");
const { MATERIALS } = await import("../src/fluids/materials.js");

const FPS = 60;
const PIXELS_PER_METER = 32;
const SCREEN_SCALE = 50;

function fakeBody(x, y) {
    return { GetPosition: () => ({ get_x: () => x, get_y: () => y }), GetAngle: () => 0 };
}

function fakePlayer(sigma, pieces = 1) {
    const renderItems = Array.from({ length: pieces }, (_, k) => ({
        body: fakeBody(k, 5),
        bodyId: `b_${k}`,
        type: ["circle", "box", "polygon"][k % 3],
        centerX: 0,
        centerY: 0,
        angle: 0,
        radius: 0.3,
        halfWidth: 0.3,
        halfHeight: 0.3,
        vertices: [[-0.3, -0.3], [0.3, -0.3], [0, 0.3]],
    }));
    return {
        renderItems,
        dead: false,
        wet: true,
        wetSigma: sigma,
        shortCircuitDps: 0,
        flashAmount: () => 0,
    };
}

const effectsByPlayer = new WeakMap();

/** Efectos del jugador: uno por jugador, como en el juego, para que las burbujas sigan vivas entre corridas. */
function effectsOf(player) {
    if (!effectsByPlayer.has(player)) {
        effectsByPlayer.set(player, new RagdollEffects({ parent: new PIXI.Container(), pixelsPerMeter: PIXELS_PER_METER }));
    }
    return effectsByPlayer.get(player);
}

/** Lo dibujado en un frame, pasado de px del mundo a metros: `arcs` con `x`, `y` y `r`, y los tramos de chispa (`lineTos`). */
function drawnFrame(graphics) {
    const arcs = graphics.circles.map(({ x, y, radius }) => ({ x: x / PIXELS_PER_METER, y: y / PIXELS_PER_METER, r: radius / PIXELS_PER_METER }));
    return { arcs, lineTos: graphics.lineTos };
}

function run(player, seconds, from = 0) {
    const effects = effectsOf(player);
    const frames = [];
    for (let i = 0; i < Math.round(seconds * FPS); i++) {
        effects.draw(player, SCREEN_SCALE, from + i / FPS);
        frames.push(drawnFrame(effects.graphics));
    }
    return frames;
}

const bubblesOf = (ctx) => ctx.arcs.filter((a) => a.r <= H2_BUBBLES.maxRadius + 1e-6);

test("sparkCount: agua limpia como siempre y el ácido unas 5 veces más", () => {
    assert.equal(sparkCount(3), 3);
    assert.equal(sparkCount(14.99), 15);
});

test("ácido puro: ~20 burbujas/s por pieza, radio 0,02–0,04 m, vivas ~0,5 s", () => {
    const player = fakePlayer(MATERIALS.acid.sigmaE);
    const frames = run(player, 2);
    const alive = frames.slice(60).map((f) => bubblesOf(f).length);
    const mean = alive.reduce((a, b) => a + b, 0) / alive.length;
    assert.ok(Math.abs(mean - 20 * H2_BUBBLES.life) <= 1.5, `burbujas vivas ${mean}, esperado ${20 * H2_BUBBLES.life}`);
    for (const frame of frames) {
        for (const b of bubblesOf(frame)) assert.ok(b.r >= H2_BUBBLES.minRadius - 1e-6 && b.r <= H2_BUBBLES.maxRadius + 1e-6);
    }
});

test("las burbujas suben ~0,3 m/s y desaparecen al soltar el líquido", () => {
    const player = fakePlayer(MATERIALS.acid.sigmaE);
    const frames = run(player, 1);
    assert.ok(frames.some((f) => bubblesOf(f).length > 0));
    player.wet = false;
    const after = run(player, 1, 1);
    assert.ok(bubblesOf(after[10]).length > 0, "las que ya nacieron siguen subiendo");
    assert.equal(bubblesOf(after.at(-1)).length, 0, "a los 0,5 s ya no queda ninguna");
    const dt = 1 / FPS;
    const a = bubblesOf(after[0]);
    const b = bubblesOf(after[1]);
    assert.ok(a.length > 0 && b.length > 0);
    const same = a.map((x) => ({ before: x, after: b.find((y) => y.x === x.x) })).filter((p) => p.after);
    assert.ok(same.length > 0);
    for (const { before, after: later } of same) assert.ok(Math.abs((later.y - before.y) / dt - H2_BUBBLES.rise) < 0.05, `sube ${(later.y - before.y) / dt} m/s`);
});

test("con agua limpia no hay burbujas y con un poco de ácido hay menos que con ácido puro", () => {
    const clean = run(fakePlayer(MATERIALS.water.sigmaE, 8), 1);
    assert.equal(clean.reduce((n, f) => n + bubblesOf(f).length, 0), 0);
    const pure = run(fakePlayer(MATERIALS.acid.sigmaE, 8), 1).reduce((n, f) => n + bubblesOf(f).length, 0);
    const diluted = run(fakePlayer(MATERIALS.acid.sigmaE / 4, 8), 1).reduce((n, f) => n + bubblesOf(f).length, 0);
    assert.ok(diluted > 0 && diluted < pure * 0.5, `${diluted} contra ${pure}`);
});

