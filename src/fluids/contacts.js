/**
 * Lector en solo lectura de los buffers nativos de contactos de un `b2ParticleSystem` (docs/design/14-agua.md §14.8).
 * Módulo hoja y único que conoce esas estructuras: el binding no exporta `GetContacts` ni el conteo de contactos
 * partícula-cuerpo, y cada buffer es un `b2GrowableBuffer { data*, count, capacity, allocator* }` dentro del sistema.
 *
 * Los offsets no se fijan: la primera vez que hay contactos se buscan en las primeras `SEARCH_WORDS` palabras
 * del sistema y se validan con los primeros contactos (índices en rango; `0 < peso ≤ 1` en partícula-partícula y
 * `peso > 0` finito en partícula-cuerpo, donde una partícula dentro del cuerpo pesa más que 1). Esperados: +54 palabras
 * y 6 por contacto (`indexA`, `indexB`, `weight`, `nx`, `ny`, `flags`) para partícula-partícula, y +58 y 7 por
 * contacto (`index`, `body*`, `fixture*`, `weight`, `nx`, `ny`, `mass`) para partícula-cuerpo. Si un offset
 * hallado difiere del esperado se avisa una vez con `console.warn`; si no se encuentra, `failed` queda en
 * verdadero y quien depende de los contactos se desactiva. El puntero `data` se relee en cada lectura.
 * No crea objetos nativos. `weights` suma pesos por partícula; `pairs` y `bodies` copian los contactos a arreglos
 * propios (`pairA/B/W`, `bodyIndex/Ptr/W/Nx/Ny`) para quien necesite recorrerlos uno por uno (`src/fluids/thermal.js`,
 * `src/fluids/viscosity.js`, `src/fluids/adhesion.js`).
 */

const SEARCH_WORDS = 600;
const PARTICLE_CONTACT_WORDS = 6;
const BODY_CONTACT_WORDS = 7;
const CHECKED_CONTACTS = 8;

/** Offsets (en palabras) que halló el relevamiento de la estructura nativa. */
export const EXPECTED_OFFSETS = { particle: 54, body: 58 };

/** Lector de los contactos de `system`. */
export class Contacts {
    /**
     * `stats` informa los offsets hallados (`particleOffset`, `bodyOffset`, `null` si todavía no se encontraron),
     * `failed` (se vio el buffer pero no se pudo ubicar o validar) y `unexpected` (algún offset distinto del esperado).
     */
    constructor(system) {
        this.system = system;
        this.stats = { particleOffset: null, bodyOffset: null, failed: false, unexpected: false };
        this.warned = false;
        this.pairA = new Int32Array(0);
        this.pairB = new Int32Array(0);
        this.pairW = new Float32Array(0);
        this.bodyIndex = new Int32Array(0);
        this.bodyPtr = new Int32Array(0);
        this.bodyW = new Float32Array(0);
        this.bodyNx = new Float32Array(0);
        this.bodyNy = new Float32Array(0);
    }

    /** Verdadero si algún buffer existe y no se pudo ubicar: los contactos no son confiables. */
    get failed() {
        return this.stats.failed;
    }

    /**
     * Pone en `out[0 .. n)` la suma de pesos de los contactos de cada partícula: partícula-partícula en `pp` y
     * partícula-cuerpo en `pb` (arreglos de al menos `n` elementos, `n` = `GetParticleCount()`). Con buffers
     * todavía inexistentes quedan en cero; devuelve falso si algún buffer existe y no se pudo leer.
     */
    weights(pp, pb, n) {
        pp.fill(0, 0, n);
        pb.fill(0, 0, n);
        if (n === 0 || this.stats.failed) return !this.stats.failed;
        this.readParticles(pp, n);
        this.readBodies(pb, n);
        return !this.stats.failed;
    }

