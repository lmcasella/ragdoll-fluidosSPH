import { LIGHT_FUNCTIONS, LIGHT_MAP_RANGE, VEC4_PER_LIGHT, applyLights, createPointLightUniforms } from "./lighting.js";
import { LIGHT_MAP, createLightMapUniforms, sharedLightMap } from "./lightMap.js";
import { glslFloat } from "./surfaceFilter.js";
import { FILTER_VERTEX } from "./thresholdFilter.js";
import { RENDER_QUALITY } from "./renderQuality.js";

/**
 * Filtro del mapa de luz (`docs/design/13-arte.md` §13.3): se aplica a un cuadrilátero del tamaño de la pantalla que se
 * dibuja en la textura del mapa de luz. Por cada píxel suma las luces puntuales con su caída; las de los robots (las que
 * tienen radio de fuente) multiplican además por la visibilidad, que sale de marchar desde el píxel hacia la luz sobre el
 * mapa de oclusión. La posición de pantalla sale de la del píxel en la textura de destino (`uInputSize` y `uOutputFrame`, porque
 * `vTextureCoord` es relativo a la textura de trabajo, que puede ser mayor que el área), dividida por el tamaño de esa
 * textura (`uOutputTexture`) y multiplicada por `uScreenSize`. Se dibuja a la resolución de la textura de destino (`resolution: "inherit"`), no a la del canvas.
 */

const SHADER_NAME = "light-map-filter";

/** Nombre del grupo de uniforms del filtro. */
const UNIFORM_GROUP = "lightMapUniforms";

/** Componentes del origen de pantalla (x, y). */
const ORIGIN_COMPONENTS = 2;

/** Escala inicial del filtro, en px por metro, hasta el primer `updateLightMapFilter`. */
const INITIAL_PIXELS_PER_METER = 1;

/**
 * Fragmento del filtro, GLSL ES 3.00 tras la conversión de PIXI (sin `texelFetch`, `textureSize`, enteros en `clamp`, `%` ni
 * bits). `visibility` marcha `MARCH_STEPS` pasos de la posición del píxel a la de la luz, suma el alfa del mapa de oclusión
 * en cada uno y lo suaviza; ignora los primeros `NEAR_PIXEL_IGNORE` m desde el píxel y lo que queda dentro de `sourceRadius`
 * de la luz (la luz no se tapa a sí misma al pegarse a una plataforma). El resultado va dividido por `LIGHT_MAP_RANGE`, porque la textura
 * es de 8 bits.
 */
export const LIGHT_MAP_FRAGMENT = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uOcclusion;
uniform highp vec2 uOrigin;
uniform highp float uPixelsPerMeter;
uniform highp vec2 uScreenSize;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform highp vec4 uOutputTexture;
${LIGHT_FUNCTIONS}

const float MARCH_STEPS = ${glslFloat(LIGHT_MAP.marchSteps)};
const float NEAR_PIXEL_IGNORE = ${glslFloat(LIGHT_MAP.nearPixelIgnore)};
const float FULL_OCCLUSION = ${glslFloat(LIGHT_MAP.fullOcclusion)};
const float SHADOWED_LIGHTS = ${glslFloat(LIGHT_MAP.shadowedLights)};
const float LIGHT_MAP_RANGE = ${glslFloat(LIGHT_MAP_RANGE)};

float occlusionAt(vec2 world)
{
    vec2 screen = vec2(world.x * uPixelsPerMeter + uOrigin.x, uOrigin.y - world.y * uPixelsPerMeter);
    return texture(uOcclusion, screen / uScreenSize).a;
}

float visibility(vec2 pixel, vec2 lightPosition, float sourceRadius)
{
    vec2 toLight = lightPosition - pixel;
    float reach = length(toLight);
    float occluded = 0.0;
    for (int marchStep = 0; marchStep < ${LIGHT_MAP.marchSteps}; marchStep++) {
        float fraction = (float(marchStep) + 0.5) / MARCH_STEPS;
        float along = fraction * reach;
        if (along < NEAR_PIXEL_IGNORE || reach - along < sourceRadius) continue;
        occluded += occlusionAt(pixel + toLight * fraction);
    }
    return 1.0 - smoothstep(0.0, FULL_OCCLUSION, occluded);
}

void main(void)
{
    vec2 screen = (vTextureCoord * uInputSize.xy + uOutputFrame.xy) / uOutputTexture.xy * uScreenSize;
    vec2 pixel = vec2(screen.x - uOrigin.x, uOrigin.y - screen.y) / uPixelsPerMeter;
    vec3 total = vec3(0.0);
    float marched = 0.0;
    for (int index = 0; index < MAX_LIGHTS; index++) {
        if (float(index) >= uLightCount) break;
        vec4 placement = uLights[index * ${VEC4_PER_LIGHT}];
        vec4 tint = uLights[index * ${VEC4_PER_LIGHT} + 1];
        float strength = lightFalloff(length(vec3(pixel - placement.xy, LIGHT_HEIGHT)), placement.z, placement.w);
        if (strength <= 0.0) continue;
        if (tint.a > 0.0 && marched < SHADOWED_LIGHTS) {
            strength *= visibility(pixel, placement.xy, tint.a);
            marched += 1.0;
        }
        total += tint.rgb * strength;
    }
    finalColor = vec4(total / LIGHT_MAP_RANGE, 1.0);
}
`;

/**
 * Crea el filtro del mapa de luz (un solo shader GLSL). Lee el mapa de oclusión compartido (`sharedLightMap`). Se crea una
 * vez; la cámara y las luces se ponen cada frame con `updateLightMapFilter` y `setLightMapFilterLights`.
 * @returns {PIXI.Filter}
 */
export function createLightMapFilter() {
    return new PIXI.Filter({
        glProgram: PIXI.GlProgram.from({ vertex: FILTER_VERTEX, fragment: LIGHT_MAP_FRAGMENT, name: SHADER_NAME }),
        resolution: "inherit",
        antialias: RENDER_QUALITY.filterAntialias,
        resources: {
            uOcclusion: sharedLightMap().occlusion.source,
            [UNIFORM_GROUP]: {
                uOrigin: { value: new Float32Array(ORIGIN_COMPONENTS), type: "vec2<f32>" },
                uPixelsPerMeter: { value: INITIAL_PIXELS_PER_METER, type: "f32" },
                ...createLightMapUniforms(),
                ...createPointLightUniforms(),
            },
        },
    });
}

/**
 * Pone la cámara en el filtro, una vez por frame y sin crear objetos.
 * @param {PIXI.Filter} filter el de `createLightMapFilter`
 * @param {object} camera
 * @param {number} camera.originX px de pantalla del origen del mundo físico, en x
 * @param {number} camera.originY px de pantalla del origen del mundo físico, en y (hacia abajo)
 * @param {number} camera.pixelsPerMeter px de pantalla por metro
 */
export function updateLightMapFilter(filter, { originX, originY, pixelsPerMeter }) {
    const { uniforms } = filter.resources[UNIFORM_GROUP];
    uniforms.uOrigin[0] = originX;
    uniforms.uOrigin[1] = originY;
    uniforms.uPixelsPerMeter = pixelsPerMeter;
}

/**
 * Pone las luces del frame en el filtro, sin crear objetos.
 * @param {PIXI.Filter} filter el de `createLightMapFilter`
 * @param {{data: Float32Array, count: number}} lightSet luces de `createLightSet`
 */
export function setLightMapFilterLights(filter, lightSet) {
    applyLights(filter.resources[UNIFORM_GROUP].uniforms, lightSet);
}
