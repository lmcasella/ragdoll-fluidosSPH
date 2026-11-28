import { clamp } from "../core/math/scalar.js";
import { DENSITY_ISO_LEVEL } from "../core/math/marchingSquares.js";

/** Desgaste mínimo de una celda viva vecina de una celda que el ácido eliminó, de 0 a 1. */
export const NEIGHBOR_WEAR = 0.6;

/** Desplazamientos de fila y columna a los 8 vecinos de una celda. */
const NEIGHBOR_OFFSETS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1],
];

/** Tamaño de celda buscado de una grilla de densidad, en m: el real se ajusta para que el ancho y el alto sean múltiplos enteros de celda. */
export const DENSITY_CELL_SIZE = 0.05;

/** Fracción de cobertura desde la que una celda cuenta como llena: absorbe el error de redondeo de los bordes. */
const FULL_COVERAGE = 1 - 1e-9;

/** Posición del centro de una celda dentro de ella, como fracción de su lado. */
const CELL_CENTER = 0.5;

/**
 * Cantidad de celdas de un largo `length` (m) con celdas de cerca de `DENSITY_CELL_SIZE`, siempre un entero de al menos 1.
 * @param {number} length en m
 * @returns {number}
 */
function cellsAlong(length) {
    return Math.max(1, Math.round(length / DENSITY_CELL_SIZE));
}

/**
 * Grilla de densidad de un tramo de terreno (`docs/design/05-escenario.md` §5.5): la materia como valores de 0 (vacío) a 1
 * (lleno) en celdas de cerca de 5 cm, guardados por filas con la fila 0 en la `y` menor. Es la fuente de verdad del
 * tramo: la forma física y el contorno se derivan de ella. Es JS puro y no toca el heap del motor. El tamaño de celda se
 * ajusta en x y en y para que el ancho y el alto entren en un número entero de celdas, así el contorno de un tramo
 * entero coincide con su rectángulo. `shapeDirty` marca que el contorno pudo cambiar desde la última vez que se rehízo la
 * forma (una celda cruzó `DENSITY_ISO_LEVEL` o cambió una celda de borde) y `wearDirty` que cambió el desgaste desde la
 * última vez que se dibujó: perder materia sin cambiar el contorno solo marca el desgaste.
 * `wear` guarda el desgaste de cada celda, de 0 a 1, para dibujar el óxido (`docs/design/13-arte.md` §13.2): lo escribe solo
 * `erode`, y `fillRectangle` lo pone en cero.
 */
export class DensityGrid {
    /**
     * @param {object} area rectángulo que cubre la grilla, en m y en el marco local del cuerpo que la lleva
     * @param {number} area.originX borde izquierdo, en m
     * @param {number} area.originY borde inferior, en m
     * @param {number} area.width ancho, en m
     * @param {number} area.height alto, en m
     */
    constructor({ originX, originY, width, height }) {
        this.originX = originX;
        this.originY = originY;
        this.columns = cellsAlong(width);
        this.rows = cellsAlong(height);
        this.cellWidth = width / this.columns;
        this.cellHeight = height / this.rows;
        this.values = new Float32Array(this.columns * this.rows);
        this.wear = new Float32Array(this.columns * this.rows);
        this.hasWear = false;
        /** Objeto de trabajo de `searchWindow`. */
        this.window = { firstColumn: 0, lastColumn: 0, firstRow: 0, lastRow: 0 };
        this.shapeDirty = false;
        this.wearDirty = false;
    }

    /** Ancho de la grilla, en m. */
    get width() {
        return this.columns * this.cellWidth;
    }

    /** Alto de la grilla, en m. */
    get height() {
        return this.rows * this.cellHeight;
    }

    /**
     * Fracción, de 0 a 1, del intervalo de una celda que cubre `[low, high]`.
     * @param {number} cellLow borde menor de la celda, en m
     * @param {number} cellSize tamaño de la celda, en m
     * @param {number} low borde menor de lo que cubre, en m
     * @param {number} high borde mayor de lo que cubre, en m
     * @returns {number}
     */
    static coverage(cellLow, cellSize, low, high) {
        const overlap = Math.min(high, cellLow + cellSize) - Math.max(low, cellLow);
        const fraction = clamp(overlap / cellSize, 0, 1);
        return fraction >= FULL_COVERAGE ? 1 : fraction;
    }

