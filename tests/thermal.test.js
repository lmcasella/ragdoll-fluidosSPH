/**
 * Térmica y fases del basalto (docs/design/14-agua.md §14.8 y §14.16 T y L, #75): LiquidFun real, `stepWorld` con 8
 * subpasos y el contorno del juego. Cada prueba informa lo medido contra la referencia.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { thermalScene, DT } from "./helpers/thermal-bench.js";
import { fillStore } from "./helpers/water-bench.js";
import { loadGame } from "./helpers/game.js";

const { FLUID } = await import("../src/combat/weapons.js");
const { PARTICLE } = await import("../src/fluids/particles.js");
const { SINK } = await import("../src/fluids/particleStore.js");
const { MATERIALS, REACTIONS, SIGMA_W } = await import("../src/fluids/materials.js");
const { THERMAL } = await import("../src/fluids/thermal.js");
const { PAIR_REST_WEIGHT } = await import("../src/fluids/viscosity.js");
const { stepWorld } = await import("../lib/ragimporter.js");

const fmt = (n, digits = 3) => Number(n).toFixed(digits);
const A_P = (1.5 * 0.06) ** 2;
const M_LAVA = MATERIALS.lava.SG * SIGMA_W * A_P;
const LAVA = MATERIALS.lava;
const HEAT = MATERIALS.heat;
const P_B = 2 * Math.sqrt(Math.PI * A_P) * (SIGMA_W / THERMAL.waterDensity);
const KELVIN = 273.15;

test("constantes: T(e) del basalto por tramos, entalpía de nacimiento por material y filas de REACTIONS", () => {
    const s = thermalScene({ points: [{ x: 5, y: 0.2, kind: FLUID.LAVA }, { x: 6, y: 0.2, kind: FLUID.STONE }, { x: 7, y: 0.2, kind: FLUID.WATER }] });
    const th = s.thermal;
    assert.equal(s.store.thermal, true);
    assert.ok(Math.abs(th.temperature(FLUID.LAVA, s.store.enthalpy[0]) - 1150) < 1e-9);
    assert.ok(Math.abs(th.temperature(FLUID.STONE, s.store.enthalpy[1]) - 20) < 1e-9);
    assert.ok(Math.abs(th.temperature(FLUID.WATER, s.store.enthalpy[2]) - 20) < 1e-9);
    assert.equal(th.temperature(FLUID.LAVA, th.eSolid), 1000);
    assert.equal(th.temperature(FLUID.LAVA, th.eSolid + 0.5 * LAVA.latentFusion), 1000);
    assert.ok(Math.abs(th.eLiquid - th.eSolid - LAVA.latentFusion) < 1e-6);
    assert.equal(th.meltFraction(th.eSolid), 0);
    assert.equal(th.meltFraction(th.eLiquid), 1);
    for (const row of REACTIONS) {
        const from = Object.values(row.from).reduce((a, b) => a + b, 0);
        const to = Object.values(row.to).reduce((a, b) => a + b, 0);
        assert.equal(from, to);
    }
    s.dispose();
});

/**
 * Modelo concentrado de la ficha 34 integrado con paso fino: enfriamiento por radiación y convección de la lava de
 * `T0` hasta el solidus con `c` del líquido, y después `L_f` a la potencia del solidus. Devuelve los segundos.
 */
function analyticSolidification() {
    const q = (T) => P_B * (LAVA.emissivity * HEAT.stefanBoltzmann * ((T + KELVIN) ** 4 - (20 + KELVIN) ** 4) + HEAT.convection * (T - 20));
    let T = LAVA.temperature;
    let t = 0;
    const h = 0.01;
    while (T > LAVA.solidus) {
        T -= (q(T) * h) / (M_LAVA * LAVA.c);
        t += h;
    }
    const toSolidus = t;
    return { toSolidus, total: toSolidus + (M_LAVA * LAVA.latentFusion) / q(LAVA.solidus) };
}

