import { lerp } from "../core/math/scalar.js";
import { createSeededRandom } from "../core/math/random.js";
import { piecewiseLinear } from "../core/math/numeric.js";
import { SHAPE_BUILDERS } from "./backgroundShapes.js";

/**
 * Fondo de planta industrial en cuatro capas de lejos a cerca (ver `docs/design/13-arte.md` §13.1). Datos:
 * - `bandTransition`: ancho, en m de altura de la cámara, de la zona donde una franja se funde con la siguiente.
 * - `bands`: franjas de altura (`minHeight`, en m) con el color del cielo `sky` (`[r, g, b]`, 0-255).
 * - `smokeColor`: color del humo (`0xRRGGBB`).
 * - `layers`: `depth` (0 fija a la pantalla, 1 se mueve como el escenario), `color` (`0xRRGGBB`), tamaño del tramo
 *   (`segmentWidth` y `segmentHeight`, en m de la capa) y `elements`: tipo (`kind` de `SHAPE_BUILDERS`), intentos por tramo
 *   (`attempts`), rangos de ancho y alto en m, y `presence`, la probabilidad de que cada intento se dibuje en cada franja.
 * Todos los colores son más oscuros que las plataformas (`levelView.js`) y los de las capas lejanas se acercan al cielo.
 */
export const BACKGROUND = {
    bandTransition: 10,
    bands: [
        { name: "floor", minHeight: 0, sky: [30, 35, 46] },
        { name: "walkways", minHeight: 30, sky: [24, 30, 46] },
        { name: "summit", minHeight: 80, sky: [34, 40, 54] },
    ],
    smokeColor: 0x282a34,
    layers: [
        {
            depth: 0.1,
            color: 0x242934,
            segmentWidth: 48,
            segmentHeight: 24,
            elements: [
                { kind: "chimney", attempts: 2, minWidth: 2, maxWidth: 3.5, minHeight: 12, maxHeight: 22, presence: [1, 0.6, 0.1] },
                { kind: "smokingChimney", attempts: 2, minWidth: 2, maxWidth: 3.5, minHeight: 12, maxHeight: 22, presence: [0.1, 0.6, 1] },
                { kind: "tank", attempts: 2, minWidth: 6, maxWidth: 10, minHeight: 5, maxHeight: 9, presence: [1, 0.7, 0] },
            ],
        },
        {
            depth: 0.25,
            color: 0x1f222b,
            segmentWidth: 40,
            segmentHeight: 20,
            elements: [
                { kind: "tank", attempts: 2, minWidth: 5, maxWidth: 9, minHeight: 4, maxHeight: 8, presence: [1, 0.8, 0.1] },
                { kind: "structure", attempts: 2, minWidth: 6, maxWidth: 10, minHeight: 8, maxHeight: 14, presence: [0.8, 1, 0.2] },
                { kind: "smokingChimney", attempts: 1, minWidth: 1.5, maxWidth: 2.5, minHeight: 10, maxHeight: 18, presence: [0.1, 0.5, 1] },
            ],
        },
        {
            depth: 0.45,
            color: 0x1c1f27,
            segmentWidth: 32,
            segmentHeight: 16,
            elements: [
                { kind: "pipe", attempts: 3, minWidth: 8, maxWidth: 16, minHeight: 0.25, maxHeight: 0.45, presence: [1, 0.8, 0.2] },
                { kind: "structure", attempts: 1, minWidth: 5, maxWidth: 8, minHeight: 7, maxHeight: 12, presence: [0.8, 1, 0.2] },
                { kind: "catwalk", attempts: 2, minWidth: 8, maxWidth: 14, minHeight: 1.2, maxHeight: 1.8, presence: [0.2, 1, 0.3] },
            ],
        },
        {
            depth: 0.7,
            color: 0x16181f,
            segmentWidth: 24,
            segmentHeight: 16,
            elements: [
                { kind: "verticalBeam", attempts: 2, minWidth: 0.6, maxWidth: 1, minHeight: 10, maxHeight: 16, presence: [1, 0.8, 0.3] },
            ],
        },
    ],
};

/** Desplazamiento que separa a las columnas y filas de una clave de tramo: las negativas también tienen clave única. */
const KEY_OFFSET = 32768;

/** Cantidad de filas posibles por columna en una clave de tramo. */
const KEY_SPAN = 65536;

/** Primos que mezclan columna, fila y capa en la semilla de un tramo. */
const SEED_COLUMN_PRIME = 73856093;
const SEED_ROW_PRIME = 19349663;
const SEED_LAYER_PRIME = 83492791;

/**
 * Paradas de una rampa por franjas: cada franja mantiene su valor y se funde con la anterior en `transition` m centrados en
 * su `minHeight`.
 * @param {{ minHeight: number }[]} bands
 * @param {number[][]} valuesByBand canales de cada franja, en el orden de `bands`
 * @param {number} transition ancho de la zona de fundido, en m
 * @returns {[number, number[]][]} paradas para `piecewiseLinear`
 */
