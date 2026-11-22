import { test } from "node:test";
import assert from "node:assert/strict";
import { damBreak, jetBench, restBench, plateBench, M_P } from "../helpers/water-bench.js";
import { shotBench } from "../helpers/fluid-bench.js";
import { loadGame } from "../helpers/game.js";
import { fillField } from "../helpers/water-scene.js";

const { WEAPONS, SHOT_SYSTEM, FLUID } = await import("../../js/weapons.js");
const { ORIGIN } = await import("../../js/particleStore.js");
const { LEVEL } = await import("../../js/level.js");

const fmt = (value) => JSON.stringify(value, (_, v) => (typeof v === "number" ? Number(v.toFixed(3)) : v));

/**
 * Criterios de #69 (docs/design/14-agua.md §14.16, P1 a P5) con LiquidFun real y el contorno inelástico del juego
 * (`js/wallContact.js`).
 */
/**
 * Asentado de P1 en segundos, igual para los tres h₀. La precondición de reposo es la velocidad cuadrática media
 * |v|rms ≤ 0,2 m/s: con r = 0,06 m el máximo lo dominan partículas sueltas de la columna alta y solo se informa.
 */
const P1_SETTLE = 7;
for (const h0 of [1, 2]) {
    test(`P1: rotura de presa con h₀ = ${h0} m, pendiente del frente contra 2√(g h₀) − 2√(g δ) ±10 % en t √(g/h₀) de 2 a 3,4`, (t) => {
        const m = damBreak({ h0, settle: P1_SETTLE });
        t.diagnostic(
            `P1 h₀ ${h0}: ${m.initial} partículas, |v|rms al soltar ${m.vrmsSettle.toFixed(3)} m/s (|v|max ${m.vmaxSettle.toFixed(3)} m/s); pendiente ${m.slope.toFixed(2)} m/s contra ${m.expected.toFixed(2)} m/s ` +
                `(${((m.slope / m.expected - 1) * 100).toFixed(1)} %) con ${m.samples} muestras; retardo t₀ √(g/h₀) ${m.lag.toFixed(2)}`,
        );
        assert.ok(m.vrmsSettle <= 0.2, `|v|rms al soltar ${m.vrmsSettle.toFixed(3)} m/s`);
        assert.ok(m.samples >= 20, `solo ${m.samples} muestras`);
        assert.ok(Math.abs(m.slope / m.expected - 1) <= 0.1, `pendiente ${m.slope.toFixed(2)} m/s contra ${m.expected.toFixed(2)} m/s`);
    });
}
/**
 * P1 con h₀ = 3 m es un límite declarado del motor: la columna alta excita el modo acústico vertical de LiquidFun
 * (período ≈ 0,6 s, |v|rms 0,26–0,61 m/s, presente también sin el contorno; compresibilidad débil con r = 0,06 m).
 * Se corre con cinco asentados que cubren un período del modo: se exige la pendiente y solo se informa el reposo.
 */
for (const settle of [6.3, 6.45, 6.6, 6.75, 6.9]) {
    test(`P1: rotura de presa con h₀ = 3 m, asentado de ${settle} s, pendiente del frente ±10 % (|v| solo se informa)`, (t) => {
        const m = damBreak({ h0: 3, settle });
        t.diagnostic(
            `P1 h₀ 3 asentado ${settle} s: |v|rms ${m.vrmsSettle.toFixed(3)} m/s, |v|max ${m.vmaxSettle.toFixed(3)} m/s; pendiente ${m.slope.toFixed(2)} m/s contra ${m.expected.toFixed(2)} m/s ` +
                `(${((m.slope / m.expected - 1) * 100).toFixed(1)} %) con ${m.samples} muestras`,
        );
        assert.ok(m.samples >= 20, `solo ${m.samples} muestras`);
        assert.ok(Math.abs(m.slope / m.expected - 1) <= 0.1, `pendiente ${m.slope.toFixed(2)} m/s contra ${m.expected.toFixed(2)} m/s`);
    });
}
for (const weapon of WEAPONS) {
    test(`P2: chorro de ${weapon.name} sin explosión al crear (rapidez y parábola)`, (t) => {
        const m = jetBench(weapon);
        t.diagnostic(`P2 ${weapon.name}: ${fmt(m)}`);
        assert.ok(m.checked > 300, `solo ${m.checked} muestras`);
        assert.equal(m.outSpeed, 0, `${m.outSpeed} muestras con rapidez > esperada + 1 m/s (máximo exceso ${m.maxExcess.toFixed(3)})`);
        assert.equal(m.outDeviation, 0, `${m.outDeviation} muestras con desvío >= r (máximo ${m.maxDeviation.toFixed(3)} m)`);
    });
}

