/**
 * Identidad estable de las partículas del sistema de disparos (docs/design/14-agua.md §14.2). Módulo hoja:
 * es el único que llama a `CreateParticle` y `DestroyParticle` en ese sistema.
 * `DestroyParticle` deja una zombi que el motor compacta al principio del siguiente `Step`, y los índices
 * cambian. Por eso `userData` guarda solo `slot + 1` (el 0 es "sin slot") y el estado por partícula vive en
 * arreglos tipados indexados por slot (`vx`, `vy` guardan la velocidad del último subpaso para el contorno
 * inelástico, `js/wallContact.js`). El slot de una destruida se libera en `afterStep()`.
 * Libro de masa: `created[kind]` cuenta las creaciones y `destroyed[cause][kind]` las destrucciones por causa.
 * Congelado y recorte (#160): una partícula quieta pasa a `b2_wallParticle` (fija, sigue soportando a las demás) y
 * vuelve a sus flags al despertarla; si los fotogramas se vuelven lentos se destruyen las más viejas con `SINK.PERF`.
 */

import { PARTICLE } from "./particles.js";

/**
 * Datos del congelado y del recorte por rendimiento. `sleepSpeed` (m/s) y `sleepTime` (s): quietud para congelar.
 * `wakeReach` (en radios): distancia a la que una partícula en movimiento despierta a una congelada, y también la
 * que impide congelar a una con vecinas en movimiento. `slowFrameMs` y `slowTime` (s): frame lento sostenido que
 * activa el recorte, de a `trimBatch` partículas por frame.
 */
export const PARTICLES = { sleepSpeed: 0.05, sleepTime: 1, wakeReach: 3, slowFrameMs: 20, slowTime: 1, trimBatch: 100 };

const HASH_SIZE = 16384;

/** Origen de cada partícula, para el dibujo y la limpieza. */
export const ORIGIN = { SHOT: 1, RAIN: 2, STEAM: 3, MAP: 4 };

/**
 * Causa de cada destrucción, obligatoria en `destroy` (libro de masa, docs/design/14-agua.md §14.2): `ABSORBED`
 * pasa al campo, `OUT` salió del mundo, `HIT` ácido consumido al dañar, `EVAPORATED` pasó al aire,
 * `RESET` ronda nueva y `PERF` recorte de las más viejas por rendimiento.
 */
