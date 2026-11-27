import { MATERIALS } from "../fluids/materials.js";
import { clampUnit, lerp } from "../core/math/scalar.js";

/** Degradado horizontal de espacio local: de 0 a 1 a lo ancho del tramo. */
const GRADIENT_START = { x: 0, y: 0 };
const GRADIENT_END = { x: 1, y: 0 };

/** Posición del centro de una celda dentro de ella, como fracción de su ancho. */
const CELL_CENTER = 0.5;

/** Canales de un color RGB. */
const RGB_CHANNELS = 3;

/** Cota de los vértices de `waterOutline`: por celda del campo y fijos, de sobra para el peor caso de tramos de una celda. */
const OUTLINE_VERTICES_PER_CELL = 4;
const OUTLINE_FIXED_VERTICES = 4;

/** Vértices de la línea de superficie de un tramo que no son centros de celda: la cara izquierda y la derecha. */
const SURFACE_FACE_VERTICES = 2;

/**
 * Contorno del agua del campo (puro, sin PIXI): llena `out` y lo devuelve. Un polígono por tramo mojado (celdas
 * consecutivas con `h > hDry`), con `out.count` tramos; el tramo `section` ocupa los vértices `out.start[section]` a
 * `out.start[section] + out.size[section] − 1` de `out.xs` y `out.ys` (metros): lecho y superficie de la cara izquierda, los
 * centros de celda por arriba, la cara derecha y los centros por abajo. `out.surface[section]` es la cantidad de
 * vértices de la línea de superficie, que empieza en `out.start[section] + 1`. Los buffers se crean en la primera
 * llamada y se reutilizan.
 * @param {object} water campo de alturas
 * @param {object} out se llena y se devuelve
 */
export function waterOutline(water, out) {
    const { N: cellCount, i0: firstCell, i1: endCell, dx: cellWidth, x0: leftEdge, b: bed, h: depth } = water;
    const wetThreshold = water.config.hDry;
    const capacity = OUTLINE_VERTICES_PER_CELL * cellCount + OUTLINE_FIXED_VERTICES;
    if (!out.xs || out.xs.length < capacity) {
        out.xs = new Float64Array(capacity);
        out.ys = new Float64Array(capacity);
        out.start = new Int32Array(cellCount + 2);
        out.size = new Int32Array(cellCount + 2);
        out.surface = new Int32Array(cellCount + 2);
    }
    const { xs, ys } = out;
    let sectionCount = 0;
    let vertex = 0;
    let cell = firstCell;
    while (cell < endCell) {
        if (depth[cell] <= wetThreshold) {
            cell++;
            continue;
        }
        let lastWet = cell;
        while (lastWet + 1 < endCell && depth[lastWet + 1] > wetThreshold) lastWet++;
        const leftFace = leftEdge + cell * cellWidth;
        const rightFace = leftEdge + (lastWet + 1) * cellWidth;
        const firstVertex = vertex;
        xs[vertex] = leftFace;
        ys[vertex++] = bed[cell];
        xs[vertex] = leftFace;
        ys[vertex++] = bed[cell] + depth[cell];
        for (let wet = cell; wet <= lastWet; wet++) {
            xs[vertex] = leftEdge + (wet + CELL_CENTER) * cellWidth;
            ys[vertex++] = bed[wet] + depth[wet];
        }
        xs[vertex] = rightFace;
        ys[vertex++] = bed[lastWet] + depth[lastWet];
        xs[vertex] = rightFace;
        ys[vertex++] = bed[lastWet];
        for (let wet = lastWet; wet >= cell; wet--) {
            xs[vertex] = leftEdge + (wet + CELL_CENTER) * cellWidth;
            ys[vertex++] = bed[wet];
        }
        out.start[sectionCount] = firstVertex;
        out.size[sectionCount] = vertex - firstVertex;
        out.surface[sectionCount] = lastWet - cell + 1 + SURFACE_FACE_VERTICES;
        sectionCount++;
        cell = lastWet + 1;
    }
    out.count = sectionCount;
    return out;
}

/**
 * Color del agua del campo en `x` (puro, sin PIXI): llena `out` y lo devuelve con el RGB entero. Falso color de
 * la fracción másica de H2SO4 `w` (docs/design/14-agua.md §14.3, Render): `f = 1 − 10^(−α w / w_a)`, con
 * `α = MATERIALS.acid.tintAbsorbance` (Beer–Lambert), de `water.config.draw.color` hacia `MATERIALS.acid.tint`.
 * Con `w` = 0 es exactamente `draw.color`. El tinte es una aproximación de juego: el ácido real es incoloro.
 * @param {object} water campo de alturas
 * @param {number} x posición, en m
 * @param {number[]} out RGB entero (0-255) que se llena y se devuelve
 */
export function fieldColor(water, x, out = [0, 0, 0]) {
    const { color } = water.config.draw;
    const { tint, tintAbsorbance, species } = MATERIALS.acid;
    const tintFraction = 1 - 10 ** ((-tintAbsorbance * water.acidFractionAt(x)) / species.H2SO4);
    for (let channel = 0; channel < RGB_CHANNELS; channel++) {
        out[channel] = Math.round(lerp(color[channel], tint[channel], tintFraction));
    }
    return out;
}

