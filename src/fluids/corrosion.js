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

/** Fracción de ácido que puede quedar sin gastar por redondeo cuando la partícula ya cuenta como agotada. */
const SPENT_TOLERANCE = 1e-6;

/**
 * Corrosión del terreno por ácido (`docs/design/05-escenario.md` §5.5 y `docs/design/14-agua.md`, #347). Patrón "juntar
 * durante el paso, actuar después": el callback de contactos de `DamageSystem` llama a `enqueue` y solo guarda el índice;
 * `process` corre después de cada `stepWorld` desde el loop.
 *
 * El acero que disuelve una partícula en total sale de su ácido por estequiometría (Fe + H2SO4, ver `CORROSION`),
 * multiplicado por `CORROSION.speedup`. Al tocar gasta de una vez la fracción `biteFraction`; después, en cada paso en
 * contacto, gasta parejo el resto a lo largo de `contactSeconds`, y al juntar ese contacto se destruye con
 * `SINK.CORRODED`.
 * Box2D avisa el contacto partícula↔cuerpo solo cuando empieza, así que una partícula queda marcada en contacto desde ese
 * aviso hasta que ya no tiene materia del terreno a su alcance (`Terrain.touches`). Si no hay materia, ese paso no gasta
 * ácido. Lo gastado y la marca viven por slot, y un slot reusado se reconoce por `store.generation`.
 *
 * `stats`: `dissolvedMass` (kg de acero por unidad de espesor de la rebanada, ya con el factor), `spentAcid` (ácido
 * gastado, en partículas enteras equivalentes), `consumed` (partículas destruidas) y `touching` (partículas en contacto
 * en el último paso).
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
        this.touchReach = config.touchRadii * system.GetRadius();
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
        this.spent = new Float32Array(store.capacity);
        this.touching = new Uint8Array(store.capacity);
        this.trackedGeneration = new Uint32Array(store.capacity);
        this.reset();
    }

    /** Pone en cero las estadísticas. */
    reset() {
        this.stats = { dissolvedMass: 0, spentAcid: 0, consumed: 0, touching: 0 };
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

    /**
     * Marca en contacto la partícula de `slot`; si el slot es de una partícula nueva, su ácido arranca entero.
     * @param {number} slot
     */
    markTouching(slot) {
        const generation = this.store.generation[slot];
        if (this.trackedGeneration[slot] !== generation) {
            this.trackedGeneration[slot] = generation;
            this.spent[slot] = 0;
        }
        this.touching[slot] = 1;
    }

    /**
     * Verdadero si la partícula viva de `slot` está marcada en contacto; borra la marca de un slot reusado.
     * @param {number} slot
     */
    isTouching(slot) {
        if (this.touching[slot] === 0) return false;
        if (this.trackedGeneration[slot] === this.store.generation[slot]) return true;
        this.touching[slot] = 0;
        return false;
    }

    /**
     * Aplica lo encolado y corroe con las partículas en contacto: llamar una vez por paso, después de `stepWorld` y de
     * `store.afterStep()`.
     * @param {number} dt duración del paso, en s
     */
    process(dt) {
        const terrain = this.terrain();
        const { store } = this;
        for (const index of this.queue) {
            const slot = store.slotAt(index);
            if (slot >= 0 && store.alive[slot] === 1) this.markTouching(slot);
        }
        const hadContacts = this.queue.length > 0 || this.stats.touching > 0;
        this.queue.length = 0;
        if (terrain === null || !hadContacts) return;
        const positions = Box2D.getPointer(this.system.GetPositionBuffer()) >> 2;
        const stepFraction = ((1 - this.config.biteFraction) * dt) / this.config.contactSeconds;
        const count = this.system.GetParticleCount();
        let touching = 0;
        for (let index = 0; index < count; index++) {
            const slot = store.slotAt(index);
            if (slot < 0 || store.alive[slot] === 0 || !this.isTouching(slot)) continue;
            const x = Box2D.HEAPF32[positions + POSITION_STRIDE * index];
            const y = Box2D.HEAPF32[positions + POSITION_STRIDE * index + 1];
            if (!terrain.touches({ x, y, reach: this.touchReach })) {
                this.touching[slot] = 0;
                continue;
            }
            touching++;
            this.corrode(terrain, index, slot, x, y, stepFraction);
        }
        this.stats.touching = touching;
    }

    /**
     * Saca del terreno la mordida (`biteFraction`, si la partícula todavía no gastó nada) o la fracción `stepFraction` del
     * acero de la partícula, sin pasarse de lo que le queda, y la destruye si su ácido se acabó.
     * @param {Terrain} terrain
     * @param {number} index índice de la partícula en el sistema
     * @param {number} slot
     * @param {number} x en m del mundo
     * @param {number} y en m del mundo
     * @param {number} stepFraction fracción del ácido entero que se gasta en un paso de contacto
     */
    corrode(terrain, index, slot, x, y, stepFraction) {
        const { store, stats, config } = this;
        const fullArea = this.steelArea[store.kind[slot]];
        const wanted = this.spent[slot] === 0 ? config.biteFraction : stepFraction;
        const fraction = Math.min(wanted, 1 - this.spent[slot]);
        const removed = terrain.erodeAt({ x, y, reach: this.reach, area: fullArea * fraction });
        if (removed <= 0) return;
        const spent = removed / fullArea;
        this.spent[slot] += spent;
        stats.dissolvedMass += removed * config.steelDensity * SLICE_THICKNESS;
        stats.spentAcid += spent;
        if (this.spent[slot] < 1 - SPENT_TOLERANCE) return;
        stats.consumed++;
        this.touching[slot] = 0;
        store.destroy(index, SINK.CORRODED);
    }
}
