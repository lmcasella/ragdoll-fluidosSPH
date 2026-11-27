import { lerp } from "./scalar.js";

/**
 * Área de un polígono de vértices intercalados `[x0, y0, x1, y1, …]` (fórmula de Gauss).
 * @param {ArrayLike<number>} vertices en m
 * @param {number} count cantidad de vértices
 * @returns {number} en m², positiva si el polígono es antihorario
 */
export function polygonArea(vertices, count) {
    let doubleArea = 0;
    for (let i = 0, previous = count - 1; i < count; previous = i++) {
        doubleArea += vertices[2 * previous] * vertices[2 * i + 1] - vertices[2 * i] * vertices[2 * previous + 1];
    }
    return doubleArea / 2;
}

/**
 * Área y centroide de un polígono de vértices intercalados `[x0, y0, x1, y1, …]`. No crea objetos: escribe en `out`.
 * Con área 0 el centroide no está definido (queda en NaN o infinito).
 * @param {ArrayLike<number>} vertices en m
 * @param {number} count cantidad de vértices
 * @param {{x: number, y: number, area: number}} out recibe el centroide `x`, `y` (m) y el `area` (m², positiva si es antihorario)
 * @returns {{x: number, y: number, area: number}} `out`
 */
export function polygonCentroid(vertices, count, out) {
    let doubleArea = 0;
    let weightedX = 0;
    let weightedY = 0;
    for (let i = 0, previous = count - 1; i < count; previous = i++) {
        const cross = vertices[2 * previous] * vertices[2 * i + 1] - vertices[2 * i] * vertices[2 * previous + 1];
        doubleArea += cross;
        weightedX += (vertices[2 * previous] + vertices[2 * i]) * cross;
        weightedY += (vertices[2 * previous + 1] + vertices[2 * i + 1]) * cross;
    }
    out.area = doubleArea / 2;
    out.x = weightedX / (6 * out.area);
    out.y = weightedY / (6 * out.area);
    return out;
}

/**
 * Recorta un polígono con el semiplano `normalX · x + normalY · y ≤ offset` (Sutherland–Hodgman) y deja el resultado en
 * `destination`. No crea objetos. El polígono de entrada debe tener al menos un vértice.
 * @param {ArrayLike<number>} source vértices intercalados `[x0, y0, …]`, en m
 * @param {number} sourceCount cantidad de vértices de `source`
 * @param {Float64Array} destination recibe los vértices recortados; con lugar para `sourceCount + 1` vértices
 * @param {number} normalX componente X de la normal del semiplano
 * @param {number} normalY componente Y de la normal del semiplano
 * @param {number} offset término independiente del semiplano, en m
 * @returns {number} cantidad de vértices escritos en `destination`
 */
export function clipPolygonByHalfPlane(source, sourceCount, destination, normalX, normalY, offset) {
    let written = 0;
    let previousX = source[2 * sourceCount - 2];
    let previousY = source[2 * sourceCount - 1];
    let previousSide = normalX * previousX + normalY * previousY - offset;
    for (let i = 0; i < sourceCount; i++) {
        const x = source[2 * i];
        const y = source[2 * i + 1];
        const side = normalX * x + normalY * y - offset;
        if (side <= 0) {
            if (previousSide > 0) {
                const fraction = previousSide / (previousSide - side);
                destination[2 * written] = lerp(previousX, x, fraction);
                destination[2 * written + 1] = lerp(previousY, y, fraction);
                written++;
            }
            destination[2 * written] = x;
            destination[2 * written + 1] = y;
            written++;
        } else if (previousSide <= 0) {
            const fraction = previousSide / (previousSide - side);
            destination[2 * written] = lerp(previousX, x, fraction);
            destination[2 * written + 1] = lerp(previousY, y, fraction);
            written++;
        }
        previousX = x;
        previousY = y;
        previousSide = side;
    }
    return written;
}

/**
 * Estrecha el rango de parámetros `[range.from, range.to]` de un segmento `start + t · delta` a la parte que queda
 * dentro de la banda `lower ≤ coordenada ≤ upper` sobre un eje. Con `lower` en `-Infinity` o `upper` en `Infinity` la banda es un semiplano.
 * `delta` no puede ser 0 (el segmento paralelo a la banda lo resuelve el llamador). No crea objetos.
 * @param {{from: number, to: number}} range parámetros `t` del tramo vigente, entre 0 y 1; se modifica
 * @param {number} start coordenada del inicio del segmento sobre el eje
 * @param {number} delta variación de la coordenada a lo largo del segmento, distinta de 0
 * @param {number} lower borde inferior de la banda, en las unidades de la coordenada
 * @param {number} upper borde superior de la banda, en las unidades de la coordenada
 * @returns {{from: number, to: number}} `range`
 */
export function clipSegmentToBand(range, start, delta, lower, upper) {
    let enter = (lower - start) / delta;
    let leave = (upper - start) / delta;
    if (enter > leave) [enter, leave] = [leave, enter];
    range.from = Math.max(range.from, enter);
    range.to = Math.min(range.to, leave);
    return range;
}

/**
 * Recorta cada intervalo de `intervals` a [`lower`, `upper`] y descarta los que quedan vacíos.
 * @param {number[][]} intervals pares `[desde, hasta]`
 * @param {number} lower
 * @param {number} upper
 * @returns {number[][]} intervalos nuevos
 */
export function intersectIntervals(intervals, lower, upper) {
    return intervals.map(([from, to]) => [Math.max(from, lower), Math.min(to, upper)]).filter(([from, to]) => from <= to);
}

/**
 * Quita el tramo (`lower`, `upper`) de cada intervalo de `intervals`; un intervalo que lo contiene se parte en dos.
 * @param {number[][]} intervals pares `[desde, hasta]`
 * @param {number} lower
 * @param {number} upper
 * @returns {number[][]} intervalos nuevos
 */
export function subtractIntervals(intervals, lower, upper) {
    const remaining = [];
    for (const [from, to] of intervals) {
        if (upper <= from || lower >= to) remaining.push([from, to]);
        else {
            if (lower > from) remaining.push([from, lower]);
            if (upper < to) remaining.push([upper, to]);
        }
    }
    return remaining;
}

/**
 * Agranda `target` para que también cubra `source`. No crea objetos.
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} target caja que se modifica; vacía si vale `Infinity` y `-Infinity`
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} source caja a sumar
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}} `target`
 */
export function mergeBounds(target, source) {
    target.minX = Math.min(target.minX, source.minX);
    target.minY = Math.min(target.minY, source.minY);
    target.maxX = Math.max(target.maxX, source.maxX);
    target.maxY = Math.max(target.maxY, source.maxY);
    return target;
}
