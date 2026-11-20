import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers/fluid-bench.js";

const { dropShape, drawParticles, SHOT_DRAW: DRAW } = await import("../js/render.js");

const WATER = 4;

test("el agua de lluvia y la de disparo, en la misma posición, dan la misma primitiva", () => {
    const rain = {};
    const shot = {};
    for (const [x, y] of [[10, 30], [-3.2, 1.7]]) {
        dropShape(x, y, WATER, DRAW, rain);
        dropShape(x, y, WATER, DRAW, shot);
        assert.deepEqual(rain, shot);
    }
});

test("drawParticles: toda partícula de un material es un círculo del mismo radio, vuele a la velocidad que vuele", () => {
    const heap = new Float32Array(64);
    const u8 = new Uint8Array(heap.buffer);
    const speeds = [0, 4, 12, 300];
    speeds.forEach((v, i) => {
        heap[i * 2] = 10 + i;
        heap[i * 2 + 1] = 30;
        heap[16 + i * 2 + 1] = -v;
    });
    const fake = { GetPositionBuffer: () => 0, GetVelocityBuffer: () => 64, GetColorBuffer: () => 128, GetParticleCount: () => 4 };
    const previous = globalThis.Box2D;
    globalThis.Box2D = { HEAPF32: heap, HEAPU8: u8, getPointer: (address) => address };
    const arcs = [];
    const ctx = { beginPath() {}, fill() {}, arc: (x, y, r) => arcs.push([x, y, r]) };
    const store = { kind: [WATER, WATER, WATER, WATER], slotAt: (i) => i };
    try {
        drawParticles(ctx, fake, DRAW.radius, DRAW, store);
    } finally {
        globalThis.Box2D = previous;
    }
    assert.equal(arcs.length, 4);
    for (const [, , r] of arcs) assert.equal(r, DRAW.radius * DRAW.kinds[WATER].radiusScale);
});
