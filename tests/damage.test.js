import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
globalThis.Box2D = require("../vendor/liquidfun.js");

const { DamageSystem, FLUID } = await import("../js/damage.js");

// Regla de fuego amigo (docs/design/12-decisiones.md): el fluido propio no daña a su dueño
// durante 0,4 s desde el disparo; después sí.
function setup() {
    const gravity = new Box2D.b2Vec2(0, -10);
    const world = new Box2D.b2World(gravity);
    Box2D.destroy(gravity);
    const destroyed = [];
    const particleSystem = { DestroyParticle: (i) => destroyed.push(i) };
    const damage = new DamageSystem(world, particleSystem);
    const hurts = [];
    const player = { hurt: (bodyId, amount) => hurts.push({ bodyId, amount }) };
    const owner = { player, index: 0, bodyId: "torso" };
    const hit = (shotOwner, shotTime, index = 1) =>
        damage.fluidHits.push({
            owner,
            index,
            shot: { owner: shotOwner, weapon: FLUID.ACID, time: shotTime },
            kind: FLUID.ACID,
        });
    return { damage, hit, hurts, destroyed };
}

test("el ácido propio no daña al dueño dentro de los 0,4 s del disparo", () => {
    const { damage, hit, hurts, destroyed } = setup();
    hit(0, 10);
    damage.process(10.3);
    assert.equal(hurts.length, 0);
    assert.equal(destroyed.length, 0);
});

test("el ácido propio daña al dueño pasados los 0,4 s (charco propio)", () => {
    const { damage, hit, hurts, destroyed } = setup();
    hit(0, 10);
    damage.process(10.5);
    assert.equal(hurts.length, 1);
    assert.deepEqual(destroyed, [1]);
});

test("el ácido del rival daña sin período de gracia", () => {
    const { damage, hit, hurts } = setup();
    hit(1, 10);
    damage.process(10.01);
    assert.equal(hurts.length, 1);
});
