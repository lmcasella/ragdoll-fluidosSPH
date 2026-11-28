import { SURFACES } from "../level/surfaces.js";
import { BEVEL_FUNCTIONS } from "./bevelFunctions.js";
import { BASE_LIGHT_FUNCTIONS, LIGHT_FUNCTIONS, LIGHT_MAP_FUNCTIONS, applyLights, createBaseLightUniforms, createPointLightUniforms } from "./lighting.js";
import { createLightMapUniforms, lightMapSource } from "./lightMap.js";
import { glslColor, glslFloat } from "./surfaceFilter.js";
import { FILTER_VERTEX } from "./thresholdFilter.js";
import { RENDER_QUALITY } from "./renderQuality.js";

/**
 * Filtro de los robots (`docs/design/13-arte.md` §13.4): un solo `PIXI.Filter` sobre la capa de robots que los muestra como
 * metal pintado con relieve. Cada pieza ya llega pintada con su color final (jugador, destello y mojado) por `tint`, así el
 * filtro no sabe de jugadores. El contorno de las piezas llega en `ROBOT_JOINT_COLOR` y se dibuja como junta hundida. La
 * altura sube en el bisel de la silueta y baja en las juntas; de su gradiente sale la normal, que se ilumina con la luz base
 * y el mapa de luz modulado por el relieve (`lightMapPass.js`, `docs/design/13-arte.md` §13.3). Sin ruido ni textura: los robots se mueven.
 */

/** Color con que se traza el contorno de las piezas para que el filtro lo reconozca como junta: ninguna pieza lo usa. */
export const ROBOT_JOINT_COLOR = 0x000000;

/** Color con que se dibujan tornillos y articulaciones para que el filtro los pinte de acero pelado: ninguna pieza es gris. */
export const ROBOT_METAL_COLOR = 0x808080;

/** Paso del canal azul del código del visor entre un jugador y el siguiente, de 0 a 255. */
export const ROBOT_VISOR_SLOT_STEP = 64;

/** Cantidad de jugadores que distingue el código del visor: el azul `(slot + 1) · paso` tiene que entrar en un byte. */
export const ROBOT_VISOR_SLOTS = 3;

const RED_CHANNEL_SHIFT = 16;
const BYTE_MAX = 255;
const CHANNEL_MASK = 0xff;

/** Nivel de gris de `ROBOT_METAL_COLOR`, de 0 a 1. */
const METAL_CODE_LEVEL = (ROBOT_METAL_COLOR & CHANNEL_MASK) / BYTE_MAX;

/** Componentes de cada color de visor en el arreglo de uniforms (`vec4`: r, g, b y uno sin usar). */
const VISOR_COLOR_COMPONENTS = 4;

/**
 * Color con que se dibuja el visor del jugador `slot` para que el filtro lo pinte emisivo: rojo pleno, verde en cero y el
 * azul indica el jugador, de quien el filtro toma el color (`createRobotFilter`).
 * @param {number} slot índice del jugador, desde 0
 * @returns {number} color `0xRRGGBB`
 */
export function robotVisorCode(slot) {
    return (BYTE_MAX << RED_CHANNEL_SHIFT) | ((slot + 1) * ROBOT_VISOR_SLOT_STEP);
}

const SHADER_NAME = "robot-filter";

/** Nombre del grupo de uniforms del filtro. */
const UNIFORM_GROUP = "robotUniforms";

/** Componentes del origen de pantalla (x, y). */
const ORIGIN_COMPONENTS = 2;

/** Escala inicial del filtro, en px por metro, hasta el primer `updateRobotFilter`. */
const INITIAL_PIXELS_PER_METER = 1;

