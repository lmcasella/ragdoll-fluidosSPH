/**
 * Generador del arte por pieza del robot (`docs/design/13-arte.md` §13.4): escribe `<pieza>-paint.svg` y `<pieza>-trim.svg`
 * de cada pieza de `ROBOT_ART` (`src/ragdoll/robotArt.js`, la tabla que dice el lado, la resolución y el oscurecido).
 * Regenerar da siempre los mismos archivos.
 *
 * Uso: `node tests/tools/robotArt.js <carpeta de SVG> <robot.rag.json> [--preview <carpeta>]`.
 * Con `--preview` escribe además `index.html` en esa carpeta (nunca en `assets/`), con el robot armado en tres colores
 * para mirarlo en un navegador.
 *
 * Las coordenadas de cada pieza están en m, en el marco de su cuerpo y con la Y hacia arriba; los SVG se escriben con la Y
 * invertida, centrados en el origen del cuerpo.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROBOT_ART, ROBOT_ART_LAYERS } from "../../src/ragdoll/robotArt.js";
import { isRobotBackLayer, robotLayerOf } from "../../src/ragdoll/robotLayers.js";

const STEEL = "#8e98a3";
const STEEL_DARK = "#5d6670";
const SEAM = "#22272e";
const VISOR = "#1b2028";
const GLOW = "#8ff6ff";
const PAINT = "#ffffff";
const PAINT_SHADE = "#c9c9c9";
const OUTLINE_WIDTH = 0.022;
const TRIM_SEAM_WIDTH = 0.015;
const HEX_RADIX = 16;
const HEX_DIGITS_PER_CHANNEL = 2;
const MAX_CHANNEL = 255;
const WHITE = "#ffffff";

/** Inclinación y centro de giro de la caña de la pierna, en rad y en m (marco de la pieza, Y hacia arriba). */
const LEG_SHIN_TILT_RAD = 0.26623;
const LEG_SHIN_PIVOT_X = -0.00333;
const LEG_SHIN_PIVOT_Y = -0.15729;

/** Cuadro de la lámina de vista previa, en m, y escala de sus dos tamaños, en px/m. */
const PREVIEW_LEFT = -0.6;
const PREVIEW_TOP = -1.35;
const PREVIEW_WIDTH = 3.2;
const PREVIEW_HEIGHT = 1.5;
const PREVIEW_BACKGROUND = "#2a3240";
const PREVIEW_LARGE_SCALE = 300;
const PREVIEW_SMALL_SCALE = 60;
const PREVIEW_PLAYER_COLORS = { first: "#ff9933", second: "#33b5ff" };
const PREVIEW_SECOND_ROBOT_X = 1.1;
const PREVIEW_MIRRORED_ROBOT_X = 2.2;
const RADIANS_TO_DEGREES = 180 / Math.PI;

/**
 * @param {number[][]} points pares `[x, y]`, Y hacia arriba
 * @returns {string} lista de puntos de SVG, con la Y invertida
 */
function svgPoints(points) {
    return points.map(([x, y]) => `${x},${-y}`).join(" ");
}

function polygon(points, fill, extra = "") {
    return `<polygon points="${svgPoints(points)}" fill="${fill}" ${extra}/>`;
}

function rectangle(minX, minY, maxX, maxY, fill, extra = "") {
    return `<rect x="${minX}" y="${-maxY}" width="${maxX - minX}" height="${maxY - minY}" fill="${fill}" ${extra}/>`;
}

