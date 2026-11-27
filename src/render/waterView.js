import { MATERIALS } from "../fluids/materials.js";
import { lerp } from "../core/math/scalar.js";
import { updateLiquidFilter } from "./liquidFilter.js";
import { HEIGHT_CHANNELS, createWaterFilter, createWaterHeights, encodeWater, setWaterFilterLights } from "./waterFilter.js";

/** Código de color de un tramo de agua sin ácido (`encodeWater(0)`): negro, con la cobertura en el alfa. */
const CLEAR_WATER_CODE = encodeWater(0);

/** Posición del centro de una celda dentro de ella, como fracción de su ancho. */
const CELL_CENTER = 0.5;

/** Canal de la textura de alturas con la marca de columna mojada (el rojo lleva `η`). */
const WET_CHANNEL = 1;

/** Fracción de la distancia entre dos puntos donde está el medio. */
const MIDPOINT = 0.5;

/** Canales de un color RGB. */
const RGB_CHANNELS = 3;

/** Cota de los vértices de `waterOutline`: por celda del campo y fijos, de sobra para el peor caso de tramos de una celda. */
const OUTLINE_VERTICES_PER_CELL = 4;
const OUTLINE_FIXED_VERTICES = 4;

/** Vértices de la línea de superficie de un tramo que no son centros de celda: la cara izquierda y la derecha. */
const SURFACE_FACE_VERTICES = 2;

/** Vértices del contorno de un tramo antes de la superficie: la cara izquierda del lecho y la de la superficie. */
const SURFACE_START_OFFSET = 1;

/** Constante del índice de lecho de un borde de 1 en adelante: `first + 4 + 2 · cells − edge`, con el contorno de `waterOutline`. */
const BED_CENTERS_OFFSET = 4;

/**
 * Vértice de superficie del borde `edge` de un tramo que empieza en `first`: 0 es la cara izquierda, de 1 a `cells` los centros de
 * celda y `cells + 1` la cara derecha (ver `waterOutline`).
 * @param {number} first primer vértice del tramo
 * @param {number} edge borde, de 0 a `cells + 1`
 * @returns {number} índice en `out.xs` y `out.ys`
 */
function surfaceVertex(first, edge) {
    return first + SURFACE_START_OFFSET + edge;
}

/**
 * Vértice de lecho del borde `edge`, bajo el de superficie: el contorno recorre el lecho de derecha a izquierda.
 * @param {number} first primer vértice del tramo
 * @param {number} cells celdas del tramo
 * @param {number} edge borde, de 0 a `cells + 1`
 * @returns {number} índice en `out.xs` y `out.ys`
 */
function bedVertex(first, cells, edge) {
    return edge === 0 ? first : first + BED_CENTERS_OFFSET + 2 * cells - edge;
}
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
 * Escribe en `data` la superficie `η` (m) y la marca de columna mojada de cada columna del campo, un texel RGBA por columna
 * (ver `createWaterHeights`). Una columna está mojada si está en el span activo y `h` supera `hDry`.
 * @param {object} water campo de alturas
 * @param {Float32Array} data buffer de `createWaterHeights`, se llena en el lugar
 */
export function writeSurfaceHeights(water, data) {
    const { N: columnCount, i0: firstCell, i1: endCell, b: bed, h: depth } = water;
    const wetThreshold = water.config.hDry;
    for (let column = 0; column < columnCount; column++) {
        const texel = column * HEIGHT_CHANNELS;
        const wet = column >= firstCell && column < endCell && depth[column] > wetThreshold;
        data[texel] = bed[column] + depth[column];
        data[texel + WET_CHANNEL] = wet ? 1 : 0;
    }
}

/**
 * Fracción del tinte de ácido del agua del campo en `x` (puro): `f = 1 − 10^(−α w / w_a)`, con `w` la fracción másica de
 * H2SO4 y `α = MATERIALS.acid.tintAbsorbance` (Beer–Lambert). Con `w` = 0 es 0.
 * @param {object} water campo de alturas
 * @param {number} x posición, en m
 * @returns {number} de 0 a 1
 */
export function acidTintFraction(water, x) {
    const { tintAbsorbance, species } = MATERIALS.acid;
    return 1 - 10 ** ((-tintAbsorbance * water.acidFractionAt(x)) / species.H2SO4);
}

/**
 * Color del agua del campo en `x` (puro, sin PIXI): llena `out` y lo devuelve con el RGB entero. Falso color de
 * la fracción másica de H2SO4 `w` (docs/design/14-agua.md §14.3, Render): de `water.config.draw.color` hacia
 * `MATERIALS.acid.tint` según `acidTintFraction`. Con `w` = 0 es exactamente `draw.color`. El tinte es una aproximación de
 * juego: el ácido real es incoloro.
 * @param {object} water campo de alturas
 * @param {number} x posición, en m
 * @param {number[]} out RGB entero (0-255) que se llena y se devuelve
 */
export function fieldColor(water, x, out = [0, 0, 0]) {
    const { color } = water.config.draw;
    const { tint } = MATERIALS.acid;
    const tintFraction = acidTintFraction(water, x);
    for (let channel = 0; channel < RGB_CHANNELS; channel++) {
        out[channel] = Math.round(lerp(color[channel], tint[channel], tintFraction));
    }
    return out;
}