/**
 * Fragmento del filtro, GLSL ES 1.00 tras la conversión de PIXI (sin `texelFetch`, `textureSize` ni operaciones de enteros).
 * Medidas en metros. `PAINT_BRIGHTNESS`: cuánto del color de la pieza queda con la pintura satinada. `PAINT_WEAR_MIX`: parte
 * que se mezcla hacia el acero de las plataformas en los `PAINT_WEAR_WIDTH` más externos de la silueta. `LIGHT_FLOOR`:
 * piso del multiplicador de luz, para que el destello y el mojado sigan leyéndose. La luz base (clave y relleno) se divide por la de una cara plana, así el color
 * del jugador queda igual donde no hay relieve; el mapa de luz se suma sin dividir, para que alumbre de verdad. El bisel mide al menos MIN_BEVEL_PX px para que se vea con la cámara lejos.
 * Detalles por código de color (se dibujan sin tinte): `ROBOT_METAL_COLOR` se pinta de acero oscuro (`METAL_BRIGHTNESS`) con
 * `METAL_SHINE` veces el brillo; el código del visor (`robotVisorCode`) se pinta del color del jugador (`uVisorColors`) aclarado
 * hacia el blanco (`VISOR_WHITE_MIX`), sin luz y `VISOR_GLOW` veces más claro, con un halo de `VISOR_HALO_WIDTH` m que suma `VISOR_HALO_STRENGTH` de su color.
 */
export const ROBOT_FRAGMENT = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform highp vec2 uOrigin;
uniform highp float uPixelsPerMeter;
uniform highp vec4 uVisorColors[${ROBOT_VISOR_SLOTS}];
${BASE_LIGHT_FUNCTIONS}
${LIGHT_FUNCTIONS}
${LIGHT_MAP_FUNCTIONS}
${BEVEL_FUNCTIONS}

const vec3 STEEL_BASE = ${glslColor(SURFACES.steel.baseColor)};
const vec3 JOINT_PAINT = vec3(0.10, 0.11, 0.13);
const float JOINT_CODE_LIMIT = 0.08;
const float JOINT_DEPTH = 0.03;
const float BEVEL_WIDTH = 0.04;
const float BEVEL_HEIGHT = 0.05;
const float MIN_BEVEL_PX = 3.0;
const float MIN_WEAR_PX = 1.5;
const float PAINT_BRIGHTNESS = ${glslFloat(0.95)};
const float PAINT_WEAR_WIDTH = 0.02;
const float PAINT_WEAR_MIX = ${glslFloat(0.5)};
const float LIGHT_FLOOR = ${glslFloat(0.75)};
const float SPECULAR_SHININESS = 16.0;
const float SPECULAR_STRENGTH = ${glslFloat(0.5)};
const vec3 VIEW_DIRECTION = vec3(0.0, 0.0, 1.0);
const float METAL_CODE_LEVEL = ${glslFloat(METAL_CODE_LEVEL)};
const float METAL_CODE_TOLERANCE = 0.04;
const float METAL_BRIGHTNESS = ${glslFloat(0.55)};
const float METAL_SHINE = ${glslFloat(3)};
const float VISOR_RED_MIN = 0.5;
const float VISOR_RED_MAX = 0.9;
const float VISOR_GREEN_MAX = 0.6;
const float VISOR_BLUE_MIN = 0.19;
const float VISOR_BLUE_MAX = 0.23;
const float VISOR_AMOUNT_GAIN = ${glslFloat(2)};
const float VISOR_WHITE_MIX = ${glslFloat(0.7)};
const float VISOR_SLOT_STEP = ${glslFloat(ROBOT_VISOR_SLOT_STEP / BYTE_MAX)};
const float VISOR_GLOW = ${glslFloat(1.6)};
const float VISOR_HALO_WIDTH = 0.05;
const float VISOR_HALO_STRENGTH = ${glslFloat(0.45)};
const float MIN_HALO_PX = 4.0;
const float HALO_TAP_WEIGHT = 0.25;

float bevelWidth()
{
    return max(BEVEL_WIDTH, MIN_BEVEL_PX / uPixelsPerMeter);
}

float jointAt(vec2 textureCoord)
{
    vec4 code = texture(uTexture, textureCoord);
    if (code.a <= 0.0) return 0.0;
    float brightest = max(code.r, max(code.g, code.b)) / code.a;
    return 1.0 - smoothstep(0.0, JOINT_CODE_LIMIT, brightest);
}