function line(startX, startY, endX, endY, color, width) {
    return `<line x1="${startX}" y1="${-startY}" x2="${endX}" y2="${-endY}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
}

function circle(centerX, centerY, radius, fill, extra = "") {
    return `<circle cx="${centerX}" cy="${-centerY}" r="${radius}" fill="${fill}" ${extra}/>`;
}

/** Le suma a una forma el contorno de junta. */
function outlined(shape) {
    return shape.replace("/>", ` stroke="${SEAM}" stroke-width="${OUTLINE_WIDTH}" stroke-linejoin="round"/>`);
}

/** Envuelve la caña de la pierna en su giro propio. */
function shinTilted(content) {
    const tiltDegrees = LEG_SHIN_TILT_RAD * RADIANS_TO_DEGREES;
    return `<g transform="rotate(${tiltDegrees} ${LEG_SHIN_PIVOT_X} ${-LEG_SHIN_PIVOT_Y})">${content}</g>`;
}

function seamStroke(width) {
    return `stroke="${SEAM}" stroke-width="${width}"`;
}

/**
 * Cada pieza: `paint` (blanco que se tiñe) y `trim` (acero, juntas y visor, sin teñir), como listas de elementos SVG.
 */
const PIECES = {
    head: {
        paint: [
            outlined(polygon([[-0.15, -0.11], [-0.165, 0.06], [-0.1, 0.165], [0.1, 0.165], [0.175, 0.08], [0.175, -0.1], [0.1, -0.165], [-0.09, -0.165]], PAINT)),
            polygon([[-0.15, -0.11], [-0.09, -0.165], [0.1, -0.165], [0.175, -0.1], [0.175, -0.06], [-0.155, -0.06]], PAINT_SHADE),
        ],
        trim: [
            rectangle(-0.09, 0.165, -0.05, 0.225, STEEL_DARK),
            polygon([[-0.03, -0.035], [0.175, -0.035], [0.175, 0.075], [-0.01, 0.075]], VISOR),
            rectangle(0.02, 0.01, 0.17, 0.035, GLOW),
            line(-0.12, 0.1, -0.06, 0.1, SEAM, TRIM_SEAM_WIDTH),
        ],
    },
    torso: {
        paint: [
            outlined(polygon([[-0.21, -0.2], [-0.24, 0.12], [-0.14, 0.24], [0.15, 0.24], [0.245, 0.11], [0.21, -0.2]], PAINT)),
            polygon([[-0.21, -0.2], [0.21, -0.2], [0.225, -0.05], [-0.225, -0.05]], PAINT_SHADE),
        ],
        trim: [
            rectangle(-0.12, 0.2, 0.12, 0.255, STEEL, seamStroke(TRIM_SEAM_WIDTH)),
            line(-0.22, -0.05, 0.22, -0.05, SEAM, 0.018),
            line(-0.17, 0.06, -0.07, 0.06, SEAM, 0.02),
            line(-0.17, 0.11, -0.07, 0.11, SEAM, 0.02),
            line(-0.17, 0.01, -0.07, 0.01, SEAM, 0.02),
            circle(0.12, 0.08, 0.035, STEEL_DARK),
            circle(0.12, 0.08, 0.015, GLOW),
        ],
    },
    pelvis: {
        paint: [
            outlined(polygon([[-0.17, -0.09], [-0.17, 0.1], [-0.12, 0.14], [0.12, 0.14], [0.17, 0.1], [0.17, -0.09], [0.12, -0.13], [-0.12, -0.13]], PAINT)),
            polygon([[-0.17, -0.09], [-0.12, -0.13], [0.12, -0.13], [0.17, -0.09], [0.17, -0.04], [-0.17, -0.04]], PAINT_SHADE),
        ],
        trim: [rectangle(-0.17, 0.01, 0.17, 0.06, STEEL_DARK, seamStroke(0.014)), rectangle(-0.03, 0.0, 0.03, 0.07, STEEL)],
    },
    upperArm: {
        paint: [
            outlined(polygon([[-0.11, 0.05], [-0.11, 0.17], [-0.06, 0.2], [0.07, 0.2], [0.1, 0.16], [0.1, 0.05], [0.06, 0.02], [-0.08, 0.02]], PAINT)),
            polygon([[-0.11, 0.05], [-0.08, 0.02], [0.06, 0.02], [0.1, 0.05], [0.1, 0.08], [-0.11, 0.08]], PAINT_SHADE),
        ],
        trim: [
            outlined(rectangle(-0.06, -0.15, 0.03, 0.03, STEEL)),
            rectangle(-0.06, -0.15, -0.035, 0.03, STEEL_DARK),
            circle(-0.014, -0.12, 0.04, STEEL_DARK, seamStroke(0.014)),
        ],
    },
    cannon: {
        paint: [
            outlined(polygon([[-0.33, -0.04], [-0.33, 0.1], [-0.28, 0.125], [0.12, 0.125], [0.16, 0.09], [0.16, -0.02], [0.12, -0.055], [-0.28, -0.055]], PAINT)),
            polygon([[-0.33, -0.04], [-0.28, -0.055], [0.12, -0.055], [0.16, -0.02], [0.16, 0.01], [-0.33, 0.01]], PAINT_SHADE),
        ],
        trim: [
            outlined(rectangle(0.16, -0.01, 0.315, 0.08, STEEL)),
            rectangle(0.16, -0.01, 0.315, 0.015, STEEL_DARK),
            outlined(rectangle(0.29, -0.025, 0.33, 0.095, STEEL_DARK)),
            line(-0.2, -0.04, -0.2, 0.11, SEAM, 0.016),
            line(-0.05, -0.04, -0.05, 0.11, SEAM, 0.016),
            rectangle(0.0, 0.06, 0.1, 0.09, GLOW),
        ],
    },
    hip: {
        paint: [outlined(polygon([[-0.09, -0.06], [-0.09, -0.15], [0.1, -0.15], [0.1, -0.06]], PAINT))],
        trim: [outlined(rectangle(-0.06, -0.12, 0.08, -0.03, STEEL)), circle(0.006, -0.085, 0.028, STEEL_DARK)],
    },
    thigh: {
        paint: [
            outlined(polygon([[-0.08, -0.12], [-0.085, 0.1], [-0.05, 0.15], [0.06, 0.15], [0.085, 0.1], [0.08, -0.12], [0.04, -0.16], [-0.04, -0.16]], PAINT)),
            polygon([[-0.08, -0.12], [-0.04, -0.16], [0.04, -0.16], [0.08, -0.12], [0.08, -0.08], [-0.08, -0.08]], PAINT_SHADE),
        ],
        trim: [line(-0.06, 0.03, 0.06, 0.03, SEAM, 0.016), rectangle(-0.04, 0.07, 0.04, 0.11, STEEL_DARK)],
    },
    leg: {
        paint: [
            shinTilted(outlined(polygon([[-0.075, 0.03], [-0.08, 0.27], [-0.04, 0.31], [0.07, 0.31], [0.09, 0.26], [0.03, 0.03]], PAINT, ""))),
            outlined(polygon([[-0.17, -0.11], [-0.15, 0.03], [-0.07, 0.07], [0.1, 0.07], [0.19, 0.0], [0.2, -0.11]], PAINT)),
            polygon([[-0.17, -0.11], [0.2, -0.11], [0.2, -0.06], [-0.165, -0.06]], PAINT_SHADE),
        ],
        trim: [
            shinTilted(`${outlined(rectangle(-0.05, 0.02, 0.0, 0.25, STEEL))}${line(-0.06, 0.2, 0.06, 0.2, SEAM, 0.016)}`),
            outlined(rectangle(-0.18, -0.157, 0.21, -0.11, SEAM)),
            circle(-0.01, 0.0, 0.035, STEEL_DARK),
        ],
    },
};

/**
 * Multiplica un color `#rrggbb` por otro y por un factor, canal por canal.
 * @returns {string} color `#rrggbb`
 */
function multiplyColors(hex, tint, factor) {
    const channels = (color) => [0, 1, 2].map((index) => parseInt(color.slice(1 + index * HEX_DIGITS_PER_CHANNEL, 3 + index * HEX_DIGITS_PER_CHANNEL), HEX_RADIX));
    const tintChannels = channels(tint);
    const multiplied = channels(hex).map((value, index) => Math.round((value * tintChannels[index] * factor) / MAX_CHANNEL));
    return "#" + multiplied.map((value) => value.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_CHANNEL, "0")).join("");
}

