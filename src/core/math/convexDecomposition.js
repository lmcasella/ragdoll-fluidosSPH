import { NEGLIGIBLE_EXTENT } from "./scalar.js";
import { polygonArea } from "./geometry.js";

/** Vueltas completas sin poder cortar nada tras las que `earClip` se rinde: solo pasa con entradas inválidas. */
const GIVE_UP_TURNS = 2;

/** Un polígono con menos vértices que esto no encierra área. */
const TRIANGLE_VERTICES = 3;

/** Multiplicador que junta dos índices de vértice en una clave numérica de arista; tope de vértices por contorno: 2^20. */
const EDGE_KEY_STRIDE = 1048576;

/**
 * Producto vectorial de (first - origin) y (second - origin): el doble del área con signo del triángulo, en m². Positivo si los tres puntos giran
 * en sentido antihorario.
 * @param {{x: number, y: number}} origin
 * @param {{x: number, y: number}} first
 * @param {{x: number, y: number}} second
 * @returns {number} en m²
 */
function turn(origin, first, second) {
    return (first.x - origin.x) * (second.y - origin.y) - (first.y - origin.y) * (second.x - origin.x);
}

/**
 * @param {{x: number, y: number}} first
 * @param {{x: number, y: number}} second
 * @returns {boolean} si ambos puntos están en el mismo lugar, por coordenadas
 */
function samePlace(first, second) {
    return first.x === second.x && first.y === second.y;
}

/**
 * @param {{x: number, y: number}} point
 * @param {{x: number, y: number}} cornerA
 * @param {{x: number, y: number}} cornerB
 * @param {{x: number, y: number}} cornerC vértices del triángulo, en sentido antihorario
 * @returns {boolean} si el punto está dentro del triángulo o sobre su borde
 */
function insideTriangle(point, cornerA, cornerB, cornerC) {
    return turn(cornerA, cornerB, point) >= 0 && turn(cornerB, cornerC, point) >= 0 && turn(cornerC, cornerA, point) >= 0;
}

/**
 * Convierte vértices intercalados en puntos `{x, y}`.
 * @param {ArrayLike<number>} flat vértices intercalados, en m
 * @returns {{x: number, y: number}[]}
 */
function toPoints(flat) {
    const points = [];
    for (let index = 0; index < flat.length; index += 2) points.push({ x: flat[index], y: flat[index + 1] });
    return points;
}

/**
 * Índice del vértice de mayor x de un anillo.
 * @param {{x: number, y: number}[]} points
 * @returns {number}
 */
function rightmostIndex(points) {
    let best = 0;
    for (let index = 1; index < points.length; index++) {
        if (points[index].x > points[best].x) best = index;
    }
    return best;
}

/**
 * Busca el vértice del contorno al que unir un agujero: el vértice visible desde `hole[holeIndex]` hacia +x (Eberly).
 * Lanza un rayo hacia +x, toma el extremo más a la derecha de la arista que corta primero y, si hay vértices reflejos
 * dentro del triángulo formado, elige el que menos se desvía del rayo.
 * @param {{x: number, y: number}[]} outline contorno antihorario, con los puentes anteriores
 * @param {{x: number, y: number}} holePoint vértice más a la derecha del agujero
 * @returns {number} índice en `outline`
 */
function visibleVertexIndex(outline, holePoint) {
    let hitX = Infinity;
    let candidate = -1;
    for (let index = 0; index < outline.length; index++) {
        const from = outline[index];
        const to = outline[(index + 1) % outline.length];
        const straddles = (from.y <= holePoint.y && to.y >= holePoint.y) || (to.y <= holePoint.y && from.y >= holePoint.y);
        if (!straddles || from.y === to.y) continue;
        const crossingX = from.x + ((holePoint.y - from.y) * (to.x - from.x)) / (to.y - from.y);
        if (crossingX < holePoint.x || crossingX >= hitX) continue;
        hitX = crossingX;
        if (from.y === holePoint.y) candidate = index;
        else if (to.y === holePoint.y) candidate = (index + 1) % outline.length;
        else candidate = from.x > to.x ? index : (index + 1) % outline.length;
    }
    if (candidate < 0) return -1;
    if (outline[candidate].y === holePoint.y) return candidate;

    const hit = { x: hitX, y: holePoint.y };
    const apex = outline[candidate];
    let bestIndex = candidate;
    let bestSlope = Math.abs(apex.y - holePoint.y) / (apex.x - holePoint.x);
    for (let index = 0; index < outline.length; index++) {
        const point = outline[index];
        const previous = outline[(index + outline.length - 1) % outline.length];
        const next = outline[(index + 1) % outline.length];
        const isReflex = turn(previous, point, next) <= 0;
        if (!isReflex || index === candidate) continue;
        const inside = apex.y > holePoint.y ? insideTriangle(point, holePoint, hit, apex) : insideTriangle(point, holePoint, apex, hit);
        if (!inside) continue;
        const slope = Math.abs(point.y - holePoint.y) / (point.x - holePoint.x);
        if (slope < bestSlope) {
            bestSlope = slope;
            bestIndex = index;
        }
    }
    return bestIndex;
}

