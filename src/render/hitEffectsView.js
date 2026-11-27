import { TAU, lerp } from "../core/math/scalar.js";

/**
 * Feedback de golpes melee, en metros y segundos (`docs/design/09-arquitectura.md`, melee). `hit`: un círculo blanco que se
 * agranda (de `radius` a `radius + grow`) y se apaga en `time`. `block`: `rays` líneas radiales que salen del contacto, de
 * `from` a `to`, en blanco azulado. `blockBreak`: lo mismo, más grande y en naranja. `width` es el grosor del trazo en px de pantalla.
 */
export const HIT_FX = {
    hit: { time: 0.2, radius: 0.15, grow: 0.4, color: "#ffffff", width: 3 },
    block: { time: 0.25, rays: 6, from: 0.15, to: 0.45, color: "#bfe0ff", width: 2.5 },
    blockBreak: { time: 0.35, rays: 8, from: 0.15, to: 0.8, color: "#ff8a1f", width: 3 },
};

/**
 * Efectos de los golpes de `Melee.hits` en un solo `PIXI.Graphics` que se limpia y se redibuja cada frame
 * (`docs/design/03-robots.md` §3.7). Los eventos vencidos se descartan de la lista.
 */
export class HitEffectsView {
    /**
     * @param {object} options
     * @param {PIXI.Container} options.parent contenedor superpuesto, en px a `pixelsPerMeter` con la cámara aplicada
     * @param {number} options.pixelsPerMeter px por metro de la geometría
     */
    constructor({ parent, pixelsPerMeter }) {
        this.pixelsPerMeter = pixelsPerMeter;
        this.graphics = new PIXI.Graphics();
        parent.addChild(this.graphics);
    }

    /**
     * Dibuja los eventos y descarta los vencidos.
     * @param {object[]} hits eventos `{ x, y, time, kind }` de `Melee.hits`; `kind` es `"hit"`, `"block"` o `"blockBreak"`
     * @param {number} screenScale escala de la cámara, en px de pantalla por metro
     * @param {number} now reloj de simulación, en s
     */
    draw(hits, screenScale, now) {
        const { graphics, pixelsPerMeter: scale } = this;
        graphics.clear();
        for (let index = hits.length - 1; index >= 0; index--) {
            const hit = hits[index];
            const effect = HIT_FX[hit.kind] ?? HIT_FX.hit;
            const progress = (now - hit.time) / effect.time;
            if (progress >= 1) {
                hits.splice(index, 1);
                continue;
            }
            if (effect.rays) {
                const innerRadius = effect.from;
                const outerRadius = lerp(effect.from, effect.to, progress);
                for (let ray = 0; ray < effect.rays; ray++) {
                    const angle = (ray / effect.rays) * TAU;
                    graphics
                        .moveTo((hit.x + Math.cos(angle) * innerRadius) * scale, (hit.y + Math.sin(angle) * innerRadius) * scale)
                        .lineTo((hit.x + Math.cos(angle) * outerRadius) * scale, (hit.y + Math.sin(angle) * outerRadius) * scale);
                }
            } else {
                graphics.circle(hit.x * scale, hit.y * scale, (effect.radius + progress * effect.grow) * scale);
            }
            graphics.stroke({ width: (effect.width * scale) / screenScale, color: effect.color, alpha: 1 - progress });
        }
    }
}
