import { MATERIALS, SIGMA_W } from "./materials.js";
import { KIND_MATERIAL } from "../water/immersion.js";
import { Contacts } from "./contacts.js";
import { SINK } from "./particleStore.js";

/**
 * Datos de la evaporación de agua detenida (docs/design/14-agua.md §14.7b). `rate` es `e_r` (m/s), la tasa real
 * de evaporación de agua quieta al aire (~3 mm por día); `restSpeed` (m/s) es la rapidez por debajo de la cual el
 * agua se considera detenida; `latentHeat` es `L_v` del agua a 20 °C (J/kg); `wFull` es la suma de pesos de contacto
 * de una partícula interior de agua en reposo, la mediana de la ventana interior del banco P3 (`restBench`,
 * `SHOT_SYSTEM`, t entre 6 y 8 s: 1,1114 medido).
 */
export const EVAPORATION = { rate: 3.5e-8, restSpeed: 1, latentHeat: 2.454e6, wFull: 1.11 };

const KIND_SLOTS = 256;

/**
 * Evaporación del agua detenida según su superficie expuesta (docs/design/14-agua.md §14.7b). Una vez por paso fijo,
 * después de `immersion.step`. Cada partícula del store cuyo material tenga `evaporationScale` y con
 * `|v| < restSpeed` acumula `dφ/dt = F_evap · e_r · f · P / A_p`, con `f = clamp(1 − (W_pp + W_pb) / W_full, 0, 1)`
 * la fracción expuesta del contorno, `A_p = (1,5 r)²` y `P` el perímetro del círculo de ese área, ambos del radio
 * vigente del sistema. `φ` vive en `store.evaporated`; con `φ ≥ 1` la partícula se destruye con `SINK.EVAPORATED`.
 * Los pesos salen de `Contacts`: si el buffer nativo no se encuentra, el módulo se desactiva (`stats.enabled` en
 * falso) y el juego sigue.
 *
 * `stats`: `enabled`, `evaporated` (partículas destruidas por `φ ≥ 1`), `mass` (kg de agua pasados al aire) y
 * `latent` (J, negativo: el calor latente `−L_v m dφ` que aporta el aire y debe sumarse a `E_perdida` cuando el
 * monitor exista) y `vapor` (J que lleva el vapor, `m dφ (e + L_v)` con la entalpía `e` de la partícula al evaporar,
 * solo con `store.thermal`: es el término `Σ m φ e_v` del monitor de energía de `src/fluids/thermal.js`), más `contacts`
 * (offsets hallados por `Contacts`).
 */
export class Evaporation {
    constructor(system, store) {
        this.system = system;
        this.store = store;
        this.contacts = new Contacts(system);
        const diameter = 1.5 * system.GetRadius();
        const area = diameter * diameter;
        const perimeter = 2 * Math.sqrt(Math.PI * area);
        this.rate = new Float64Array(KIND_SLOTS);
        this.mass = new Float64Array(KIND_SLOTS);
        for (const [kind, entry] of Object.entries(KIND_MATERIAL)) {
            const scale = entry.material.evaporationScale;
            if (!(scale > 0)) continue;
            this.rate[kind] = (scale * EVAPORATION.rate * perimeter) / area;
            this.mass[kind] = entry.material.SG * SIGMA_W * area;
        }
        const capacity = Math.max(system.GetMaxParticleCount(), 1);
        this.pp = new Float32Array(capacity);
        this.pb = new Float32Array(capacity);
        this.reset();
    }

    /** Pone en cero las estadísticas. */
    reset() {
        this.stats = { enabled: !this.contacts.failed, evaporated: 0, mass: 0, latent: 0, vapor: 0, contacts: this.contacts.stats };
    }

    /** Avanza `φ` de cada partícula de agua detenida y destruye las que llegan a 1. `dt` es el paso fijo. */
    step(dt) {
        const { system, store, stats } = this;
        const total = system.GetParticleCount();
        if (total === 0) return;
        stats.enabled = this.contacts.weights(this.pp, this.pb, total);
        if (!stats.enabled) return;
        const vel = Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
        const heap = Box2D.HEAPF32;
        const restSquared = EVAPORATION.restSpeed * EVAPORATION.restSpeed;
        for (let i = 0; i < total; i++) {
            const slot = store.slotAt(i);
            if (slot < 0 || store.alive[slot] === 0) continue;
            const kind = store.kind[slot];
            const rate = this.rate[kind];
            if (rate === 0) continue;
            const vx = heap[vel + 2 * i];
            const vy = heap[vel + 2 * i + 1];
            if (vx * vx + vy * vy >= restSquared) continue;
            const exposed = Math.min(Math.max(1 - (this.pp[i] + this.pb[i]) / EVAPORATION.wFull, 0), 1);
            const before = store.evaporated[slot];
            const after = Math.min(before + rate * exposed * dt, 1);
            store.evaporated[slot] = after;
            const gained = store.evaporated[slot] - before;
            stats.mass += this.mass[kind] * gained;
            stats.latent -= EVAPORATION.latentHeat * this.mass[kind] * gained;
            if (store.thermal) stats.vapor += this.mass[kind] * gained * (store.enthalpy[slot] + EVAPORATION.latentHeat);
            if (store.evaporated[slot] >= 1) {
                store.destroy(i, SINK.EVAPORATED);
                stats.evaporated++;
            }
        }
    }
}
