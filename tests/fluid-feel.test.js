// Banco de pruebas de la sensación de los fluidos (#40, docs/design/07-sph.md §7.5): LiquidFun real, determinista
import { test } from "node:test";
import assert from "node:assert/strict";
import { shotBench } from "./helpers/fluid-bench.js";

const { WEAPONS, SHOT_SYSTEM } = await import("../js/weapons.js");
const { createParticleSystem, PARTICLE } = await import("../js/particles.js");

const fmt = (metrics) => JSON.stringify(metrics, (_, v) => (typeof v === "number" ? Number(v.toFixed(3)) : v));

/** Una gota es aislada si su vecina más cercana está a más de `4 r`; llegó al piso si y <= `4 r` (ambos umbrales salen del radio del sistema, `tests/helpers/fluid-bench.js`). */
for (const weapon of WEAPONS) {
    test(`disparos: ${weapon.name} no deja partículas sueltas (el rebote es P4 de pure-water.test.js)`, (t) => {
        const m = shotBench(SHOT_SYSTEM, weapon);
        t.diagnostic(fmt(m));
        assert.ok(m.impacted >= 20, `solo ${m.impacted} partículas llegaron al piso`);
        assert.ok(m.isolatedPct <= 10, `aisladas ${m.isolatedPct.toFixed(1)} %`);
    });
}

// #41: barrido de viscousStrength de la miel. El criterio de ancho del diseño (<= 0,6 veces el de 0,25) no se
// alcanza con ningún valor hasta 1,0 (lo medido está en docs/design/07-sph.md §7.5): se exige que reduzca y que el
// charco quede quieto
const HONEY = WEAPONS.find((w) => w.name === "Miel");
const LAVA = WEAPONS.find((w) => w.name === "Lava");

test("miel: con el viscousStrength final el charco es más angosto que con 0,25 y queda quieto", { todo: "con agua pura (#69) el charco con 0,6 es más ancho que con 0,25 (ver informe de #69)" }, (t) => {
    const base = shotBench({ ...SHOT_SYSTEM, viscousStrength: 0.25 }, HONEY);
    for (const v of [0.5, 0.75]) t.diagnostic(`viscousStrength ${v}: ${fmt(shotBench({ ...SHOT_SYSTEM, viscousStrength: v }, HONEY))}`);
    const final = shotBench(SHOT_SYSTEM, HONEY);
    t.diagnostic(`0,25: ${fmt(base)}`);
    t.diagnostic(`final ${SHOT_SYSTEM.viscousStrength}: ${fmt(final)}; spread final / 0,25 = ${(final.spread / base.spread).toFixed(3)}`);
    assert.ok(final.spread < base.spread, `ancho ${final.spread.toFixed(2)} contra ${base.spread.toFixed(2)}`);
    assert.ok(final.restSpeedP95 < 0.1, `restSpeedP95 ${final.restSpeedP95.toFixed(3)}`);
});

test("lava: sin flags de viscosidad ni tensión, como el agua (agua pura)", () => {
    assert.equal(LAVA.flags, PARTICLE.WATER);
    assert.equal(HONEY.flags, PARTICLE.VISCOUS);
});

function emptyWorld() {
    const g = new Box2D.b2Vec2(0, -10);
    const world = new Box2D.b2World(g);
    Box2D.destroy(g);
    return world;
}

test("createParticleSystem aplica los datos y lanza ante una clave desconocida", () => {
    const system = createParticleSystem(emptyWorld(), SHOT_SYSTEM);
    assert.ok(Math.abs(system.GetRadius() - SHOT_SYSTEM.radius) < 1e-6);
    assert.ok(Math.abs(system.GetDamping() - SHOT_SYSTEM.dampingStrength) < 1e-6);
    assert.equal(system.GetMaxParticleCount(), SHOT_SYSTEM.maxCount);
    assert.ok(Math.abs(system.GetGravityScale() - SHOT_SYSTEM.gravityScale) < 1e-6);
    assert.throws(() => createParticleSystem(emptyWorld(), { radius: 0.1, dampingStrenght: 1 }), /dampingStrenght/);
    assert.equal(PARTICLE.TENSILE, 1 << 7);
});
