import { COLOR_BYTES, tintOf } from "../core/color.js";
import { DEBUG } from "../core/debug.js";
import { vectorLength } from "../core/math/vector2.js";
import { GRAVITY } from "../core/physics/constants.js";
import { VECTOR_COMPONENTS } from "../core/heap.js";

/** Trazo de las capas de vectores: ancho en px de pantalla y alfa de todos los colores. */
const STROKE = { px: 1, alpha: 0.5 };

/** Alfa de los círculos del modo de puntos. */
const POINT_ALPHA = 0.8;

/** Peso mínimo con que se divide una fuerza, en N, para que una pieza sin masa no dé una flecha infinita. */
const MIN_WEIGHT_NEWTONS = 1e-6;

/** Largo de la punta de una flecha, en px de pantalla, y cuánto se abren sus lados respecto de su largo. */
const ARROW_HEAD = { px: 3, spread: 0.5 };

/** Colores de cada trazo de las capas de vectores, `0xRRGGBB`. */
const LAYER_COLORS = {
    velocity: tintOf(255, 255, 255),
    buoyancy: tintOf(51, 224, 255),
    drag: tintOf(255, 85, 221),
    columnHeight: tintOf(80, 200, 255),
    columnVelocity: tintOf(255, 225, 77),
    bot: tintOf(255, 179, 71),
    terrainCells: tintOf(120, 200, 120),
    terrainContour: tintOf(255, 255, 255),
    terrainPolygon: tintOf(255, 200, 60),
    terrainTile: tintOf(80, 160, 255),
    terrainFlash: tintOf(255, 255, 255),
};

/** Alfa de las celdas de densidad llena y del destello de un tramo rehecho en la capa del terreno. */
const TERRAIN_ALPHA = { cells: 0.35, flash: 0.5 };

/** Fuerzas de cada pieza que dibuja la capa de fuerzas, con su color: la clave es la propiedad de la pieza de `Buoyancy`. */
const FORCE_STROKES = [
    { property: "buoyancy", color: LAYER_COLORS.buoyancy },
    { property: "drag", color: LAYER_COLORS.drag },
];

/** Mitad de un ancho: el centro de una celda del campo está a media celda de su borde. */
const HALF = 0.5;

/**
 * Capas de debug que se dibujan sobre el mundo, como `PIXI.Graphics` que se limpian y se redibujan solo mientras su opción
 * está en sí (`docs/design/10-controles.md` §10.5, `docs/design/14-agua.md` §14.12): los puntos de las partículas y las capas de
 * vectores (velocidades, fuerzas, columnas del campo y bots) y la del terreno de densidad (`docs/design/05-escenario.md`
 * §5.5). Los gráficos se crean una vez; con todo apagado cada método solo borra lo que dibujó antes y sale. El panel de texto es HTML (`src/ui/debugPanel.js`).
 */
export class DebugView {
    /**
     * @param {object} options
     * @param {PIXI.Container} options.parent contenedor superpuesto, en px a `pixelsPerMeter` con la cámara aplicada
     * @param {number} options.pixelsPerMeter px por metro de la geometría
     * @param {Debug} options.debug estado del monitor (`src/core/debug.js`)
     */
    constructor({ parent, pixelsPerMeter, debug }) {
        this.pixelsPerMeter = pixelsPerMeter;
        this.debug = debug;
        this.pointsGraphics = new PIXI.Graphics();
        this.layerGraphics = {
            velocidades: new PIXI.Graphics(),
            fuerzas: new PIXI.Graphics(),
            columnas: new PIXI.Graphics(),
            bots: new PIXI.Graphics(),
            terreno: new PIXI.Graphics(),
        };
        parent.addChild(this.pointsGraphics, ...Object.values(this.layerGraphics));
        this.drawn = new Set();
        this.pointFill = { color: 0, alpha: POINT_ALPHA };
    }

    /**
     * Borra lo que `graphics` dibujó antes, si dibujó algo, y lo deja listo para dibujar de nuevo.
     * @param {PIXI.Graphics} graphics
     * @param {boolean} willDraw verdadero si el que llama va a dibujar en este frame
     */
    reset(graphics, willDraw) {
        if (!this.drawn.has(graphics) && !willDraw) return;
        graphics.clear();
        if (willDraw) this.drawn.add(graphics);
        else this.drawn.delete(graphics);
    }

