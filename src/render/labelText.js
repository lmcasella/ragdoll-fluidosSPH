/**
 * @module labelText
 * Letra de un ícono del mundo (inicial de un arma) como `PIXI.Text`: negrita, centrada y con la Y invertida, porque
 * el contenedor de la cámara tiene la Y hacia arriba. Las usan los recogibles y la rueda de armas.
 */
import { tintOf } from "../core/color.js";
import { MAX_SCALE } from "./camera.js";

/** Alto de la letra, en m. */
const LABEL_SIZE_M = 0.5;

/** Color casi negro de las letras y de los fondos del dibujo de armas, `0xRRGGBB`: se lee sobre el color de cada arma. */
export const INK_COLOR = tintOf(16, 16, 24);

/** Centro de la letra dentro de su textura, como fracción de su lado. */
const LABEL_ANCHOR = 0.5;

/** Factor de escala en Y que corrige la inversión de la cámara. */
const FLIP_Y = -1;

/**
 * Crea la letra de un ícono. Se crea una vez y después solo se cambian su texto y su posición. La textura tiene la
 * resolución del zoom máximo de la cámara (`MAX_SCALE`), para que la letra no se pixele.
 * @param {PIXI.Container} parent contenedor al que se agrega
 * @param {number} pixelsPerMeter px por metro de la geometría del mundo
 * @returns {PIXI.Text}
 */
export function createLabel(parent, pixelsPerMeter) {
    const label = new PIXI.Text({
        text: "",
        style: { fontFamily: "sans-serif", fontWeight: "bold", fontSize: LABEL_SIZE_M * pixelsPerMeter, fill: INK_COLOR },
        resolution: Math.ceil(MAX_SCALE / pixelsPerMeter),
    });
    label.anchor.set(LABEL_ANCHOR);
    label.scale.set(1, FLIP_Y);
    parent.addChild(label);
    return label;
}