export function bandStops(bands, valuesByBand, transition) {
    const stops = [[bands[0].minHeight, valuesByBand[0]]];
    for (let band = 1; band < bands.length; band++) {
        stops.push([bands[band].minHeight - transition / 2, valuesByBand[band - 1]]);
        stops.push([bands[band].minHeight + transition / 2, valuesByBand[band]]);
    }
    return stops;
}

/** Rampa del color del cielo por altura de la cámara, en m. */
export const SKY_STOPS = bandStops(
    BACKGROUND.bands,
    BACKGROUND.bands.map((band) => band.sky),
    BACKGROUND.bandTransition,
);

const PRESENCE_STOPS = BACKGROUND.layers.map((layer) =>
    layer.elements.map((element) =>
        bandStops(BACKGROUND.bands, element.presence.map((presence) => [presence]), BACKGROUND.bandTransition),
    ),
);

const presenceChannels = [0];

/**
 * Dónde queda y qué parte muestra una capa. El zoom de la capa va de 1 (fija) al de la cámara según `depth`, y su centro
 * sigue a la cámara multiplicado por `depth`. Las posiciones son del contenedor de la capa, en px de pantalla, con la
 * geometría en px a `pixelsPerMeter` y la Y invertida como `Camera.applyTo`.
 * @param {object} options
 * @param {number} options.depth de 0 a 1
 * @param {number} options.x posición X de la cámara, en m
 * @param {number} options.y posición Y de la cámara, en m
 * @param {number} options.zoom zoom de la cámara
 * @param {number} options.viewWidth ancho de la vista, en px
 * @param {number} options.viewHeight alto de la vista, en px
 * @param {number} options.pixelsPerMeter px por metro de la geometría
 * @param {object} out recibe `zoom`, `positionX`, `positionY` y los bordes visibles de la capa (`left`, `right`, `bottom`, `top`, en m de la capa)
 * @returns {object} `out`
 */
export function layerPlacement({ depth, x, y, zoom, viewWidth, viewHeight, pixelsPerMeter }, out) {
    const layerZoom = lerp(1, zoom, depth);
    const pixelsPerLayerMeter = pixelsPerMeter * layerZoom;
    const centerX = x * depth;
    const centerY = y * depth;
    const halfWidth = viewWidth / (2 * pixelsPerLayerMeter);
    const halfHeight = viewHeight / (2 * pixelsPerLayerMeter);
    out.zoom = layerZoom;
    out.positionX = viewWidth / 2 - centerX * pixelsPerLayerMeter;
    out.positionY = viewHeight / 2 + centerY * pixelsPerLayerMeter;
    out.left = centerX - halfWidth;
    out.right = centerX + halfWidth;
    out.bottom = centerY - halfHeight;
    out.top = centerY + halfHeight;
    return out;
}

/**
 * Clave numérica única de un tramo dentro de su capa, para buscarlo sin crear texto en cada frame.
 * @param {number} column
 * @param {number} row
 * @returns {number}
 */
export function segmentKey(column, row) {
    return (column + KEY_OFFSET) * KEY_SPAN + (row + KEY_OFFSET);
}

/**
 * Semilla del azar de un tramo: misma capa, columna y fila dan siempre la misma.
 * @param {number} layerIndex
 * @param {number} column
 * @param {number} row
 * @returns {number}
 */
export function segmentSeed(layerIndex, column, row) {
    return Math.imul(column, SEED_COLUMN_PRIME) ^ Math.imul(row, SEED_ROW_PRIME) ^ Math.imul(layerIndex + 1, SEED_LAYER_PRIME);
}

/**
 * Figuras de un tramo de una capa, en m locales del tramo (esquina inferior izquierda en el origen). Un elemento se dibuja si
 * su azar cae bajo la presencia de la franja que corresponde a su altura: la altura de la cámara con la que ese punto de la
 * capa queda al centro de la vista (`y / depth`). Es puro: no toca PIXI.
 * @param {number} layerIndex posición en `BACKGROUND.layers`
 * @param {number} column índice del tramo en horizontal
 * @param {number} row índice del tramo en vertical
 * @returns {object[]} figuras (ver `backgroundShapes.js`)
 */
export function generateSegment(layerIndex, column, row) {
    const layer = BACKGROUND.layers[layerIndex];
    const random = createSeededRandom(segmentSeed(layerIndex, column, row));
    const shapes = [];
    layer.elements.forEach((element, elementIndex) => {
        for (let attempt = 0; attempt < element.attempts; attempt++) {
            const x = random() * layer.segmentWidth;
            const y = random() * layer.segmentHeight;
            const width = lerp(element.minWidth, element.maxWidth, random());
            const height = lerp(element.minHeight, element.maxHeight, random());
            const roll = random();
            const bandHeight = (row * layer.segmentHeight + y) / layer.depth;
            piecewiseLinear(PRESENCE_STOPS[layerIndex][elementIndex], bandHeight, presenceChannels);
            if (roll < presenceChannels[0]) SHAPE_BUILDERS[element.kind](shapes, x, y, width, height, random);
        }
    });
    return shapes;
}