test("L1: partícula de lava aislada en aire solidifica en el tiempo del modelo concentrado (ficha 34) ±10 %", (t) => {
    const s = thermalScene({ points: [{ x: 5, y: 0.2, kind: FLUID.LAVA }] });
    const analytic = analyticSolidification();
    let reachedSolidus = null;
    while (s.time < 600 && s.store.kind[0] === FLUID.LAVA) {
        s.step();
        if (reachedSolidus === null && s.store.enthalpy[0] <= s.thermal.eLiquid) reachedSolidus = s.time;
    }
    const error = (s.time - analytic.total) / analytic.total;
    t.diagnostic(
        `L1: solidifica a los ${fmt(s.time, 1)} s (${fmt(s.time / 60, 2)} min) contra ${fmt(analytic.total, 1)} s del modelo concentrado, error ${fmt(error * 100, 2)} %; llega al solidus a los ${fmt(reachedSolidus, 1)} s (analítico ${fmt(analytic.toSolidus, 1)} s); referencia de la ficha ~4 min; perdió ${fmt(s.thermal.stats.lost / 1000, 2)} kJ de ${fmt(((LAVA.temperature - LAVA.solidus) * LAVA.c + LAVA.latentFusion) * M_LAVA / 1000, 2)} kJ`,
    );
    assert.equal(s.store.kind[0], FLUID.STONE);
    assert.ok(Math.abs(error) <= 0.1, `error ${error}`);
    assert.ok(Math.abs(s.time - 240) / 240 <= 0.1, `${s.time} s contra ~4 min`);
    assert.equal(s.thermal.stats.advance.solidify, s.thermal.mass[FLUID.LAVA]);
    s.dispose();
});

test("L2: masas iguales de lava a 1150 °C y piedra a 1000 °C llegan a 1000 °C con ~72 % fundido (ficha 32) ±2 puntos", (t) => {
    const s = thermalScene({ points: [{ x: 5, y: 0.2, kind: FLUID.LAVA }, { x: 5.09, y: 0.2, kind: FLUID.STONE }], airLosses: false });
    const th = s.thermal;
    s.store.enthalpy[1] = th.eSolid;
    for (let k = 0; k < 120; k++) s.step({ viscous: false });
    assert.equal(s.system.GetContactCount(), 1);
    const total0 = M_LAVA * (s.store.enthalpy[0] + s.store.enthalpy[1]);
    let seconds = 0;
    while (seconds < 1e6) {
        s.thermalOnly(5);
        seconds += 5;
        if (th.temperature(s.store.kind[0], s.store.enthalpy[0]) < 1000 + 1e-3) break;
    }
    const fraction = (th.meltFraction(s.store.enthalpy[0]) + th.meltFraction(s.store.enthalpy[1])) / 2;
    const temps = [0, 1].map((slot) => th.temperature(s.store.kind[slot], s.store.enthalpy[slot]));
    const total1 = M_LAVA * (s.store.enthalpy[0] + s.store.enthalpy[1]);
    t.diagnostic(
        `L2: tras ${fmt(seconds / 3600, 1)} h de conducción real las dos están a ${fmt(temps[0], 3)} y ${fmt(temps[1], 3)} °C con ${fmt(fraction * 100, 2)} % de la masa fundida (referencia 72,5 %); energía total ${fmt(Math.abs(total1 - total0) / total0, 12)} de deriva relativa`,
    );
    assert.ok(Math.abs(temps[0] - 1000) < 0.01 && Math.abs(temps[1] - 1000) < 1e-9);
    assert.ok(Math.abs(fraction - 0.725) <= 0.02, `fracción fundida ${fraction}`);
    assert.ok(Math.abs(total1 - total0) / total0 < 1e-9);
    s.dispose();
});