    /**
     * Copia los contactos partícula-partícula a `pairA`, `pairB` y `pairW` (índices y peso, arreglos propios que
     * crecen y valen hasta la próxima llamada) y devuelve cuántos son, o -1 si el buffer no se pudo leer. Descarta
     * los contactos con índices fuera de `n`.
     */
    pairs(n) {
        if (this.stats.failed) return -1;
        const total = this.system.GetContactCount();
        if (n === 0 || total <= 0) return 0;
        if (this.pairA.length < total) {
            const size = Math.max(total, 2 * this.pairA.length);
            this.pairA = new Int32Array(size);
            this.pairB = new Int32Array(size);
            this.pairW = new Float32Array(size);
        }
        const words = this.particleWords(total, n);
        if (words < 0) return -1;
        const heapI = Box2D.HEAP32;
        const heapF = Box2D.HEAPF32;
        let kept = 0;
        for (let c = 0; c < total; c++) {
            const w = words + c * PARTICLE_CONTACT_WORDS;
            const a = heapI[w];
            const b = heapI[w + 1];
            if (a >= n || b >= n) continue;
            this.pairA[kept] = a;
            this.pairB[kept] = b;
            this.pairW[kept] = heapF[w + 2];
            kept++;
        }
        return kept;
    }

    /**
     * Copia los contactos partícula-cuerpo a `bodyIndex`, `bodyPtr` (puntero nativo del `b2Body`), `bodyW` (peso) y
     * `bodyNx`/`bodyNy` (normal unitaria exterior, del sólido a la partícula; el motor la guarda al revés), arreglos propios que crecen y valen hasta la próxima llamada. Devuelve cuántos son, o -1 si el buffer no se
     * pudo leer. El buffer guarda punteros a los cuerpos hasta el próximo `world.Step`: leerlo justo después de `stepWorld`.
     */
    bodies(n) {
        if (this.stats.failed) return -1;
        const data = Box2D.getPointer(this.system.GetBodyContacts());
        if (data === 0 || n === 0) return 0;
        const base = Box2D.getPointer(this.system) >> 2;
        const heapI = Box2D.HEAP32;
        const heapF = Box2D.HEAPF32;
        if (this.stats.bodyOffset === null || heapI[base + this.stats.bodyOffset] !== data) {
            const offset = this.findBodies(base, data, n);
            if (offset < 0) {
                this.fail();
                return -1;
            }
            this.stats.bodyOffset = offset;
            this.note(offset, EXPECTED_OFFSETS.body, "partícula-cuerpo");
        }
        const total = heapI[base + this.stats.bodyOffset + 1];
        if (this.bodyIndex.length < total) {
            const size = Math.max(total, 2 * this.bodyIndex.length);
            this.bodyIndex = new Int32Array(size);
            this.bodyPtr = new Int32Array(size);
            this.bodyW = new Float32Array(size);
            this.bodyNx = new Float32Array(size);
            this.bodyNy = new Float32Array(size);
        }
        const words = data >> 2;
        let kept = 0;
        for (let c = 0; c < total; c++) {
            const w = words + c * BODY_CONTACT_WORDS;
            const index = heapI[w];
            if (index >= n) continue;
            this.bodyIndex[kept] = index;
            this.bodyPtr[kept] = heapI[w + 1];
            this.bodyW[kept] = heapF[w + 3];
            this.bodyNx[kept] = -heapF[w + 4];
            this.bodyNy[kept] = -heapF[w + 5];
            kept++;
        }
        return kept;
    }

    /**
     * Índice (en palabras del heap) del primer contacto partícula-partícula, ubicando el buffer la primera vez o si
     * cambió; -1 si no se pudo ubicar.
     */
    particleWords(count, n) {
        const base = Box2D.getPointer(this.system) >> 2;
        const heapI = Box2D.HEAP32;
        if (this.stats.particleOffset === null || heapI[base + this.stats.particleOffset + 1] !== count) {
            const offset = this.findParticles(base, count, n);
            if (offset < 0) {
                this.fail();
                return -1;
            }
            this.stats.particleOffset = offset;
            this.note(offset, EXPECTED_OFFSETS.particle, "partícula-partícula");
        }
        return heapI[base + this.stats.particleOffset] >> 2;
    }

