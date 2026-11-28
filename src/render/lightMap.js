/**
 * Estado compartido del mapa de luz (`docs/design/13-arte.md` §13.3): las dos texturas que se dibujan una vez por frame
 * (`lightMapPass.js`) y que leen los filtros del fondo, las plataformas, los robots y el agua. Patrón: servicio compartido,
 * uno por instancia de `PIXI`, con las texturas y el tamaño de pantalla reutilizados entre frames.
 */

/**
 * Valores del mapa de luz. `resolution`: fracción de la resolución del canvas a que se dibujan el mapa de oclusión y el de
 * luz. `shadowedLights`: luces con sombras, una por robot. `marchSteps`: pasos con que se marcha desde cada píxel hacia
 * cada luz con sombras. `nearPixelIgnore`: tramo, en m, desde el píxel en que se ignora la oclusión, para que la
 * superficie de un colisionador reciba la luz que le llega de frente. `fullOcclusion`: oclusión acumulada, en pasos
 * tapados, con la que la luz no llega del todo.
 */
export const LIGHT_MAP = { resolution: 0.5, shadowedLights: 2, marchSteps: 16, nearPixelIgnore: 0.15, fullOcclusion: 1 };

/** Componentes del tamaño de pantalla (ancho, alto). */
const SIZE_COMPONENTS = 2;

/** Tamaño inicial de las texturas, en px, hasta el primer `LightMapPass.render`. */
const INITIAL_SIZE = 1;

const mapsByPixi = new WeakMap();

/**
 * Las texturas del mapa de oclusión y del mapa de luz, y el tamaño de pantalla en px que comparten todos los filtros (un
 * solo arreglo que se actualiza en el lugar). Se crean la primera vez que se piden.
 * @returns {{occlusion: PIXI.RenderTexture, light: PIXI.RenderTexture, screenSize: Float32Array}}
 */
export function sharedLightMap() {
    let maps = mapsByPixi.get(globalThis.PIXI);
    if (!maps) {
        const options = { width: INITIAL_SIZE, height: INITIAL_SIZE, resolution: LIGHT_MAP.resolution };
        maps = {
            occlusion: PIXI.RenderTexture.create(options),
            light: PIXI.RenderTexture.create(options),
            screenSize: new Float32Array(SIZE_COMPONENTS).fill(INITIAL_SIZE),
        };
        mapsByPixi.set(globalThis.PIXI, maps);
    }
    return maps;
}

/**
 * Uniforms del mapa de luz para el grupo de un filtro: `uScreenSize`, el arreglo compartido con el tamaño de pantalla.
 * @returns {object}
 */
export function createLightMapUniforms() {
    return { uScreenSize: { value: sharedLightMap().screenSize, type: "vec2<f32>" } };
}

/**
 * Textura del mapa de luz como recurso `uLightMap` de un filtro (`resources: { uLightMap: lightMapSource() }`).
 * @returns {PIXI.TextureSource}
 */
export function lightMapSource() {
    return sharedLightMap().light.source;
}
