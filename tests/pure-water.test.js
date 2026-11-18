import { test } from "node:test";
import assert from "node:assert/strict";
import { damBreak, jetBench, restBench, plateBench, M_P } from "./helpers/water-bench.js";
import { shotBench } from "./helpers/fluid-bench.js";
import { loadGame } from "./helpers/game.js";

const { WEAPONS, SHOT_SYSTEM, FLUID } = await import("../js/weapons.js");
const { ORIGIN } = await import("../js/particleStore.js");
const { LEVEL } = await import("../js/level.js");

const fmt = (value) => JSON.stringify(value, (_, v) => (typeof v === "number" ? Number(v.toFixed(3)) : v));

/**
 * Criterios de #69 (docs/design/14-agua.md §14.16, P1 a P6) con LiquidFun real. Los que no cumplen con los
 * valores del diseño quedan como `todo`: el valor medido está en el diagnóstico y no se ajustan parámetros.
 */
const P1_TODO = "P1 no cumple (ver informe de #69)";
const P4_TODO = "P4 no cumple (ver informe de #69)";
const P5_TODO = "P5 no cumple (ver informe de #69)";

test("P1: rotura de presa, frente medido / Ritter >= 0,65 en toda la ventana 0,3 a 1,5 s", { todo: P1_TODO }, (t) => {
    const { curve, initial } = damBreak();
    const window = curve.filter((c) => c.t >= 0.3 - 1e-9 && c.t <= 1.5 + 1e-9);
    const worst = window.reduce((a, b) => (b.ratio < a.ratio ? b : a));
    const samples = [0.3, 0.6, 0.9, 1.2, 1.5].map((s) => window.find((c) => Math.abs(c.t - s) < 1e-6));
    t.diagnostic(`P1: ${initial} partículas; curva ${samples.map((c) => `t ${c.t.toFixed(1)}: ${c.ratio.toFixed(3)}`).join(", ")}; mínimo ${worst.ratio.toFixed(3)} en t ${worst.t.toFixed(2)}`);
    assert.ok(window.length > 60);
    assert.ok(worst.ratio >= 0.65, `mínimo ${worst.ratio.toFixed(3)} en t ${worst.t.toFixed(2)} s`);
});

for (const weapon of WEAPONS) {
    test(`P2: chorro de ${weapon.name} sin explosión al crear (rapidez y parábola)`, (t) => {
        const m = jetBench(weapon);
        t.diagnostic(`P2 ${weapon.name}: ${fmt(m)}`);
        assert.ok(m.checked > 300, `solo ${m.checked} muestras`);
        assert.equal(m.outSpeed, 0, `${m.outSpeed} muestras con rapidez > esperada + 1 m/s (máximo exceso ${m.maxExcess.toFixed(3)})`);
        assert.equal(m.outDeviation, 0, `${m.outDeviation} muestras con desvío >= r (máximo ${m.maxDeviation.toFixed(3)} m)`);
    });
}

test("P3: compresión en reposo, densidad 1,00 del empaquetado ideal ±10 % en la ventana interior", (t) => {
    const m = restBench();
    t.diagnostic(`P3: ${fmt(m)} (W_full es el dato para #62-E)`);
    assert.ok(Math.abs(m.density - 1) <= 0.1, `densidad ${m.density.toFixed(3)}`);
});

for (const weapon of WEAPONS) {
    test(`P4: ${weapon.name} contra el piso, e = Σ rebote / Σ llegada <= 0,2`, { todo: P4_TODO }, (t) => {
        const m = shotBench(SHOT_SYSTEM, weapon);
        t.diagnostic(`P4 ${weapon.name}: e ${m.rebound.toFixed(3)} con ${m.impacted} partículas`);
        assert.ok(m.impacted >= 10, `solo ${m.impacted} partículas llegaron al piso`);
        assert.ok(m.rebound <= 0.2, `e ${m.rebound.toFixed(3)}`);
    });
}

const THRUST_TODO = new Map([[FLUID.WATER, P5_TODO], [FLUID.ACID, P5_TODO], [FLUID.LAVA, P5_TODO]]);

for (const weapon of WEAPONS) {
    test(`P5: empuje del chorro de ${weapon.name} sobre la placa = rate · σ_w · A_p · v ±15 %`, { todo: THRUST_TODO.get(weapon.id) }, (t) => {
        const expected = weapon.rate * M_P * weapon.speed;
        const m = plateBench(weapon);
        t.diagnostic(`P5 ${weapon.name}: ${m.force.toFixed(1)} N medidos contra ${expected.toFixed(1)} N (${((m.force / expected - 1) * 100).toFixed(1)} %), recorrido de la placa ${m.travel.toExponential(1)} m`);
        assert.ok(Math.abs(m.force / expected - 1) <= 0.15, `${m.force.toFixed(1)} N contra ${expected.toFixed(1)} N`);
    });
}

test("P6: costo con 1.500 disparos vivos e inundación al tope (se mide, no bloquea)", async (t) => {
    const savedRate = LEVEL.flood.maxRate;
    LEVEL.flood.maxRate = 1500;
    try {
        const game = await loadGame();
        const { world, match, immersion, flood, damage, store, particleSystem } = game.state;
        game.setPad(0);
        game.setPad(1);
        game.frames(10);
        match.roundTime = 170;
        game.frames(60 * 20);

        const def = new Box2D.b2ParticleDef();
        const at = new Box2D.b2Vec2(0, 0);
        const color = new Box2D.b2ParticleColor(90, 170, 255, 255);
        def.set_color(color);
        def.set_flags(1 << 14);
        let made = 0;
        for (let row = 0; made < 1500; row++) {
            for (let col = 0; col < 50 && made < 1500; col++) {
                at.set_x(10 + col * 0.18);
                at.set_y(6 + row * 0.18);
                def.set_position(at);
                if (store.create(def, { kind: FLUID.WATER, origin: ORIGIN.SHOT }) >= 0) made++;
            }
        }
        Box2D.destroy(def);
        Box2D.destroy(at);
        Box2D.destroy(color);

        const ms = { step: 0, flood: 0, immersion: 0, process: 0 };
        const timed = (owner, name, key) => {
            const original = owner[name].bind(owner);
            owner[name] = (...args) => {
                const t0 = process.hrtime.bigint();
                const result = original(...args);
                ms[key] += Number(process.hrtime.bigint() - t0) / 1e6;
                return result;
            };
        };
        timed(world, "Step", "step");
        timed(flood, "step", "flood");
        timed(immersion, "step", "immersion");
        timed(damage, "process", "process");
        const frames = 240;
        let live = Infinity;
        game.setPad(0);
        for (let i = 0; i < frames; i++) {
            game.frame();
            live = Math.min(live, particleSystem.GetParticleCount());
        }
        const physics = (ms.step + ms.flood + ms.immersion + ms.process) / frames;
        t.diagnostic(
            `P6: física ${physics.toFixed(2)} ms/frame (world.Step ${(ms.step / frames).toFixed(2)}, flood ${(ms.flood / frames).toFixed(3)}, ` +
                `immersion ${(ms.immersion / frames).toFixed(3)}, process ${(ms.process / frames).toFixed(3)}); ` +
                `mínimo de disparos vivos ${live}; presupuesto 8 ms`,
        );
        assert.ok(Number.isFinite(physics));
        assert.ok(live >= 1400, `solo quedaron ${live} disparos vivos`);
    } finally {
        LEVEL.flood.maxRate = savedRate;
    }
});