    /**
     * Dibuja cada partícula como un círculo relleno de radio `radius` (m) con el color de su buffer de color y alfa
     * `POINT_ALPHA`. Solo en los modos `"puntos"` y `"ambos"`. No crea objetos nativos; el estilo de relleno es uno solo que se
     * reescribe por partícula (PIXI lo copia al recibirlo), así que cada partícula suma solo su círculo y su relleno al gráfico.
     * @param {object|null} refs `{ heap, bytes, positionIndex, color, count, radius }`: vistas `Float32Array` y `Uint8Array` del heap, índice de
     *   palabra de la posición, offset en bytes del buffer de color, cantidad y radio físico (m); `null` con los puntos apagados
     */
    drawPoints(refs) {
        const pointsOn = this.debug.fluidMode !== "metaball";
        this.reset(this.pointsGraphics, pointsOn);
        if (!pointsOn) return;
        const { heap, bytes, positionIndex, color, count, radius } = refs;
        const scale = this.pixelsPerMeter;
        for (let index = 0; index < count; index++) {
            const colorOffset = color + COLOR_BYTES * index;
            const vectorOffset = positionIndex + VECTOR_COMPONENTS * index;
            this.pointFill.color = tintOf(bytes[colorOffset], bytes[colorOffset + 1], bytes[colorOffset + 2]);
            this.pointsGraphics.circle(heap[vectorOffset] * scale, heap[vectorOffset + 1] * scale, radius * scale).fill(this.pointFill);
        }
    }

    /**
     * Dibuja las capas de vectores que estén en sí y borra las apagadas.
     * @param {number} screenScale escala de la cámara, en px de pantalla por metro
     * @param {object|null} refs `particles` `{ heap, positionIndex, velocityIndex, count }` (vista `Float32Array` del heap y los índices de palabra de los
     *   buffers de posición y velocidad), `pieces` (las piezas de `Buoyancy`: `cx`, `cy`, `buoyancy`, `drag`, `body`) y
     *   `water` (el campo: `h`, `b`, `uOf`, `x0`, `dx`, `i0`, `i1`, `config.hDry`) y `terrain` (ver `drawTerrain`); `null` con todas
     *   las capas apagadas
     */
    drawLayers(screenScale, refs) {
        const { layers } = this.debug;
        const strokeWidth = (STROKE.px * this.pixelsPerMeter) / screenScale;
        const { velocidades, fuerzas, columnas, bots, terreno } = this.layerGraphics;
        this.reset(velocidades, layers.velocidades);
        this.reset(fuerzas, layers.fuerzas);
        this.reset(columnas, layers.columnas);
        this.reset(bots, layers.bots);
        this.reset(terreno, layers.terreno);
        if (layers.velocidades) this.drawVelocities(velocidades, strokeWidth, screenScale, refs.particles);
        if (layers.fuerzas) this.drawForces(fuerzas, strokeWidth, refs.pieces);
        if (layers.columnas) this.drawColumns(columnas, strokeWidth, refs.water);
        if (layers.bots) this.drawBots(bots, strokeWidth);
        if (layers.terreno) this.drawTerrain(terreno, strokeWidth, refs.terrain);
    }

    /**
     * Agrega al trazo en curso un anillo cerrado de vértices intercalados.
     * @param {PIXI.Graphics} graphics
     * @param {number[]} ring `[x0, y0, x1, y1, …]`, en m
     */
    addRing(graphics, ring) {
        const scale = this.pixelsPerMeter;
        graphics.moveTo(ring[0] * scale, ring[1] * scale);
        for (let index = 2; index < ring.length; index += 2) graphics.lineTo(ring[index] * scale, ring[index + 1] * scale);
        graphics.closePath();
    }

    /**
     * Rectángulo de una celda o un tramo, en px de la geometría, para rellenar o trazar.
     * @param {PIXI.Graphics} graphics
     * @param {number} x borde izquierdo, en m
     * @param {number} y borde inferior, en m
     * @param {number} width en m
     * @param {number} height en m
     */
    addRectangle(graphics, x, y, width, height) {
        const scale = this.pixelsPerMeter;
        graphics.rect(x * scale, y * scale, width * scale, height * scale);
    }

    /**
     * Dibuja las celdas de una grilla con alfa según su densidad, juntando en un solo rectángulo las celdas contiguas de
     * una fila con la misma densidad.
     * @param {PIXI.Graphics} graphics
     * @param {DensityGrid} grid
     */
    drawCells(graphics, grid) {
        const { values, columns, rows, cellWidth, cellHeight, originX, originY } = grid;
        for (let row = 0; row < rows; row++) {
            let runStart = 0;
            for (let column = 1; column <= columns; column++) {
                const rowOffset = row * columns;
                if (column < columns && values[rowOffset + column] === values[rowOffset + runStart]) continue;
                const density = values[rowOffset + runStart];
                if (density > 0) {
                    this.addRectangle(graphics, originX + runStart * cellWidth, originY + row * cellHeight, (column - runStart) * cellWidth, cellHeight);
                    graphics.fill({ color: LAYER_COLORS.terrainCells, alpha: density * TERRAIN_ALPHA.cells });
                }
                runStart = column;
            }
        }
    }

