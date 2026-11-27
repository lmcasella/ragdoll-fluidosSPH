import { LIGHT_FUNCTIONS, applyLights, createPointLightUniforms } from "./lighting.js";
import { FILTER_VERTEX } from "./thresholdFilter.js";

/**
 * Filtro de luz sin normales (`docs/design/13-arte.md` §13.3), para las capas del fondo: suma a lo dibujado la luz de las
 * fuentes de `lighting.js`, con la misma caída que en las plataformas y atenuada por `scale`. Lleva el color con alfa
 * premultiplicado, así que la luz se pesa por el alfa y no sale del dibujo.
 */

const SHADER_NAME = "light-filter";

/** Nombre del grupo de uniforms del filtro. */
const UNIFORM_GROUP = "lightUniforms";

/** Componentes del origen de pantalla (x, y). */
const ORIGIN_COMPONENTS = 2;

/** Escala inicial del filtro, en px por metro, hasta el primer `updateLightFilter`. */
const INITIAL_PIXELS_PER_METER = 1;

/** Fragmento del filtro, GLSL ES 3.00: el color de la capa más la suma de luces en el punto del mundo, sin normales. */
export const LIGHT_FILTER_FRAGMENT = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform highp vec2 uOrigin;
uniform highp float uPixelsPerMeter;
uniform highp float uLightScale;
${LIGHT_FUNCTIONS}

void main(void)
{
    vec4 color = texture(uTexture, vTextureCoord);
    vec2 screen = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
    vec2 world = vec2(screen.x - uOrigin.x, uOrigin.y - screen.y) / uPixelsPerMeter;
    vec3 light = lightSum(vec3(world, 0.0), vec3(0.0, 0.0, 1.0), 0.0, 0.0) * uLightScale;
    finalColor = vec4(color.rgb + light * color.a, color.a);
}
`;

/**
 * Crea un filtro de luz sin normales. Se crea una vez por capa; la cámara y las luces se ponen cada frame con
 * `updateLightFilter` y `applyLights`.
 * @param {object} options
 * @param {number} options.scale cuánta luz recibe la capa, de 0 a 1
 * @returns {PIXI.Filter}
 */
export function createLightFilter({ scale }) {
    return new PIXI.Filter({
        glProgram: PIXI.GlProgram.from({ vertex: FILTER_VERTEX, fragment: LIGHT_FILTER_FRAGMENT, name: SHADER_NAME }),
        resources: {
            [UNIFORM_GROUP]: {
                uOrigin: { value: new Float32Array(ORIGIN_COMPONENTS), type: "vec2<f32>" },
                uPixelsPerMeter: { value: INITIAL_PIXELS_PER_METER, type: "f32" },
                uLightScale: { value: scale, type: "f32" },
                ...createPointLightUniforms(),
            },
        },
    });
}

/**
 * Pone la cámara en el filtro, una vez por frame y sin crear objetos.
 * @param {PIXI.Filter} filter el de `createLightFilter`
 * @param {object} camera
 * @param {number} camera.originX px de pantalla del origen del mundo, en x
 * @param {number} camera.originY px de pantalla del origen del mundo, en y (hacia abajo)
 * @param {number} camera.pixelsPerMeter px de pantalla por metro
 */
export function updateLightFilter(filter, { originX, originY, pixelsPerMeter }) {
    const { uniforms } = filter.resources[UNIFORM_GROUP];
    uniforms.uOrigin[0] = originX;
    uniforms.uOrigin[1] = originY;
    uniforms.uPixelsPerMeter = pixelsPerMeter;
}

/**
 * Pone las luces del frame en el filtro, sin crear objetos.
 * @param {PIXI.Filter} filter el de `createLightFilter`
 * @param {{data: Float32Array, count: number}} lightSet luces de `createLightSet`
 */
export function setLightFilterLights(filter, lightSet) {
    applyLights(filter.resources[UNIFORM_GROUP].uniforms, lightSet);
}
