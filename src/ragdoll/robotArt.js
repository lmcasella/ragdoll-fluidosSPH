/**
 * Arte por pieza del robot (estilo mech industrial, `docs/design/13-arte.md` §13.4). Cada pieza son dos SVG de
 * `assets/robot/`: `<pieza>-paint.svg` (blanco y grises, se tiñe con el color del jugador) y `<pieza>-trim.svg` (acero,
 * juntas y visor, no se tiñe). Los genera `tests/tools/robotArt.js` desde esta misma tabla.
 *
 * - `folder`: carpeta de los SVG, relativa a `index.js`.
 * - `sideMeters`: lado del cuadrado del SVG, en m, centrado en el origen del cuerpo.
 * - `rasterPixels`: lado en px al que se rasteriza el SVG; da `rasterPixels / sideMeters` px/m, más del doble de `MAX_SCALE`
 *   (`src/render/camera.js`) para que el zoom máximo no pixele.
 * - `backShade`: factor de brillo de las piezas de atrás, sobre pintura y detalle (0 a 1).
 * - `pieceOfBody`: pieza de cada cuerpo del `.rag.json` del robot.
 */
export const ROBOT_ART = {
    folder: "./assets/robot",
    sideMeters: 0.8,
    rasterPixels: 256,
    backShade: 0.72,
    pieceOfBody: {
        b_1: "head",
        b_2: "torso",
        b_6: "pelvis",
        b_13: "upperArm",
        b_15: "upperArm",
        b_3: "cannon",
        b_14: "cannon",
        b_9: "hip",
        b_18: "hip",
        b_8: "thigh",
        b_17: "thigh",
        b_4: "leg",
        b_16: "leg",
    },
};

/** Capas de cada pieza: `paint` se tiñe y `trim` no. */
export const ROBOT_ART_LAYERS = ["paint", "trim"];

/** Piezas distintas del robot, sin repetir. */
export const ROBOT_ART_PIECES = [...new Set(Object.values(ROBOT_ART.pieceOfBody))];

/**
 * Ruta del SVG de una capa de una pieza.
 * @param {string} piece pieza de `ROBOT_ART.pieceOfBody`
 * @param {string} layer una de `ROBOT_ART_LAYERS`
 * @returns {string}
 */
export function robotArtPath(piece, layer) {
    return `${ROBOT_ART.folder}/${piece}-${layer}.svg`;
}