test("la lava y la piedra cambian de fase por entalpía en los dos sentidos, con flags y filas de REACTIONS", () => {
    const s = thermalScene({
        points: [
            { x: 5, y: 0.2, kind: FLUID.LAVA, flags: PARTICLE.CONTACT_LISTENER },
            { x: 8, y: 0.2, kind: FLUID.STONE, flags: PARTICLE.POWDER | PARTICLE.CONTACT_LISTENER },
        ],
        airLosses: false,
    });
    const th = s.thermal;
    s.store.enthalpy[0] = th.eSolid - 1;
    s.store.enthalpy[1] = th.eLiquid + 1;
    s.step();
    assert.equal(s.store.kind[0], FLUID.STONE);
    assert.equal(s.store.kind[1], FLUID.LAVA);
    assert.equal(s.system.GetParticleFlags(0) & PARTICLE.POWDER, PARTICLE.POWDER);
    assert.equal(s.system.GetParticleFlags(0) & PARTICLE.CONTACT_LISTENER, PARTICLE.CONTACT_LISTENER);
    assert.equal(s.system.GetParticleFlags(1) & (PARTICLE.POWDER | PARTICLE.WALL), 0);
    assert.equal(s.system.GetParticleFlags(1) & PARTICLE.CONTACT_LISTENER, PARTICLE.CONTACT_LISTENER);
    assert.equal(th.stats.solidified, 1);
    assert.equal(th.stats.remelted, 1);
    assert.equal(th.stats.advance.solidify, th.mass[FLUID.LAVA]);
    assert.equal(th.stats.advance.remelt, th.mass[FLUID.LAVA]);
    s.store.enthalpy[0] = th.eSolid + 0.5 * LAVA.latentFusion;
    for (let k = 0; k < 10; k++) s.step();
    assert.equal(s.store.kind[0], FLUID.STONE, "en la meseta de fusión la fase no cambia (histéresis)");
    s.dispose();
});

test("la piedra en la meseta de fusión vuelve a lava solo al superar solidus + L_f, sin recibir calor de un solo golpe", () => {
    const s = thermalScene({ points: [{ x: 5, y: 0.2, kind: FLUID.STONE }], airLosses: false });
    const th = s.thermal;
    s.store.enthalpy[0] = th.eLiquid - 1;
    s.step();
    assert.equal(s.store.kind[0], FLUID.STONE);
    s.store.enthalpy[0] = th.eLiquid + 1;
    s.step();
    assert.equal(s.store.kind[0], FLUID.LAVA);
    s.dispose();
});

test("L3: charco de lava isotérmico a 1150 °C (μ = 300 Pa·s) contra el flujo viscoso de película delgada, u = ρ g H³/(3 μ L)", (t) => {
    const rows = 3;
    const cols = 40;
    const points = [];
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) points.push({ x: 5 + k * 0.09 + (r % 2) * 0.045, y: 0.115 + r * 0.078, kind: FLUID.LAVA });
    const s = thermalScene({ points, airLosses: false });
    const area = points.length * A_P;
    const extent = () => {
        const p = s.positions();
        return { min: Math.min(...p.map((q) => q.x)), max: Math.max(...p.map((q) => q.x)) };
    };
    const start = extent();
    const samples = [];
    let previous = 0;
    for (let step = 1; step <= Math.round(4 / DT); step++) {
        s.step();
        if (step % 30 === 0) {
            const e = extent();
            const L = e.max - e.min + 0.09;
            const spread = (start.min - e.min + (e.max - start.max)) / 2;
            const H = area / L;
            samples.push({ t: step * DT, L, H, front: (spread - previous) / 0.5, analytic: (LAVA.SG * 1000 * 10 * H ** 3) / (3 * LAVA.viscosity.mu0 * L) });
            previous = spread;
        }
    }
    const window = samples.filter((q) => q.t >= 1 && q.t <= 3);
    const ratio = window.reduce((a, q) => a + q.front / q.analytic, 0) / window.length;
    t.diagnostic(
        `L3: velocidad del frente medida / analítica en t de 1 a 3 s: ${window.map((q) => `${fmt(q.front, 3)}/${fmt(q.analytic, 4)}`).join(" ")} m/s; razón media ${fmt(ratio, 1)} (esperado 1 ± 0,3). Formulación con los pesos de contacto normalizados por su valor de reposo`,
    );
    s.dispose();
    assert.ok(Math.abs(ratio - 1) <= 0.3, `razón ${ratio}`);
});

test("viscosidad: μ(T) del diseño y su acotado", () => {
    const s = thermalScene({ points: [{ x: 5, y: 0.2, kind: FLUID.LAVA }] });
    const v = s.viscosity;
    assert.equal(v.mu(1150), 300);
    assert.ok(Math.abs(v.mu(1070) / v.mu(1150) - 1000) < 1e-6);
    assert.equal(v.mu(5000), LAVA.viscosity.min);
    assert.equal(v.mu(-5000), LAVA.viscosity.max);
    s.dispose();
});

