/**
 * Invariantes de masa y energía con ebullición (docs/design/14-agua.md §14.16 G y T1, #112): la escena estándar de
 * `tests/helpers/invariants-run.js` (el juego real con gamepad simulado) más una zona de la pileta a 100 °C, 60 partículas
 * de lava, 24 de ácido y 24 de agua a 90 °C que caen sobre ella. El vapor que sale de las columnas, el que sube y sale
 * del mundo y el ácido que queda en las columnas se cuentan por especie (I1, con el vapor como H2O) y por material (I2b).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runStandardScene, MASS_TOLERANCE, SPECIES } from "../helpers/invariants-run.js";

const { FLUID } = await import("../../src/combat/weapons.js");
const { MATERIALS, SIGMA_W } = await import("../../src/fluids/materials.js");
const { SINK, ORIGIN } = await import("../../src/fluids/particleStore.js");

const WINDOW = 45;
let game = null;
let energy0 = 0;
let worstEnergy = 0;
let injected = 0;
let removed = 0;

const run = await runStandardScene({
    windowSeconds: WINDOW,
    leadSeconds: 55,
    onStart(g) {
        game = g;
        const { water, store, thermal } = g.state;
        for (let i = 260; i <= 300; i++) water.E[i] = SIGMA_W * MATERIALS.water.c * water.h[i] * 100;
        const def = new Box2D.b2ParticleDef();
        const at = new Box2D.b2Vec2(0, 0);
        const make = (x, y, kind, enthalpy) => {
            at.set_x(x);
            at.set_y(y);
            def.set_position(at);
            store.create(def, { kind, origin: ORIGIN.SHOT, enthalpy });
        };
        for (let k = 0; k < 100; k++) make(27 + (k % 10) * 0.2, 3.4 + Math.floor(k / 10) * 0.2, FLUID.LAVA);
        for (let k = 0; k < 24; k++) make(26.1 + (k % 12) * 0.3, 5 + Math.floor(k / 12) * 0.2, FLUID.ACID);
        for (let k = 0; k < 24; k++) make(26.2 + (k % 12) * 0.3, 6 + Math.floor(k / 12) * 0.2, FLUID.WATER, MATERIALS.water.c * 90);
        Box2D.destroy(def);
        Box2D.destroy(at);
        energy0 = thermal.energy() + thermal.energyLost();
        const create = store.create.bind(store);
        store.create = (d, props) => {
            const index = create(d, props);
            if (index >= 0 && props.origin !== ORIGIN.STEAM) {
                const slot = store.slotAt(index);
                injected += thermal.mass[store.kind[slot]] * store.enthalpy[slot];
            }
            return index;
        };
        const destroy = store.destroy.bind(store);
        store.destroy = (i, cause) => {
            const slot = store.slotAt(i);
            if (slot >= 0 && store.alive[slot] === 1 && cause !== SINK.ABSORBED && cause !== SINK.EVAPORATED && cause !== SINK.HUMIDITY) {
                removed += thermal.mass[store.kind[slot]] * (1 - store.evaporated[slot]) * store.enthalpy[slot];
            }
            destroy(i, cause);
        };
        const advance = g.state.water.step.bind(g.state.water);
        g.state.water.step = (dt) => {
            advance(dt);
            worstEnergy = Math.max(worstEnergy, Math.abs(thermal.energy() + thermal.energyLost() + removed - injected - energy0));
        };
    },
});

const g = () => game.state;

test("la escena con ebullición produce vapor de verdad", (t) => {
    const { thermal, store } = g();
    t.diagnostic(
        `vapores emitidos por columnas ${thermal.stats.emitted}, agua→vapor ${thermal.stats.boiled}, vapor→agua ${thermal.stats.condensed}, creados ${store.created[FLUID.STEAM]}, absorbidos ${store.destroyed[SINK.ABSORBED][FLUID.STEAM]}, fuera del mundo ${store.destroyed[SINK.OUT][FLUID.STEAM]}, vivos ${thermal.stats.steam}; lava solidificada ${thermal.stats.solidified}`,
    );
    assert.ok(thermal.stats.emitted > 0, "ninguna columna emitió vapor");
});

for (const species of SPECIES) {
    test(`I1 con vapor: masa de ${species} constante en cada paso (< 1e-6)`, (t) => {
        const track = run.i1[species];
        assert.ok(track.evals > 0);
        t.diagnostic(`${species}: |R|/den máx ${track.max.toExponential(2)} en ${track.evals} pasos, fallas ${track.fails}`);
        assert.equal(track.fails, 0, `${species}: ${track.fails} de ${track.evals} pasos fuera de ${MASS_TOLERANCE}, máx ${track.max}`);
    });
}

test("I2b con vapor: el balance de masa de agua, ácido, miel y lava cierra con las filas de REACTIONS y el paso del campo al vapor", () => {
    for (const [name, track] of Object.entries(run.i2b)) {
        assert.ok(track.evals > 0, name);
        assert.equal(track.fails, 0, `${name}: ${track.fails} pasos fuera de tolerancia, máx ${track.max}`);
    }
    assert.equal(run.i2a.changes, 0);
});

test("T1 con ebullición: la energía se conserva (deriva < 0,1 % de la energía inicial) con vapor, ácido y lava", (t) => {
    const drift = worstEnergy / Math.abs(energy0);
    t.diagnostic(
        `peor deriva ${worstEnergy.toExponential(2)} J de ${energy0.toExponential(3)} J: ${drift.toExponential(2)}; inyectada por disparos ${injected.toExponential(3)} J, salida con partículas destruidas (OUT, HIT, PERF) ${removed.toExponential(3)} J`,
    );
    assert.ok(drift < 0.001, `deriva ${drift}`);
});
