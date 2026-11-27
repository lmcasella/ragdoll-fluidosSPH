/** Cantidad de valores distintos de un entero sin signo de 32 bits: divide un `uint32` para llevarlo a [0, 1). */
const UINT32_RANGE = 4294967296;

/** Constantes de mulberry32: paso de la semilla por llamada, desplazamientos de bits y multiplicador de la mezcla. */
const SEED_INCREMENT = 0x6d2b79f5;
const MIX_SHIFT_FIRST = 15;
const MIX_SHIFT_SECOND = 7;
const MIX_SHIFT_THIRD = 14;
const MIX_OR_MASK_FIRST = 1;
const MIX_OR_MASK_SECOND = 61;

/** Constantes del hash entero: desplazamientos de bits y multiplicadores de cada vuelta de la mezcla. */
const HASH_SHIFT_FIRST = 15;
const HASH_SHIFT_SECOND = 12;
const HASH_MULTIPLIER_FIRST = 0x2c1b3c6d;
const HASH_MULTIPLIER_SECOND = 0x297a2d39;

/**
 * Generador pseudoaleatorio determinista (mulberry32): mismo `seed`, misma secuencia. Ver `docs/referencias.md`.
 * @param {number} seed entero; se toma como `uint32`
 * @returns {() => number} función que devuelve un número en [0, 1) en cada llamada
 */
export function createSeededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + SEED_INCREMENT) >>> 0;
        let mixed = state;
        mixed = Math.imul(mixed ^ (mixed >>> MIX_SHIFT_FIRST), mixed | MIX_OR_MASK_FIRST);
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> MIX_SHIFT_SECOND), mixed | MIX_OR_MASK_SECOND);
        return ((mixed ^ (mixed >>> MIX_SHIFT_THIRD)) >>> 0) / UINT32_RANGE;
    };
}

/**
 * Hash entero a [0, 1): da piezas y ángulos repetibles sin `Math.random` (xorshift-multiply, ver `docs/referencias.md`).
 * @param {number} seed entero
 * @returns {number} en [0, 1)
 */
export function hashToUnit(seed) {
    let mixed = Math.imul(seed ^ (seed >>> HASH_SHIFT_FIRST), HASH_MULTIPLIER_FIRST);
    mixed = Math.imul(mixed ^ (mixed >>> HASH_SHIFT_SECOND), HASH_MULTIPLIER_SECOND);
    return ((mixed ^ (mixed >>> HASH_SHIFT_FIRST)) >>> 0) / UINT32_RANGE;
}
