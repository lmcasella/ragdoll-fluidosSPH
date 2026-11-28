import { LIGHTING, LIGHT_FUNCTIONS, LIGHT_MAP_FUNCTIONS, applyLights, createPointLightUniforms } from "./lighting.js";
import { createLightMapUniforms, lightMapSource } from "./lightMap.js";
import { FILTER_VERTEX } from "./thresholdFilter.js";
import { RENDER_QUALITY } from "./renderQuality.js";

/**
 * Filtro de luz sin normales (`docs/design/13-arte.md` §13.3), para las capas del fondo: suma a lo dibujado el mapa de luz
 * (`lightMapPass.js`, leído en la posición de pantalla de cada píxel, con las sombras de los robots) atenuado por
 * `pointLight`, la luz clave como un degradé vertical en pantalla (más clara arriba, atenuada por `keyLight`) y una niebla
 * de `fog` hacia `LIGHTING.backgroundFogColor`, que aclara las capas lejanas. Lleva el color con alfa premultiplicado, así
 * que todo se pesa por el alfa y no sale del dibujo.
 */

const SHADER_NAME = "light-filter";

/** Nombre del grupo de uniforms del filtro. */
const UNIFORM_GROUP = "lightUniforms";

/** Alto de pantalla inicial del filtro, en px, hasta el primer `updateLightFilter`. */
const INITIAL_VIEW_HEIGHT = 1;

/** Fragmento del filtro, GLSL ES 3.00: el color de la capa más el mapa de luz en el píxel, sin normales. */
export const LIGHT_FILTER_FRAGMENT = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform highp float uLightScale;
uniform highp float uKeyScale;
uniform highp float uFog;
uniform highp float uViewHeight;
uniform highp vec3 uKeyColor;
uniform highp vec3 uFogColor;
${LIGHT_FUNCTIONS}
${LIGHT_MAP_FUNCTIONS}

void main(void)
{
    vec4 color = texture(uTexture, vTextureCoord);
    vec2 screen = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
    vec3 light = mappedLight(screen) * uLightScale;
    float keyGradient = 1.0 - clamp(screen.y / uViewHeight, 0.0, 1.0);
    vec3 key = uKeyColor * uKeyScale * keyGradient;
    vec3 lit = mix(color.rgb + (light + key) * color.a, uFogColor * color.a, uFog);
    finalColor = vec4(lit, color.a);
}
`;

/**
 * Crea un filtro de luz sin normales. Se crea una vez por capa; el alto de pantalla y las luces se ponen cada frame con
 * `updateLightFilter` y `applyLights`.
 * @param {object} options
 * @param {number} options.pointLight cuánta luz del mapa de luz recibe la capa, de 0 a 1
 * @param {number} options.keyLight cuánto la aclara la luz clave en el degradé vertical
 * @param {number} options.fog cuánto la tiñe la niebla, de 0 a 1
 * @returns {PIXI.Filter}
 */
export function createLightFilter({ pointLight, keyLight, fog }) {
    const { color, intensity } = LIGHTING.base;
    return new PIXI.Filter({
        glProgram: PIXI.GlProgram.from({ vertex: FILTER_VERTEX, fragment: LIGHT_FILTER_FRAGMENT, name: SHADER_NAME }),
        antialias: RENDER_QUALITY.filterAntialias,
        resources: {
            uLightMap: lightMapSource(),
            [UNIFORM_GROUP]: {
                uLightScale: { value: pointLight, type: "f32" },
                uKeyScale: { value: keyLight, type: "f32" },
                uFog: { value: fog, type: "f32" },
                uViewHeight: { value: INITIAL_VIEW_HEIGHT, type: "f32" },
                uKeyColor: { value: new Float32Array(color.map((channel) => channel * intensity)), type: "vec3<f32>" },
                uFogColor: { value: new Float32Array(LIGHTING.backgroundFogColor), type: "vec3<f32>" },
                ...createPointLightUniforms(),
                ...createLightMapUniforms(),
            },
        },
    });
}

/**
 * Pone el alto de pantalla en el filtro, una vez por frame y sin crear objetos.
 * @param {PIXI.Filter} filter el de `createLightFilter`
 * @param {object} camera
 * @param {number} [camera.viewHeight] alto de la pantalla, en px, para el degradé de la luz clave
 */
export function updateLightFilter(filter, { viewHeight = INITIAL_VIEW_HEIGHT }) {
    filter.resources[UNIFORM_GROUP].uniforms.uViewHeight = viewHeight;
}

/**
 * Pone las luces del frame en el filtro, sin crear objetos.
 * @param {PIXI.Filter} filter el de `createLightFilter`
 * @param {{data: Float32Array, count: number}} lightSet luces de `createLightSet`
 */
export function setLightFilterLights(filter, lightSet) {
    applyLights(filter.resources[UNIFORM_GROUP].uniforms, lightSet);
}
