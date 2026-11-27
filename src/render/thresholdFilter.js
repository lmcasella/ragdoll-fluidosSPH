import { clampUnit } from "../core/math/scalar.js";

/**
 * Base de los filtros de las gotas: el umbral que funde las gotas vecinas de una capa de fluido (ver `docs/design/07-sph.md`
 * §7.4) y el vértice común de los filtros propios. El filtro de las capas es `liquidFilter.js`, que corta con este umbral.
 * El umbral lleva el alfa a `alfa · GAIN + OFFSET` limitado a 0-1.
 */

/** Pendiente del alfa de salida respecto del de entrada. */
export const THRESHOLD_GAIN = 20;

/** Desplazamiento del alfa de salida: con `GAIN` 20 el alfa llega a 0 en 0,5 y a 1 en 0,55. */
export const THRESHOLD_OFFSET = -10;

/** Vértice común de los filtros propios: ubica el cuadrilátero del filtro y pasa la coordenada de textura de entrada. */
export const FILTER_VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

void main(void)
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;

/**
 * Alfa de salida del umbral: la misma fórmula del shader de `liquidFilter.js`, para probarla en Node.
 * @param {number} alpha alfa de entrada, de 0 a 1
 * @returns {number} alfa de salida, de 0 a 1
 */
export function thresholdAlpha(alpha) {
    return clampUnit(alpha * THRESHOLD_GAIN + THRESHOLD_OFFSET);
}