/**
 * Indica si una dirección sale hacia el interior de un contorno antihorario en uno de sus vértices.
 * @param {{x: number, y: number}} corner vértice
 * @param {{x: number, y: number}} previous vértice anterior
 * @param {{x: number, y: number}} next vértice siguiente
 * @param {{x: number, y: number}} target punto hacia el que se mira
 * @returns {boolean}
 */
function opensTowards(corner, previous, next, target) {
    const toNext = { x: next.x - corner.x, y: next.y - corner.y };
    const toPrevious = { x: previous.x - corner.x, y: previous.y - corner.y };
    const direction = { x: target.x - corner.x, y: target.y - corner.y };
    const crossOf = (first, second) => first.x * second.y - first.y * second.x;
    if (crossOf(toNext, toPrevious) > 0) return crossOf(toNext, direction) >= 0 && crossOf(direction, toPrevious) >= 0;
    return !(crossOf(toPrevious, direction) > 0 && crossOf(direction, toNext) > 0);
}

/**
 * Entre las copias de un vértice del contorno (los puentes duplican vértices), elige la que mira hacia `holePoint`, para
 * que el puente nuevo no cruce a los anteriores.
 * @param {{x: number, y: number}[]} outline contorno antihorario
 * @param {number} target índice de una copia del vértice
 * @param {{x: number, y: number}} holePoint punto del agujero a unir
 * @returns {number} índice de la copia elegida
 */
function copyFacing(outline, target, holePoint) {
    const place = outline[target];
    for (let index = 0; index < outline.length; index++) {
        if (!samePlace(outline[index], place)) continue;
        const previous = outline[(index + outline.length - 1) % outline.length];
        const next = outline[(index + 1) % outline.length];
        if (opensTowards(place, previous, next, holePoint)) return index;
    }
    return target;
}

/**
 * Une los agujeros al contorno externo con un puente cada uno (Eberly), de derecha a izquierda. El resultado es un
 * polígono débilmente simple: cada puente aparece dos veces, recorrido de ida y de vuelta.
 * @param {{x: number, y: number}[]} outer contorno antihorario
 * @param {{x: number, y: number}[][]} holes agujeros horarios
 * @returns {{x: number, y: number}[]} un solo contorno antihorario
 */
function bridgeHoles(outer, holes) {
    const ordered = holes
        .map((hole) => ({ hole, rightmost: rightmostIndex(hole) }))
        .sort((first, second) => second.hole[second.rightmost].x - first.hole[first.rightmost].x);
    let outline = outer;
    for (const { hole, rightmost } of ordered) {
        const visible = visibleVertexIndex(outline, hole[rightmost]);
        if (visible < 0) continue;
        const target = copyFacing(outline, visible, hole[rightmost]);
        const around = [];
        for (let step = 0; step <= hole.length; step++) around.push(hole[(rightmost + step) % hole.length]);
        outline = [...outline.slice(0, target + 1), ...around, outline[target], ...outline.slice(target + 1)];
    }
    return outline;
}

/**
 * Triangula un contorno simple o débilmente simple, antihorario, cortando orejas (ear clipping, Meisters, 1975). Un
 * vértice es oreja si es convexo y ningún otro vértice cae dentro del triángulo que forma con sus vecinos; los vértices
 * en el mismo lugar que uno del triángulo (los dos lados de un puente) no cuentan. Los vértices alineados con sus
 * vecinos se descartan sin triángulo. Solo los vértices reflejos o alineados pueden tapar una oreja, y el puente se
 * abre hacia la copia correcta de cada vértice duplicado. Si ninguno es oreja (entrada con autointersecciones) corta el
 * primer convexo y, sin convexos, se rinde y devuelve lo cortado hasta ahí.
 * @param {{x: number, y: number}[]} outline contorno antihorario
 * @returns {number[][]} triángulos como tres índices de `outline`, antihorarios
 */
