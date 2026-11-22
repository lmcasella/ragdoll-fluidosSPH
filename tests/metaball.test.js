import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers/fluid-bench.js";

const {
    DROP_STRETCH,
    METABALL_RADIUS,
    METABALL_THRESHOLD,
    metaballAlpha,
    metaballPeak,
    metaballVisibleRadius,
    drawParticles,
    FluidLayers,
    MetaballSprites,
    SHOT_DRAW: DRAW,
    PARTICLE_RADIUS,
} = await import("../js/render.js");

/** Alfa de `n` capas de alfa `a` en `source-over`: `1 − Π(1 − a_i)`. */
const over = (...alphas) => 1 - alphas.reduce((acc, a) => acc * (1 - a), 1);

test("una gota aislada de cada material mide PARTICLE_RADIUS · radiusScale (±5 %)", (t) => {
    for (const [kind, row] of Object.entries(DRAW.kinds)) {
        const radius = Math.min(DRAW.radius * row.radiusScale, DRAW.maxRadius);
        const peak = metaballPeak(radius);
        const visible = metaballVisibleRadius(peak);
        t.diagnostic(`kind ${kind}: pico ${peak.toFixed(3)}, radio visible ${visible.toFixed(4)} m, esperado ${(PARTICLE_RADIUS * row.radiusScale).toFixed(4)} m`);
        assert.ok(peak <= 1);
        assert.ok(Math.abs(visible / (PARTICLE_RADIUS * row.radiusScale) - 1) < 0.05);
        assert.ok(metaballAlpha(radius * 0.999, peak) > METABALL_THRESHOLD);
        assert.ok(metaballAlpha(radius * 1.001, peak) < METABALL_THRESHOLD);
    }
});

test("dos gotas a 0,12 m superan el umbral en el punto medio y a 0,2 m no", (t) => {
    for (const [kind, row] of Object.entries(DRAW.kinds)) {
        const peak = metaballPeak(Math.min(DRAW.radius * row.radiusScale, DRAW.maxRadius));
        const mid = over(metaballAlpha(0.06, peak), metaballAlpha(0.06, peak));
        t.diagnostic(`kind ${kind}: alfa en el punto medio a 0,12 m = ${mid.toFixed(3)}`);
        assert.ok(mid > METABALL_THRESHOLD + 0.1, `kind ${kind}: ${mid}`);
        assert.ok(over(metaballAlpha(0.1, peak), metaballAlpha(0.1, peak)) < METABALL_THRESHOLD);
    }
});

/** Contexto 2D falso que cuenta los dibujos. */
function fakeDoc() {
    const created = [];
    const doc = {
        created,
        createElement() {
            const draws = [];
            const canvas = {
                width: 0,
                height: 0,
                style: {},
                draws,
                getContext: () => ({
                    draws,
                    setTransform() {},
                    clearRect() {},
                    createRadialGradient: () => ({ addColorStop() {} }),
                    fillRect() {},
                    drawImage(sprite, x, y) {
                        draws.push({ sprite, x, y });
                    },
                }),
            };
            created.push(canvas);
            return canvas;
        },
    };
    return doc;
}

function fakeSystem(kinds, colors) {
    const n = kinds.length;
    const heap = new Float32Array(5 * n + 16);
    const u8 = new Uint8Array(heap.buffer);
    kinds.forEach((_, i) => {
        heap[i * 2] = 10 + i * 0.1;
        heap[i * 2 + 1] = 30;
        u8.set(colors[i], n * 8 + i * 4);
    });
    return {
        system: { GetPositionBuffer: () => 0, GetColorBuffer: () => n * 8, GetVelocityBuffer: () => n * 12, GetParticleCount: () => n },
        box: { HEAPF32: heap, HEAPU8: u8, getPointer: (a) => a },
    };
}

function run(layers, kinds, colors) {
    const { system, box } = fakeSystem(kinds, colors);
    const previous = globalThis.Box2D;
    globalThis.Box2D = box;
    try {
        drawParticles(layers, system, DRAW, { kind: kinds, slotAt: (i) => i });
    } finally {
        globalThis.Box2D = previous;
    }
}

