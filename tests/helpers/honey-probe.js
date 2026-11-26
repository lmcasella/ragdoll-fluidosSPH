/**
 * Medición de la miel sumergida (docs/design/14-agua.md §14.16 H, #110) sobre el juego real: por partícula de miel
 * que toca el fondo de la pileta (`y < pool.bottom + BOTTOM_BAND`), cuenta los pasos en que vuelve a estar a menos
 * de `2 r` de la superficie del campo (H4), el desplazamiento horizontal del conjunto apoyado (H6) y la velocidad
 * de las columnas bajo la capa. Llamar `sample()` una vez por paso fijo.
 */
const { LEVEL } = await import("../../src/level/level.js");
const { FLUID } = await import("../../src/combat/weapons.js");

/** Banda sobre el fondo (m) que cuenta como apoyada. */
export const BOTTOM_BAND = 0.5;

export class HoneyProbe {
    constructor(game) {
        const { store, water, particleSystem } = game.state;
        this.store = store;
        this.water = water;
        this.system = particleSystem;
        this.radius = particleSystem.GetRadius();
        this.touched = new Uint8Array(store.capacity);
        this.x0 = new Float64Array(store.capacity);
        this.resurfaced = 0;
        this.resurfacedParticles = new Set();
        this.maxShift = 0;
        this.maxShiftStep = -1;
        this.shift = 0;
        this.maxColumnSpeed = 0;
        this.centroid = NaN;
        this.steps = 0;
        this.submerged = 0;
        this.settled = 0;
        this.touchedEver = 0;
        this.maxSubmerged = 0;
    }

    /** Un paso: actualiza los contadores con las posiciones actuales. */
    sample() {
        const { store, water, system, radius } = this;
        const { x1, x2, bottom } = LEVEL.pool;
        const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
        const count = system.GetParticleCount();
        const { x0: xw, dx, N, h, b } = water;
        let bottomCount = 0;
        let sum = 0;
        let sumX = 0;
        let submerged = 0;
        let settled = 0;
        const seen = this.seen ?? (this.seen = new Uint8Array(store.capacity));
        seen.fill(0);
        for (let i = 0; i < count; i++) {
            const slot = store.slotAt(i);
            if (slot < 0 || store.alive[slot] === 0 || store.kind[slot] !== FLUID.HONEY) continue;
            seen[slot] = 1;
            const x = Box2D.HEAPF32[pos + 2 * i];
            const y = Box2D.HEAPF32[pos + 2 * i + 1];
            const c = Math.min(N - 1, Math.max(0, Math.floor((x - xw) / dx)));
            const eta = b[c] + h[c];
            const inPool = x > x1 && x < x2;
            const low = y < bottom + BOTTOM_BAND;
            if (inPool && y < eta) {
                submerged++;
                if (low) settled++;
            }
            if (inPool && low && this.touched[slot] === 0) {
                this.touched[slot] = 1;
                this.x0[slot] = x;
                this.touchedEver++;
            }
            if (this.touched[slot] === 1) {
                if (h[c] > water.config.hDry && y > eta - 2 * radius) {
                    this.resurfaced++;
                    this.resurfacedParticles.add(slot);
                }
                if (low) {
                    bottomCount++;
                    sum += x - this.x0[slot];
                    sumX += x;
                    this.maxColumnSpeed = Math.max(this.maxColumnSpeed, Math.abs(water.uOf(c)));
                }
            }
        }
        for (let slot = 0; slot < this.touched.length; slot++) if (seen[slot] === 0) this.touched[slot] = 0;
        this.submerged = submerged;
        this.maxSubmerged = Math.max(this.maxSubmerged, submerged);
        this.settled = settled;
        this.bottomCount = bottomCount;
        this.shift = bottomCount > 0 ? sum / bottomCount : 0;
        this.centroid = bottomCount > 0 ? sumX / bottomCount : NaN;
        if (Math.abs(this.shift) > this.maxShift) {
            this.maxShift = Math.abs(this.shift);
            this.maxShiftStep = this.steps;
        }
        this.steps++;
    }

    /** Fracción de las partículas sumergidas que están apoyadas (0 si no hay ninguna sumergida). */
    get settledFraction() {
        return this.submerged > 0 ? this.settled / this.submerged : 0;
    }
}
