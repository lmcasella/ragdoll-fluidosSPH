import { QUARTER_TURN, TAU } from "../core/math/scalar.js";

/**
 * Formas de los ítems de las cajas y del mapa (`docs/design/04-fluidos.md` §4.2): las usan la marca de embalaje de
 * `crateView.js` y la llave del ítem de reparación de `pickupView.js`.
 * - `drop`: `tipRatio` es la distancia de la punta de la gota al centro de su círculo, en radios; `arcSegments`, los tramos del arco de abajo;
 * - `wrench`: contorno de la llave inglesa como polígono cerrado de pares `[x, y]`, con el largo total en 1 y centrada
 *   en el origen: un mango con la cabeza de boca abierta arriba.
 */
export const ITEM_SHAPES = {
    drop: { tipRatio: 1.7, arcSegments: 16 },
    wrench: {
        outline: [
            [-0.07, -0.5],
            [0.07, -0.5],
            [0.07, 0.2],
            [0.2, 0.3],
            [0.2, 0.5],
            [0.09, 0.5],
            [0.09, 0.36],
            [-0.09, 0.36],
            [-0.09, 0.5],
            [-0.2, 0.5],
            [-0.2, 0.3],
            [-0.07, 0.2],
        ],
    },
};

/**
 * Dibuja una gota de pintura (un solo polígono, para que la transparencia no se sume donde se tocaría a sí misma),
 * centrada en el origen del gráfico, con la punta hacia arriba (Y hacia arriba, como el mundo).
 * @param {PIXI.Graphics} graphics gráfico ya vaciado
 * @param {object} drop
 * @param {number} drop.height alto total de la gota, en m
 * @param {number} drop.color color `0xRRGGBB`
 * @param {number} drop.alpha opacidad, de 0 a 1
 * @param {number} drop.pixelsPerMeter px por metro de la geometría
 */
export function drawDrop(graphics, { height, color, alpha, pixelsPerMeter }) {
    const { tipRatio, arcSegments } = ITEM_SHAPES.drop;
    const radius = (height / (1 + tipRatio)) * pixelsPerMeter;
    const centerY = (-(tipRatio - 1) * radius) / 2;
    const tangentAngle = Math.acos(1 / tipRatio);
    const arcStart = QUARTER_TURN - tangentAngle;
    const arcSweep = TAU - 2 * tangentAngle;
    const points = [0, centerY + tipRatio * radius];
    for (let segment = 0; segment <= arcSegments; segment++) {
        const angle = arcStart - (arcSweep * segment) / arcSegments;
        points.push(Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
    }
    graphics.poly(points).fill({ color, alpha });
}

/**
 * Dibuja una llave inglesa (un solo polígono) centrada en el origen del gráfico.
 * @param {PIXI.Graphics} graphics gráfico ya vaciado
 * @param {object} wrench
 * @param {number} wrench.length largo total, en m
 * @param {number} wrench.color color `0xRRGGBB`
 * @param {number} wrench.alpha opacidad, de 0 a 1
 * @param {number} wrench.pixelsPerMeter px por metro de la geometría
 * @param {number} [wrench.tilt] giro del dibujo, en rad
 */
export function drawWrench(graphics, { length, color, alpha, pixelsPerMeter, tilt = 0 }) {
    const cosine = Math.cos(tilt);
    const sine = Math.sin(tilt);
    const points = [];
    for (const [x, y] of ITEM_SHAPES.wrench.outline) {
        points.push((x * cosine - y * sine) * length * pixelsPerMeter, (x * sine + y * cosine) * length * pixelsPerMeter);
    }
    graphics.poly(points).fill({ color, alpha });
}