export const SINK = { ABSORBED: 1, OUT: 2, HIT: 3, EVAPORATED: 4, RESET: 5, PERF: 6 };

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
        this.vx = new Float32Array(capacity);
        this.vy = new Float32Array(capacity);
        this.quiet = new Float32Array(capacity);
        this.frozen = new Uint8Array(capacity);
        this.frozenCount = 0;
        this.slowTime = 0;
        this.cellHead = new Int32Array(HASH_SIZE);
        this.cellNext = new Int32Array(capacity);
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
        this.quiet[slot] = 0;
        this.frozen[slot] = 0;
        const vel = (Box2D.getPointer(this.system.GetVelocityBuffer()) >> 2) + 2 * index;
        this.vx[slot] = Box2D.HEAPF32[vel];
        this.vy[slot] = Box2D.HEAPF32[vel + 1];
        return index;
    }

    /** Slot de la partícula `i`, o -1 si no tiene (`userData` 0). */
    slotAt(i) {
        return Box2D.HEAP32[(this.system.GetUserDataBuffer() >> 2) + i] - 1;
    }

    /**
     * Idempotente: el slot vivo pasa a `pending` y la partícula queda zombi hasta el próximo `Step`. `cause` es
     * un valor de `SINK` y es obligatoria: suma la partícula a `destroyed[cause][kind]`.
     */
    destroy(i, cause) {
        if (!(cause >= 1 && cause < SINK_SLOTS)) throw new Error("ParticleStore.destroy exige una causa de SINK");
        const slot = this.slotAt(i);
        if (slot < 0 || slot >= this.capacity || this.alive[slot] === 0) return;
        this.system.DestroyParticle(i);
        this.alive[slot] = 0;
        if (this.frozen[slot] === 1) this.frozenCount--;
        this.frozen[slot] = 0;
        this.destroyed[cause][this.kind[slot]]++;
        this.pending[this.pendingCount++] = slot;
    }

    /** Pasa la partícula viva `i` a `b2_wallParticle`: queda fija y sigue soportando a las demás. */
    freeze(i) {
        const slot = this.slotAt(i);
        if (slot < 0 || this.alive[slot] === 0 || this.frozen[slot] === 1) return;
        this.system.SetParticleFlags(i, this.system.GetParticleFlags(i) | PARTICLE.WALL);
        this.frozen[slot] = 1;
        this.frozenCount++;
    }

    /** Devuelve a la partícula `i` sus flags de origen y reinicia su cuenta de quietud. Sin efecto si no está congelada. */
    wake(i) {
        const slot = this.slotAt(i);
        if (slot < 0 || slot >= this.capacity || this.alive[slot] === 0) return;
        this.quiet[slot] = 0;
        if (this.frozen[slot] === 0) return;
        this.system.SetParticleFlags(i, this.system.GetParticleFlags(i) & ~PARTICLE.WALL);
        this.frozen[slot] = 0;
        this.frozenCount--;
    }

    /**
     * Congela y despierta por quietud, una vez por frame con el tiempo físico `dt` (s) de sus pasos. Una partícula
     * con |v| < `sleepSpeed` durante `sleepTime` y sin vecinas en movimiento a `wakeReach` radios se congela; una
     * congelada con una vecina en movimiento a esa distancia se despierta. Los contactos con cuerpos y con el campo
     * de agua despiertan por `wake`. Los movimientos se buscan en una grilla hash reutilizada, sin crear nada nativo.
     */
    updateSleep(dt) {
        const { system, alive, quiet, frozen, cellHead, cellNext } = this;
        const total = system.GetParticleCount();
        if (total === 0 || !(dt > 0)) return;
        const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
        const vel = Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
        const marks = system.GetUserDataBuffer() >> 2;
        const heapF = Box2D.HEAPF32;
        const heapI = Box2D.HEAP32;
        const reach = PARTICLES.wakeReach * system.GetRadius();
        const reach2 = reach * reach;
        const speed2 = PARTICLES.sleepSpeed * PARTICLES.sleepSpeed;
        cellHead.fill(-1);
        let movers = 0;
        for (let i = 0; i < total; i++) {
            const slot = heapI[marks + i] - 1;
            if (slot < 0 || alive[slot] === 0) continue;
            const vx = heapF[vel + 2 * i];
            const vy = heapF[vel + 2 * i + 1];
            if (frozen[slot] === 1) continue;
            if (vx * vx + vy * vy < speed2) {
                quiet[slot] += dt;
                continue;
            }
            quiet[slot] = 0;
            const cell = this.cellOf(heapF[pos + 2 * i], heapF[pos + 2 * i + 1], reach);
            cellNext[i] = cellHead[cell];
            cellHead[cell] = i;
            movers++;
        }
        for (let i = 0; i < total; i++) {
            const slot = heapI[marks + i] - 1;
            if (slot < 0 || alive[slot] === 0) continue;
            const isFrozen = frozen[slot] === 1;
            if (!isFrozen && quiet[slot] < PARTICLES.sleepTime) continue;
            const near = movers > 0 && this.nearMover(heapF[pos + 2 * i], heapF[pos + 2 * i + 1], reach, reach2, pos, i);
            if (isFrozen && near) this.wake(i);
            else if (!isFrozen && !near) this.freeze(i);
        }
    }

    /** Celda de la grilla hash para (x, y) con celdas de lado `size`. */
    cellOf(x, y, size) {
        return (Math.imul(Math.floor(x / size), 73856093) ^ Math.imul(Math.floor(y / size), 19349663)) & (HASH_SIZE - 1);
    }

    /** Verdadero si alguna partícula en movimiento, distinta de `self`, está a menos de `reach` de (x, y). */
    nearMover(x, y, reach, reach2, pos, self) {
        const heapF = Box2D.HEAPF32;
        const cx = Math.floor(x / reach);
        const cy = Math.floor(y / reach);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const cell = (Math.imul(cx + dx, 73856093) ^ Math.imul(cy + dy, 19349663)) & (HASH_SIZE - 1);
                for (let j = this.cellHead[cell]; j >= 0; j = this.cellNext[j]) {
                    if (j === self) continue;
                    const ex = heapF[pos + 2 * j] - x;
                    const ey = heapF[pos + 2 * j + 1] - y;
                    if (ex * ex + ey * ey <= reach2) return true;
                }
            }
        }
        return false;
    }

    /**
     * Recorte por rendimiento, una vez por frame. `frameMs` es el tiempo de frame medido por quien llama (en las
     * pruebas se simula) y `dt` los segundos reales del frame. Si `frameMs` supera `slowFrameMs` de forma sostenida
     * durante `slowTime`, destruye hasta `trimBatch` partículas con `SINK.PERF` en ese frame, primero las congeladas y
     * después las de id de disparo menor; las del mapa (disparo 0) van al final. Devuelve cuántas destruyó.
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
            this.trimKey[i] = (this.frozen[slot] === 1 ? 0 : 2 ** 32) + shot;
            order.push(i);
        }
        const key = this.trimKey;
        order.sort((a, b) => key[a] - key[b] || a - b);
        const count = Math.min(PARTICLES.trimBatch, order.length);
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
        this.frozen.fill(0);
        this.frozenCount = 0;
        this.slowTime = 0;
    }
}