test("P3: compresión en reposo, densidad 1,00 del empaquetado ideal ±10 % en la ventana interior y nada fuera del tanque", (t) => {
    const m = restBench();
    t.diagnostic(`P3: ${fmt(m)} (W_full es el dato para #62-E)`);
    assert.equal(m.escaped, 0, `${m.escaped} partículas fuera del tanque`);
    assert.ok(Math.abs(m.density - 1) <= 0.1, `densidad ${m.density.toFixed(3)}`);
});

for (const weapon of WEAPONS) {
    test(`P4: ${weapon.name} contra el piso, e = Σ rebote / Σ llegada <= 0,2`, (t) => {
        const m = shotBench(SHOT_SYSTEM, weapon);
        t.diagnostic(`P4 ${weapon.name}: e ${m.rebound.toFixed(3)} con ${m.impacted} partículas`);
        assert.ok(m.impacted >= 10, `solo ${m.impacted} partículas llegaron al piso`);
        assert.ok(m.rebound <= 0.2, `e ${m.rebound.toFixed(3)}`);
    });
}

for (const weapon of WEAPONS) {
    test(`P5: empuje del chorro de ${weapon.name} sobre la placa = rate · σ_w · A_p · v ±15 %`, (t) => {
        const expected = weapon.rate * M_P * weapon.speed;
        const m = plateBench(weapon);
        const drift = Math.abs(m.force - m.balance) / expected;
        t.diagnostic(`P5 ${weapon.name}: ${m.force.toFixed(1)} N medidos contra ${expected.toFixed(1)} N (${((m.force / expected - 1) * 100).toFixed(1)} %), balance de momento ${m.balance.toFixed(1)} N (error de conservación ${(drift * 100).toFixed(2)} % de la referencia), recorrido de la placa ${m.travel.toExponential(1)} m`);
        assert.ok(Math.abs(m.force / expected - 1) <= 0.15, `${m.force.toFixed(1)} N contra ${expected.toFixed(1)} N`);
        assert.ok(drift <= 0.01, `|F_motor − balance de momento| = ${(drift * 100).toFixed(2)} % de la referencia`);
    });
}

test("P6: costo con 1.500 disparos vivos (lava, que el campo no absorbe) sumergidos en la inundación al tope (se mide, no bloquea)", async (t) => {
    {
        const game = await loadGame();
        const { world, match, immersion, flood, damage, store, particleSystem, wallContact, water } = game.state;
        game.setPad(0);
        game.setPad(1);
        game.frames(10);
        fillField(water, 14);
        match.roundTime = LEVEL.flood.start + 200;
        game.frames(60 * 5);

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
                if (store.create(def, { kind: FLUID.LAVA, origin: ORIGIN.SHOT }) >= 0) made++;
            }
        }
        Box2D.destroy(def);
        Box2D.destroy(at);
        Box2D.destroy(color);
        const ms = { step: 0, wall: 0, flood: 0, immersion: 0, water: 0, process: 0 };
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
        timed(wallContact, "update", "wall");
        timed(flood, "step", "flood");
        timed(immersion, "step", "immersion");
        timed(water, "step", "water");
        timed(damage, "process", "process");
        const frames = 240;
        let live = Infinity;
        game.setPad(0);
        for (let i = 0; i < frames; i++) {
            game.frame();
            live = Math.min(live, particleSystem.GetParticleCount());
        }
        const physics = (ms.step + ms.wall + ms.flood + ms.immersion + ms.water + ms.process) / frames;
        t.diagnostic(
            `P6: física ${physics.toFixed(2)} ms/frame (world.Step ${(ms.step / frames).toFixed(2)}, wallContact ${(ms.wall / frames).toFixed(3)}, flood ${(ms.flood / frames).toFixed(3)}, ` +
                `immersion ${(ms.immersion / frames).toFixed(3)}, water ${(ms.water / frames).toFixed(3)}, process ${(ms.process / frames).toFixed(3)}); ` +
                `mínimo de disparos vivos ${live}; presupuesto 8 ms`,
        );
        assert.ok(Number.isFinite(physics));
        assert.ok(live >= 1400, `solo quedaron ${live} disparos vivos`);
    }
});
