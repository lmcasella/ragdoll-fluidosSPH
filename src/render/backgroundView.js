import { piecewiseLinear } from "../core/math/numeric.js";
import { tintOf } from "../core/color.js";
import { BACKGROUND, SKY_STOPS, generateSegment, layerPlacement, segmentKey } from "./background.js";
import { createLightFilter, setLightFilterLights, updateLightFilter } from "./lightFilter.js";
import { LIGHTING } from "./lighting.js";

/** Color con el que se dibuja el cielo antes de teñirlo; el tinte le pone el color real. */
const SKY_BASE_COLOR = 0xffffff;

/**
 * Fondo de planta industrial con parallax de cuatro capas (`docs/design/13-arte.md` §13.1), en modo retenido. Cuelga de la
 * capa de fondo de la escena, fuera de `world`: cada capa tiene su propia posición y zoom. Cada capa es un contenedor con
 * tramos (`PIXI.Graphics`) en un pool: un tramo se vuelve a dibujar solo cuando se recicla al salir de la vista, y en cada
 * frame solo se mueven los contenedores. Unidades de la geometría: px a `pixelsPerMeter`.
 */
export class BackgroundView {
    /**
     * @param {object} options
     * @param {PIXI.Container} options.parent contenedor de la capa de fondo
     * @param {number} options.pixelsPerMeter px por metro de la geometría
     */
    constructor({ parent, pixelsPerMeter }) {
        this.pixelsPerMeter = pixelsPerMeter;
        this.container = new PIXI.Container();
        this.sky = new PIXI.Graphics();
        this.sky.rect(0, 0, 1, 1).fill(SKY_BASE_COLOR);
        this.container.addChild(this.sky);
        this.skyChannels = [0, 0, 0];
        this.layers = BACKGROUND.layers.map((definition, index) => {
            const container = new PIXI.Container();
            this.container.addChild(container);
            return { index, definition, container, activeSegments: [], freeSegments: [], occupied: new Map(), placement: {} };
        });
        parent.addChild(this.container);
        this.segmentBuilds = 0;
        this.lightFilters = LIGHTING.backgroundLayers.map((look, nearness) => {
            const filter = createLightFilter(look);
            this.layers[this.layers.length - 1 - nearness].container.filters = [filter];
            return filter;
        });
    }

    /**
     * Pasa las luces del frame y la cámara a los filtros de las capas más cercanas, sin redibujar ningún tramo. Las luces van en
     * coordenadas del mundo físico (`docs/design/13-arte.md` §13.3).
     * @param {{data: Float32Array, count: number}} lightSet luces de `createLightSet`
     * @param {{originX: number, originY: number, pixelsPerMeter: number}} camera origen del mundo en px de pantalla y px por metro
     */
    setLights(lightSet, camera) {
        for (const filter of this.lightFilters) {
            updateLightFilter(filter, camera);
            setLightFilterLights(filter, lightSet);
        }
    }

    /**
     * Mueve las capas y recicla los tramos que salieron de la vista.
     * @param {object} camera datos planos de la cámara
     * @param {number} camera.x posición X, en m
     * @param {number} camera.y posición Y, en m
     * @param {number} camera.zoom zoom de la cámara
     * @param {number} camera.viewWidth ancho de la vista, en px
     * @param {number} camera.viewHeight alto de la vista, en px
     */
    update({ x, y, zoom, viewWidth, viewHeight }) {
        piecewiseLinear(SKY_STOPS, y, this.skyChannels);
        const [red, green, blue] = this.skyChannels;
        this.sky.tint = tintOf(Math.round(red), Math.round(green), Math.round(blue));
        this.sky.scale.set(viewWidth, viewHeight);
        for (const layer of this.layers) {
            layerPlacement(
                { depth: layer.definition.depth, x, y, zoom, viewWidth, viewHeight, pixelsPerMeter: this.pixelsPerMeter },
                layer.placement,
            );
            layer.container.scale.set(layer.placement.zoom, -layer.placement.zoom);
            layer.container.position.set(layer.placement.positionX, layer.placement.positionY);
            this.syncSegments(layer);
        }
    }

    /**
     * Libera los tramos fuera de la vista de la capa y asigna uno a cada tramo visible que no tiene.
     * @param {object} layer capa de `this.layers`
     */
    syncSegments(layer) {
        const { segmentWidth, segmentHeight } = layer.definition;
        const { left, right, bottom, top } = layer.placement;
        const firstColumn = Math.floor(left / segmentWidth);
        const lastColumn = Math.floor(right / segmentWidth);
        const firstRow = Math.floor(bottom / segmentHeight);
        const lastRow = Math.floor(top / segmentHeight);
        for (let index = layer.activeSegments.length - 1; index >= 0; index--) {
            const segment = layer.activeSegments[index];
            const visible = segment.column >= firstColumn && segment.column <= lastColumn && segment.row >= firstRow && segment.row <= lastRow;
            if (visible) continue;
            segment.graphics.visible = false;
            layer.occupied.delete(segment.key);
            layer.freeSegments.push(segment);
            layer.activeSegments[index] = layer.activeSegments[layer.activeSegments.length - 1];
            layer.activeSegments.pop();
        }
        for (let column = firstColumn; column <= lastColumn; column++) {
            for (let row = firstRow; row <= lastRow; row++) {
                const key = segmentKey(column, row);
                if (layer.occupied.has(key)) continue;
                const segment = layer.freeSegments.pop() ?? this.createSegment(layer);
                this.buildSegment(layer, segment, column, row, key);
            }
        }
    }

    /**
     * Agrega al pool de la capa un tramo vacío.
     * @param {object} layer
     * @returns {object}
     */
    createSegment(layer) {
        const graphics = new PIXI.Graphics();
        layer.container.addChild(graphics);
        return { graphics, column: 0, row: 0, key: 0 };
    }

    /**
     * Asigna el tramo (`column`, `row`) a un tramo del pool y lo dibuja con las figuras de `generateSegment`.
     * @param {object} layer
     * @param {object} segment tramo del pool
     * @param {number} column
     * @param {number} row
     * @param {number} key clave de `segmentKey`
     */
    buildSegment(layer, segment, column, row, key) {
        const { definition } = layer;
        const scale = this.pixelsPerMeter;
        segment.column = column;
        segment.row = row;
        segment.key = key;
        layer.occupied.set(key, segment);
        layer.activeSegments.push(segment);
        const { graphics } = segment;
        graphics.position.set(column * definition.segmentWidth * scale, row * definition.segmentHeight * scale);
        graphics.visible = true;
        graphics.clear();
        const shapes = generateSegment(layer.index, column, row);
        for (const shape of shapes) {
            if (shape.type === "rect") graphics.rect(shape.x * scale, shape.y * scale, shape.width * scale, shape.height * scale);
            else if (shape.type === "polygon") graphics.poly(shape.points.map((coordinate) => coordinate * scale));
        }
        graphics.fill(definition.color);
        for (const shape of shapes) {
            if (shape.type === "puff") graphics.circle(shape.x * scale, shape.y * scale, shape.radius * scale).fill({ color: BACKGROUND.smokeColor, alpha: shape.alpha });
        }
        this.segmentBuilds++;
    }
}
