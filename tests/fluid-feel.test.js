// Banco de pruebas de la sensación de los fluidos (#40, docs/design/07-sph.md §7.5): LiquidFun real, determinista
import { test } from "node:test";
import assert from "node:assert/strict";
import { shotBench, poolBench } from "./helpers/fluid-bench.js";

const { WEAPONS, SHOT_SYSTEM } = await import("../js/weapons.js");
const { LEVEL } = await import("../js/level.js");
const { createParticleSystem, PARTICLE } = await import("../js/particles.js");

const fmt = (metrics) => JSON.stringify(metrics, (_, v) => (typeof v === "number" ? Number(v.toFixed(3)) : v));

for (const weapon of WEAPONS) {
    test(`disparos: ${weapon.name} no rebota y no deja partículas sueltas`, (t) => {
        const m = shotBench(SHOT_SYSTEM, weapon);
        t.diagnostic(fmt(m));
        assert.ok(m.impacted >= 20, `solo ${m.impacted} partículas llegaron al piso`);
        assert.ok(m.rebound <= 0.2, `rebote ${m.rebound.toFixed(3)}`);
        assert.ok(m.isolatedPct <= 10, `aisladas ${m.isolatedPct.toFixed(1)} %`);
    });
}

test("agua del nivel: la rotura de presa fluye, se nivela y queda quieta", (t) => {
    const m = poolBench(LEVEL.pool.physics, LEVEL.pool.flags);
    t.diagnostic(fmt(m));
    assert.ok(m.front <= 2, `el frente llega a x 37 en ${m.front.toFixed(2)} s`);
    assert.ok(m.surfaceStd < 0.1, `desvío ${m.surfaceStd.toFixed(3)} m`);
    assert.ok(m.surfaceRange < 0.375, `rango ${m.surfaceRange.toFixed(3)} m`);
    assert.ok(m.speedMean < 0.05, `velocidad media ${m.speedMean.toFixed(3)} m/s`);
    assert.ok(m.speedP95 < 0.2, `p95 ${m.speedP95.toFixed(3)} m/s`);
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

test("el agua del nivel se crea con las fuerzas de LEVEL.pool.physics", async () => {
    const { buildLevel, fillPool } = await import("../js/level.js");
    const world = emptyWorld();
    buildLevel(world);
    const system = fillPool(world);
    assert.ok(Math.abs(system.GetDamping() - LEVEL.pool.physics.dampingStrength) < 1e-6);
    assert.ok(Math.abs(system.GetRadius() - LEVEL.pool.radius) < 1e-6);
});
