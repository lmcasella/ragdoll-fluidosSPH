import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
globalThis.Box2D ??= require("../vendor/liquidfun.js");
globalThis.PIXI ??= {
    Container: class {
        addChild(child) {
            return child;
        }
        removeChild() {}
        destroy() {}
    },
};

const { stepWorld } = await import("../lib/ragimporter.js");
const { createParticleSystem } = await import("../js/particles.js");
const { SHOT_SYSTEM } = await import("../js/weapons.js");
const { ParticleStore } = await import("../js/particleStore.js");
const { WallContact } = await import("../js/wallContact.js");

/** Piso estático con la cara superior en y = 0 y un sistema de disparos sin gravedad. */
function scene() {
    const gravity = new Box2D.b2Vec2(0, 0);
    const world = new Box2D.b2World(gravity);
    Box2D.destroy(gravity);
    const bodyDef = new Box2D.b2BodyDef();
    const ground = world.CreateBody(bodyDef);
    Box2D.destroy(bodyDef);
    const shape = new Box2D.b2PolygonShape();
    const center = new Box2D.b2Vec2(0, -0.5);
    shape.SetAsBox(10, 0.5, center, 0);
    ground.CreateFixture(shape, 0);
    Box2D.destroy(center);
    Box2D.destroy(shape);
    const system = createParticleSystem(world, SHOT_SYSTEM);
    const store = new ParticleStore(system, SHOT_SYSTEM);
    const wall = new WallContact(system, store);
    const def = new Box2D.b2ParticleDef();
    const position = new Box2D.b2Vec2(0, 0);
    const velocity = new Box2D.b2Vec2(0, 0);
    const spawn = (y, vy) => {
        position.set_y(y);
        velocity.set_y(vy);
        def.set_position(position);
        def.set_velocity(velocity);
        return store.create(def, {});
    };
    const vyOf = (i) => Box2D.HEAPF32[(Box2D.getPointer(system.GetVelocityBuffer()) >> 2) + 2 * i + 1];
    const yOf = (i) => Box2D.HEAPF32[(Box2D.getPointer(system.GetPositionBuffer()) >> 2) + 2 * i + 1];
    return { world, system, store, wall, spawn, vyOf, yOf, radius: system.GetRadius() };
}

test("wallContact: una partícula pegada al piso con velocidad saliente la conserva", () => {
    const { world, store, wall, spawn, vyOf, yOf, radius } = scene();
    const index = spawn(0.5 * radius, 3);
    assert.ok(index >= 0);
    stepWorld(world, [wall]);
    store.afterStep();
    assert.ok(yOf(0) > 0.5 * radius, `la partícula no subió: y = ${yOf(0)}`);
    assert.ok(vyOf(0) >= 2.9, `perdió la velocidad de emisión: vy = ${vyOf(0)}`);
});

test("wallContact: una partícula que choca contra el piso no rebota (e <= 0,2)", () => {
    const { world, store, wall, spawn, vyOf, radius } = scene();
    spawn(4 * radius, -4);
    let arrival = 0;
    let rebound = 0;
    let hit = false;
    for (let step = 0; step < 90; step++) {
        stepWorld(world, [wall]);
        store.afterStep();
        const vy = vyOf(0);
        if (!hit && vy > -0.5 * 4) hit = true;
        if (!hit) arrival = Math.max(arrival, -vy);
        else rebound = Math.max(rebound, vy);
    }
    assert.ok(arrival > 3, `llegó con ${arrival} m/s`);
    assert.ok(rebound / arrival <= 0.2, `e = ${rebound / arrival}`);
});