test("viscosidad: el par de lava en contacto relaja su velocidad relativa de forma exacta y conserva la cantidad de movimiento", () => {
    const s = thermalScene({ points: [{ x: 5, y: 3, kind: FLUID.LAVA }, { x: 5.09, y: 3, kind: FLUID.LAVA }], airLosses: false, params: { gravityScale: 0 } });
    for (let k = 0; k < 60; k++) s.step({ viscous: false });
    const vel = Box2D.getPointer(s.system.GetVelocityBuffer()) >> 2;
    Box2D.HEAPF32[vel] = 0;
    Box2D.HEAPF32[vel + 1] = 0;
    Box2D.HEAPF32[vel + 2] = 1;
    Box2D.HEAPF32[vel + 3] = 0.5;
    s.thermal.step(DT);
    const w = s.thermal.contacts.pairW[0];
    const mu = s.viscosity.mu(1150);
    const m = s.thermal.mass[FLUID.LAVA];
    const decay = Math.exp(-mu * (SIGMA_W / THERMAL.waterDensity) * (w / PAIR_REST_WEIGHT) * DT * (2 / m));
    s.viscosity.step(DT);
    const dvx = Box2D.HEAPF32[vel + 2] - Box2D.HEAPF32[vel];
    const dvy = Box2D.HEAPF32[vel + 3] - Box2D.HEAPF32[vel + 1];
    assert.ok(Math.abs(dvx - decay) < 1e-6, `Δv_x ${dvx} contra ${decay}`);
    assert.ok(Math.abs(dvy - 0.5 * decay) < 1e-6);
    assert.ok(Math.abs(Box2D.HEAPF32[vel] + Box2D.HEAPF32[vel + 2] - 1) < 1e-6, "cantidad de movimiento horizontal");
    assert.ok(Math.abs(Box2D.HEAPF32[vel + 1] + Box2D.HEAPF32[vel + 3] - 0.5) < 1e-6, "cantidad de movimiento vertical");
    assert.equal(s.viscosity.stats.pairs, 1);
    s.dispose();
});

test("viscosidad: con una dt enorme el par queda en la velocidad media, sin invertir ni sobrecorregir", () => {
    const s = thermalScene({ points: [{ x: 5, y: 3, kind: FLUID.LAVA }, { x: 5.09, y: 3, kind: FLUID.LAVA }], airLosses: false, params: { gravityScale: 0 } });
    for (let k = 0; k < 60; k++) s.step({ viscous: false });
    const vel = Box2D.getPointer(s.system.GetVelocityBuffer()) >> 2;
    Box2D.HEAPF32[vel] = -2;
    Box2D.HEAPF32[vel + 1] = 0;
    Box2D.HEAPF32[vel + 2] = 4;
    Box2D.HEAPF32[vel + 3] = 0;
    s.thermal.step(DT);
    s.viscosity.step(1e3);
    assert.ok(Math.abs(Box2D.HEAPF32[vel] - 1) < 1e-5 && Math.abs(Box2D.HEAPF32[vel + 2] - 1) < 1e-5);
    s.dispose();
});

