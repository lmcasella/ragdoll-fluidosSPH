/**
 * Identidad estable de las partículas del sistema de disparos (docs/design/14-agua.md §14.2). Módulo hoja:
 * es el único que llama a `CreateParticle` y `DestroyParticle` en ese sistema.
 * `DestroyParticle` deja una zombi que el motor compacta al principio del siguiente `Step`, y los índices
 * cambian. Por eso `userData` guarda solo `slot + 1` (el 0 es "sin slot") y el estado por partícula vive en
 * arreglos tipados indexados por slot. El slot de una destruida se libera en `afterStep()`.
 */

/** Origen de cada partícula, para el dibujo y la limpieza. */
export const ORIGIN = { SHOT: 1, RAIN: 2, STEAM: 3, MAP: 4 };

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
        this.free = new Int32Array(capacity);
        this.pending = new Int32Array(capacity);
        this.freeCount = capacity;
        this.pendingCount = 0;
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
        this.origin[slot] = props.origin ?? ORIGIN.SHOT;
        this.shot[slot] = props.shot ?? 0;
        return index;
    }

    /** Slot de la partícula `i`, o -1 si no tiene (`userData` 0). */
    slotAt(i) {
        return Box2D.HEAP32[(this.system.GetUserDataBuffer() >> 2) + i] - 1;
    }

    /** Idempotente: el slot vivo pasa a `pending` y la partícula queda zombi hasta el próximo `Step`. */
    destroy(i) {
        const slot = this.slotAt(i);
        if (slot < 0 || slot >= this.capacity || this.alive[slot] === 0) return;
        this.system.DestroyParticle(i);
        this.alive[slot] = 0;
        this.pending[this.pendingCount++] = slot;
    }

    /** Libera los slots de las destruidas. Llamar inmediatamente después de cada `stepWorld`. */
    afterStep() {
        while (this.pendingCount > 0) this.free[this.freeCount++] = this.pending[--this.pendingCount];
    }

    /** Destruye todas las partículas vivas (reinicio de ronda). */
    reset() {
        for (let i = this.system.GetParticleCount() - 1; i >= 0; i--) this.destroy(i);
    }
}
