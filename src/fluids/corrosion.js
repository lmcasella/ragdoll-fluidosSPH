import { CORROSION, SIGMA_W } from "./materials.js";
import { KIND_MATERIAL } from "../water/immersion.js";
import { SINK } from "./particleStore.js";
import { WATER_DENSITY } from "../core/physics/constants.js";

const KIND_SLOTS = 256;

/** Lado de la parcela de una partícula, en radios del sistema (el mismo `1,5 r` del resto de los módulos de fluidos). */
const PARTICLE_SIDE_IN_RADII = 1.5;

/** Valores por partícula en el buffer de posiciones: x e y. */
const POSITION_STRIDE = 2;

/** Espesor de la rebanada 2D, en m: el mismo `b = σ_w / ρ_w` del resto de los módulos de fluidos. */
const SLICE_THICKNESS = SIGMA_W / WATER_DENSITY;

/**
 * Corrosión del terreno por ácido (`docs/design/05-escenario.md` §5.5 y `docs/design/14-agua.md`, #347). Patrón "juntar
 * durante el paso, actuar después": el callback de contactos de `DamageSystem` llama a `enqueue` y solo guarda el índice;
 * `process` corre después de `stepWorld` desde el loop, saca de la grilla del terreno el acero que disuelve cada
 * partícula (Fe + H2SO4, ver `CORROSION`) y la destruye con `SINK.CORRODED`. El acero que disuelve una partícula sale de
 * su ácido por estequiometría, multiplicado por `CORROSION.speedup`; si no hay material a mano la partícula no se gasta.
 *
 * `stats`: `dissolvedMass` (kg de acero por unidad de espesor de la rebanada, ya con el factor) y `consumed` (partículas
 * gastadas).
 */
export class Corrosion {
    /**
     * @param {object} options
     * @param {object} options.system `b2ParticleSystem` de los disparos
     * @param {object} options.store `ParticleStore`
     * @param {() => Terrain|null} options.terrain devuelve el terreno vigente, o `null` si no hay
     * @param {typeof CORROSION} [options.config]
     */
    constructor({ system, store, terrain, config = CORROSION }) {
        this.system = system;
        this.store = store;
        this.terrain = terrain;
        this.config = config;
        this.reach = config.reachRadii * system.GetRadius();
        const side = PARTICLE_SIDE_IN_RADII * system.GetRadius();
        const particleArea = side * side;
        const ironPerAcid = config.ironMolarMass / config.acidMolarMass;
        this.steelArea = new Float64Array(KIND_SLOTS);
        for (const [kind, entry] of Object.entries(KIND_MATERIAL)) {
            const acidFraction = entry.material.species?.H2SO4;
            if (!(acidFraction > 0)) continue;
            const acidMass = entry.material.SG * SIGMA_W * particleArea * acidFraction;
            const steelMass = acidMass * ironPerAcid * config.speedup;
            this.steelArea[kind] = steelMass / (config.steelDensity * SLICE_THICKNESS);
        }
        this.queue = [];
        this.reset();
    }

    /** Pone en cero las estadísticas. */
    reset() {
        this.stats = { dissolvedMass: 0, consumed: 0 };
    }

    /**
     * Encola un contacto partícula↔cuerpo si el cuerpo es el del terreno vigente y la partícula es de ácido. Es el único
     * método que se llama dentro de un callback de Box2D: no crea ni destruye nada.
     * @param {number} bodyPointer puntero del cuerpo tocado
     * @param {number} index índice de la partícula en el sistema
     */
    enqueue(bodyPointer, index) {
        const terrain = this.terrain();
        if (!terrain || Box2D.getPointer(terrain.body) !== bodyPointer) return;
        const slot = this.store.slotAt(index);
        if (slot < 0 || this.store.alive[slot] === 0 || this.steelArea[this.store.kind[slot]] === 0) return;
        this.queue.push(index);
    }

    /** Aplica lo encolado durante el paso: llamar después de `stepWorld` y de `store.afterStep()`. */
    process() {
        const terrain = this.terrain();
        const { store, stats, config } = this;
        const positions = Box2D.getPointer(this.system.GetPositionBuffer()) >> 2;
        for (const index of this.queue) {
            const slot = store.slotAt(index);
            if (terrain === null || slot < 0 || store.alive[slot] === 0) continue;
            const removed = terrain.erodeAt({
                x: Box2D.HEAPF32[positions + POSITION_STRIDE * index],
                y: Box2D.HEAPF32[positions + POSITION_STRIDE * index + 1],
                reach: this.reach,
                area: this.steelArea[store.kind[slot]],
            });
            if (removed <= 0) continue;
            stats.dissolvedMass += removed * config.steelDensity * SLICE_THICKNESS;
            stats.consumed++;
            store.destroy(index, SINK.CORRODED);
        }
        this.queue.length = 0;
    }
}