    /**
     * Pone en cada celda la fracción de su área que cubre el rectángulo dado (1 si la cubre entera) y marca como sucios la
     * forma y el desgaste. Reemplaza la densidad que hubiera.
     * @param {{minX: number, minY: number, maxX: number, maxY: number}} rectangle en m, en el marco local del cuerpo
     */
    fillRectangle({ minX, minY, maxX, maxY }) {
        const columnCoverage = new Float32Array(this.columns);
        for (let column = 0; column < this.columns; column++) {
            columnCoverage[column] = DensityGrid.coverage(this.originX + column * this.cellWidth, this.cellWidth, minX, maxX);
        }
        for (let row = 0; row < this.rows; row++) {
            const rowCoverage = DensityGrid.coverage(this.originY + row * this.cellHeight, this.cellHeight, minY, maxY);
            for (let column = 0; column < this.columns; column++) {
                this.values[row * this.columns + column] = rowCoverage * columnCoverage[column];
            }
        }
        this.wear.fill(0);
        this.hasWear = false;
        this.shapeDirty = true;
        this.wearDirty = true;
    }

    /**
     * Recorre las celdas vivas que están dentro del contorno (densidad desde `DENSITY_ISO_LEVEL`) y tienen desgaste, sin
     * crear un objeto por celda.
     * @param {(x: number, y: number, width: number, height: number, wear: number) => void} visit recibe el borde inferior
     * izquierdo, el tamaño y el desgaste de la celda; `x` e `y` en m, en el marco local del cuerpo
     */
    forEachWornCell(visit) {
        if (!this.hasWear) return;
        for (let row = 0; row < this.rows; row++) {
            for (let column = 0; column < this.columns; column++) {
                const index = row * this.columns + column;
                if (this.wear[index] <= 0 || this.values[index] < DENSITY_ISO_LEVEL) continue;
                visit(this.originX + column * this.cellWidth, this.originY + row * this.cellHeight, this.cellWidth, this.cellHeight, this.wear[index]);
            }
        }
    }

    /**
     * Celdas con desgaste, con su rectángulo (ver `forEachWornCell`). Crea un objeto por celda: para dibujar se usa `forEachWornCell`.
     * @returns {{x: number, y: number, width: number, height: number, wear: number}[]}
     */
    wornCells() {
        const cells = [];
        this.forEachWornCell((x, y, width, height, wear) => cells.push({ x, y, width, height, wear }));
        return cells;
    }

    /**
     * Verdadero si el valor de la celda puede mover el contorno: la celda o alguna de sus 8 vecinas está del otro lado de
     * `DENSITY_ISO_LEVEL` (el cruce se ubica por interpolación entre las dos muestras). El borde de la grilla es duro, así
     * que lo de afuera no cuenta.
     * @param {number} row
     * @param {number} column
     * @returns {boolean}
     */
    touchesContour(row, column) {
        const isInside = this.values[row * this.columns + column] >= DENSITY_ISO_LEVEL;
        for (const [rowOffset, columnOffset] of NEIGHBOR_OFFSETS) {
            const neighborRow = row + rowOffset;
            const neighborColumn = column + columnOffset;
            if (neighborRow < 0 || neighborRow >= this.rows || neighborColumn < 0 || neighborColumn >= this.columns) continue;
            if ((this.values[neighborRow * this.columns + neighborColumn] >= DENSITY_ISO_LEVEL) !== isInside) return true;
        }
        return false;
    }

    /**
     * Sube el desgaste de las celdas vivas vecinas (8 vecinos) de una celda que se vació, hasta `NEIGHBOR_WEAR` como mínimo.
     * @param {number} row
     * @param {number} column
     */
    wearNeighbors(row, column) {
        for (const [rowOffset, columnOffset] of NEIGHBOR_OFFSETS) {
            const neighborRow = row + rowOffset;
            const neighborColumn = column + columnOffset;
            if (neighborRow < 0 || neighborRow >= this.rows || neighborColumn < 0 || neighborColumn >= this.columns) continue;
            const index = neighborRow * this.columns + neighborColumn;
            if (this.values[index] > 0) this.wear[index] = Math.max(this.wear[index], NEIGHBOR_WEAR);
        }
    }

    /**
     * Ventana de celdas que cubre el círculo de búsqueda, recortada a la grilla. Devuelve siempre el mismo objeto de
     * trabajo (se pisa en cada llamada) para no crear uno por consulta.
     * @param {number} x en m, en el marco local del cuerpo
     * @param {number} y en m, en el marco local del cuerpo
     * @param {number} radius en m
     * @returns {{firstColumn: number, lastColumn: number, firstRow: number, lastRow: number}}
     */
    searchWindow(x, y, radius) {
        const window = this.window;
        window.firstColumn = clamp(Math.floor((x - radius - this.originX) / this.cellWidth), 0, this.columns - 1);
        window.lastColumn = clamp(Math.ceil((x + radius - this.originX) / this.cellWidth), 0, this.columns - 1);
        window.firstRow = clamp(Math.floor((y - radius - this.originY) / this.cellHeight), 0, this.rows - 1);
        window.lastRow = clamp(Math.ceil((y + radius - this.originY) / this.cellHeight), 0, this.rows - 1);
        return window;
    }