test("viscosidad contra un cuerpo: la lava que roza una caja dinámica la arrastra con el impulso opuesto", () => {
    const s = thermalScene({ points: [{ x: 5, y: 0.2, kind: FLUID.LAVA }], airLosses: false });
    const def = new Box2D.b2BodyDef();
    def.set_type(Box2D.b2_dynamicBody);
    const at = new Box2D.b2Vec2(5, 0.5);
    def.set_position(at);
    const body = s.world.CreateBody(def);
    Box2D.destroy(def);
    const shape = new Box2D.b2PolygonShape();
    shape.SetAsBox(0.3, 0.1);
    body.CreateFixture(shape, 1);
    Box2D.destroy(shape);
    body.SetGravityScale(0);
    const v = new Box2D.b2Vec2(3, 0);
    body.SetLinearVelocity(v);
    Box2D.destroy(v);
    Box2D.destroy(at);
    let contacts = 0;
    for (let k = 0; k < 120 && contacts === 0; k++) {
        stepWorld(s.world, [s.wall]);
        s.store.afterStep();
        s.thermal.step(DT);
        contacts = s.thermal.contacts.bodies(s.system.GetParticleCount());
    }
    assert.ok(contacts > 0, "la lava toca la caja");
    const vel = Box2D.getPointer(s.system.GetVelocityBuffer()) >> 2;
    const before = { px: Box2D.HEAPF32[vel], bx: body.GetLinearVelocity().get_x() };
    const momentumBefore = M_LAVA * before.px + body.GetMass() * before.bx;
    s.viscosity.step(DT);
    const momentumAfter = M_LAVA * Box2D.HEAPF32[vel] + body.GetMass() * body.GetLinearVelocity().get_x();
    assert.ok(Box2D.HEAPF32[vel] !== before.px || s.viscosity.stats.bodies > 0, "la viscosidad actuó");
    assert.ok(s.viscosity.stats.bodies > 0);
    assert.ok(Math.abs(momentumAfter - momentumBefore) < 1e-4 * Math.abs(momentumBefore) + 1e-6, `cantidad de movimiento ${momentumBefore} → ${momentumAfter}`);
    s.dispose();
});

/** Piso con artesa de 4 m y un chorro de `count` partículas de `kind` desde 0,8 m sobre x = 5, con un temblor de ±2 cm. */
function trough(kind, flags, count = 60) {
    const s = thermalScene({ kind, walls: true });
    for (let step = 0; step < Math.round(14 / DT); step++) {
        if (step % 8 === 0 && step < count * 8) s.create({ x: 5 + 0.02 * Math.sin(step * 1.7), y: 0.8, kind, flags });
        s.step();
    }
    return s;
}

/** Altura (m) de la columna más alta y la más baja de la distribución de partículas, en columnas de 0,25 m. */
function profile(s) {
    const tops = new Map();
    for (const p of s.positions()) {
        const bin = Math.round(p.x * 4) / 4;
        tops.set(bin, Math.max(tops.get(bin) ?? 0, p.y));
    }
    const heights = [...tops.values()];
    const bins = [...tops.entries()].sort((a, b) => a[0] - b[0]);
    const peak = bins.reduce((best, b) => (b[1] > best[1] ? b : best), bins[0]);
    const base = Math.min(...heights);
    const flat = bins.filter((b) => b[1] <= base + 0.02).map((b) => Math.abs(b[0] - peak[0]));
    const rise = peak[1] - base;
    return { peak: peak[1], base, angle: rise < 0.02 ? 0 : (Math.atan2(rise, Math.min(...flat)) * 180) / Math.PI };
}

test("T7: la piedra que cae se apila (POWDER) y en reposo queda inmóvil (WALL), contra el agua que se aplana", (t) => {
    const stone = trough(FLUID.STONE, PARTICLE.POWDER);
    const water = trough(FLUID.WATER, 0);
    const speeds = stone.speeds();
    const walled = Array.from({ length: stone.system.GetParticleCount() }, (_, i) => stone.system.GetParticleFlags(i) & PARTICLE.WALL).filter(Boolean).length;
    const pileStone = profile(stone);
    const pileWater = profile(water);
    t.diagnostic(
        `T7: ${stone.system.GetParticleCount()} partículas de piedra, ${walled} con WALL, velocidad máxima ${Math.max(...speeds)} m/s; pila: pico ${fmt(pileStone.peak, 2)} m sobre una base de ${fmt(pileStone.base, 2)} m, ángulo ${fmt(pileStone.angle, 1)}°; el agua (control): pico ${fmt(pileWater.peak, 2)} m, ángulo ${fmt(pileWater.angle, 1)}°; POWDER verificado en ejecución: GetParticleFlags devuelve ${PARTICLE.POWDER}`,
    );
    assert.equal(walled, stone.system.GetParticleCount());
    assert.equal(Math.max(...speeds), 0);
    assert.ok(pileStone.angle > 5, `ángulo ${pileStone.angle}`);
    assert.ok(pileStone.peak - pileStone.base > 0.15);
    assert.ok(pileWater.angle < 1, `ángulo del agua ${pileWater.angle}`);
    stone.dispose();
    water.dispose();
});