vec2 jointSlope(vec2 textureCoord)
{
    vec2 tap = vec2(bevelWidth() * uPixelsPerMeter) / uInputSize.xy;
    float right = jointAt(textureCoord + vec2(tap.x, 0.0));
    float left = jointAt(textureCoord - vec2(tap.x, 0.0));
    float up = jointAt(textureCoord - vec2(0.0, tap.y));
    float down = jointAt(textureCoord + vec2(0.0, tap.y));
    return -JOINT_DEPTH / (2.0 * bevelWidth()) * vec2(right - left, up - down);
}

float metalAmount(vec3 tint)
{
    float deviation = max(max(abs(tint.r - METAL_CODE_LEVEL), abs(tint.g - METAL_CODE_LEVEL)), abs(tint.b - METAL_CODE_LEVEL));
    return 1.0 - smoothstep(0.0, METAL_CODE_TOLERANCE, deviation);
}

vec4 visorAt(vec2 textureCoord)
{
    vec4 code = texture(uTexture, textureCoord);
    if (code.a <= 0.0) return vec4(0.0);
    vec3 straight = code.rgb / code.a;
    float slot = floor(straight.b / VISOR_SLOT_STEP + 0.5) - 1.0;
    float amount = (1.0 - smoothstep(0.0, VISOR_GREEN_MAX, straight.g)) * smoothstep(VISOR_RED_MIN, VISOR_RED_MAX, straight.r) * smoothstep(VISOR_BLUE_MIN, VISOR_BLUE_MAX, straight.b);
    vec3 color = uVisorColors[0].rgb;
    for (int index = 1; index < ${ROBOT_VISOR_SLOTS}; index++) {
        if (float(index) <= slot) color = uVisorColors[index].rgb;
    }
    return vec4(mix(color, vec3(1.0), VISOR_WHITE_MIX), min(1.0, amount * VISOR_AMOUNT_GAIN));
}

vec3 visorHalo(vec2 textureCoord)
{
    vec2 tap = vec2(max(VISOR_HALO_WIDTH, MIN_HALO_PX / uPixelsPerMeter) * uPixelsPerMeter) / uInputSize.xy;
    vec4 right = visorAt(textureCoord + vec2(tap.x, 0.0));
    vec4 left = visorAt(textureCoord - vec2(tap.x, 0.0));
    vec4 up = visorAt(textureCoord - vec2(0.0, tap.y));
    vec4 down = visorAt(textureCoord + vec2(0.0, tap.y));
    return (right.rgb * right.a + left.rgb * left.a + up.rgb * up.a + down.rgb * down.a) * HALO_TAP_WEIGHT * VISOR_HALO_STRENGTH;
}

float outerEdgeAmount(vec2 textureCoord)
{
    vec2 tap = vec2(max(PAINT_WEAR_WIDTH, MIN_WEAR_PX / uPixelsPerMeter) * uPixelsPerMeter) / uInputSize.xy;
    float right = coverageAt(textureCoord + vec2(tap.x, 0.0));
    float left = coverageAt(textureCoord - vec2(tap.x, 0.0));
    float up = coverageAt(textureCoord - vec2(0.0, tap.y));
    float down = coverageAt(textureCoord + vec2(0.0, tap.y));
    return 1.0 - min(min(right, left), min(up, down));
}

