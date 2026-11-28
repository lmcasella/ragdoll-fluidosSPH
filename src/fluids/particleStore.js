import { clamp } from "../core/math/scalar.js";

/**
 * Identidad estable de las partículas del sistema de disparos (docs/design/14-agua.md §14.2). Módulo hoja:
 * es el único que llama a `CreateParticle` y `DestroyParticle` en ese sistema.
 * `DestroyParticle` deja una zombi que el motor compacta al principio del siguiente `Step`, y los índices
 * cambian. Por eso `userData` guarda solo `slot + 1` (el 0 es "sin slot") y el estado por partícula vive en
 * arreglos tipados indexados por slot (`vx`, `vy` guardan la velocidad del último subpaso para el contorno
 * inelástico, `src/fluids/wallContact.js`). El slot de una destruida se libera en `afterStep()`.
 * Libro de masa: `created[kind]` cuenta las creaciones y `destroyed[cause][kind]` las destrucciones por causa.
 * Térmica (#75): `enthalpy[slot]` es la entalpía específica (J/kg, 0 a 0 °C), que nace con `enthalpyInit[kind]` o
 * con `props.enthalpy`; `thermal` lo pone en verdadero `src/fluids/thermal.js` al ocuparse de ellas, y `generation[slot]`
 * sube con cada `create` para que quien guarde estado por slot sepa que es de otra partícula.
 * Recorte (#160): si los fotogramas se vuelven lentos se destruyen las más viejas con `SINK.PERF`.
 */

/**
 * Datos del recorte por rendimiento. `slowFrameMs` y `slowTime` (s): frame lento sostenido que activa el recorte,
 * de a `trimBatch` partículas por frame. Nunca baja de `minCount` vivas: con pocas partículas la lentitud viene de
 * otra parte y recortar borraría los disparos apenas salen (#266).
 */
export const PARTICLES = { slowFrameMs: 20, slowTime: 1, trimBatch: 100, minCount: 1000 };

/** Origen de cada partícula, para el dibujo y la limpieza (SPLASH: gota lanzada por un cuerpo que entra al agua del campo). */
export const ORIGIN = { SHOT: 1, RAIN: 2, STEAM: 3, MAP: 4, SPLASH: 5 };

/**
 * Causa de cada destrucción, obligatoria en `destroy` (libro de masa, docs/design/14-agua.md §14.2): `ABSORBED`
 * pasa al campo, `OUT` salió del mundo, `HIT` ácido consumido al dañar, `EVAPORATED` pasó al aire,
 * `RESET` ronda nueva, `PERF` recorte de las más viejas por rendimiento y `HUMIDITY` niebla que se disolvió en el
 * aire (sumidero de H₂O, #113) y `CORRODED` ácido gastado al disolver terreno (#347).
 */
export const SINK = { ABSORBED: 1, OUT: 2, HIT: 3, EVAPORATED: 4, RESET: 5, PERF: 6, HUMIDITY: 7, CORRODED: 8 };

const SINK_SLOTS = Math.max(...Object.values(SINK)) + 1;
const KIND_SLOTS = 256;

export class ParticleStore {
    /**
     * `params` son los datos del sistema (`SHOT_SYSTEM`): con destrucción por edad el motor borraría partículas
     * por su cuenta y los slots quedarían colgados, y el build no deja leerla del sistema.
     */
    constructor(system, params, capacity = system.GetMaxParticleCount()) {
        if (params?.destroyByAge !== false) throw new Error("ParticleStore exige destroyByAge: false en los datos del sistema");
        if (!(capacity > 0)) throw new Error("ParticleStore necesita una capacidad finita (maxCount > 0)");
        this.system = system;
        this.capacity = capacity;
        this.alive = new Uint8Array(capacity);
        this.kind = new Uint8Array(capacity);
        this.origin = new Uint8Array(capacity);
        this.shot = new Int32Array(capacity);
        this.evaporated = new Float32Array(capacity);
        this.enthalpy = new Float64Array(capacity);
        this.generation = new Uint32Array(capacity);
        this.enthalpyInit = new Float64Array(KIND_SLOTS);
        this.thermal = false;
        this.vx = new Float32Array(capacity);
        this.vy = new Float32Array(capacity);
        this.slowTime = 0;
        this.trimKey = new Float64Array(capacity);
        this.trimOrder = [];
        this.free = new Int32Array(capacity);
        this.pending = new Int32Array(capacity);
        this.freeCount = capacity;
        this.pendingCount = 0;
        this.created = new Float64Array(KIND_SLOTS);
        this.destroyed = Array.from({ length: SINK_SLOTS }, () => new Float64Array(KIND_SLOTS));
        for (let s = 0; s < capacity; s++) this.free[s] = capacity - 1 - s;
    }

