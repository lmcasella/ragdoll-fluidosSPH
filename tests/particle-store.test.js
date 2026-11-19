/** ParticleStore (#68, docs/design/14-agua.md §14.2): identidad estable de partículas con LiquidFun real. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
globalThis.Box2D = require("../vendor/liquidfun.js");
globalThis.PIXI = {
    Container: class {
        addChild(child) {
            return child;
        }
        removeChild() {}
        destroy() {}
    },
};

const { ParticleStore, ORIGIN, SINK } = await import("../js/particleStore.js");
const { createParticleSystem } = await import("../js/particles.js");
const { SHOT_SYSTEM, FLUID } = await import("../js/weapons.js");
const { stepWorld } = await import("../lib/ragimporter.js");

function scene(maxCount) {
    const gravity = new Box2D.b2Vec2(0, 0);
    const world = new Box2D.b2World(gravity);
    Box2D.destroy(gravity);
    const params = { ...SHOT_SYSTEM, maxCount };
    const system = createParticleSystem(world, params);
    const store = new ParticleStore(system, params);
    const def = new Box2D.b2ParticleDef();
    const position = new Box2D.b2Vec2(0, 0);
    const make = (x, props) => {
        position.set_x(x);
        def.set_position(position);
        return store.create(def, props);
    };
    const step = () => {
        stepWorld(world, []);
        store.afterStep();
    };
    const userData = () => {
        const buffer = system.GetUserDataBuffer() >> 2;
        return Array.from({ length: system.GetParticleCount() }, (_, i) => Box2D.HEAP32[buffer + i]);
    };
    const xs = () => {
        const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
        return Array.from({ length: system.GetParticleCount() }, (_, i) => Box2D.HEAPF32[pos + 2 * i]);
    };
    return { world, system, store, make, step, userData, xs };
}

function seeded(seed) {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

test("S1: destruir las de índice par y llamar a stepWorld conserva el orden de las sobrevivientes y su estado", () => {
    const { system, store, make, step, userData, xs } = scene(64);
    for (let i = 0; i < 20; i++) make(i * 0.5, { kind: FLUID.ACID, shot: 100 + i });
    const before = userData();
    assert.deepEqual(before, Array.from({ length: 20 }, (_, i) => i + 1), "userData = slot + 1");

    for (let i = 0; i < 20; i += 2) store.destroy(i, SINK.OUT);
    step();

    assert.equal(system.GetParticleCount(), 10);
    const expected = before.filter((_, i) => i % 2 === 1);
    assert.deepEqual(userData(), expected);
    let errors = 0;
    xs().forEach((x, i) => {
        const original = 2 * i + 1;
        const slot = store.slotAt(i);
        if (slot !== original || store.shot[slot] !== 100 + original || store.kind[slot] !== FLUID.ACID || Math.abs(x - original * 0.5) > 0.2) errors++;
    });
    assert.equal(errors, 0);
});

test("S2: destruir y crear en el mismo frame nunca comparte slot entre una zombi y una viva (10.000 ciclos con semilla)", () => {
    const { system, store, make, step, userData } = scene(48);
    const random = seeded(68);
    let model = [];
    let zombies = new Set();
    let collisions = 0;
    let mismatches = 0;
    for (let cycle = 0; cycle < 10000; cycle++) {
        const kills = Math.floor(random() * 4);
        for (let k = 0; k < kills && system.GetParticleCount() > 0; k++) {
            const index = Math.floor(random() * system.GetParticleCount());
            const slot = store.slotAt(index);
            if (store.alive[slot] === 1) zombies.add(slot);
            store.destroy(index, SINK.OUT);
        }
        const births = Math.floor(random() * 4);
        for (let b = 0; b < births; b++) {
            const index = make(random() * 10, { kind: FLUID.WATER, shot: cycle });
            if (index < 0) continue;
            const slot = store.slotAt(index);
            if (zombies.has(slot) || model.some((m) => m.slot === slot && !m.dead)) collisions++;
            model[index] = { slot, shot: cycle, dead: false };
        }
        for (const slot of zombies) {
            const entry = model.find((m) => m.slot === slot && !m.dead);
            if (entry) entry.dead = true;
        }
        if (random() < 0.3) {
            step();
            model = model.filter((m) => !m.dead);
            zombies = new Set();
            const data = userData();
            if (data.length !== model.length) mismatches++;
            else data.forEach((d, i) => (d !== model[i].slot + 1 || store.shot[model[i].slot] !== model[i].shot) && mismatches++);
        }
    }
    assert.equal(collisions, 0);
    assert.equal(mismatches, 0);
});

test("S4: con el sistema lleno y zombis pendientes, create devuelve -1 y no cambia ningún índice ni userData", () => {
    const { system, store, make, step, userData, xs } = scene(8);
    for (let i = 0; i < 8; i++) make(i, { kind: FLUID.HONEY, shot: i + 1 });
    store.destroy(1, SINK.OUT);
    store.destroy(4, SINK.OUT);
    store.destroy(6, SINK.OUT);
    const dataBefore = userData();
    const xsBefore = xs();
    const countBefore = system.GetParticleCount();

    assert.equal(make(99, { kind: FLUID.HONEY }), -1);
    assert.equal(system.GetParticleCount(), countBefore);
    assert.deepEqual(userData(), dataBefore);
    assert.deepEqual(xs(), xsBefore);

    step();
    assert.equal(system.GetParticleCount(), 5);
    assert.ok(make(99, { kind: FLUID.HONEY }) >= 0, "después del paso hay lugar");
});

test("S5: ParticleStore lanza un error si destroyByAge no es false", () => {
    const { system } = scene(8);
    assert.throws(() => new ParticleStore(system, { ...SHOT_SYSTEM, destroyByAge: true }), /destroyByAge/);
    assert.throws(() => new ParticleStore(system, { radius: 0.1, maxCount: 8 }), /destroyByAge/);
    assert.doesNotThrow(() => new ParticleStore(system, SHOT_SYSTEM));
    assert.equal(SHOT_SYSTEM.destroyByAge, false);
});

test("destroy es idempotente, afterStep libera el slot y reset destruye todo", () => {
    const { system, store, make, step } = scene(8);
    for (let i = 0; i < 3; i++) make(i, { kind: FLUID.LAVA, origin: ORIGIN.MAP, shot: 0 });
    assert.equal(store.origin[0], ORIGIN.MAP);
    store.destroy(1, SINK.OUT);
    store.destroy(1, SINK.OUT);
    assert.equal(store.pendingCount, 1);
    assert.equal(store.freeCount, 8 - 3);
    step();
    assert.equal(store.pendingCount, 0);
    assert.equal(store.freeCount, 8 - 2);
    store.reset();
    assert.equal(store.alive.reduce((a, b) => a + b, 0), 0);
    step();
    assert.equal(system.GetParticleCount(), 0);
    assert.equal(store.freeCount, 8);
});

test("libro de masa: created y destroyed por causa y tipo; destroy exige causa; reset lo pone en cero", () => {
    const { store, make } = scene(8);
    for (let i = 0; i < 3; i++) make(i, { kind: FLUID.ACID, origin: ORIGIN.SHOT, shot: 1 });
    make(3, { kind: FLUID.HONEY, origin: ORIGIN.SHOT, shot: 1 });
    assert.equal(store.created[FLUID.ACID], 3);
    assert.equal(store.created[FLUID.HONEY], 1);
    assert.throws(() => store.destroy(0), /causa/);
    assert.throws(() => store.destroy(0, 99), /causa/);
    store.destroy(0, SINK.HIT);
    store.destroy(0, SINK.HIT);
    store.destroy(3, SINK.PERSIST_CAP);
    assert.equal(store.destroyed[SINK.HIT][FLUID.ACID], 1);
    assert.equal(store.destroyed[SINK.PERSIST_CAP][FLUID.HONEY], 1);
    store.reset();
    assert.equal(store.destroyed[SINK.RESET][FLUID.ACID], 0);
    assert.equal(store.created[FLUID.ACID], 0);
});