    /**
     * Capa del terreno de densidad (`docs/design/05-escenario.md` §5.5): por cada tramo a la vista, las celdas con alfa según
     * su densidad, el borde del tramo, los polígonos convexos con sus uniones y el contorno simplificado; el tramo que se
     * rehízo en este frame destella. El gráfico se mueve con el cuerpo del terreno y dibuja en su marco local.
     * @param {PIXI.Graphics} graphics
     * @param {number} strokeWidth ancho del trazo, en px de la geometría
     * @param {object} refs `tiles` (los tramos de `Terrain`: `grid`, `rings`, `polygons`, `rebuiltFrame`), `frame` (el contador de
     *   `Terrain.update`, para el destello), `offsetX` y `offsetY` (la posición del cuerpo, en m) y `view` (la caja visible de
     *   la cámara, `{ minX, minY, maxX, maxY }`, en m del mundo)
     */
    drawTerrain(graphics, strokeWidth, { tiles, frame, offsetX, offsetY, view }) {
        const scale = this.pixelsPerMeter;
        graphics.position.set(offsetX * scale, offsetY * scale);
        const visible = [];
        for (const tile of tiles) {
            const { grid } = tile;
            const isInView =
                grid.originX + grid.width + offsetX >= view.minX &&
                grid.originX + offsetX <= view.maxX &&
                grid.originY + grid.height + offsetY >= view.minY &&
                grid.originY + offsetY <= view.maxY;
            if (isInView) visible.push(tile);
        }
        for (const tile of visible) this.drawCells(graphics, tile.grid);
        for (const tile of visible) this.addRectangle(graphics, tile.grid.originX, tile.grid.originY, tile.grid.width, tile.grid.height);
        this.strokeSegments(graphics, strokeWidth, LAYER_COLORS.terrainTile, visible.length);
        let polygons = 0;
        for (const tile of visible) {
            for (const polygon of tile.polygons) this.addRing(graphics, polygon);
            polygons += tile.polygons.length;
        }
        this.strokeSegments(graphics, strokeWidth, LAYER_COLORS.terrainPolygon, polygons);
        let rings = 0;
        for (const tile of visible) {
            for (const ring of tile.rings) this.addRing(graphics, ring);
            rings += tile.rings.length;
        }
        this.strokeSegments(graphics, strokeWidth, LAYER_COLORS.terrainContour, rings);
        for (const tile of visible) {
            if (tile.rebuiltFrame !== frame) continue;
            this.addRectangle(graphics, tile.grid.originX, tile.grid.originY, tile.grid.width, tile.grid.height);
            graphics.fill({ color: LAYER_COLORS.terrainFlash, alpha: TERRAIN_ALPHA.flash });
        }
    }

    /**
     * Cierra el trazo de `graphics` con el color y el ancho dados, si se agregó algún segmento.
     * @param {PIXI.Graphics} graphics
     * @param {number} strokeWidth ancho, en px de la geometría
     * @param {number} color `0xRRGGBB`
     * @param {number} segments cantidad de segmentos agregados
     */
    strokeSegments(graphics, strokeWidth, color, segments) {
        if (segments > 0) graphics.stroke({ width: strokeWidth, color, alpha: STROKE.alpha });
    }

    /**
     * Agrega al trazo en curso el segmento de `(fromX, fromY)` a `(toX, toY)`.
     * @param {PIXI.Graphics} graphics
     * @param {number} fromX origen, en m
     * @param {number} fromY origen, en m
     * @param {number} toX destino, en m
     * @param {number} toY destino, en m
     */
    addSegment(graphics, fromX, fromY, toX, toY) {
        const scale = this.pixelsPerMeter;
        graphics.moveTo(fromX * scale, fromY * scale).lineTo(toX * scale, toY * scale);
    }

