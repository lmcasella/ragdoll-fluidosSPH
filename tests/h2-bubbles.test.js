/** Burbujas de H2 y chispas del cortocircuito (docs/design/15-quimica.md §15.5b): solo dibujo, sin física. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { drawRobot, sparkCount, H2_BUBBLES } = await import("../js/render.js");
const { MATERIALS } = await import("../js/materials.js");

const FPS = 60;

function fakeBody(x, y) {
    return { GetPosition: () => ({ get_x: () => x, get_y: () => y }), GetAngle: () => 0 };
}

function fakePlayer(sigma, pieces = 1) {
    const renderItems = Array.from({ length: pieces }, (_, k) => ({
        body: fakeBody(k, 5),
        bodyId: `b_${k}`,
        type: ["circle", "box", "polygon"][k % 3],
        cx: 0,
        cy: 0,
        angle: 0,
        radius: 0.3,
        hw: 0.3,
        hh: 0.3,
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

function fakeCtx() {
    const ctx = { arcs: [], strokes: 0, lineTos: 0 };
    const noop = () => {};
    Object.assign(ctx, {
        save: noop,
        restore: noop,
        translate: noop,
        rotate: noop,
        beginPath: noop,
        moveTo: noop,
        closePath: noop,
        rect: noop,
        fill: noop,
        lineTo: () => ctx.lineTos++,
        stroke: () => ctx.strokes++,
        arc: (x, y, r) => ctx.arcs.push({ x, y, r, alpha: ctx.globalAlpha }),
    });
    return ctx;
}

function run(player, seconds, from = 0) {
    const frames = [];
    for (let i = 0; i < Math.round(seconds * FPS); i++) {
        const ctx = fakeCtx();
        drawRobot(ctx, player, "#ff0000", 50, from + i / FPS);
        frames.push(ctx);
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