    /** Suma los pesos de los contactos partícula-partícula en `out`. */
    readParticles(out, n) {
        const count = this.system.GetContactCount();
        if (count <= 0) return;
        const heapI = Box2D.HEAP32;
        const heapF = Box2D.HEAPF32;
        const words = this.particleWords(count, n);
        if (words < 0) return;
        for (let c = 0; c < count; c++) {
            const w = words + c * PARTICLE_CONTACT_WORDS;
            const a = heapI[w];
            const b = heapI[w + 1];
            if (a >= n || b >= n) continue;
            out[a] += heapF[w + 2];
            out[b] += heapF[w + 2];
        }
    }

    /** Suma los pesos de los contactos partícula-cuerpo en `out`. */
    readBodies(out, n) {
        const data = Box2D.getPointer(this.system.GetBodyContacts());
        if (data === 0) return;
        const base = Box2D.getPointer(this.system) >> 2;
        const heapI = Box2D.HEAP32;
        const heapF = Box2D.HEAPF32;
        if (this.stats.bodyOffset === null || heapI[base + this.stats.bodyOffset] !== data) {
            const offset = this.findBodies(base, data, n);
            if (offset < 0) {
                this.fail();
                return;
            }
            this.stats.bodyOffset = offset;
            this.note(offset, EXPECTED_OFFSETS.body, "partícula-cuerpo");
        }
        const count = heapI[base + this.stats.bodyOffset + 1];
        const words = data >> 2;
        for (let c = 0; c < count; c++) {
            const w = words + c * BODY_CONTACT_WORDS;
            const index = heapI[w];
            if (index >= n) continue;
            out[index] += heapF[w + 3];
        }
    }

    /** Palabra del sistema que es el puntero al buffer y tiene el conteo `count` justo después, validada por estructura; -1 si no hay. */
    findParticles(base, count, n) {
        const heapI = Box2D.HEAP32;
        for (let k = 0; k < SEARCH_WORDS; k++) {
            const data = heapI[base + k];
            if (data <= 0 || (data & 3) !== 0 || heapI[base + k + 1] !== count || heapI[base + k + 2] < count) continue;
            if (this.validParticles(data >> 2, count, n)) return k;
        }
        return -1;
    }

    /**
     * Palabra del sistema que es el puntero `data` que devuelve `GetBodyContacts()`, con el conteo y la capacidad
     * coherentes; si el conteo no es cero se validan además los contactos. -1 si no hay.
     */
    findBodies(base, data, n) {
        const heapI = Box2D.HEAP32;
        for (let k = 0; k < SEARCH_WORDS; k++) {
            if (heapI[base + k] !== data) continue;
            const count = heapI[base + k + 1];
            if (count < 0 || heapI[base + k + 2] < count) continue;
            if (count === 0 || this.validBodies(data >> 2, count, n)) return k;
        }
        return -1;
    }

    validParticles(words, count, n) {
        const heapI = Box2D.HEAP32;
        const heapF = Box2D.HEAPF32;
        const checked = Math.min(count, CHECKED_CONTACTS);
        for (let c = 0; c < checked; c++) {
            const w = words + c * PARTICLE_CONTACT_WORDS;
            const weight = heapF[w + 2];
            if (!(heapI[w] >= 0 && heapI[w] < n && heapI[w + 1] >= 0 && heapI[w + 1] < n && weight > 0 && weight <= 1)) return false;
        }
        return true;
    }

    validBodies(words, count, n) {
        const heapI = Box2D.HEAP32;
        const heapF = Box2D.HEAPF32;
        const checked = Math.min(count, CHECKED_CONTACTS);
        for (let c = 0; c < checked; c++) {
            const w = words + c * BODY_CONTACT_WORDS;
            const weight = heapF[w + 3];
            if (!(heapI[w] >= 0 && heapI[w] < n && heapI[w + 1] > 0 && weight > 0 && weight < Infinity)) return false;
        }
        return true;
    }

    fail() {
        this.stats.failed = true;
        console.warn("contacts.js: no se encontró el buffer nativo de contactos; lo que depende de él queda desactivado");
    }

    note(found, expected, name) {
        if (found === expected) return;
        this.stats.unexpected = true;
        if (this.warned) return;
        this.warned = true;
        console.warn(`contacts.js: el buffer de contactos ${name} está a +${found} palabras, se esperaba +${expected}`);
    }
}
