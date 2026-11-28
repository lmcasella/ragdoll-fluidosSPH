import { RagdollEffects } from "./RagdollEffects.js";
import { RagdollSprites } from "./RagdollSprites.js";
import { syncParts } from "./ragdollSync.js";
import { tintParts } from "./ragdollTint.js";

/**
 * Dibujo de un robot en PIXI (Composición): su arte por pieza dentro de `rag.view`, el sincronizado con la física, el
 * tinte de los efectos y el `Graphics` de chispas y burbujas. Se crea una vez al aparecer el robot y `paint` corre una
 * vez por frame (`docs/design/03-robots.md`).
 */
export class RagdollPainter {
    /**
     * @param {object} options
     * @param {object} options.player `ActiveRagdoll` ya con `renderItems`; su `rag.view` ya cuelga de la escena
     * @param {object} options.json `.rag.json` del robot
     * @param {Object<string, {paint: PIXI.Texture, trim: PIXI.Texture}>} options.textures texturas del arte por pieza, ya cargadas
     * @param {PIXI.Container} options.effectsParent contenedor del mundo para chispas y burbujas
     */
    constructor({ player, json, textures, effectsParent }) {
        this.player = player;
        this.pixelsPerMeter = json.units.pixelsPerMeter;
        this.sprites = new RagdollSprites({
            view: player.rag.view,
            items: player.renderItems,
            textures,
            pixelsPerMeter: this.pixelsPerMeter,
            side: player.side,
        });
        this.parts = this.sprites.parts;
        this.effects = new RagdollEffects({ parent: effectsParent, pixelsPerMeter: this.pixelsPerMeter });
    }

    /**
     * Pone el robot en la pose de la física con sus tintes y redibuja sus chispas y burbujas.
     * @param {number[]} baseColor color del jugador, `[r, g, b]` de 0 a 255
     * @param {number} screenScale escala de la cámara, en px de pantalla por metro
     * @param {number} now reloj de juego, en s
     */
    paint(baseColor, screenScale, now) {
        syncParts(this.parts, this.pixelsPerMeter);
        tintParts(this.parts, this.player, baseColor, now);
        this.effects.draw(this.player, screenScale, now);
    }

    /** Destruye lo que el robot dibuja fuera de `rag.view`; los sprites se van con la vista al destruir la instancia. */
    destroy() {
        this.effects.destroy();
    }
}
