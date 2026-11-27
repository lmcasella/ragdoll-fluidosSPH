import { MATERIALS, SIGMA_W } from "./materials.js";
import { FLUID } from "../combat/weapons.js";
import { mixtureViscosity } from "./adhesion.js";
import { clamp, exponentialApproachFactor } from "../core/math/scalar.js";

const STATIC = 0;
const DYNAMIC = 2;

/** Coeficiente de Trouton del hilo de miel: la viscosidad elongacional de un fluido newtoniano en 2D es `3 μ`. */
const HONEY_TROUTON = 3;

/**
 * Pesos de contacto de reposo de LiquidFun (medidos una vez en banco con la lava de `SHOT_SYSTEM`, radio 0,06 m, en
 * `STEP`): `PAIR_REST_WEIGHT` es la mediana del peso entre vecinas interiores de un charco en reposo en una artesa
 * (0,2397) y `BODY_REST_WEIGHT` la de una partícula apoyada en reposo sobre un cuerpo (0,0601). Normalizan el peso
 * del núcleo para que valga 1 en reposo y el esfuerzo sea `μ b (w / w⁰) Δv`.
 */
export const PAIR_REST_WEIGHT = 0.2397;
export const BODY_REST_WEIGHT = 0.0601;

/**
 * Viscosidad de la lava por contactos (docs/design/14-agua.md §14.8, #75). LiquidFun no tiene viscosidad por
 * partícula, así que el esfuerzo viscoso se aplica por contactos: para cada par con al menos una partícula de
 * lava y la otra lava o piedra, y peso `w`, `F_ab = μ(T̄) b (w / w_pp⁰) (v_b − v_a)` con `T̄` la temperatura media del
 * par y `μ(T)` de `MATERIALS.lava.viscosity`. Contra los cuerpos, `F = 2 μ b (w / w_pb⁰) (v_cuerpo − v_p)` con la
 * velocidad del cuerpo en el punto de contacto (no deslizamiento; el 2 es la mitad de espesor de la capa límite), y
 * el impulso opuesto va al cuerpo dinámico.
 *
 * Se integra en forma exacta por par, `Δv ← Δv exp(−k dt (1/m_a + 1/m_b))` con `k = μ b w / w⁰`, así que no invierte la
 * velocidad relativa con ninguna `dt` y conserva la cantidad de movimiento. Las masas son las reales
 * (`SG · σ_w · A_p`); la piedra inmóvil (`WALL`) y el cuerpo estático valen masa infinita.
 *
 * Una vez por paso fijo, después de `thermal.step`: usa sus temperaturas por índice y sus contactos. Si la térmica
 * está desactivada, el módulo se desactiva también (`stats.enabled` en falso).
 *
 * Hilos de miel (#214): entre dos partículas de miel en contacto actúa `k = 3 μ_ef b (w / w⁰)`, con `μ_ef` la viscosidad
 * efectiva de `MATERIALS.honey` (`mixtureViscosity(1)`, similitud viscosa-gravitatoria) y el coeficiente 3 de Trouton, y
 * se integra con la misma forma exacta. Reemplaza al flag `VISCOUS` de LiquidFun, que con esta `μ` es inestable por ser
 * explícito.
 *
 * `stats`: `enabled`, `pairs` (pares con viscosidad en el último paso), `bodies` (contactos con cuerpos),
 * `honeyPairs` (pares de miel) y `maxMu` (la mayor `μ` de lava aplicada, Pa·s).
 */
export class Viscosity {
    constructor(system, store, thermal) {
        this.system = system;
        this.store = store;
        this.thermal = thermal;
        const diameter = 1.5 * system.GetRadius();
        this.mass = MATERIALS.lava.SG * SIGMA_W * diameter * diameter;
        this.honeyMass = MATERIALS.honey.SG * SIGMA_W * diameter * diameter;
        this.honeyK = HONEY_TROUTON * mixtureViscosity(1) * thermal.thickness;
        this.thickness = thermal.thickness;
        this.point = new Box2D.b2Vec2(0, 0);
        this.impulse = new Box2D.b2Vec2(0, 0);
        this.reset();
    }

    /** Pone en cero las estadísticas. */
    reset() {
        this.stats = { enabled: true, pairs: 0, bodies: 0, honeyPairs: 0, maxMu: 0 };
    }

    /** Libera los vectores nativos de trabajo. */
    dispose() {
        Box2D.destroy(this.point);
        Box2D.destroy(this.impulse);
    }

    /** Viscosidad dinámica de la lava (Pa·s) a `T` °C. */
    mu(T) {
        const v = MATERIALS.lava.viscosity;
        return clamp(v.mu0 * 10 ** ((v.T0 - T) / v.deltaT), v.min, v.max);
    }

    /** Aplica la viscosidad del paso fijo `dt` (s). */
    step(dt) {
        const { thermal, stats } = this;
        stats.pairs = 0;
        stats.bodies = 0;
        stats.honeyPairs = 0;
        stats.maxMu = 0;
        stats.enabled = thermal.stats.enabled;
        if (!stats.enabled) return;
        const total = this.system.GetParticleCount();
        if (total === 0) return;
        this.pairViscosity(dt);
        this.bodyViscosity(total, dt);
    }