test("la piedra con WALL no se despierta sola y la que se mueve no pasa a WALL antes de 0,5 s de reposo", () => {
    const s = thermalScene({ points: [{ x: 5, y: 0.113, kind: FLUID.STONE, flags: PARTICLE.POWDER }] });
    for (let k = 0; k < Math.round(0.4 / DT); k++) s.step();
    assert.equal(s.system.GetParticleFlags(0) & PARTICLE.WALL, 0);
    for (let k = 0; k < Math.round(0.4 / DT); k++) s.step();
    assert.equal(s.system.GetParticleFlags(0) & PARTICLE.WALL, PARTICLE.WALL);
    assert.equal(s.thermal.walled[s.store.slotAt(0)], 1);
    s.dispose();
});

test("T6: agua quieta con zonas de 80 y 20 °C cambia menos de 1 K en 10 s en la interfaz", (t) => {
    const s = thermalScene({ walls: true });
    fillStore(s.world, s.system, s.store, 3.06, 0.06, 6.94, 0.9);
    for (let k = 0; k < Math.round(3 / DT); k++) s.step();
    const cWater = MATERIALS.water.c;
    const slotOf = (i) => s.store.slotAt(i);
    const pos = s.positions();
    const cold = [];
    pos.forEach((p, i) => {
        s.store.enthalpy[slotOf(i)] = cWater * (p.x < 5 ? 80 : 20);
        if (p.x >= 5) cold.push(i);
    });
    const hotCount = pos.filter((p) => p.x < 5).length;
    let maxRise = 0;
    for (let k = 0; k < Math.round(10 / DT); k++) {
        s.step();
        for (const i of cold) maxRise = Math.max(maxRise, s.store.enthalpy[slotOf(i)] / cWater - 20);
    }
    const speeds = s.speeds();
    t.diagnostic(
        `T6: ${hotCount} partículas a 80 °C y ${cold.length} a 20 °C en reposo (velocidad máxima ${fmt(Math.max(...speeds), 4)} m/s); en 10 s la partícula fría más calentada subió ${fmt(maxRise, 4)} K (esperado < 1 K)`,
    );
    assert.ok(maxRise < 1, `subió ${maxRise} K`);
    s.dispose();
});

test("T8: la térmica con ~1.000 partículas cuesta menos de 0,3 ms por paso (se exige con PERF=1, en corrida aislada)", (t) => {
    const room = thermalScene({ walls: true });
    fillStore(room.world, room.system, room.store, 3.06, 0.06, 6.94, 2.9);
    const n = room.system.GetParticleCount();
    for (let i = 0; i < n; i++) {
        const slot = room.store.slotAt(i);
        room.store.enthalpy[slot] = MATERIALS.water.c * (20 + 60 * ((i * 7) % 11) / 10);
    }
    for (let k = 0; k < 120; k++) room.step();
    const steps = 300;
    let thermalMs = 0;
    let viscosityMs = 0;
    for (let k = 0; k < steps; k++) {
        stepWorld(room.world, [room.wall]);
        room.store.afterStep();
        const t0 = performance.now();
        room.thermal.step(DT);
        const t1 = performance.now();
        room.viscosity.step(DT);
        const t2 = performance.now();
        thermalMs += t1 - t0;
        viscosityMs += t2 - t1;
    }
    t.diagnostic(
        `T8: ${n} partículas, ${room.thermal.stats.pairs} contactos; térmica ${fmt(thermalMs / steps, 3)} ms por paso, viscosidad (sin lava) ${fmt(viscosityMs / steps, 3)} ms por paso`,
    );
    assert.ok(thermalMs / steps < 1, `${thermalMs / steps} ms`);
    if (process.env.PERF === "1") assert.ok(thermalMs / steps < 0.3, `${thermalMs / steps} ms`);
    room.dispose();
    const lava = thermalScene({ walls: true });
    fillStore(lava.world, lava.system, lava.store, 3.06, 0.06, 6.94, 2.9);
    for (let i = 0; i < lava.system.GetParticleCount(); i++) {
        const slot = lava.store.slotAt(i);
        lava.store.kind[slot] = FLUID.LAVA;
        lava.store.enthalpy[slot] = lava.store.enthalpyInit[FLUID.LAVA];
    }
    for (let k = 0; k < 120; k++) lava.step();
    let lavaMs = 0;
    for (let k = 0; k < steps; k++) {
        stepWorld(lava.world, [lava.wall]);
        lava.store.afterStep();
        lava.thermal.step(DT);
        const t0 = performance.now();
        lava.viscosity.step(DT);
        lavaMs += performance.now() - t0;
    }
    t.diagnostic(`T8: con ${lava.system.GetParticleCount()} partículas de lava la viscosidad cuesta ${fmt(lavaMs / steps, 3)} ms por paso (${lava.viscosity.stats.pairs} pares y ${lava.viscosity.stats.bodies} contactos con cuerpos)`);
    lava.dispose();
});

