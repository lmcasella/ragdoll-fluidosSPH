/**
 * Áreas dibujadas en geometría, sin canvas (docs/design/14-agua.md §14.16 G, I3). `UnionArea` mide la unión de
 * círculos y cápsulas con una grilla de celdas de `CELL` metros muestreadas en su centro, solo en las filas y
 * columnas que caen dentro de la caja de cada primitiva: cada primitiva aporta, por fila de la grilla, el
 * intervalo de columnas cuyo centro cubre, y la unión se cuenta por fila ordenando los intervalos (almacén
 * disperso, sin grilla del nivel). `polygonArea` es la fórmula del área de Gauss.
 */

/** Lado de la celda de muestreo (m). */
export const CELL = 0.0025;

const ROW_OFFSET = 2048;
const COL_OFFSET = 2048;
const ROWS = 32768;
const COL_RANGE = 65536;

/** Área (m²) del polígono de `size` vértices que empieza en `first` en `xs` e `ys`. */
export function polygonArea(xs, ys, first, size) {
    let twice = 0;
    for (let k = 0; k < size; k++) {
        const a = first + k;
        const b = first + ((k + 1) % size);
        twice += xs[a] * ys[b] - xs[b] * ys[a];
    }
    return Math.abs(twice) / 2;
}

export class UnionArea {
    constructor(capacity = 1 << 16, kinds = 4) {
        this.kinds = kinds;
        this.group = new Int32Array(capacity);
        this.span2 = new Uint32Array(capacity);
        this.sorted = new Uint32Array(capacity);
        this.heads = new Int32Array(kinds * ROWS + 1);
        this.next = new Int32Array(kinds * ROWS + 1);
        this.count = 0;
    }

    /** Vacía las primitivas acumuladas. */
    clear() {
        this.count = 0;
    }

    push(kind, row, a, b) {
        if (row + ROW_OFFSET < 0 || row + ROW_OFFSET >= ROWS || a + COL_OFFSET < 0 || b + COL_OFFSET >= COL_RANGE) throw new RangeError("primitiva fuera del rango de la grilla");
        if (this.count === this.group.length) {
            const size = this.group.length * 2;
            const group = new Int32Array(size);
            group.set(this.group);
            this.group = group;
            const spans = new Uint32Array(size);
            spans.set(this.span2);
            this.span2 = spans;
            this.sorted = new Uint32Array(size);
        }
        this.group[this.count] = kind * ROWS + row + ROW_OFFSET;
        this.span2[this.count++] = (a + COL_OFFSET) * COL_RANGE + b + COL_OFFSET;
    }

    /** Suma el intervalo `[xa, xb]` (m) de la fila `row` si algún centro de celda cae dentro. */
    span(kind, row, xa, xb) {
        const a = Math.ceil(xa / CELL - 0.5);
        const b = Math.floor(xb / CELL - 0.5);
        if (a <= b) this.push(kind, row, a, b);
    }

    /** Suma un círculo de centro (`cx`, `cy`) y radio `r` (m) al material `kind`. */
    addCircle(kind, cx, cy, r) {
        const lo = Math.ceil((cy - r) / CELL - 0.5);
        const hi = Math.floor((cy + r) / CELL - 0.5);
        for (let row = lo; row <= hi; row++) {
            const dy = (row + 0.5) * CELL - cy;
            const q = r * r - dy * dy;
            if (q < 0) continue;
            const half = Math.sqrt(q);
            this.span(kind, row, cx - half, cx + half);
        }
    }

    /**
     * Área de la unión por material (m²) en `out` (`Float64Array` de `kinds`): reparte los intervalos por
     * material y fila, ordena los de cada fila por columna inicial y cuenta las celdas de su unión.
     */
    areas(out) {
        out.fill(0);
        const { heads, next, group, span2, sorted, count } = this;
        heads.fill(0);
        for (let n = 0; n < count; n++) heads[group[n] + 1]++;
        for (let g = 0; g < heads.length - 1; g++) heads[g + 1] += heads[g];
        next.set(heads);
        for (let n = 0; n < count; n++) sorted[next[group[n]]++] = span2[n];
        for (let g = 0; g < heads.length - 1; g++) {
            const from = heads[g];
            const to = heads[g + 1];
            if (from === to) continue;
            const row = sorted.subarray(from, to);
            if (row.length > 1) row.sort();
            let end = -Infinity;
            let cells = 0;
            for (let n = 0; n < row.length; n++) {
                const b = (row[n] % COL_RANGE) - COL_OFFSET;
                const a = Math.floor(row[n] / COL_RANGE) - COL_OFFSET;
                if (a > end) {
                    cells += b - a + 1;
                    end = b;
                } else if (b > end) {
                    cells += b - end;
                    end = b;
                }
            }
            out[Math.floor(g / ROWS)] += cells;
        }
        for (let k = 0; k < out.length; k++) out[k] *= CELL * CELL;
        return out;
    }
}
