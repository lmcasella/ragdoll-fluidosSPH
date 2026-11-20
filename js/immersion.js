import { FLUID } from "./weapons.js";
import { MATERIALS, SIGMA_W } from "./materials.js";
import { SINK } from "./particleStore.js";

/** Densidad del agua (kg/m³). */
const RHO_W = 1000;

/** Repasos de absorción por paso: lo absorbido sube `η` y puede tapar gotas vecinas que todavía no tocaban el agua. */
const MAX_ABSORB_PASSES = 4;

/**
 * Material de cada id de fluido del sistema de disparos y fracción en volumen de miel de la partícula (`X_v`).
 */
export const KIND_MATERIAL = {
    [FLUID.WATER]: { material: MATERIALS.water, honey: 0 },
    [FLUID.ACID]: { material: MATERIALS.acid, honey: 0 },
    [FLUID.HONEY]: { material: MATERIALS.honey, honey: 1 },
    [FLUID.LAVA]: { material: MATERIALS.lava, honey: 0 },
    [FLUID.STONE]: { material: MATERIALS.stone, honey: 0 },
};

/**
 * Acople entre las partículas del sistema de disparos y el campo de alturas `ShallowWater`
 * (docs/design/14-agua.md §14.4). Una vez por paso fijo, después de `stepWorld` y `store.afterStep()`.
 *
 * Absorción: toda partícula miscible con `y ≤ η(x) + r` suma a la columna su volumen, su cantidad de
 * movimiento horizontal (`SG · A_p · v_x`, Boussinesq), su energía térmica (a la temperatura ambiente más la
 * pérdida inelástica del choque) su miel y su H2SO4 (`SG · σ_w · A_p · species.H2SO4`, kg), y se destruye con `store.destroy`. La cantidad de movimiento
 * vertical no genera ola: se suma a `stats.verticalImpulse` (kg·m/s de la rebanada) como impulso sobre el lecho.
 *
 * Inmersión: la partícula inmiscible con `y < η(x)` recibe el empuje de Arquímedes `g ρ_col/(ρ_w SG)` y el
 * arrastre cuadrático hacia la corriente, integrado en forma exacta (`v ← u_c + (v − u_c)/(1 + k dt)`). La
 * reacción horizontal va a la columna con `addMomentum`. El impulso del par partícula–columna se recorta a la
 * masa reducida, así que ninguna velocidad relativa se invierte.
 *
 * `submerged`, `columns` y `count` listan las inmersas (índice y celda) y valen hasta el próximo `stepWorld`.
 * `stats` suma lo absorbido (`absorbed`, `volume` en m²), el impulso vertical, los recortes por masa reducida
 * (`capped`) y el calor de la pérdida inelástica que se sumó a las columnas (`inelastic`, J). Con `store.thermal`
 * (`js/thermal.js`) la energía que lleva la partícula es la de su entalpía propia, no la del agua ambiente.
 */
export class Immersion {
    constructor(system, store, water, { gravity = 10 } = {}) {
        this.system = system;
        this.store = store;
        this.water = water;
        this.gravity = gravity;
        this.radius = system.GetRadius();
        this.diameter = 1.5 * this.radius;
        this.area = this.diameter * this.diameter;
        this.heat = SIGMA_W * MATERIALS.water.c * water.config.ambientT;
        const capacity = Math.max(system.GetMaxParticleCount(), 1);
        this.submerged = new Int32Array(capacity);
        this.columns = new Int32Array(capacity);
        this.count = 0;
        this.reset();
    }

    /** Vacía las listas y las estadísticas. */
    reset() {
        this.count = 0;
        this.stats = { absorbed: 0, volume: 0, verticalImpulse: 0, capped: 0, inelastic: 0 };
    }

    /** Absorbe las miscibles y aplica la inmersión a las inmiscibles. `dt` es el paso fijo. */
    step(dt) {
        this.count = 0;
        const { system, store, water } = this;
        const total = system.GetParticleCount();
        if (total === 0) return;
        const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
        const vel = Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
        const heap = Box2D.HEAPF32;
        const minX = water.x0 + water.i0 * water.dx;
        const maxX = water.x0 + water.i1 * water.dx;
        const absorbedAtStart = this.stats.absorbed;
        for (let i = 0; i < total; i++) {
            const slot = store.slotAt(i);
            if (slot < 0 || store.alive[slot] === 0) continue;
            const entry = KIND_MATERIAL[store.kind[slot]];
            if (!entry) continue;
            const x = heap[pos + 2 * i];
            if (x < minX || x > maxX) continue;
            const y = heap[pos + 2 * i + 1];
            const eta = water.surfaceAt(x);
            if (entry.material.miscible) {
                if (y <= eta + this.radius) this.absorb(i, entry, x, heap[vel + 2 * i], heap[vel + 2 * i + 1]);
            } else if (y < eta) {
                this.immerse(i, entry.material, x, vel, dt);
            }
        }
        for (let pass = 0; pass < MAX_ABSORB_PASSES; pass++) {
            const before = this.stats.absorbed;
            for (let i = 0; i < total; i++) {
                const slot = store.slotAt(i);
                if (slot < 0 || store.alive[slot] === 0) continue;
                const entry = KIND_MATERIAL[store.kind[slot]];
                if (!entry || !entry.material.miscible) continue;
                const x = heap[pos + 2 * i];
                if (x < minX || x > maxX) continue;
                if (heap[pos + 2 * i + 1] <= water.surfaceAt(x) + this.radius) {
                    this.absorb(i, entry, x, heap[vel + 2 * i], heap[vel + 2 * i + 1]);
                }
            }
            if (this.stats.absorbed === before) break;
        }
        if (this.stats.absorbed !== absorbedAtStart) water.consolidate();
    }