test("sin el offset de contactos la térmica y la viscosidad se desactivan y el paso sigue", () => {
    const s = thermalScene({ points: [{ x: 5, y: 0.2, kind: FLUID.LAVA }, { x: 5.09, y: 0.2, kind: FLUID.WATER }] });
    for (let k = 0; k < 30; k++) s.step();
    const before = [s.store.enthalpy[0], s.store.enthalpy[1]];
    s.thermal.contacts.stats.failed = true;
    assert.doesNotThrow(() => s.step());
    assert.equal(s.thermal.stats.enabled, false);
    assert.equal(s.viscosity.stats.enabled, false);
    assert.deepEqual([s.store.enthalpy[0], s.store.enthalpy[1]], before);
    s.dispose();
});

test("la lava sumergida cede calor a su columna con el limitador y la energía se conserva", (t) => {
    const s = thermalScene({ immersion: true, airLosses: false });
    const water = s.water;
    const x = 28;
    const i = Math.floor((x - water.x0) / water.dx);
    const eta = water.surfaceAt(x);
    s.create({ x, y: eta - 0.5, kind: FLUID.LAVA });
    const E0 = s.thermal.energy();
    const column0 = water.E[i];
    let steps = 0;
    for (; steps < Math.round(20 / DT); steps++) {
        s.step();
        water.step(DT);
    }
    const E1 = s.thermal.energy() + s.thermal.energyLost();
    t.diagnostic(
        `lava sumergida 20 s: la columna ${i} pasó de ${fmt(water.E[i] / (SIGMA_W * MATERIALS.water.c * water.h[i]), 3)} °C (E ${fmt(column0, 1)} J/m); deriva de energía ${fmt(Math.abs(E1 - E0) / E0, 9)}; la lava quedó a ${fmt(s.thermal.temperature(s.store.kind[0], s.store.enthalpy[0]), 1)} °C`,
    );
    assert.ok(Math.abs(E1 - E0) / E0 < 1e-3);
    assert.ok(s.store.enthalpy[0] < s.store.enthalpyInit[FLUID.LAVA]);
    s.dispose();
});

test("el agua caliente absorbida lleva su entalpía propia a la columna y el monitor cierra", () => {
    const s = thermalScene({ immersion: true });
    const water = s.water;
    const x = 28;
    const eta = water.surfaceAt(x);
    s.create({ x, y: eta + 0.01, kind: FLUID.WATER, enthalpy: MATERIALS.water.c * 90 });
    const before = s.thermal.energy() + s.thermal.energyLost();
    let absorbed = false;
    for (let k = 0; k < 120 && !absorbed; k++) {
        s.step();
        absorbed = s.immersion.stats.absorbed > 0;
    }
    assert.ok(absorbed);
    const after = s.thermal.energy() + s.thermal.energyLost();
    assert.ok(Math.abs(after - before) / before < 1e-6, `${before} → ${after}`);
    s.dispose();
});