function tinted(svg, tint, factor) {
    return svg.replace(/fill="(#[0-9a-f]{6})"/gi, (_, hex) => `fill="${multiplyColors(hex, tint, factor)}"`);
}

/**
 * Contenido de cada SVG de pieza, por nombre de archivo.
 * @returns {Object<string, string>}
 */
export function buildPieceSvgs() {
    const { rasterPixels, sideMeters } = ROBOT_ART;
    const half = sideMeters / 2;
    const files = {};
    for (const [name, piece] of Object.entries(PIECES)) {
        for (const layer of ROBOT_ART_LAYERS) {
            files[`${name}-${layer}.svg`] =
                `<svg xmlns="http://www.w3.org/2000/svg" width="${rasterPixels}" height="${rasterPixels}" viewBox="${-half} ${-half} ${sideMeters} ${sideMeters}">${piece[layer].join("")}</svg>`;
        }
    }
    return files;
}

/** Escribe los SVG de las piezas en `outputFolder`. */
export function writePieceSvgs(outputFolder) {
    mkdirSync(outputFolder, { recursive: true });
    for (const [fileName, content] of Object.entries(buildPieceSvgs())) writeFileSync(join(outputFolder, fileName), content);
}

/** Robot armado con las piezas en la pose del `.rag.json`, en el color `tint` (`#rrggbb`) y en SVG. */
function assembledRobot(rag, tint) {
    const bodies = [...rag.bodies].sort((first, second) => robotLayerOf(first.id, 1) - robotLayerOf(second.id, 1));
    return bodies
        .map((body) => {
            const piece = PIECES[ROBOT_ART.pieceOfBody[body.id]];
            const shade = isRobotBackLayer(robotLayerOf(body.id, 1)) ? ROBOT_ART.backShade : 1;
            const [x, y] = body.position;
            const angleDegrees = -(body.angle ?? 0) * RADIANS_TO_DEGREES;
            const paint = tinted(piece.paint.join(""), tint, shade);
            const trim = tinted(piece.trim.join(""), WHITE, shade);
            return `<g transform="translate(${x} ${-y}) rotate(${angleDegrees})">${paint}${trim}</g>`;
        })
        .join("");
}

