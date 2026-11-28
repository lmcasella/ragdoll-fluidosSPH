import { ROBOT_ART } from "./robotArt.js";
import { isRobotBackLayer, robotLayerOf } from "./robotLayers.js";
import { scaleTint } from "./ragdollTint.js";

const WHITE_TINT = 0xffffff;
const ANCHOR_CENTER = 0.5;

/**
 * Arte del robot como `PIXI.Sprite` (`docs/design/13-arte.md` §13.4): un contenedor por cuerpo dentro de `rag.view`, con la
 * pintura (se tiñe, `ragdollTint.js`) y el detalle de acero (no se tiñe), ambos anclados al centro del cuerpo y escalados
 * para que el lado del SVG (`ROBOT_ART.sideMeters`) ocupe sus metros en px de `pixelsPerMeter`. Cada contenedor lleva la capa
 * (`zIndex`) de `robotLayers.js` según el lado al que mira el robot y, si es de atrás, el oscurecido `ROBOT_ART.backShade`
 * sobre pintura y detalle; un robot que mira a la izquierda espeja sus sprites en X, como la física. Las texturas llegan
 * ya cargadas (Vista de PIXI en modo retenido): después de crearse, solo se mueven (`syncParts`) y se tiñen.
 */
export class RagdollSprites {
    /**
     * @param {object} options
     * @param {PIXI.Container} options.view `rag.view` de la instancia
     * @param {object[]} options.items piezas de `buildRenderItems`; se dibuja un arte por cuerpo
     * @param {Object<string, {paint: PIXI.Texture, trim: PIXI.Texture}>} options.textures texturas por pieza de `ROBOT_ART`
     * @param {number} options.pixelsPerMeter px por metro del JSON del robot
     * @param {number} options.side lado al que mira el robot, 1 o -1
     */
    constructor({ view, items, textures, pixelsPerMeter, side }) {
        view.sortableChildren = true;
        const spriteScale = (ROBOT_ART.sideMeters * pixelsPerMeter) / ROBOT_ART.rasterPixels;
        const bodies = new Map(items.map((item) => [item.bodyId, item.body]));
        /** @type {import("./ragdollSync.js").RagdollPart[]} */
        this.parts = [...bodies].map(([bodyId, body]) => {
            const piece = ROBOT_ART.pieceOfBody[bodyId];
            if (piece === undefined) throw new Error(`El cuerpo ${bodyId} no tiene pieza en ROBOT_ART`);
            const layer = robotLayerOf(bodyId, side);
            const shade = isRobotBackLayer(layer) ? ROBOT_ART.backShade : 1;
            const display = new PIXI.Container();
            display.zIndex = layer;
            const paint = this.createSprite(textures[piece].paint, spriteScale * side, spriteScale);
            const trim = this.createSprite(textures[piece].trim, spriteScale * side, spriteScale);
            trim.tint = scaleTint(WHITE_TINT, shade);
            display.addChild(paint, trim);
            view.addChild(display);
            return { body, bodyId, display, paint, trim, shade };
        });
    }

    /**
     * @param {PIXI.Texture} texture
     * @param {number} scaleX negativo si el robot está espejado
     * @param {number} scaleY
     * @returns {PIXI.Sprite}
     */
    createSprite(texture, scaleX, scaleY) {
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(ANCHOR_CENTER);
        sprite.scale.set(scaleX, scaleY);
        return sprite;
    }
}