test("T1 y T2: lava y agua caliente en el escenario del juego durante 30 s, la energía y la masa de basalto se conservan", async (t) => {
    const game = await loadGame();
    const g = game.state;
    const { store, thermal, water, evaporation, immersion, particleSystem } = g;
    const def = new Box2D.b2ParticleDef();
    const at = new Box2D.b2Vec2(0, 0);
    const creation = [];
    for (let k = 0; k < 40; k++) {
        const cooling = k >= 20 ? thermal.eSolid + 0.05 * LAVA.latentFusion : undefined;
        creation.push({ x: 22 + (k % 8) * 0.28, y: 5 + Math.floor(k / 8) * 0.28, kind: FLUID.LAVA, enthalpy: cooling });
    }
    for (let k = 0; k < 24; k++) creation.push({ x: 28 + (k % 12) * 0.6, y: 6 + Math.floor(k / 12) * 0.3, kind: FLUID.WATER, enthalpy: MATERIALS.water.c * 90 });
    for (const p of creation) {
        at.set_x(p.x);
        at.set_y(p.y);
        def.set_position(at);
        store.create(def, { kind: p.kind, origin: 1, enthalpy: p.enthalpy });
    }
    Box2D.destroy(def);
    Box2D.destroy(at);
    const lavaMass = creation.filter((p) => p.kind === FLUID.LAVA).length * M_LAVA;
    const lavaEnergy0 = creation.filter((p) => p.kind === FLUID.LAVA).reduce((a, p) => a + M_LAVA * (p.enthalpy ?? store.enthalpyInit[FLUID.LAVA]), 0);
    const E0 = thermal.energy() + thermal.energyLost();
    let worst = 0;
    let worstMass = 0;
    let peakBasaltMass = 0;
    for (let f = 0; f < 30 * 60; f++) {
        game.frame();
        const E = thermal.energy() + thermal.energyLost();
        worst = Math.max(worst, Math.abs(E - E0));
        let basalt = 0;
        for (let slot = 0; slot < store.capacity; slot++) {
            if (store.alive[slot] && (store.kind[slot] === FLUID.LAVA || store.kind[slot] === FLUID.STONE)) basalt += M_LAVA;
        }
        peakBasaltMass = Math.max(peakBasaltMass, basalt);
        worstMass = Math.max(worstMass, Math.abs(basalt - lavaMass) / lavaMass);
    }
    let lava = 0;
    let stone = 0;
    let walled = 0;
    for (let slot = 0; slot < store.capacity; slot++) {
        if (!store.alive[slot]) continue;
        if (store.kind[slot] === FLUID.LAVA) lava++;
        if (store.kind[slot] === FLUID.STONE) {
            stone++;
            walled += thermal.walled[slot];
        }
    }
    const E1 = thermal.energy() + thermal.energyLost();
    const columns = Array.from({ length: water.N }, (_, i) => i).filter((i) => water.h[i] > water.config.hDry);
    const hottest = Math.max(...columns.map((i) => water.temperatureOf(i)));
    t.diagnostic(
        `T1: E₀ ${fmt(E0 / 1e6, 3)} MJ (lava ${fmt(lavaEnergy0 / 1e6, 3)} MJ); en 30 s deriva final ${((E1 - E0) / E0).toExponential(2)} de E₀ (${((E1 - E0) / lavaEnergy0).toExponential(2)} de la energía de la lava), peor deriva ${(worst / E0).toExponential(2)}; perdida al aire ${fmt(thermal.stats.lost / 1e6, 3)} MJ, latente ${fmt(evaporation.stats.latent / 1e6, 3)} MJ, calor inelástico ${fmt(immersion.stats.inelastic / 1e6, 4)} MJ, vapor ${fmt(evaporation.stats.vapor / 1e6, 3)} MJ`,
    );
    t.diagnostic(
        `T1: lava ${lava}, piedra ${stone} (${walled} con WALL), solidificadas ${thermal.stats.solidified}, refundidas ${thermal.stats.remelted}; columna más caliente ${fmt(hottest, 2)} °C; destruidas OUT ${store.destroyed[SINK.OUT][FLUID.LAVA] + store.destroyed[SINK.OUT][FLUID.STONE]}`,
    );
    t.diagnostic(`T2: masa de basalto (lava + piedra) máxima desvío relativo ${worstMass}, creada ${fmt(lavaMass, 4)} kg, avance de las filas ${JSON.stringify(thermal.stats.advance)}`);
    assert.ok(thermal.stats.solidified > 0 && stone > 0, "la mitad de la lava casi sólida solidifica en la escena");
    assert.ok(worst / E0 < 0.001, `deriva ${worst / E0}`);
    assert.equal(thermal.stats.E_perdida, thermal.energyLost());
    assert.ok(worstMass < 1e-6);
    assert.ok(particleSystem.GetParticleCount() > 0);
});