    /** Pares lava–lava y lava–piedra. */
    pairViscosity(dt) {
        const { thermal, stats } = this;
        const { pairA, pairB, pairW } = thermal.contacts;
        const vel = Box2D.getPointer(this.system.GetVelocityBuffer()) >> 2;
        const heap = Box2D.HEAPF32;
        const lava = FLUID.LAVA;
        const stone = FLUID.STONE;
        const honey = FLUID.HONEY;
        const m = this.mass;
        for (let c = 0; c < thermal.stats.pairs; c++) {
            const a = pairA[c];
            const b = pairB[c];
            const sa = thermal.slotOf[a];
            const sb = thermal.slotOf[b];
            if (sa < 0 || sb < 0) continue;
            const ka = thermal.kindOf[a];
            const kb = thermal.kindOf[b];
            if (ka === honey && kb === honey) {
                this.honeyPair(a, b, pairW[c], vel, dt);
                continue;
            }
            if (!((ka === lava && (kb === lava || kb === stone)) || (kb === lava && ka === stone))) continue;
            const mu = this.mu(0.5 * (thermal.temp[a] + thermal.temp[b]));
            const wallA = thermal.walled[sa] === 1;
            const wallB = thermal.walled[sb] === 1;
            if (wallA && wallB) continue;
            const inverse = (wallA ? 0 : 1 / m) + (wallB ? 0 : 1 / m);
            const k = (mu * this.thickness * pairW[c]) / PAIR_REST_WEIGHT;
            const factor = exponentialApproachFactor(k * dt * inverse);
            const dvx = heap[vel + 2 * b] - heap[vel + 2 * a];
            const dvy = heap[vel + 2 * b + 1] - heap[vel + 2 * a + 1];
            const jx = (factor * dvx) / inverse;
            const jy = (factor * dvy) / inverse;
            if (!wallA) {
                heap[vel + 2 * a] += jx / m;
                heap[vel + 2 * a + 1] += jy / m;
            }
            if (!wallB) {
                heap[vel + 2 * b] -= jx / m;
                heap[vel + 2 * b + 1] -= jy / m;
            }
            stats.pairs++;
            if (mu > stats.maxMu) stats.maxMu = mu;
        }
    }

    /** Hilo de miel entre las partículas `a` y `b` con peso de contacto `w`: viscosidad exacta, conserva la cantidad de movimiento. */
    honeyPair(a, b, w, vel, dt) {
        const heap = Box2D.HEAPF32;
        const m = this.honeyMass;
        const inverse = 2 / m;
        const k = (this.honeyK * w) / PAIR_REST_WEIGHT;
        const factor = exponentialApproachFactor(k * dt * inverse);
        const dvx = heap[vel + 2 * b] - heap[vel + 2 * a];
        const dvy = heap[vel + 2 * b + 1] - heap[vel + 2 * a + 1];
        const jx = (factor * dvx) / inverse;
        const jy = (factor * dvy) / inverse;
        heap[vel + 2 * a] += jx / m;
        heap[vel + 2 * a + 1] += jy / m;
        heap[vel + 2 * b] -= jx / m;
        heap[vel + 2 * b + 1] -= jy / m;
        this.stats.honeyPairs++;
    }

    /** Lava contra los cuerpos: no deslizamiento con la velocidad del cuerpo en el punto, con reacción sobre el cuerpo dinámico. */
    bodyViscosity(total, dt) {
        const { thermal, stats, point, impulse } = this;
        const contacts = thermal.contacts;
        const count = contacts.bodies(total);
        if (count <= 0) return;
        const vel = Box2D.getPointer(this.system.GetVelocityBuffer()) >> 2;
        const pos = Box2D.getPointer(this.system.GetPositionBuffer()) >> 2;
        const heap = Box2D.HEAPF32;
        const m = this.mass;
        for (let c = 0; c < count; c++) {
            const i = contacts.bodyIndex[c];
            if (thermal.slotOf[i] < 0 || thermal.kindOf[i] !== FLUID.LAVA) continue;
            const body = Box2D.wrapPointer(contacts.bodyPtr[c], Box2D.b2Body);
            const type = body.GetType();
            let bx = 0;
            let by = 0;
            let massBody = Infinity;
            point.set_x(heap[pos + 2 * i]);
            point.set_y(heap[pos + 2 * i + 1]);
            if (type !== STATIC) {
                const vb = body.GetLinearVelocityFromWorldPoint(point);
                bx = vb.get_x();
                by = vb.get_y();
                if (type === DYNAMIC) massBody = body.GetMass();
            }
            const mu = this.mu(thermal.temp[i]);
            const inverse = 1 / m + 1 / massBody;
            const k = (2 * mu * this.thickness * contacts.bodyW[c]) / BODY_REST_WEIGHT;
            const factor = exponentialApproachFactor(k * dt * inverse);
            const jx = (factor * (heap[vel + 2 * i] - bx)) / inverse;
            const jy = (factor * (heap[vel + 2 * i + 1] - by)) / inverse;
            heap[vel + 2 * i] -= jx / m;
            heap[vel + 2 * i + 1] -= jy / m;
            if (type === DYNAMIC) {
                impulse.set_x(jx);
                impulse.set_y(jy);
                body.ApplyLinearImpulse(impulse, point, true);
            }
            stats.bodies++;
            if (mu > stats.maxMu) stats.maxMu = mu;
        }
    }
}