function earClip(outline) {
    const count = outline.length;
    const previousOf = outline.map((unused, index) => (index + count - 1) % count);
    const nextOf = outline.map((unused, index) => (index + 1) % count);
    const triangles = [];
    let remaining = count;
    let current = 0;
    let sinceLastClip = 0;
    while (remaining >= TRIANGLE_VERTICES && sinceLastClip <= GIVE_UP_TURNS * remaining) {
        const previous = previousOf[current];
        const next = nextOf[current];
        const cornerTurn = turn(outline[previous], outline[current], outline[next]);
        let clip = false;
        if (Math.abs(cornerTurn) <= NEGLIGIBLE_EXTENT) {
            clip = true;
        } else if (cornerTurn > 0) {
            clip = isEar(outline, previousOf, nextOf, current, remaining) || sinceLastClip > remaining;
            if (clip) triangles.push([previous, current, next]);
        }
        if (clip) {
            nextOf[previous] = next;
            previousOf[next] = previous;
            remaining--;
            sinceLastClip = 0;
            current = next;
        } else {
            sinceLastClip++;
            current = next;
        }
    }
    return triangles;
}

/**
 * @param {{x: number, y: number}[]} outline
 * @param {number[]} previousOf vecino anterior de cada vértice vivo
 * @param {number[]} nextOf vecino siguiente de cada vértice vivo
 * @param {number} current vértice convexo a probar
 * @param {number} remaining cantidad de vértices vivos
 * @returns {boolean} si ningún otro vértice vivo cae dentro del triángulo de `current` con sus vecinos
 */
function isEar(outline, previousOf, nextOf, current, remaining) {
    const previous = previousOf[current];
    const next = nextOf[current];
    const cornerA = outline[previous];
    const cornerB = outline[current];
    const cornerC = outline[next];
    let other = nextOf[next];
    for (let visited = 3; visited < remaining; visited++) {
        const point = outline[other];
        const isBlockingCorner = turn(outline[previousOf[other]], point, outline[nextOf[other]]) <= 0;
        const isOwnCorner = samePlace(point, cornerA) || samePlace(point, cornerB) || samePlace(point, cornerC);
        if (isBlockingCorner && !isOwnCorner && insideTriangle(point, cornerA, cornerB, cornerC)) return false;
        other = nextOf[other];
    }
    return true;
}

/**
 * Indica si un polígono (lista de índices) es convexo, admitiendo vértices alineados.
 * @param {{x: number, y: number}[]} points
 * @param {number[]} polygon índices en `points`
 * @returns {boolean}
 */
function isConvex(points, polygon) {
    for (let index = 0; index < polygon.length; index++) {
        const previous = points[polygon[(index + polygon.length - 1) % polygon.length]];
        const current = points[polygon[index]];
        const next = points[polygon[(index + 1) % polygon.length]];
        if (turn(previous, current, next) < -NEGLIGIBLE_EXTENT) return false;
    }
    return true;
}

/**
 * Clave de una arista dirigida, para buscarla en un `Map`.
 * @param {number} start índice del vértice de origen
 * @param {number} end índice del vértice de destino
 * @returns {number}
 */
function edgeKey(start, end) {
    return start * EDGE_KEY_STRIDE + end;
}

/**
 * Une dos polígonos a lo largo de la arista `start → end` del primero (que es `end → start` en el segundo), si la unión
 * es convexa y no pasa de `maxVertices`.
 * @param {{x: number, y: number}[]} points
 * @param {number[]} first polígono como índices, antihorario, con la arista `start → end`
 * @param {number[]} second polígono como índices, antihorario, con la arista `end → start`
 * @param {number} start índice de vértice
 * @param {number} end índice de vértice
 * @param {number} maxVertices
 * @returns {number[]|null} la unión, o null si no sirve
 */
function mergeAlongEdge(points, first, second, start, end, maxVertices) {
    if (first.length + second.length - 2 > maxVertices) return null;
    const firstIndex = first.findIndex((vertex, index) => vertex === start && first[(index + 1) % first.length] === end);
    const secondIndex = second.findIndex((vertex, index) => vertex === end && second[(index + 1) % second.length] === start);
    const merged = [];
    for (let step = 1; step <= first.length; step++) merged.push(first[(firstIndex + step) % first.length]);
    for (let step = 2; step < second.length; step++) merged.push(second[(secondIndex + step) % second.length]);
    return isConvex(points, merged) ? merged : null;
}

