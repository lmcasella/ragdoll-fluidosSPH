const SHAPE_COLOR = 0xffffff;
const OUTLINE_COLOR = 0xffffff;

/** Grosor del contorno de las piezas en pantalla, en px: no cambia con el zoom. */
const OUTLINE_SCREEN_PX = 1.5;

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
 * relleno (blanco, para que el `tint` de `ragdollTint.js` sea su color) y el contorno (blanco, que nunca se tiñe),
 * en ese orden para que cada pieza tape el contorno de la anterior. La forma se dibuja una sola vez, ya en el marco del
 * cuerpo y en px de `pixelsPerMeter` con la Y hacia abajo; solo el contorno se rehace cuando el zoom cambia su grosor.
 * Cada frame solo se mueven las piezas (`syncParts`). No se crea si el JSON trae sprites (`createRagdollShapes`).
 */
export class RagdollShapes {
    /**
     * @param {object} options
     * @param {PIXI.Container} options.view `rag.view` de la instancia
     * @param {object[]} options.items piezas de `buildRenderItems`, en metros
     * @param {number} options.pixelsPerMeter px por metro del JSON del robot
     */
    constructor({ view, items, pixelsPerMeter }) {
        this.pixelsPerMeter = pixelsPerMeter;
        this.outlineWidth = 0;
        this.outlineBuilds = 0;
        this.items = items;
        /** @type {import("./ragdollSync.js").RagdollPart[]} */
        this.parts = items.map((item) => {
            const fill = new PIXI.Graphics();
            const outline = new PIXI.Graphics();
            view.addChild(fill, outline);
            this.trace(fill, item).fill(SHAPE_COLOR);
            return { body: item.body, bodyId: item.bodyId, fill, outline };
        });
    }

    /**
     * Traza la forma de una pieza en `graphics`, en px, con la Y hacia abajo y el marco del cuerpo.
     * @param {PIXI.Graphics} graphics
     * @param {object} item pieza de `buildRenderItems` (`type`, `cx`, `cy`, `angle` y su medida), en metros
     * @returns {PIXI.Graphics}
     */
    trace(graphics, item) {
        const scale = this.pixelsPerMeter;
        if (item.type === "circle") return graphics.circle(item.cx * scale, -item.cy * scale, item.radius * scale);
        const corners = item.type === "box" ? boxCorners(item.hw, item.hh) : item.vertices;
        const cosAngle = Math.cos(item.angle);
        const sinAngle = Math.sin(item.angle);
        const points = [];
        for (const [cornerX, cornerY] of corners) {
            const x = item.cx + cornerX * cosAngle - cornerY * sinAngle;
            const y = item.cy + cornerX * sinAngle + cornerY * cosAngle;
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
            this.trace(outline, item).stroke({ width: outlineWidth, color: OUTLINE_COLOR });
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
 * @returns {RagdollShapes|null}
 */
export function createRagdollShapes({ view, items, json }) {
    if (json.sprites.length > 0) return null;
    return new RagdollShapes({ view, items, pixelsPerMeter: json.units.pixelsPerMeter });
}