    /**
     * Crea la partícula de `def` y devuelve su índice, o -1 si no hay slot libre o el motor no tiene lugar.
     * No compacta ni cambia ningún índice. El puntero de `userData` se relee después de crear.
     */
    create(def, props) {
        if (this.freeCount === 0) return -1;
        const index = this.system.CreateParticle(def);
        if (index < 0) return -1;
        const slot = this.free[--this.freeCount];
        Box2D.HEAP32[(this.system.GetUserDataBuffer() >> 2) + index] = slot + 1;
        this.alive[slot] = 1;
        this.kind[slot] = props.kind ?? 0;
        this.created[this.kind[slot]]++;
        this.origin[slot] = props.origin ?? ORIGIN.SHOT;
        this.shot[slot] = props.shot ?? 0;
        this.evaporated[slot] = 0;
        this.enthalpy[slot] = props.enthalpy ?? this.enthalpyInit[this.kind[slot]];
        this.generation[slot]++;
        const vel = (Box2D.getPointer(this.system.GetVelocityBuffer()) >> 2) + 2 * index;
        this.vx[slot] = Box2D.HEAPF32[vel];
        this.vy[slot] = Box2D.HEAPF32[vel + 1];
        return index;
    }

    /** Índice de `Box2D.HEAP32` donde empieza el buffer de `userData` de las partículas. */
    userDataStart() {
        return this.system.GetUserDataBuffer() >> 2;
    }

    /**
     * Slot de la partícula `i`, o -1 si no tiene (`userData` 0), con el inicio del buffer ya leído (`userDataStart()`).
     * Es para recorridos que piden la dirección una sola vez y no una por partícula: el binding cuesta más que el resto.
     */
    slotIn(userDataStart, i) {
        return Box2D.HEAP32[userDataStart + i] - 1;
    }

    /** Slot de la partícula `i`, o -1 si no tiene (`userData` 0). */
    slotAt(i) {
        return this.slotIn(this.userDataStart(), i);
    }

    /**
     * Idempotente: el slot vivo pasa a `pending` y la partícula queda zombi hasta el próximo `Step`. `cause` es
     * un valor de `SINK` y es obligatoria: suma la partícula a `destroyed[cause][kind]`. Si ya se evaporó una
     * fracción `φ` y la causa no es `EVAPORATED`, el libro anota `1 − φ` en la causa y `φ` en `EVAPORATED`: la
     * parte evaporada pasó al aire y no sale con la partícula (docs/design/14-agua.md §14.7b).
     */
    destroy(i, cause) {
        if (!(cause >= 1 && cause < SINK_SLOTS)) throw new Error("ParticleStore.destroy exige una causa de SINK");
        const slot = this.slotAt(i);
        if (slot < 0 || slot >= this.capacity || this.alive[slot] === 0) return;
        this.system.DestroyParticle(i);
        this.alive[slot] = 0;
        const phi = cause === SINK.ABSORBED ? this.evaporated[slot] : 0;
        this.destroyed[cause][this.kind[slot]] += 1 - phi;
        this.destroyed[SINK.EVAPORATED][this.kind[slot]] += phi;
        this.pending[this.pendingCount++] = slot;
    }

    /**
     * Recorte por rendimiento, una vez por frame. `frameMs` es el tiempo de frame medido por quien llama (en las
     * pruebas se simula) y `dt` los segundos reales del frame. Si `frameMs` supera `slowFrameMs` de forma sostenida
     * durante `slowTime`, destruye hasta `trimBatch` partículas con `SINK.PERF` en ese frame, las de id de
     * disparo menor primero; las del mapa (disparo 0) van al final, sin bajar de `minCount` vivas. Devuelve cuántas
     * destruyó.
     */
    trim(frameMs, dt) {
        if (!(frameMs > PARTICLES.slowFrameMs)) {
            this.slowTime = 0;
            return 0;
        }
        this.slowTime += dt;
        if (this.slowTime < PARTICLES.slowTime) return 0;
        const total = this.system.GetParticleCount();
        const order = this.trimOrder;
        order.length = 0;
        for (let i = 0; i < total; i++) {
            const slot = this.slotAt(i);
            if (slot < 0 || this.alive[slot] === 0) continue;
            const shot = this.shot[slot] > 0 ? this.shot[slot] : 2 ** 31;
            this.trimKey[i] = shot;
            order.push(i);
        }
        const key = this.trimKey;
        order.sort((a, b) => key[a] - key[b] || a - b);
        const count = clamp(order.length - PARTICLES.minCount, 0, PARTICLES.trimBatch);
        for (let n = 0; n < count; n++) this.destroy(order[n], SINK.PERF);
        return count;
    }

    /** Libera los slots de las destruidas. Llamar inmediatamente después de cada `stepWorld`. */
    afterStep() {
        while (this.pendingCount > 0) this.free[this.freeCount++] = this.pending[--this.pendingCount];
    }

    /** Destruye todas las partículas vivas con la causa `RESET` (reinicio de ronda) y pone el libro en cero. */
    reset() {
        for (let i = this.system.GetParticleCount() - 1; i >= 0; i--) this.destroy(i, SINK.RESET);
        this.created.fill(0);
        for (const book of this.destroyed) book.fill(0);
        this.slowTime = 0;
    }
}
