import { LIGHT_MAP, sharedLightMap } from "./lightMap.js";
import { createLightMapFilter, setLightMapFilterLights, updateLightMapFilter } from "./lightMapFilter.js";

/**
 * Pase del mapa de luz (`docs/design/13-arte.md` §13.3), una vez por frame y antes de dibujar la escena: primero el mapa
 * de oclusión, con la capa del nivel (plataformas, terreno y cajas) con la cámara de `world` y sin sus filtros de
 * material, de modo que cuenta solo la cobertura (alfa); los robots y los líquidos no están en esa capa, así que no tapan
 * la luz. Después el mapa de luz, con un cuadrilátero de pantalla completa y el filtro de `lightMapFilter.js`. Las dos
 * texturas están a `LIGHT_MAP.resolution` del canvas, se crean una vez y solo se redimensionan si cambia el tamaño.
 * Patrón: vista de PIXI en modo retenido (el cuadrilátero, el filtro y la matriz de trabajo se crean una sola vez).
 */
export class LightMapPass {
    /**
     * @param {object} options
     * @param {PIXI.Container} options.world contenedor que mueve la cámara
     * @param {PIXI.Container[]} options.casters capas hijas de `world` que tapan la luz, de abajo a arriba
     */
    constructor({ world, casters }) {
        this.world = world;
        this.casters = casters;
        this.maps = sharedLightMap();
        this.filter = createLightMapFilter();
        this.quad = new PIXI.Sprite(PIXI.Texture.WHITE);
        this.quad.filters = [this.filter];
        this.transform = new PIXI.Matrix();
        this.occluderFilters = [];
        this.width = 0;
        this.height = 0;
    }

    /**
     * Registra los filtros de material de las capas que tapan la luz: se desactivan mientras se dibuja el mapa de oclusión.
     * @param {...PIXI.Filter} filters
     */
    addOccluderFilters(...filters) {
        this.occluderFilters.push(...filters);
    }

    /**
     * Cambia el tamaño de las texturas y del cuadrilátero solo si cambió el de pantalla.
     * @param {number} width ancho del canvas, en px
     * @param {number} height alto del canvas, en px
     */
    resize(width, height) {
        if (width === this.width && height === this.height) return;
        this.width = width;
        this.height = height;
        this.maps.occlusion.resize(width, height, LIGHT_MAP.resolution);
        this.maps.light.resize(width, height, LIGHT_MAP.resolution);
        this.maps.screenSize[0] = width;
        this.maps.screenSize[1] = height;
        this.quad.width = width;
        this.quad.height = height;
    }

    /**
     * Dibuja el mapa de oclusión y el de luz de este frame, sin crear objetos.
     * @param {PIXI.Renderer} renderer
     * @param {object} frame
     * @param {number} frame.width ancho del canvas, en px
     * @param {number} frame.height alto del canvas, en px
     * @param {{originX: number, originY: number, pixelsPerMeter: number}} frame.camera cámara del frame
     * @param {{data: Float32Array, count: number}} frame.lightSet luces del frame
     */
    render(renderer, { width, height, camera, lightSet }) {
        this.resize(width, height);
        this.renderOcclusion(renderer);
        updateLightMapFilter(this.filter, camera);
        setLightMapFilterLights(this.filter, lightSet);
        renderer.render({ container: this.quad, target: this.maps.light, clear: true });
    }

    /** Dibuja las capas que tapan la luz en el mapa de oclusión, con la transformación de cada una dentro de `world`. */
    renderOcclusion(renderer) {
        for (const filter of this.occluderFilters) filter.enabled = false;
        this.world.updateLocalTransform();
        this.casters.forEach((layer, index) => {
            layer.updateLocalTransform();
            this.transform.copyFrom(this.world.localTransform).append(layer.localTransform);
            renderer.render({ container: layer, target: this.maps.occlusion, clear: index === 0, transform: this.transform });
        });
        for (const filter of this.occluderFilters) filter.enabled = true;
    }
}
