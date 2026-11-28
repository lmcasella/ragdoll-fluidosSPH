import { ROBOT_JOINT_COLOR } from "../render/robotFilter.js";
import { drawBodyDetail } from "./robotDetailShapes.js";
import { robotLayerOf } from "./robotLayers.js";

const SHAPE_COLOR = 0xffffff;

/** Grosor del contorno de las piezas en pantalla, en px: no cambia con el zoom. */
const OUTLINE_SCREEN_PX = 1.5;

/** Grosor de las hendiduras del torso y la pelvis, como fracción del grosor del contorno. */
const PANEL_LINE_WIDTH_RATIO = 0.8;

/** Cambio relativo del grosor del contorno (en la geometría) a partir del cual se rehace para seguir el zoom. */
const OUTLINE_REBUILD_TOLERANCE = 0.1;

/**
 * Esquinas de una caja de mitades `halfWidth` y `halfHeight`, en m y en el marco de la pieza, como pares `[x, y]`.
 * @param {number} halfWidth
 * @param {number} halfHeight
 * @returns {number[][]}
 */
function boxCorners(halfWidth, halfHeight) {
    return [
        [-halfWidth, -halfHeight],
        [halfWidth, -halfHeight],
        [halfWidth, halfHeight],
        [-halfWidth, halfHeight],
    ];
}

/**
 * Figuras del robot como `PIXI.Graphics` (`docs/design/03-robots.md`): un par por fixture dentro de `rag.view`, el
 * relleno (blanco, para que el `tint` de `ragdollTint.js` sea su color) y el contorno (del color de junta del filtro de los robots, `robotFilter.js`, que nunca se tiñe),
 * en ese orden para que cada pieza tape el contorno de la anterior. Cada pieza lleva la capa (`zIndex`) de `robotLayers.js`
 * según el lado al que mira el robot. El detalle de máquina (visor, hendiduras, tornillos y discos de las articulaciones,
 * `robotDetail.js`) se traza en el contorno de su cuerpo, sin tinte, con los códigos del filtro; sigue la pose y la capa de la pieza; `rag.view` ordena por capa y el robot se recrea al girar. La forma se dibuja una sola vez, ya en el marco del
 * cuerpo y en px de `pixelsPerMeter` con la Y hacia abajo; solo el contorno se rehace cuando el zoom cambia su grosor.
 * Cada frame solo se mueven las piezas (`syncParts`). No se crea si el JSON trae sprites (`createRagdollShapes`).
 */
export class RagdollShapes {
    /**
     * @param {object} options
     * @param {PIXI.Container} options.view `rag.view` de la instancia
     * @param {object[]} options.items piezas de `buildRenderItems`, en metros
     * @param {number} options.pixelsPerMeter px por metro del JSON del robot
     * @param {number} [options.side] lado al que mira el robot, 1 o -1: decide qué brazo y qué pierna quedan adelante (`robotLayers.js`)
     * @param {number} [options.slot] índice del jugador, que da el color del visor (`robotVisorCode`)
     */
    constructor({ view, items, pixelsPerMeter, side = 1, slot = 0 }) {
        this.pixelsPerMeter = pixelsPerMeter;
        this.side = side;
        this.slot = slot;
        const seenBodies = new Set();
        /** Verdadero en la primera pieza de cada cuerpo: ahí va su detalle, una sola vez aunque el cuerpo tenga varias figuras. */
        this.carriesDetail = items.map((item) => {
            const first = !seenBodies.has(item.bodyId);
            seenBodies.add(item.bodyId);
            return first;
        });
        this.outlineWidth = 0;
        this.outlineBuilds = 0;
        this.items = items;
        view.sortableChildren = true;
        /** @type {import("./ragdollSync.js").RagdollPart[]} */
        this.parts = items.map((item) => {
            const fill = new PIXI.Graphics();
            const outline = new PIXI.Graphics();
            fill.zIndex = outline.zIndex = robotLayerOf(item.bodyId, side);
            view.addChild(fill, outline);
            this.trace(fill, item).fill(SHAPE_COLOR);
            return { body: item.body, bodyId: item.bodyId, fill, outline };
        });
    }

    /**
     * Traza la forma de una pieza en `graphics`, en px, con la Y hacia abajo y el marco del cuerpo.
     * @param {PIXI.Graphics} graphics
     * @param {object} item pieza de `buildRenderItems` (`type`, `centerX`, `centerY`, `angle` y su medida), en metros
     * @returns {PIXI.Graphics}
     */
    trace(graphics, item) {
        const scale = this.pixelsPerMeter;
        if (item.type === "circle") return graphics.circle(item.centerX * scale, -item.centerY * scale, item.radius * scale);
        const corners = item.type === "box" ? boxCorners(item.halfWidth, item.halfHeight) : item.vertices;
        const cosAngle = Math.cos(item.angle);
        const sinAngle = Math.sin(item.angle);
        const points = [];
        for (const [cornerX, cornerY] of corners) {
            const x = item.centerX + cornerX * cosAngle - cornerY * sinAngle;
            const y = item.centerY + cornerX * sinAngle + cornerY * cosAngle;
            points.push(x * scale, -y * scale);
        }
        return graphics.poly(points, true);
    }

    /**
     * Rehace el contorno solo si el grosor que corresponde al zoom cambió más que `OUTLINE_REBUILD_TOLERANCE`.
     * @param {number} screenScale escala de la cámara, en px de pantalla por metro
     */
    followZoom(screenScale) {
        const outlineWidth = (OUTLINE_SCREEN_PX * this.pixelsPerMeter) / screenScale;
        if (Math.abs(outlineWidth - this.outlineWidth) <= this.outlineWidth * OUTLINE_REBUILD_TOLERANCE) return;
        this.outlineWidth = outlineWidth;
        this.items.forEach((item, index) => {
            const { outline } = this.parts[index];
            outline.clear();
            this.trace(outline, item).stroke({ width: outlineWidth, color: ROBOT_JOINT_COLOR });
            if (!this.carriesDetail[index]) return;
            const lineWidth = outlineWidth * PANEL_LINE_WIDTH_RATIO;
            drawBodyDetail(outline, item.bodyId, { pixelsPerMeter: this.pixelsPerMeter, side: this.side, lineWidth, slot: this.slot });
        });
        this.outlineBuilds++;
    }
}

/**
 * Crea las figuras del robot, salvo que el JSON traiga sprites: entonces los dibuja la librería y esta clase no se crea.
 * @param {object} options
 * @param {PIXI.Container} options.view `rag.view` de la instancia
 * @param {object[]} options.items piezas de `buildRenderItems`
 * @param {object} options.json `.rag.json` del robot
 * @param {number} options.side lado al que mira el robot, 1 o -1
 * @param {number} options.slot índice del jugador
 * @returns {RagdollShapes|null}
 */
export function createRagdollShapes({ view, items, json, side, slot }) {
    if (json.sprites.length > 0) return null;
    return new RagdollShapes({ view, items, pixelsPerMeter: json.units.pixelsPerMeter, side, slot });
}
