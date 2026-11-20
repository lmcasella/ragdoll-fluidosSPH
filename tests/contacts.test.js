/**
 * Lector de contactos nativos (docs/design/14-agua.md §14.8, #73): `js/contacts.js` encuentra los offsets de los
 * buffers partícula-partícula y partícula-cuerpo con LiquidFun real, los informa en `stats` y se desactiva si no los halla.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { restBench, newWorld, addSolids, wallFor, DT } from "./helpers/water-bench.js";

const { stepWorld } = await import("../lib/ragimporter.js");
const { createParticleSystem } = await import("../js/particles.js");
const { SHOT_SYSTEM, FLUID } = await import("../js/weapons.js");
const { ParticleStore, ORIGIN } = await import("../js/particleStore.js");
const { Contacts, EXPECTED_OFFSETS } = await import("../js/contacts.js");

/** Cae una columna de `count` partículas sobre un piso estático y la deja `seconds` s; devuelve el sistema. */
function scene(count, seconds) {
    const world = newWorld();
    addSolids(world, [{ x: 0, y: -0.5, w: 20, h: 1 }]);
    const system = createParticleSystem(world, SHOT_SYSTEM);
    const store = new ParticleStore(system, SHOT_SYSTEM);
    const wall = wallFor(system, store);
    const def = new Box2D.b2ParticleDef();
    const at = new Box2D.b2Vec2(0, 0);
    for (let k = 0; k < count; k++) {
        at.set_x((k % 8) * 0.09);
        at.set_y(0.1 + Math.floor(k / 8) * 0.09);
        def.set_position(at);
        store.create(def, { kind: FLUID.WATER, origin: ORIGIN.SHOT });
    }
    Box2D.destroy(def);
    Box2D.destroy(at);
    for (let s = 0; s < Math.round(seconds / DT); s++) stepWorld(world, [wall]);
    return { system, wall };
}

test("sin contactos: no hay offsets y no es un fallo", () => {
    const { system, wall } = scene(1, 0.01);
    const reader = new Contacts(system);
    const pp = new Float32Array(16);
    const pb = new Float32Array(16);
    assert.equal(reader.weights(pp, pb, system.GetParticleCount()), true);
    assert.equal(reader.stats.particleOffset, null);
    assert.equal(reader.stats.failed, false);
    wall.dispose();
});

test("con contactos halla +54 (partícula-partícula) y +58 (partícula-cuerpo) y los informa en stats", (t) => {
    const { system, wall } = scene(40, 1);
    const reader = new Contacts(system);
    const n = system.GetParticleCount();
    const pp = new Float32Array(system.GetMaxParticleCount());
    const pb = new Float32Array(system.GetMaxParticleCount());
    assert.equal(reader.weights(pp, pb, n), true);
    t.diagnostic(`offsets hallados: ${JSON.stringify(reader.stats)}; contactos partícula-partícula ${system.GetContactCount()}`);
    assert.equal(reader.stats.particleOffset, EXPECTED_OFFSETS.particle);
    assert.equal(reader.stats.bodyOffset, EXPECTED_OFFSETS.body);
    assert.equal(reader.stats.unexpected, false);
    assert.equal(reader.stats.failed, false);
    let total = 0;
    let touching = 0;
    for (let i = 0; i < n; i++) {
        total += pp[i];
        if (pb[i] > 0) touching++;
        assert.ok(pp[i] >= 0 && pb[i] >= 0 && pp[i] + pb[i] < 8);
    }
    assert.ok(total > 0 && touching > 0, `pesos partícula-partícula ${total}, partículas apoyadas ${touching}`);
    wall.dispose();
});

test("el offset de partícula-partícula coincide con el que mide el banco P3", () => {
    const m = restBench();
    assert.deepEqual(m.contactOffsets, { particle: EXPECTED_OFFSETS.particle, body: EXPECTED_OFFSETS.body });
});

test("un conteo que no coincide con ningún buffer desactiva el lector y avisa una sola vez", () => {
    const { system, wall } = scene(40, 1);
    const lying = Object.create(system);
    lying.GetContactCount = () => 1 + system.GetContactCount();
    const warnings = [];
    const warn = console.warn;
    console.warn = (message) => warnings.push(message);
    try {
        const reader = new Contacts(lying);
        const pp = new Float32Array(system.GetMaxParticleCount());
        const pb = new Float32Array(system.GetMaxParticleCount());
        const n = system.GetParticleCount();
        assert.equal(reader.weights(pp, pb, n), false);
        assert.equal(reader.weights(pp, pb, n), false);
        assert.equal(reader.failed, true);
    } finally {
        console.warn = warn;
    }
    assert.equal(warnings.length, 1, warnings.join(" | "));
    wall.dispose();
});

test("un offset distinto del esperado se informa en stats.unexpected y avisa una sola vez", () => {
    const { system, wall } = scene(1, 0.01);
    const reader = new Contacts(system);
    const warnings = [];
    const warn = console.warn;
    console.warn = (message) => warnings.push(message);
    try {
        reader.note(60, EXPECTED_OFFSETS.particle, "partícula-partícula");
        reader.note(61, EXPECTED_OFFSETS.body, "partícula-cuerpo");
        reader.note(EXPECTED_OFFSETS.body, EXPECTED_OFFSETS.body, "partícula-cuerpo");
    } finally {
        console.warn = warn;
    }
    assert.equal(reader.stats.unexpected, true);
    assert.equal(warnings.length, 1);
    wall.dispose();
});