    /**
     * Verdadero si alguna celda con densidad tiene su centro a `radius` o menos del punto. Mismas celdas que `cellsWithin`,
     * pero corta en la primera y no arma arreglos.
     * @param {number} x en m, en el marco local del cuerpo
     * @param {number} y en m, en el marco local del cuerpo
     * @param {number} radius en m
     * @returns {boolean}
     */
    hasMatterWithin(x, y, radius) {
        const { firstColumn, lastColumn, firstRow, lastRow } = this.searchWindow(x, y, radius);
        for (let row = firstRow; row <= lastRow; row++) {
            for (let column = firstColumn; column <= lastColumn; column++) {
                if (this.values[row * this.columns + column] <= 0) continue;
                const distance = Math.hypot(
                    this.originX + (column + CELL_CENTER) * this.cellWidth - x,
                    this.originY + (row + CELL_CENTER) * this.cellHeight - y,
                );
                if (distance <= radius) return true;
            }
        }
        return false;
    }

    /**
     * Celdas con densidad cuyo centro está a `radius` o menos del punto, con su distancia.
     * @param {number} x en m, en el marco local del cuerpo
     * @param {number} y en m, en el marco local del cuerpo
     * @param {number} radius en m
     * @returns {{candidates: {index: number, distance: number}[], coversGrid: boolean}} `coversGrid` es verdadero si la
     * ventana de búsqueda ya abarca la grilla entera
     */
    cellsWithin(x, y, radius) {
        const { firstColumn, lastColumn, firstRow, lastRow } = this.searchWindow(x, y, radius);
        const candidates = [];
        for (let row = firstRow; row <= lastRow; row++) {
            for (let column = firstColumn; column <= lastColumn; column++) {
                const index = row * this.columns + column;
                if (this.values[index] <= 0) continue;
                const distance = Math.hypot(
                    this.originX + (column + CELL_CENTER) * this.cellWidth - x,
                    this.originY + (row + CELL_CENTER) * this.cellHeight - y,
                );
                if (distance <= radius) candidates.push({ index, distance });
            }
        }
        const coversGrid = firstColumn === 0 && lastColumn === this.columns - 1 && firstRow === 0 && lastRow === this.rows - 1;
        return { candidates, coversGrid };
    }

    /**
     * Quita `area` de materia de las celdas más cercanas al punto. Si quitó algo marca el desgaste como sucio, y la forma solo
     * si una celda cruzó `DENSITY_ISO_LEVEL` o si alguna celda cambiada toca el contorno (`touchesContour`). Busca en un
     * radio de `reach` y, si ahí no hay materia suficiente, lo agranda de a `reach` hasta juntarla o abarcar la grilla
     * (así la masa quitada sigue la estequiometría y el cráter se ensancha). Corrosión del terreno
     * (`docs/design/05-escenario.md` §5.5).
     * @param {object} options
     * @param {number} options.x punto, en m, en el marco local del cuerpo
     * @param {number} options.y punto, en m, en el marco local del cuerpo
     * @param {number} options.reach radio inicial de búsqueda y paso con que crece, en m
     * @param {number} options.area área de materia a quitar, en m²
     * @returns {number} área quitada, en m² (menos que `area` solo si la grilla no tiene tanta materia)
     */
    erode({ x, y, reach, area }) {
        const cellArea = this.cellWidth * this.cellHeight;
        let radius = reach;
        let found = this.cellsWithin(x, y, radius);
        const availableArea = (cells) => cells.reduce((total, { index }) => total + this.values[index] * cellArea, 0);
        while (!found.coversGrid && availableArea(found.candidates) < area) {
            radius += reach;
            found = this.cellsWithin(x, y, radius);
        }
        found.candidates.sort((first, second) => first.distance - second.distance);
        let remaining = area;
        let crossedIsoLevel = false;
        const changedIndices = [];
        for (const { index } of found.candidates) {
            if (remaining <= 0) break;
            const before = this.values[index];
            const taken = Math.min(before, remaining / cellArea);
            this.values[index] -= taken;
            this.wear[index] = Math.min(1, this.wear[index] + taken);
            remaining -= taken * cellArea;
            crossedIsoLevel ||= before >= DENSITY_ISO_LEVEL && this.values[index] < DENSITY_ISO_LEVEL;
            changedIndices.push(index);
            if (this.values[index] <= 0) this.wearNeighbors(Math.floor(index / this.columns), index % this.columns);
        }
        const removed = area - remaining;
        if (removed > 0) {
            this.wearDirty = true;
            this.hasWear = true;
            this.shapeDirty ||= crossedIsoLevel || changedIndices.some((index) => this.touchesContour(Math.floor(index / this.columns), index % this.columns));
        }
        return removed;
    }
}
