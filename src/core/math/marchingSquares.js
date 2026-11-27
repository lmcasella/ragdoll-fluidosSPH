import { clamp, inverseLerp } from "./scalar.js";

/** Umbral de densidad que separa lo lleno de lo vacío: una celda cuenta como materia con 0,5 o más. */
export const DENSITY_ISO_LEVEL = 0.5;

/** Densidad que se supone más allá de la banda de extensión: vacío, así el contorno siempre se cierra. */
const OUTSIDE_VALUE = 0;

/** Muestras que se agregan a cada lado de la grilla: una que repite la del borde y una de vacío. */
const PADDING_SAMPLES = 2;

/** Muestras de la banda que repite el valor del borde, a cada lado de la grilla. */
const EDGE_EXTENSION_SAMPLES = 1;

/** Distancia, en celdas, entre el centro de la primera muestra y el borde de la grilla. */
const HALF_CELL = 0.5;

/** Aristas que se numeran por muestra: la horizontal hacia la derecha (par) y la vertical hacia arriba (impar). */
const EDGES_PER_SAMPLE = 2;

const CORNER_BOTTOM_LEFT = 1;
const CORNER_BOTTOM_RIGHT = 2;
const CORNER_TOP_RIGHT = 4;
const CORNER_TOP_LEFT = 8;

const SIDE_BOTTOM = "bottom";
const SIDE_RIGHT = "right";
const SIDE_TOP = "top";
const SIDE_LEFT = "left";

/**
 * Tramos de cada configuración de esquinas llenas de una celda, como pares `[lado de entrada, lado de salida]` con la
 * materia siempre a la izquierda del recorrido. Se indexa con la suma de las esquinas llenas
 * (abajo-izquierda 1, abajo-derecha 2, arriba-derecha 4, arriba-izquierda 8).
 * Las dos configuraciones de silla (5 y 10) se resuelven igual: las esquinas llenas quedan unidas, así que dos masas que
 * se tocan en una diagonal forman un solo contorno y nunca se separan por un punto.
 */
const CELL_SEGMENTS = [
    [],
    [[SIDE_BOTTOM, SIDE_LEFT]],
    [[SIDE_RIGHT, SIDE_BOTTOM]],
    [[SIDE_RIGHT, SIDE_LEFT]],
    [[SIDE_TOP, SIDE_RIGHT]],
    [
        [SIDE_BOTTOM, SIDE_RIGHT],
        [SIDE_TOP, SIDE_LEFT],
    ],
    [[SIDE_TOP, SIDE_BOTTOM]],
    [[SIDE_TOP, SIDE_LEFT]],
    [[SIDE_LEFT, SIDE_TOP]],
    [[SIDE_BOTTOM, SIDE_TOP]],
    [
        [SIDE_LEFT, SIDE_BOTTOM],
        [SIDE_RIGHT, SIDE_TOP],
    ],
    [[SIDE_RIGHT, SIDE_TOP]],
    [[SIDE_LEFT, SIDE_RIGHT]],
    [[SIDE_BOTTOM, SIDE_RIGHT]],
    [[SIDE_LEFT, SIDE_BOTTOM]],
    [],
];

/**
 * Contornos cerrados de una grilla de densidad, con marching squares (Lorensen y Cline, 1987, en su versión 2D).
 * Las muestras están en los centros de las celdas. El borde de la grilla es duro: se repite una banda con el valor del
 * borde y más allá hay vacío, y los vértices que caen fuera de la grilla se llevan a su borde. Así una grilla llena da un
 * rectángulo exacto con los vértices (y las esquinas) en el borde de la grilla, no a media celda ni biselado, y el
 * material que llega al borde queda cortado ahí. Los cruces del umbral se ubican por
 * interpolación lineal sobre cada arista entre muestras. Las sillas se resuelven uniendo las esquinas llenas (ver
 * `CELL_SEGMENTS`), por lo que los anillos nunca se tocan en un punto.
 * Cada anillo sale con la materia a la izquierda: los externos antihorarios y los agujeros horarios. Las celdas pueden
 * ser rectangulares. Ver `docs/design/05-escenario.md` §5.5.
 * @param {{values: ArrayLike<number>, columns: number, rows: number, cellWidth: number, cellHeight: number}} grid
 * densidad de 0 a 1 en un arreglo plano por filas (la fila 0 es la de menor y), con el tamaño de celda en m
 * @param {number} [isoLevel] umbral de densidad
 * @returns {number[][]} anillos de vértices intercalados `[x0, y0, x1, y1, …]` en m, en el origen local de la grilla
 */