    /**
     * Flechas de velocidad de hasta `DEBUG.maxArrows` partículas, muestreadas a paso fijo sobre el buffer.
     * @param {PIXI.Graphics} graphics
     * @param {number} strokeWidth ancho del trazo, en px de la geometría
     * @param {number} screenScale escala de la cámara, en px de pantalla por metro
     * @param {object} particles `{ heap, positionIndex, velocityIndex, count }`
     */
    drawVelocities(graphics, strokeWidth, screenScale, { heap, positionIndex, velocityIndex, count }) {
        if (count === 0) return;
        const stride = Math.ceil(count / DEBUG.maxArrows);
        const headLength = ARROW_HEAD.px / screenScale;
        let segments = 0;
        for (let index = 0; index < count; index += stride) {
            const x = heap[positionIndex + VECTOR_COMPONENTS * index];
            const y = heap[positionIndex + VECTOR_COMPONENTS * index + 1];
            const deltaX = heap[velocityIndex + VECTOR_COMPONENTS * index] * DEBUG.arrowTime;
            const deltaY = heap[velocityIndex + VECTOR_COMPONENTS * index + 1] * DEBUG.arrowTime;
            this.addSegment(graphics, x, y, x + deltaX, y + deltaY);
            segments++;
            const length = vectorLength(deltaX, deltaY);
            if (length > headLength) {
                const directionX = deltaX / length;
                const directionY = deltaY / length;
                const tipX = x + deltaX;
                const tipY = y + deltaY;
                const spread = ARROW_HEAD.spread;
                this.addSegment(graphics, tipX, tipY, tipX - headLength * (directionX + spread * directionY), tipY - headLength * (directionY - spread * directionX));
                this.addSegment(graphics, tipX, tipY, tipX - headLength * (directionX - spread * directionY), tipY - headLength * (directionY + spread * directionX));
            }
        }
        this.strokeSegments(graphics, strokeWidth, LAYER_COLORS.velocity, segments);
    }

    /**
     * Empuje (cian) y arrastre (magenta) de cada pieza: el largo es `DEBUG.forceScale` por la fuerza sobre el peso de la pieza.
     * @param {PIXI.Graphics} graphics
     * @param {number} strokeWidth ancho del trazo, en px de la geometría
     * @param {object[]} pieces piezas de `Buoyancy`
     */
    drawForces(graphics, strokeWidth, pieces) {
        for (const { property, color } of FORCE_STROKES) {
            let segments = 0;
            for (const piece of pieces) {
                const force = piece[property];
                if (force.x === 0 && force.y === 0) continue;
                const weight = Math.max(piece.body.GetMass() * GRAVITY, MIN_WEIGHT_NEWTONS);
                const lengthPerNewton = DEBUG.forceScale / weight;
                this.addSegment(graphics, piece.cx, piece.cy, piece.cx + force.x * lengthPerNewton, piece.cy + force.y * lengthPerNewton);
                segments++;
            }
            this.strokeSegments(graphics, strokeWidth, color, segments);
        }
    }

    /**
     * Barra de `h` (del lecho a la superficie) y vector de `u` sobre ella en las columnas mojadas, hasta `DEBUG.maxColumns`.
     * @param {PIXI.Graphics} graphics
     * @param {number} strokeWidth ancho del trazo, en px de la geometría
     * @param {object} water campo de alturas
     */
    drawColumns(graphics, strokeWidth, water) {
        const { i0: firstCell, i1: endCell, h: depth, b: bed, x0: leftEdge, dx: cellWidth } = water;
        const dryDepth = water.config.hDry;
        const stride = Math.ceil((endCell - firstCell) / DEBUG.maxColumns);
        let bars = 0;
        for (let cell = firstCell; cell < endCell; cell += stride) {
            if (depth[cell] <= dryDepth) continue;
            const x = leftEdge + (cell + HALF) * cellWidth;
            this.addSegment(graphics, x, bed[cell], x, bed[cell] + depth[cell]);
            bars++;
        }
        this.strokeSegments(graphics, strokeWidth, LAYER_COLORS.columnHeight, bars);
        let arrows = 0;
        for (let cell = firstCell; cell < endCell; cell += stride) {
            if (depth[cell] <= dryDepth) continue;
            const x = leftEdge + (cell + HALF) * cellWidth;
            const surface = bed[cell] + depth[cell];
            this.addSegment(graphics, x, surface, x + water.uOf(cell) * DEBUG.arrowTime, surface);
            arrows++;
        }
        this.strokeSegments(graphics, strokeWidth, LAYER_COLORS.columnVelocity, arrows);
    }

    /**
     * Línea de cada bot a su meta, o a su objetivo si no tiene meta.
     * @param {PIXI.Graphics} graphics
     * @param {number} strokeWidth ancho del trazo, en px de la geometría
     */
    drawBots(graphics, strokeWidth) {
        let segments = 0;
        for (const bot of this.debug.bots) {
            const target = bot.goal ?? bot.target;
            if (!target || !bot.from) continue;
            this.addSegment(graphics, bot.from.x, bot.from.y, target.x, target.y);
            segments++;
        }
        this.strokeSegments(graphics, strokeWidth, LAYER_COLORS.bot, segments);
    }
}