/**
 * Agua del nivel como un `PIXI.Graphics` que se limpia y se redibuja cada frame desde el campo de alturas
 * (`docs/design/14-agua.md` §14.3, Render). Pinta un polígono por tramo mojado, del lecho a `η`, con el color codificado de
 * `waterFilter.js` (cobertura en el alfa y fracción de ácido en el rojo, con un trapecio por tramo entre centros de celda que
 * tenga ácido), y el filtro lo cambia por el agua del juego. Va después de los robots para que las piezas sumergidas se
 * vean bajo el agua. Unidades de la geometría: px a `pixelsPerMeter`, con la Y hacia arriba; la cámara la mueve y la escala
 * en el mundo. El filtro y la textura de alturas (`η` por columna, que le da la profundidad al filtro) se crean una vez; por
 * frame se actualiza la textura en el lugar y se ponen el tiempo, la cámara y las luces.
 */
export class WaterView {
    /**
     * @param {object} options
     * @param {PIXI.Container} options.parent contenedor del mundo donde se dibuja
     * @param {number} options.pixelsPerMeter px por metro del JSON del robot
     * @param {object} options.look fila de `FLUID_LOOK` del agua (`refraction` y `fresnel`)
     * @param {object} options.draw datos de dibujo del campo (`WATER_FIELD.draw`): `color`, `lineColor` y `lineWidth`
     * @param {object} options.water campo de alturas: de él salen las columnas de la textura de alturas
     */
    constructor({ parent, pixelsPerMeter, look, draw, water }) {
        this.pixelsPerMeter = pixelsPerMeter;
        this.graphics = new PIXI.Graphics();
        this.heights = createWaterHeights(water.N);
        this.filter = createWaterFilter({
            look,
            color: draw.color,
            acidColor: MATERIALS.acid.tint,
            lineColor: draw.lineColor,
            lineWidth: draw.lineWidth,
            heights: this.heights.source,
            columns: { x0: water.x0, dx: water.dx, count: water.N },
        });
        this.graphics.filters = [this.filter];
        parent.addChild(this.graphics);
        this.outline = {};
    }

    /**
     * Pone el tiempo y la cámara en el filtro del agua, sin crear objetos.
     * @param {object} frame
     * @param {number} frame.time reloj de juego, en s
     * @param {number} frame.originX px de pantalla del origen del mundo, en x
     * @param {number} frame.originY px de pantalla del origen del mundo, en y (hacia abajo)
     * @param {number} frame.pixelsPerMeter px de pantalla por metro
     */
    setFrame(frame) {
        updateLiquidFilter(this.filter, frame);
    }

    /**
     * Pasa las luces del frame al filtro del agua. Las luces van en coordenadas del mundo físico.
     * @param {{data: Float32Array, count: number}} lightSet luces de `createLightSet`
     */
    setLights(lightSet) {
        setWaterFilterLights(this.filter, lightSet);
    }

    /**
     * Pinta con el código `color` el trapecio del tramo entre los bordes `edge` y `edge + 1` (ver `surfaceVertex` y `bedVertex`).
     * @param {number} first primer vértice del tramo
     * @param {number} cells celdas del tramo
     * @param {number} edge borde izquierdo del trapecio
     * @param {number} color código de `encodeWater`
     */
    fillStrip(first, cells, edge, color) {
        const { xs, ys } = this.outline;
        const scale = this.pixelsPerMeter;
        const topLeft = surfaceVertex(first, edge);
        const topRight = surfaceVertex(first, edge + 1);
        const bottomRight = bedVertex(first, cells, edge + 1);
        const bottomLeft = bedVertex(first, cells, edge);
        this.graphics
            .moveTo(xs[topLeft] * scale, ys[topLeft] * scale)
            .lineTo(xs[topRight] * scale, ys[topRight] * scale)
            .lineTo(xs[bottomRight] * scale, ys[bottomRight] * scale)
            .lineTo(xs[bottomLeft] * scale, ys[bottomLeft] * scale)
            .closePath()
            .fill({ color });
    }
    /**
     * Redibuja el campo. Con `deep.floor > 0` pinta además un rectángulo entre las caras del tramo, de `floor` a `bottom`, para
     * que no se vea el fondo efectivo (`docs/design/16-ascenso.md`).
     * @param {object} water campo de alturas
     * @param {{ floor: number, bottom: number }|null} deep borde del agua profunda y borde inferior de la cámara, en m
     */
    draw(water, deep = null) {
        const scale = this.pixelsPerMeter;
        const { graphics, outline } = this;
        graphics.clear();
        writeSurfaceHeights(water, this.heights.data);
        this.heights.source.update();
        waterOutline(water, outline);
        const { xs, ys } = outline;
        if (deep && deep.floor > 0 && deep.bottom < deep.floor) {
            const left = water.x0 + water.i0 * water.dx;
            graphics
                .rect(left * scale, deep.bottom * scale, (water.i1 - water.i0) * water.dx * scale, (deep.floor - deep.bottom) * scale)
                .fill({ color: CLEAR_WATER_CODE });
        }
        for (let section = 0; section < outline.count; section++) {
            const first = outline.start[section];
            const last = first + outline.size[section];
            graphics.moveTo(xs[first] * scale, ys[first] * scale);
            for (let vertex = first + 1; vertex < last; vertex++) graphics.lineTo(xs[vertex] * scale, ys[vertex] * scale);
            graphics.closePath().fill({ color: CLEAR_WATER_CODE });
            const cells = outline.surface[section] - SURFACE_FACE_VERTICES;
            for (let edge = 0; edge <= cells; edge++) {
                const middle = (xs[surfaceVertex(first, edge)] + xs[surfaceVertex(first, edge + 1)]) * MIDPOINT;
                const code = encodeWater(acidTintFraction(water, middle));
                if (code !== CLEAR_WATER_CODE) this.fillStrip(first, cells, edge, code);
            }
        }
    }

    /** Quita el `Graphics` del mundo y lo destruye. */
    destroy() {
        this.heights.source.destroy();
        this.graphics.parent?.removeChild(this.graphics);
        this.graphics.destroy();
    }
}