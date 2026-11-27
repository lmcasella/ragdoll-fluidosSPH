import { clamp } from "../core/math/scalar.js";

/** Tamaño de celda buscado de una grilla de densidad, en m: el real se ajusta para que el ancho y el alto sean múltiplos enteros de celda. */
export const DENSITY_CELL_SIZE = 0.05;

/** Fracción de cobertura desde la que una celda cuenta como llena: absorbe el error de redondeo de los bordes. */
const FULL_COVERAGE = 1 - 1e-9;

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
 * entero coincide con su rectángulo. `dirty` marca que los valores cambiaron desde la última vez que se rehízo la forma.
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
        this.dirty = false;
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
     * Pone en cada celda la fracción de su área que cubre el rectángulo dado (1 si la cubre entera) y marca la grilla como
     * sucia. Reemplaza la densidad que hubiera.
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
        this.dirty = true;
    }
}