    /**
     * Deposita la partícula `i` en el campo y la destruye. Si ya se evaporó una fracción `φ`
     * (docs/design/14-agua.md §14.7b), deposita solo `A_p (1 − φ)` con la masa, la cantidad de movimiento y la
     * energía en la misma proporción.
     */
    absorb(i, entry, x, vx, vy) {
        const { water } = this;
        const slot = this.store.slotAt(i);
        const keep = 1 - this.store.evaporated[slot];
        const area = this.area * keep;
        const sg = entry.material.SG;
        const momentum = sg * area * vx;
        const loss = this.inelasticLoss(x, area, momentum, sg, vx, vy);
        const own = this.store.thermal ? sg * SIGMA_W * area * this.store.enthalpy[slot] : this.heat * area;
        const energy = own + loss;
        this.stats.inelastic += loss;
        const acid = sg * SIGMA_W * area * (entry.material.species.H2SO4 ?? 0);
        water.deposit(x, area, momentum, energy, entry.honey * area, acid);
        this.store.destroy(i, SINK.ABSORBED);
        this.stats.absorbed++;
        this.stats.volume += area;
        this.stats.verticalImpulse += sg * SIGMA_W * area * vy;
    }

    /**
     * Pérdida inelástica del choque (J): `½ m v² − ΔK_col`, con `ΔK_col` el cambio de energía cinética de las dos
     * columnas vecinas al recibir el volumen y la cantidad de movimiento. No es negativa.
     */
    inelasticLoss(x, area, momentum, sg, vx, vy) {
        const { water } = this;
        const { i0, i1, dx } = water;
        const s = (x - water.x0) / dx - 0.5;
        const i = Math.floor(s);
        const w1 = s - i;
        const c0 = Math.min(Math.max(i, i0), i1 - 1);
        const c1 = Math.min(Math.max(i + 1, i0), i1 - 1);
        let deltaK = this.columnKinetic(c0, c0 === c1 ? 1 : 1 - w1, area, momentum);
        if (c1 !== c0) deltaK += this.columnKinetic(c1, w1, area, momentum);
        const kinetic = 0.5 * sg * SIGMA_W * area * (vx * vx + vy * vy);
        return Math.max(0, kinetic - deltaK * 0.5 * SIGMA_W * dx);
    }

    /** `q²/h` de la celda `c` después de recibir la fracción `w` de la fuente, menos el de antes (m³/s²). */
    columnKinetic(c, w, area, momentum) {
        const { water } = this;
        const hDry = water.config.hDry;
        const h = water.h[c];
        const q = water.q[c];
        const h2 = h + (w * area) / water.dx;
        const q2 = q + (w * momentum) / water.dx;
        return (h2 > hDry ? (q2 * q2) / h2 : 0) - (h > hDry ? (q * q) / h : 0);
    }

    /** Empuje, arrastre y reacción sobre la columna de la partícula inmiscible `i`. */
    immerse(i, material, x, vel, dt) {
        const { water, area, diameter } = this;
        const heap = Box2D.HEAPF32;
        const sg = material.SG;
        const rho = water.densityAt(x);
        const current = water.velocityAt(x);
        const vx = heap[vel + 2 * i];
        const vy = heap[vel + 2 * i + 1] + ((this.gravity * rho) / (RHO_W * sg)) * dt;
        const rx = vx - current;
        const k = (0.5 * rho * material.Cd * diameter * Math.hypot(rx, vy)) / (sg * RHO_W * area);
        let f = (k * dt) / (1 + k * dt);
        const column = Math.min(Math.max(Math.floor((x - water.x0) / water.dx), water.i0), water.i1 - 1);
        const massColumn = SIGMA_W * water.h[column] * water.dx;
        const massParticle = sg * SIGMA_W * area;
        const cap = massColumn / (massParticle + massColumn);
        if (f > cap) {
            f = cap;
            this.stats.capped++;
        }
        heap[vel + 2 * i] = vx - f * rx;
        heap[vel + 2 * i + 1] = vy - f * vy;
        const applied = heap[vel + 2 * i] - vx;
        water.addMomentum(column, (-sg * area * applied) / water.dx);
        this.submerged[this.count] = i;
        this.columns[this.count] = column;
        this.count++;
    }
}