/**
 * Agua del nivel como un `PIXI.Graphics` que se limpia y se redibuja cada frame desde el campo de alturas
 * (`docs/design/14-agua.md` §14.3, Render): un polígono relleno por tramo mojado, del lecho a `η`, con la línea de
 * superficie encima. Va después de los robots, con la opacidad de `water.config.draw`, para que las piezas sumergidas
 * se vean bajo el agua. Los datos de dibujo son `WATER_FIELD.draw`. Unidades de la geometría: px a `pixelsPerMeter`,
 * con la Y hacia arriba; la cámara la mueve y la escala en el mundo.
 */
export class WaterView {
    /**
     * @param {object} options
     * @param {PIXI.Container} options.parent contenedor del mundo donde se dibuja
     * @param {number} options.pixelsPerMeter px por metro del JSON del robot
     */
    constructor({ parent, pixelsPerMeter }) {
        this.pixelsPerMeter = pixelsPerMeter;
        this.graphics = new PIXI.Graphics();
        parent.addChild(this.graphics);
        this.outline = {};
        this.stopColor = [0, 0, 0];
        this.gradients = [];
    }

    /**
     * Degradado horizontal de `fieldColor` para el tramo mojado entre las caras `left` y `right` (m), con una parada
     * en cada cara y una en el centro de cada `step`-ésima celda. Es de espacio local: 0 es `left` y 1 es `right`.
     * Devuelve `null` si ninguna celda del tramo tiene ácido (`A` = 0) y el tramo se rellena con `draw.color`.
     * @param {object} water campo de alturas
     * @param {number} left cara izquierda del tramo, en m
     * @param {number} right cara derecha del tramo, en m
     * @param {number} step cada cuántas celdas hay una parada
     * @returns {PIXI.FillGradient|null}
     */
    gradientFor(water, left, right, step) {
        const { x0, dx, A } = water;
        const first = Math.round((left - x0) / dx);
        const end = Math.round((right - x0) / dx) - 1;
        let acid = false;
        for (let cell = first; cell <= end && !acid; cell++) acid = A[cell] > 0;
        if (!acid) return null;
        const gradient = new PIXI.FillGradient({ type: "linear", start: GRADIENT_START, end: GRADIENT_END, textureSpace: "local" });
        this.gradients.push(gradient);
        const width = right - left;
        const addStop = (x) => {
            fieldColor(water, x, this.stopColor);
            const [red, green, blue] = this.stopColor;
            gradient.addColorStop(clampUnit((x - left) / width), `rgb(${red}, ${green}, ${blue})`);
        };
        addStop(left);
        for (let cell = first; cell <= end; cell += step) addStop(x0 + (cell + CELL_CENTER) * dx);
        addStop(right);
        return gradient;
    }

    /**
     * Redibuja el campo. Con `deep.floor > 0` pinta además un rectángulo del color del agua entre las caras del tramo,
     * de `floor` a `bottom`, para que no se vea el fondo efectivo (`docs/design/16-ascenso.md`).
     * @param {object} water campo de alturas
     * @param {number} screenScale escala de la cámara, en px de pantalla por metro
     * @param {{ floor: number, bottom: number }|null} deep borde del agua profunda y borde inferior de la cámara, en m
     */
    draw(water, screenScale, deep = null) {
        const { alpha, color, lineColor, lineWidth, colorStep } = water.config.draw;
        const scale = this.pixelsPerMeter;
        const { graphics, outline } = this;
        graphics.clear();
        for (const gradient of this.gradients) gradient.destroy();
        this.gradients.length = 0;
        waterOutline(water, outline);
        const { xs, ys } = outline;
        const flat = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        if (deep && deep.floor > 0 && deep.bottom < deep.floor) {
            const left = water.x0 + water.i0 * water.dx;
            graphics
                .rect(left * scale, deep.bottom * scale, (water.i1 - water.i0) * water.dx * scale, (deep.floor - deep.bottom) * scale)
                .fill({ color: flat, alpha });
        }
        const strokeStyle = { width: (lineWidth * scale) / screenScale, color: `rgb(${lineColor[0]}, ${lineColor[1]}, ${lineColor[2]})`, join: "round" };
        for (let section = 0; section < outline.count; section++) {
            const first = outline.start[section];
            const last = first + outline.size[section];
            const gradient = this.gradientFor(water, xs[first], xs[first + outline.surface[section]], colorStep);
            graphics.moveTo(xs[first] * scale, ys[first] * scale);
            for (let vertex = first + 1; vertex < last; vertex++) graphics.lineTo(xs[vertex] * scale, ys[vertex] * scale);
            graphics.closePath().fill(gradient ? { fill: gradient, alpha } : { color: flat, alpha });
            graphics.moveTo(xs[first + 1] * scale, ys[first + 1] * scale);
            const top = first + 1 + outline.surface[section];
            for (let vertex = first + 2; vertex < top; vertex++) graphics.lineTo(xs[vertex] * scale, ys[vertex] * scale);
            graphics.stroke(strokeStyle);
        }
    }

    /** Quita el `Graphics` del mundo y lo destruye junto con los degradados del último frame. */
    destroy() {
        for (const gradient of this.gradients) gradient.destroy();
        this.gradients.length = 0;
        this.graphics.parent?.removeChild(this.graphics);
        this.graphics.destroy();
    }
}
