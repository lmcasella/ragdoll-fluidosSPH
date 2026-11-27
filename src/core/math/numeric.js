import { clamp, clampUnit, inverseLerp, lerp } from "./scalar.js";

/** Desfase, en celdas, entre el borde izquierdo de una celda y su centro. */
const CELL_CENTER_OFFSET = 0.5;

/**
 * Método de Newton. En cada vuelta pide a `correction` el paso `f(x) / f'(x)`, lo resta de `x` y corta cuando el paso
 * es menor que `tolerance`. No crea objetos: los datos del problema viajan en `context`, que se reutiliza.
 * @param {(x: number, context: object) => number} correction paso de Newton en `x`
 * @param {number} start valor inicial
 * @param {object} context datos del problema que recibe `correction`
 * @param {number} tolerance tamaño del paso bajo el cual se da por convergido, en las unidades de `x`
 * @param {number} maxIterations tope de vueltas
 * @returns {number} la última aproximación
 */
export function solveNewton(correction, start, context, tolerance, maxIterations) {
    let x = start;
    for (let iteration = 0; iteration < maxIterations; iteration++) {
        const step = correction(x, context);
        x -= step;
        if (Math.abs(step) < tolerance) break;
    }
    return x;
}

/**
 * Bisección sobre una función creciente: busca `x` en [`lower`, `upper`] tal que `evaluate(x) = target`. No crea objetos:
 * los datos del problema viajan en `context`.
 * @param {(x: number, context: object) => number} evaluate función creciente
 * @param {number} target valor buscado
 * @param {object} context datos del problema que recibe `evaluate`
 * @param {number} lower extremo inferior, donde `evaluate` no supera `target`
 * @param {number} upper extremo superior, donde `evaluate` no queda bajo `target`
 * @param {number} steps cantidad de divisiones a la mitad
 * @returns {number} el punto medio del intervalo final
 */
export function solveBisection(evaluate, target, context, lower, upper, steps) {
    let low = lower;
    let high = upper;
    for (let step = 0; step < steps; step++) {
        const middle = (low + high) / 2;
        if (evaluate(middle, context) < target) low = middle;
        else high = middle;
    }
    return (low + high) / 2;
}

/**
 * Limitador minmod: la pendiente de menor módulo si `a` y `b` tienen el mismo signo, y 0 si no. Evita oscilaciones en
 * esquemas de volúmenes finitos de segundo orden.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function minmod(a, b) {
    return a * b <= 0 ? 0 : Math.abs(a) < Math.abs(b) ? a : b;
}

/**
 * Interpolación lineal entre centros de celda de una grilla uniforme, sin extrapolar fuera de las celdas válidas.
 * @param {number} position coordenada a muestrear, en m
 * @param {number} origin coordenada del borde izquierdo de la celda 0, en m
 * @param {number} spacing ancho de celda, en m
 * @param {number} firstIndex primera celda válida
 * @param {number} lastIndex última celda válida
 * @param {(index: number) => number} valueAt valor de la celda `index`
 * @returns {number}
 */
export function sampleUniformGrid(position, origin, spacing, firstIndex, lastIndex, valueAt) {
    const cellPosition = (position - origin) / spacing - CELL_CENTER_OFFSET;
    const index = clamp(Math.floor(cellPosition), firstIndex, lastIndex - 1);
    const fraction = clampUnit(cellPosition - index);
    return (1 - fraction) * valueAt(index) + fraction * valueAt(index + 1);
}

/**
 * Interpola linealmente cada canal de una rampa de paradas y escribe el resultado en `out` sin redondear. Fuera del
 * rango de las paradas queda el color de la primera o de la última.
 * @param {[number, number[]][]} stops paradas `[posición, canales]` ordenadas por posición creciente
 * @param {number} value posición a evaluar
 * @param {number[]} out recibe un valor por canal
 * @returns {number[]} `out`
 */
export function piecewiseLinear(stops, value, out) {
    const lastStop = stops.length - 1;
    if (value <= stops[0][0]) {
        copyChannels(stops[0][1], out);
    } else if (value >= stops[lastStop][0]) {
        copyChannels(stops[lastStop][1], out);
    } else {
        let stop = 0;
        while (value >= stops[stop + 1][0]) stop++;
        const fraction = inverseLerp(stops[stop][0], stops[stop + 1][0], value);
        const from = stops[stop][1];
        const to = stops[stop + 1][1];
        for (let channel = 0; channel < from.length; channel++) out[channel] = lerp(from[channel], to[channel], fraction);
    }
    return out;
}

/**
 * Copia los canales de `source` en `out`.
 * @param {number[]} source
 * @param {number[]} out
 */
function copyChannels(source, out) {
    for (let channel = 0; channel < source.length; channel++) out[channel] = source[channel];
}
