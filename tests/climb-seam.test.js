/**
 * C9 (#25, docs/design/16-ascenso.md §16.7): costura de la grilla de LiquidFun. Con partículas de radio 0,06 m el tag de
 * `y / diámetro` da la vuelta en y = 245,76 m: una fixture cuya caja cruza esa altura pierde los contactos con las
 * partículas. Se sueltan 50 partículas sobre una plataforma con el tope 1 m sobre la costura y 50 sobre una que la cruza.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
globalThis.Box2D = require("../vendor/liquidfun.js");

const { ParticleStore, ORIGIN } = await import("../js/particleStore.js");
const { createParticleSystem } = await import("../js/particles.js");
const { SHOT_SYSTEM, FLUID } = await import("../js/weapons.js");
const { seamHeights } = await import("../js/climb.js");
const { stepWorld } = await import("../lib/ragimporter.js");

const COUNT = 50;
const STEPS = 240;

/** Suelta `COUNT` partículas sobre una caja estática de tope `top` y alto `height`, y cuenta las que quedan apoyadas y las que la atraviesan. */
function drop(top, height) {
    const gravity = new Box2D.b2Vec2(0, -10);
    const world = new Box2D.b2World(gravity);
    Box2D.destroy(gravity);
    const system = createParticleSystem(world, SHOT_SYSTEM);
    const store = new ParticleStore(system, SHOT_SYSTEM);
    const bodyDef = new Box2D.b2BodyDef();
    const body = world.CreateBody(bodyDef);
    const shape = new Box2D.b2PolygonShape();
    const center = new Box2D.b2Vec2(0, top - height / 2);
    shape.SetAsBox(5, height / 2, center, 0);
    body.CreateFixture(shape, 0);
    const def = new Box2D.b2ParticleDef();
    const position = new Box2D.b2Vec2(0, 0);
    for (let i = 0; i < COUNT; i++) {
        position.set_x(-1.8 + (i % 25) * 0.15);
        position.set_y(top + 0.3 + Math.floor(i / 25) * 0.15);
        def.set_position(position);
        store.create(def, { kind: FLUID.WATER, origin: ORIGIN.RAIN });
    }
    for (let i = 0; i < STEPS; i++) {
        stepWorld(world, []);
        store.afterStep();
    }
    const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
    let resting = 0;
    let through = 0;
    for (let i = 0; i < system.GetParticleCount(); i++) {
        const y = Box2D.HEAPF32[pos + 2 * i + 1];
        if (y > top - 0.05) resting++;
        else if (y < top - height) through++;
    }
    const floorY = top - height;
    Box2D.destroy(def);
    Box2D.destroy(position);
    Box2D.destroy(center);
    Box2D.destroy(shape);
    Box2D.destroy(bodyDef);
    return { resting, through, floorY };
}

test("C9: las partículas quedan apoyadas sobre una plataforma sobre la costura y la atraviesan si la cruza", () => {
    const [seam] = seamHeights(SHOT_SYSTEM.radius, 0, 1000);
    const above = drop(seam + 1, 0.4);
    const across = drop(seam + 0.2, 0.4);
    console.log(
        `C9: costura en ${seam.toFixed(3)} m; plataforma con el tope en ${(seam + 1).toFixed(2)} m: ${above.resting} apoyadas, ${above.through} atravesaron; plataforma que cruza (tope ${(seam + 0.2).toFixed(2)} m): ${across.resting} apoyadas, ${across.through} atravesaron`,
    );
    assert.ok(above.resting >= COUNT - 2 && above.through === 0, `sobre la costura: ${above.resting} apoyadas, ${above.through} atravesaron`);
    assert.ok(across.through >= COUNT / 2, `cruzando la costura: ${across.through} atravesaron`);
});