function previewSheet(rag, scale) {
    const { first, second } = PREVIEW_PLAYER_COLORS;
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH * scale}" height="${PREVIEW_HEIGHT * scale}" viewBox="${PREVIEW_LEFT} ${PREVIEW_TOP} ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}">` +
        `<rect x="${PREVIEW_LEFT}" y="${PREVIEW_TOP}" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" fill="${PREVIEW_BACKGROUND}"/>` +
        `${assembledRobot(rag, first)}` +
        `<g transform="translate(${PREVIEW_SECOND_ROBOT_X} 0)">${assembledRobot(rag, second)}</g>` +
        `<g transform="translate(${PREVIEW_MIRRORED_ROBOT_X} 0) scale(-1 1)">${assembledRobot(rag, first)}</g></svg>`
    );
}

/** Escribe `index.html` en `previewFolder` con el robot armado en dos tamaños. */
export function writePreview(previewFolder, rag) {
    mkdirSync(previewFolder, { recursive: true });
    const html = `<!doctype html><html><body style="margin:0;background:${PREVIEW_BACKGROUND}">${previewSheet(rag, PREVIEW_LARGE_SCALE)}<br>${previewSheet(rag, PREVIEW_SMALL_SCALE)}</body></html>`;
    writeFileSync(join(previewFolder, "index.html"), html);
}

function runFromCommandLine(argumentsList) {
    const previewFlagIndex = argumentsList.indexOf("--preview");
    const previewFolder = previewFlagIndex >= 0 ? argumentsList[previewFlagIndex + 1] : null;
    const [outputFolder, ragPath] = argumentsList;
    writePieceSvgs(outputFolder);
    if (previewFolder) writePreview(previewFolder, JSON.parse(readFileSync(ragPath, "utf8")));
    console.log(`SVG escritos en ${outputFolder}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) runFromCommandLine(process.argv.slice(2));