export function contoursOfGrid(grid, isoLevel = DENSITY_ISO_LEVEL) {
    const { values, columns, rows, cellWidth, cellHeight } = grid;
    const paddedColumns = columns + 2 * PADDING_SAMPLES;
    const sampleAt = (paddedColumn, paddedRow) => {
        const column = paddedColumn - PADDING_SAMPLES;
        const row = paddedRow - PADDING_SAMPLES;
        const isBeyondExtension =
            column < -EDGE_EXTENSION_SAMPLES || column >= columns + EDGE_EXTENSION_SAMPLES || row < -EDGE_EXTENSION_SAMPLES || row >= rows + EDGE_EXTENSION_SAMPLES;
        if (isBeyondExtension) return OUTSIDE_VALUE;
        return values[clamp(row, 0, rows - 1) * columns + clamp(column, 0, columns - 1)];
    };
    const horizontalEdge = (paddedColumn, paddedRow) => EDGES_PER_SAMPLE * (paddedRow * paddedColumns + paddedColumn);
    const verticalEdge = (paddedColumn, paddedRow) => horizontalEdge(paddedColumn, paddedRow) + 1;

    const nextEdgeOf = new Map();
    for (let paddedRow = 0; paddedRow < rows + 2 * PADDING_SAMPLES - 1; paddedRow++) {
        for (let paddedColumn = 0; paddedColumn < paddedColumns - 1; paddedColumn++) {
            const bottomLeft = sampleAt(paddedColumn, paddedRow) >= isoLevel;
            const bottomRight = sampleAt(paddedColumn + 1, paddedRow) >= isoLevel;
            const topRight = sampleAt(paddedColumn + 1, paddedRow + 1) >= isoLevel;
            const topLeft = sampleAt(paddedColumn, paddedRow + 1) >= isoLevel;
            const configuration =
                (bottomLeft ? CORNER_BOTTOM_LEFT : 0) |
                (bottomRight ? CORNER_BOTTOM_RIGHT : 0) |
                (topRight ? CORNER_TOP_RIGHT : 0) |
                (topLeft ? CORNER_TOP_LEFT : 0);
            const edgeOfSide = {
                [SIDE_BOTTOM]: horizontalEdge(paddedColumn, paddedRow),
                [SIDE_TOP]: horizontalEdge(paddedColumn, paddedRow + 1),
                [SIDE_LEFT]: verticalEdge(paddedColumn, paddedRow),
                [SIDE_RIGHT]: verticalEdge(paddedColumn + 1, paddedRow),
            };
            for (const [enterSide, exitSide] of CELL_SEGMENTS[configuration]) {
                nextEdgeOf.set(edgeOfSide[enterSide], edgeOfSide[exitSide]);
            }
        }
    }

    const appendCrossing = (edge, ring) => {
        const isVertical = edge % EDGES_PER_SAMPLE === 1;
        const sampleIndex = (edge - (isVertical ? 1 : 0)) / EDGES_PER_SAMPLE;
        const paddedColumn = sampleIndex % paddedColumns;
        const paddedRow = (sampleIndex - paddedColumn) / paddedColumns;
        const from = sampleAt(paddedColumn, paddedRow);
        const to = isVertical ? sampleAt(paddedColumn, paddedRow + 1) : sampleAt(paddedColumn + 1, paddedRow);
        const fraction = inverseLerp(from, to, isoLevel);
        const x = (paddedColumn - PADDING_SAMPLES + HALF_CELL + (isVertical ? 0 : fraction)) * cellWidth;
        const y = (paddedRow - PADDING_SAMPLES + HALF_CELL + (isVertical ? fraction : 0)) * cellHeight;
        const clampedX = clamp(x, 0, columns * cellWidth);
        const clampedY = clamp(y, 0, rows * cellHeight);
        const length = ring.length;
        if (length >= 2 && ring[length - 2] === clampedX && ring[length - 1] === clampedY) return;
        ring.push(clampedX, clampedY);
    };

    const rings = [];
    const visited = new Set();
    for (const startEdge of nextEdgeOf.keys()) {
        if (visited.has(startEdge)) continue;
        const ring = [];
        let edge = startEdge;
        do {
            visited.add(edge);
            appendCrossing(edge, ring);
            edge = nextEdgeOf.get(edge);
        } while (edge !== startEdge);
        const length = ring.length;
        if (length >= 2 && ring[length - 2] === ring[0] && ring[length - 1] === ring[1]) ring.length -= 2;
        rings.push(ring);
    }
    return rings;
}