void main(void)
{
    vec4 encoded = texture(uTexture, vTextureCoord);
    if (encoded.a <= 0.0) {
        finalColor = vec4(0.0);
        return;
    }
    vec3 tint = encoded.rgb / encoded.a;
    float joint = jointAt(vTextureCoord);
    vec2 slope = coverageSlope(vTextureCoord, bevelWidth(), BEVEL_HEIGHT) + jointSlope(vTextureCoord);
    vec3 normal = normalize(vec3(-slope, 1.0));

    vec2 screen = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
    vec2 world = vec2(screen.x - uOrigin.x, uOrigin.y - screen.y) / uPixelsPerMeter;

    vec3 paint = tint * PAINT_BRIGHTNESS;
    paint = mix(paint, STEEL_BASE, PAINT_WEAR_MIX * outerEdgeAmount(vTextureCoord));
    paint = mix(paint, JOINT_PAINT, joint);
    float metal = metalAmount(tint);
    paint = mix(paint, STEEL_BASE * METAL_BRIGHTNESS, metal);

    float facing = max(0.0, dot(normal, uBaseDirection));
    vec3 flatNormal = vec3(0.0, 0.0, 1.0);
    vec3 baseRelief = baseLight(normal) / baseLight(flatNormal);
    vec3 light = baseRelief + mappedLight(screen) * lightRelief(vec3(world, 0.0), normal, 0.0);
    vec3 halfway = normalize(uBaseDirection + VIEW_DIRECTION);
    float specular = SPECULAR_STRENGTH * (1.0 + METAL_SHINE * metal) * pow(max(0.0, dot(normal, halfway)), SPECULAR_SHININESS) * facing;
    vec3 color = paint * max(light, vec3(LIGHT_FLOOR)) + uBaseColor * specular;
    vec4 visor = visorAt(vTextureCoord);
    color = mix(color, visor.rgb * VISOR_GLOW, visor.a) + visorHalo(vTextureCoord) * (1.0 - visor.a);
    finalColor = vec4(color * encoded.a, encoded.a);
}
`;

/**
 * Crea el filtro de los robots (un solo shader GLSL, sin texturas). Se crea una vez y sirve para todos los robots; los
 * uniforms de cámara se ponen con `updateRobotFilter` y las luces con `setRobotFilterLights`.
 * @param {number[][]} [visorColors] color RGB de 0 a 1 del visor de cada jugador, en el orden de su `slot` de `robotVisorCode`;
 *   los slots sin color repiten el último
 * @returns {PIXI.Filter}
 */
export function createRobotFilter(visorColors = []) {
    const visorBuffer = new Float32Array(ROBOT_VISOR_SLOTS * VISOR_COLOR_COMPONENTS);
    if (visorColors.length > 0) {
        for (let slot = 0; slot < ROBOT_VISOR_SLOTS; slot++) {
            visorBuffer.set(visorColors[Math.min(slot, visorColors.length - 1)], slot * VISOR_COLOR_COMPONENTS);
        }
    }
    return new PIXI.Filter({
        glProgram: PIXI.GlProgram.from({ vertex: FILTER_VERTEX, fragment: ROBOT_FRAGMENT, name: SHADER_NAME }),
        resolution: RENDER_QUALITY.filterResolution,
        antialias: RENDER_QUALITY.filterAntialias,
        resources: {
            uLightMap: lightMapSource(),
            [UNIFORM_GROUP]: {
                uOrigin: { value: new Float32Array(ORIGIN_COMPONENTS), type: "vec2<f32>" },
                uPixelsPerMeter: { value: INITIAL_PIXELS_PER_METER, type: "f32" },
                uVisorColors: { value: visorBuffer, type: "vec4<f32>", size: ROBOT_VISOR_SLOTS },
                ...createBaseLightUniforms(),
                ...createPointLightUniforms(),
                ...createLightMapUniforms(),
            },
        },
    });
}

/**
 * Pone la cámara en el filtro, una vez por frame y sin crear objetos: las luces quedan en coordenadas del mundo.
 * @param {PIXI.Filter} filter el de `createRobotFilter`
 * @param {object} camera
 * @param {number} camera.originX px de pantalla del origen del mundo físico, en x
 * @param {number} camera.originY px de pantalla del origen del mundo físico, en y (hacia abajo)
 * @param {number} camera.pixelsPerMeter px de pantalla por metro
 */
export function updateRobotFilter(filter, { originX, originY, pixelsPerMeter }) {
    const { uniforms } = filter.resources[UNIFORM_GROUP];
    uniforms.uOrigin[0] = originX;
    uniforms.uOrigin[1] = originY;
    uniforms.uPixelsPerMeter = pixelsPerMeter;
}

/**
 * Pone las luces del frame en el filtro, sin crear objetos.
 * @param {PIXI.Filter} filter el de `createRobotFilter`
 * @param {{data: Float32Array, count: number}} lightSet luces de `createLightSet`
 */
export function setRobotFilterLights(filter, lightSet) {
    applyLights(filter.resources[UNIFORM_GROUP].uniforms, lightSet);
}
