import { NEGLIGIBLE_EXTENT } from "./scalar.js";

/** Un anillo con menos vértices que esto no se puede simplificar sin dejar de ser un polígono. */
const MINIMUM_RING_VERTICES = 3;

/**
 * Distancia de `(x, y)` a la recta que pasa por dos puntos; si los puntos coinciden, la distancia al punto.
 * @param {number} x en m
 * @param {number} y en m
 * @param {{x: number, y: number}} lineStart en m
 * @param {{x: number, y: number}} lineEnd en m
 * @returns {number} en m
 */
function distanceToLine(x, y, lineStart, lineEnd) {
    const directionX = lineEnd.x - lineStart.x;
    const directionY = lineEnd.y - lineStart.y;
    const lineLength = Math.hypot(directionX, directionY);
    if (lineLength < NEGLIGIBLE_EXTENT) return Math.hypot(x - lineStart.x, y - lineStart.y);
    return Math.abs(directionX * (y - lineStart.y) - directionY * (x - lineStart.x)) / lineLength;
}

/**
 * Índice del vértice más lejano a otro.
 * @param {ArrayLike<number>} ring vértices intercalados, en m
 * @param {number} count cantidad de vértices
 * @param {number} originIndex vértice desde el que se mide
 * @returns {number}
 */
function farthestVertexFrom(ring, count, originIndex) {
    let farthestIndex = originIndex;
    let farthestDistance = -1;
    for (let index = 0; index < count; index++) {
        const distance = Math.hypot(ring[2 * index] - ring[2 * originIndex], ring[2 * index + 1] - ring[2 * originIndex + 1]);
        if (distance > farthestDistance) {
            farthestDistance = distance;
            farthestIndex = index;
        }
    }
    return farthestIndex;
}

/**
 * Marca como conservados los vértices de una cadena abierta que se apartan más de `tolerance` de la recta entre sus
 * extremos, dividiendo en el más lejano (Douglas-Peucker). Usa una pila propia en vez de recursión.
 * @param {number[]} ring vértices intercalados, en m
 * @param {Uint8Array} keep marca de vértices conservados, que se completa
 * @param {number} firstIndex extremo inicial de la cadena (ya conservado)
 * @param {number} lastIndex extremo final de la cadena (ya conservado), con índice mayor que `firstIndex`
 * @param {number} tolerance en m
 */
function markChain(ring, keep, firstIndex, lastIndex, tolerance) {
    const pending = [[firstIndex, lastIndex]];
    const lineStart = { x: 0, y: 0 };
    const lineEnd = { x: 0, y: 0 };
    while (pending.length > 0) {
        const [chainStart, chainEnd] = pending.pop();
        lineStart.x = ring[2 * chainStart];
        lineStart.y = ring[2 * chainStart + 1];
        lineEnd.x = ring[2 * chainEnd];
        lineEnd.y = ring[2 * chainEnd + 1];
        let worstIndex = -1;
        let worstDistance = tolerance;
        for (let index = chainStart + 1; index < chainEnd; index++) {
            const distance = distanceToLine(ring[2 * index], ring[2 * index + 1], lineStart, lineEnd);
            if (distance > worstDistance) {
                worstDistance = distance;
                worstIndex = index;
            }
        }
        if (worstIndex < 0) continue;
        keep[worstIndex] = 1;
        pending.push([chainStart, worstIndex], [worstIndex, chainEnd]);
    }
}

/**
 * Simplifica un anillo cerrado con Douglas-Peucker (Douglas y Peucker, 1973): quita los vértices que se apartan menos de
 * `tolerance` de la recta de sus vecinos conservados. Como el anillo no tiene extremos, se parte en dos cadenas entre su
 * vértice más lejano a uno cualquiera y el más lejano a ese; así los puntos intermedios de un lado recto nunca quedan como
 * extremos y un rectángulo lleno termina en 4 vértices. Conserva el orden y, por tanto, el sentido del anillo.
 * Ver `docs/design/05-escenario.md` §5.5.
 * @param {ArrayLike<number>} ring vértices intercalados `[x0, y0, x1, y1, …]`, en m
 * @param {number} tolerance distancia máxima de un vértice quitado a la recta resultante, en m
 * @returns {number[]} el anillo simplificado, en vértices intercalados; el original si tiene menos de 3 vértices
 */
export function simplifyRing(ring, tolerance) {
    const count = ring.length / 2;
    if (count <= MINIMUM_RING_VERTICES) return Array.from(ring);
    const firstAnchor = farthestVertexFrom(ring, count, 0);
    const secondAnchor = farthestVertexFrom(ring, count, firstAnchor);
    const lowAnchor = Math.min(firstAnchor, secondAnchor);
    const highAnchor = Math.max(firstAnchor, secondAnchor);
    const keep = new Uint8Array(count);
    keep[lowAnchor] = 1;
    keep[highAnchor] = 1;

    markChain(ring, keep, lowAnchor, highAnchor, tolerance);

    const wrappedChain = Array.from(ring).slice(2 * highAnchor).concat(Array.from(ring).slice(0, 2 * lowAnchor + 2));
    const wrappedCount = wrappedChain.length / 2;
    const wrappedKeep = new Uint8Array(wrappedCount);
    markChain(wrappedChain, wrappedKeep, 0, wrappedCount - 1, tolerance);
    for (let index = 1; index < wrappedCount - 1; index++) {
        if (wrappedKeep[index]) keep[(highAnchor + index) % count] = 1;
    }

    const simplified = [];
    for (let index = 0; index < count; index++) {
        if (keep[index]) simplified.push(ring[2 * index], ring[2 * index + 1]);
    }
    return simplified;
}