/**
 * Anota a qué pieza pertenece cada arista dirigida de un polígono.
 * @param {Map<number, number>} ownerOfEdge clave de arista → índice de pieza
 * @param {number[]} polygon polígono como índices
 * @param {number} pieceIndex
 */
function registerEdges(ownerOfEdge, polygon, pieceIndex) {
    for (let index = 0; index < polygon.length; index++) ownerOfEdge.set(edgeKey(polygon[index], polygon[(index + 1) % polygon.length]), pieceIndex);
}

/**
 * Une triángulos vecinos mientras el resultado siga siendo convexo y de hasta `maxVertices` (Hertel y Mehlhorn, 1983:
 * quitar diagonales que no hacen falta). Recorre cada diagonal una sola vez, con un mapa de arista a pieza que se
 * actualiza en cada unión, así que el costo crece casi lineal con los triángulos. Es voraz: no garantiza el mínimo de
 * piezas.
 * @param {{x: number, y: number}[]} points
 * @param {number[][]} polygons polígonos como índices
 * @param {number} maxVertices
 * @returns {number[][]}
 */
function mergePieces(points, polygons, maxVertices) {
    const pieces = polygons.map((polygon) => polygon.slice());
    const ownerOfEdge = new Map();
    pieces.forEach((polygon, pieceIndex) => registerEdges(ownerOfEdge, polygon, pieceIndex));
    const diagonals = [];
    for (const key of ownerOfEdge.keys()) {
        const start = Math.floor(key / EDGE_KEY_STRIDE);
        const end = key % EDGE_KEY_STRIDE;
        if (start < end && ownerOfEdge.has(edgeKey(end, start))) diagonals.push({ start, end });
    }
    for (const { start, end } of diagonals) {
        const firstIndex = ownerOfEdge.get(edgeKey(start, end));
        const secondIndex = ownerOfEdge.get(edgeKey(end, start));
        if (firstIndex === secondIndex) continue;
        const union = mergeAlongEdge(points, pieces[firstIndex], pieces[secondIndex], start, end, maxVertices);
        if (!union) continue;
        pieces[firstIndex] = union;
        pieces[secondIndex] = null;
        registerEdges(ownerOfEdge, union, firstIndex);
    }
    return pieces.filter((piece) => piece !== null);
}

/**
 * Quita los vértices alineados con sus vecinos.
 * @param {{x: number, y: number}[]} polygon
 * @returns {{x: number, y: number}[]}
 */
function dropCollinear(polygon) {
    return polygon.filter((point, index) => {
        const previous = polygon[(index + polygon.length - 1) % polygon.length];
        const next = polygon[(index + 1) % polygon.length];
        return Math.abs(turn(previous, point, next)) > NEGLIGIBLE_EXTENT;
    });
}

/**
 * Parte un polígono con agujeros en polígonos convexos de hasta `maxVertices` vértices, para fixtures de Box2D (que
 * admite 8). Une los agujeros al contorno con un puente (Eberly), triangula cortando orejas (Meisters) y une triángulos
 * vecinos mientras sigan siendo convexos y entren en el tope (Hertel-Mehlhorn). Descarta las piezas de área menor a
 * `minArea`, que Box2D no soporta, y los vértices alineados. Sirve para polígonos simples; con autointersecciones el
 * resultado no es fiable. Los puentes son cortes de ancho cero: las piezas de sus dos lados no se unen.
 * Ver `docs/design/05-escenario.md` §5.5.
 * @param {ArrayLike<number>} outer contorno externo antihorario, vértices intercalados `[x0, y0, …]` en m
 * @param {ArrayLike<number>[]} holes agujeros horarios, vértices intercalados en m
 * @param {{maxVertices: number, minArea: number}} limits tope de vértices por pieza y área mínima de una pieza, en m²
 * @returns {number[][]} piezas convexas antihorarias, vértices intercalados en m
 */
export function decomposeConvex(outer, holes, limits) {
    const outline = bridgeHoles(toPoints(outer), holes.map(toPoints));
    const triangles = earClip(outline);
    const pieces = mergePieces(outline, triangles, limits.maxVertices);
    const result = [];
    for (const piece of pieces) {
        const polygon = dropCollinear(piece.map((index) => outline[index]));
        if (polygon.length < TRIANGLE_VERTICES) continue;
        const flat = polygon.flatMap((point) => [point.x, point.y]);
        if (polygonArea(flat, polygon.length) < limits.minArea) continue;
        result.push(flat);
    }
    return result;
}