test("drawParticles: una capa por material presente y sin mezclar materiales", () => {
    const doc = fakeDoc();
    const anchor = { before() {} };
    const layers = new FluidLayers(doc, anchor, () => {});
    const kinds = [4, 4, 3, 6, 4, 3];
    const white = [200, 200, 200];
    run(layers, kinds, kinds.map(() => white));
    const layerCanvases = doc.created.filter((c) => c.style.zIndex !== undefined);
    assert.equal(layerCanvases.length, 3);
    const byZ = Object.fromEntries(layerCanvases.map((c) => [c.style.zIndex, c.draws.length]));
    assert.deepEqual(byZ, { 3: 2, 4: 3, 6: 1 });
    run(layers, [4, 4], [white, white]);
    assert.equal(layerCanvases.find((c) => c.style.zIndex === "3").style.display, "none");
    assert.equal(layerCanvases.find((c) => c.style.zIndex === "4").style.display, undefined);
});

test("los sprites se cachean por material y color cuantizado y respetan el tope", () => {
    const doc = fakeDoc();
    const sprites = new MetaballSprites(() => doc.createElement(), 4);
    const a = sprites.get(2, 255, 80, 20, 0.05);
    assert.equal(sprites.get(2, 252, 81, 22, 0.05), a);
    assert.notEqual(sprites.get(3, 255, 80, 20, 0.05), a);
    for (let i = 0; i < 20; i++) sprites.get(2, i * 8, 0, 0, 0.05);
    assert.equal(sprites.byKind.get(2).size, 4);
});

test("costo de drawParticles con 4.000 partículas y 5 materiales (diagnóstico, sin objetos por partícula)", (t) => {
    const doc = fakeDoc();
    const anchor = { before() {} };
    const layers = new FluidLayers(doc, anchor, () => {});
    const n = 4000;
    const kinds = Array.from({ length: n }, (_, i) => 1 + (i % 5));
    const colors = Array.from({ length: n }, (_, i) => [((i * 7) % 20) * 12, ((i * 13) % 20) * 12, ((i * 29) % 20) * 12]);
    const { system, box } = fakeSystem(kinds, colors);
    const previous = globalThis.Box2D;
    globalThis.Box2D = box;
    const store = { kind: kinds, slotAt: (i) => i };
    try {
        for (let i = 0; i < 20; i++) drawParticles(layers, system, DRAW, store);
        const frames = 200;
        const start = performance.now();
        for (let i = 0; i < frames; i++) {
            for (const c of doc.created) if (c.draws) c.draws.length = 0;
            drawParticles(layers, system, DRAW, store);
        }
        const ms = (performance.now() - start) / frames;
        t.diagnostic(`${n} partículas: ${ms.toFixed(3)} ms por frame (CPU de JS, contexto falso); sprites horneados ${layers.sprites.baked}`);
        assert.ok(ms < 5);
    } finally {
        globalThis.Box2D = previous;
    }
    assert.ok(METABALL_RADIUS > 0);
});

test("#213: dos gotas del chorro de agua a 18 m/s y 0,18 m se funden en el punto medio solo con el estiramiento por velocidad", () => {
    const radius = DRAW.radius * DRAW.kinds[4].radiusScale;
    const peak = metaballPeak(radius);
    const gap = 18 * 0.01;
    const half = METABALL_RADIUS + Math.min(DROP_STRETCH.max, (18 * DROP_STRETCH.time) / 2);
    const stretched = 2 * metaballAlpha(((gap / 2) * METABALL_RADIUS) / half, peak);
    const round = 2 * metaballAlpha(gap / 2, peak);
    assert.ok(round < METABALL_THRESHOLD, `sin estirar ${round.toFixed(3)}`);
    assert.ok(stretched > METABALL_THRESHOLD, `estirado ${stretched.toFixed(3)}`);
});