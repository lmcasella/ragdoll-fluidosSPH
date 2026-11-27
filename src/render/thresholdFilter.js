import { clampUnit } from "../core/math/scalar.js";

/**
 * Umbral de las gotas: el `PIXI.Filter` propio que funde las gotas vecinas de una capa de fluido (ver `docs/design/07-sph.md` §7.4).
 * Reproduce una matriz de color que deja el color igual y lleva el alfa a `alfa · GAIN + OFFSET` limitado a 0-1.
 */

/** Pendiente del alfa de salida respecto del de entrada. */
export const THRESHOLD_GAIN = 20;

/** Desplazamiento del alfa de salida: con `GAIN` 20 el alfa llega a 0 en 0,5 y a 1 en 0,55. */
export const THRESHOLD_OFFSET = -10;

const SHADER_NAME = "threshold-filter";

const VERTEX = `
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

const FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;

void main(void)
{
    vec4 premultiplied = texture(uTexture, vTextureCoord);
    float alpha = premultiplied.a;
    vec3 color = alpha > 0.0 ? premultiplied.rgb / alpha : vec3(0.0);
    float thresholded = clamp(alpha * ${THRESHOLD_GAIN.toFixed(1)} + ${THRESHOLD_OFFSET.toFixed(1)}, 0.0, 1.0);
    finalColor = vec4(color * thresholded, thresholded);
}
`;

/**
 * Alfa de salida del filtro: la misma fórmula del shader, para probarla en Node.
 * @param {number} alpha alfa de entrada, de 0 a 1
 * @returns {number} alfa de salida, de 0 a 1
 */
export function thresholdAlpha(alpha) {
    return clampUnit(alpha * THRESHOLD_GAIN + THRESHOLD_OFFSET);
}

/**
 * Crea el filtro de umbral (un solo shader GLSL, sin contexto WebGL propio). Una instancia sirve para varios sprites.
 * @returns {PIXI.Filter}
 */
export function createThresholdFilter() {
    return new PIXI.Filter({
        glProgram: PIXI.GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT, name: SHADER_NAME }),
        resources: {},
    });
}
