/** Una vuelta completa, en rad. */
export const TAU = Math.PI * 2;

/** Un cuarto de vuelta, en rad: la dirección "arriba" (+Y) medida desde +X. */
export const QUARTER_TURN = Math.PI / 2;

/** Tolerancia de las comparaciones de geometría y de alturas, en m: dos valores a menos de esto cuentan como iguales. */
export const GEOMETRY_TOLERANCE = 1e-9;

/** Tolerancia relativa (adimensional) de las comparaciones de magnitudes que no son longitudes: celdas, rapideces y fracciones de un total. */
export const RELATIVE_TOLERANCE = 1e-9;

/** Magnitud (m, m² o m/s según el uso) por debajo de la cual una longitud, un área o una altura se trata como nula. */
export const NEGLIGIBLE_EXTENT = 1e-12;

/**
 * Acota `value` al intervalo cerrado [`minimum`, `maximum`]. Con `minimum` mayor que `maximum` gana `maximum`.
 * @param {number} value
 * @param {number} minimum
 * @param {number} maximum
 * @returns {number}
 */
export function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Acota `value` a [0, 1].
 * @param {number} value
 * @returns {number}
 */
export function clampUnit(value) {
    return clamp(value, 0, 1);
}

/**
 * Interpolación lineal: `from` con `fraction` 0 y `to` con `fraction` 1, sin acotar.
 * @param {number} from
 * @param {number} to
 * @param {number} fraction de 0 a 1
 * @returns {number}
 */
export function lerp(from, to, fraction) {
    return from + (to - from) * fraction;
}

/**
 * Fracción en la que `value` cae entre `from` y `to` (inversa de `lerp`), sin acotar.
 * @param {number} from valor con fracción 0
 * @param {number} to valor con fracción 1, distinto de `from`
 * @param {number} value
 * @returns {number}
 */
export function inverseLerp(from, to, value) {
    return (value - from) / (to - from);
}

/**
 * Signo de `value` (-1 o 1), o `fallback` si `value` es 0 o NaN.
 * @param {number} value
 * @param {number} fallback
 * @returns {number}
 */
export function signOr(value, fallback) {
    return Math.sign(value) || fallback;
}

/**
 * Signo de `value` (-1 o 1); 1 si `value` es 0 o NaN.
 * @param {number} value
 * @returns {number}
 */
export function signOrOne(value) {
    return signOr(value, 1);
}

/**
 * Lleva un ángulo al intervalo (-π, π].
 * @param {number} angle en rad
 * @returns {number} en rad
 */
export function wrapAngle(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * Giro más corto (con signo) para ir del ángulo `from` al ángulo `to`.
 * @param {number} from en rad
 * @param {number} to en rad
 * @returns {number} en rad, en (-π, π]
 */
export function shortestAngleDifference(from, to) {
    return wrapAngle(to - from);
}

/**
 * Fracción de la distancia a un objetivo que recorre un valor que se acerca de forma exponencial: `1 − e^(−exponent)`.
 * @param {number} exponent producto adimensional de la tasa (1/s) por el tiempo (s)
 * @returns {number} de 0 a 1
 */
export function exponentialApproachFactor(exponent) {
    return 1 - Math.exp(-exponent);
}
