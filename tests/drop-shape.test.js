import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers/fluid-bench.js";

const { dropShape, SHOT_DRAW: DRAW } = await import("../src/render/render.js");

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
