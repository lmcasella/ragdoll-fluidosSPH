/**
 * `PolygonFixtureBuilder` de `src/core/engine/box2d.js` (#346) con LiquidFun real: forma, filtro y memoria nativa.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { newScene, addBox } from "./helpers/film-scene.js";

const { PolygonFixtureBuilder, MAX_POLYGON_VERTICES, boundsOfBody } = await import("../src/core/engine/box2d.js");

const STATIC_BODY = 0;
const AABB_TOLERANCE = 0.1;
const CREATIONS = 1000;
/** Cada cuántas creaciones avanza el mundo: Box2D vacía su lista de movimientos de la fase ancha solo al avanzar. */
const STEP_EVERY = 10;
const PROBE_BYTES = 1 << 20;

function emptyBody(scene) {
    return addBox(scene, "ground", { x: 0, y: 0, w: 0.2, h: 0.2, type: STATIC_BODY });
}

function heapTop() {
    const pointer = Box2D._malloc(PROBE_BYTES);
    Box2D._free(pointer);
    return pointer;
}

test("un polígono creado con el constructor tiene la caja, la fricción y el filtro pedidos", () => {
    const scene = newScene({ gravity: 0 });
    const body = emptyBody(scene);
    const builder = new PolygonFixtureBuilder();
    const filter = { categoryBits: 4, maskBits: 2, groupIndex: -3 };
    const fixture = builder.createPolygon(body, [10, 10, 14, 10, 14, 12, 10, 12], { friction: 0.8, filter, userData: 7 });
    assert.ok(Math.abs(fixture.GetFriction() - 0.8) < 1e-6);
    assert.equal(fixture.GetFilterData().get_categoryBits(), 4);
    assert.equal(fixture.GetFilterData().get_maskBits(), 2);
    assert.equal(fixture.GetFilterData().get_groupIndex(), -3);
    assert.equal(fixture.GetUserData(), 7);
    const bounds = boundsOfBody(body, { minX: 0, minY: 0, maxX: 0, maxY: 0 });
    assert.ok(Math.abs(bounds.maxX - 14) < AABB_TOLERANCE && Math.abs(bounds.maxY - 12) < AABB_TOLERANCE);
    builder.dispose();
    scene.dispose();
});

test("createBox da la misma caja que SetAsBox", () => {
    const scene = newScene({ gravity: 0 });
    const body = emptyBody(scene);
    const builder = new PolygonFixtureBuilder();
    const fixture = builder.createBox(body, { x: 20, y: 5, width: 12, height: 0.4 });
    const aabb = fixture.GetAABB(0);
    assert.ok(Math.abs(aabb.get_lowerBound().get_x() - 14) < AABB_TOLERANCE);
    assert.ok(Math.abs(aabb.get_upperBound().get_x() - 26) < AABB_TOLERANCE);
    assert.ok(Math.abs(aabb.get_lowerBound().get_y() - 4.8) < AABB_TOLERANCE);
    assert.ok(Math.abs(aabb.get_upperBound().get_y() - 5.2) < AABB_TOLERANCE);
    builder.dispose();
    scene.dispose();
});

test("rechaza polígonos con más vértices que Box2D", () => {
    const scene = newScene({ gravity: 0 });
    const body = emptyBody(scene);
    const builder = new PolygonFixtureBuilder();
    const tooMany = new Array(2 * (MAX_POLYGON_VERTICES + 1)).fill(0);
    assert.throws(() => builder.createPolygon(body, tooMany), RangeError);
    builder.dispose();
    scene.dispose();
});

test("1000 creaciones y destrucciones de fixtures no hacen crecer el heap", (t) => {
    const scene = newScene({ gravity: 0 });
    const body = emptyBody(scene);
    const builder = new PolygonFixtureBuilder();
    const createAndDestroy = (index) => {
        body.DestroyFixture(builder.createBox(body, { x: 3, y: 3, width: 1, height: 1 }));
        if (index % STEP_EVERY === 0) scene.step();
    };
    for (let index = 0; index < CREATIONS; index++) createAndDestroy(index);
    const before = heapTop();
    const size = Box2D.HEAP8.length;
    for (let index = 0; index < CREATIONS; index++) createAndDestroy(index);
    const after = heapTop();
    t.diagnostic(`tope del heap antes ${before} y después ${after}; tamaño ${Box2D.HEAP8.length} B`);
    assert.equal(after, before);
    assert.equal(Box2D.HEAP8.length, size);
    builder.dispose();
    scene.dispose();
});

test("dispose devuelve el buffer del heap", () => {
    const before = heapTop();
    const builder = new PolygonFixtureBuilder();
    builder.dispose();
    assert.equal(heapTop(), before);
});
