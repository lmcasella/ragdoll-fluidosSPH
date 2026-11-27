/**
 * Adaptador de Box2D de `src/core/engine/box2d.js` (#307) con LiquidFun real.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { newScene, addBox } from "./helpers/film-scene.js";

const { forEachFixture, fixtureBounds, forEachBody } = await import("../src/core/engine/box2d.js");

const STATIC_BODY = 0;
const BOX_HALF_WIDTH = 1;
const BOX_HALF_HEIGHT = 0.5;

function sceneWithBoxes() {
    const scene = newScene({ gravity: 0 });
    addBox(scene, "left", { x: 2, y: 3, w: 2 * BOX_HALF_WIDTH, h: 2 * BOX_HALF_HEIGHT, type: STATIC_BODY });
    addBox(scene, "right", { x: 8, y: 5, w: 2 * BOX_HALF_WIDTH, h: 2 * BOX_HALF_HEIGHT, type: STATIC_BODY });
    return scene;
}

test("forEachFixture recorre los fixtures de un cuerpo con el contexto", () => {
    const scene = sceneWithBoxes();
    const context = { count: 0 };
    forEachFixture(scene.bodies.get("left"), (fixture, data) => data.count++, context);
    assert.equal(context.count, 1);
    scene.dispose();
});

test("fixtureBounds escribe la caja del fixture en el objeto de salida", () => {
    const scene = sceneWithBoxes();
    const out = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    forEachFixture(scene.bodies.get("right"), (fixture) => fixtureBounds(fixture, out), null);
    const tolerance = 0.1;
    assert.ok(Math.abs(out.minX - 7) < tolerance);
    assert.ok(Math.abs(out.maxX - 9) < tolerance);
    assert.ok(Math.abs(out.minY - 4.5) < tolerance);
    assert.ok(Math.abs(out.maxY - 5.5) < tolerance);
    scene.dispose();
});

test("forEachBody visita todos los cuerpos en orden de inserción", () => {
    const scene = sceneWithBoxes();
    const visited = [];
    forEachBody(scene.bodies, (body, context) => context.push(body), visited);
    assert.deepEqual(visited, [scene.bodies.get("left"), scene.bodies.get("right")]);
    scene.dispose();
});
