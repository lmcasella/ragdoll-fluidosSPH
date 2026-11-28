import { MAX_POLYGON_VERTICES, PolygonFixtureBuilder } from "../core/engine/box2d.js";
import { contoursOfGrid } from "../core/math/marchingSquares.js";
import { simplifyRing } from "../core/math/polygonSimplify.js";
import { decomposeConvex } from "../core/math/convexDecomposition.js";
import { assignHolesToOuters } from "../core/math/ringNesting.js";
import { polygonArea } from "../core/math/geometry.js";
import { GEOMETRY_TOLERANCE } from "../core/math/scalar.js";
import { DensityGrid } from "./densityGrid.js";
import { SURFACES, surfaceOf } from "./surfaces.js";

/**
 * Valores del terreno de densidad (`docs/design/05-escenario.md` §5.5): `maxTileSize` (m) es el lado máximo de un tramo de
 * una pieza grande; `maxRebuildsPerFrame` es el tope de tramos cuya forma se rehace en un frame; `wearRedrawInterval` (s) es
 * cada cuánto como mucho se publica el desgaste de un tramo para redibujarlo; `simplifyCells` es la
 * tolerancia de simplificación del contorno, en celdas; `minPieceCells` es el área mínima de un polígono convexo, en celdas².
 */
export const TERRAIN = { maxTileSize: 4, maxRebuildsPerFrame: 4, wearRedrawInterval: 0.25, simplifyCells: 0.5, minPieceCells: 0.5 };

/** Un anillo con menos vértices que esto no encierra área. */
const MINIMUM_RING_VERTICES = 3;

/** Valores por vértice en un arreglo intercalado (x, y). */
const COMPONENTS_PER_VERTEX = 2;

/**
 * Cantidad de tramos iguales en que se parte un largo para que ninguno pase de `maxSize`.
 * @param {number} length en m
 * @param {number} maxSize en m
 * @returns {number} al menos 1
 */
function tilesAlong(length, maxSize) {
    return Math.max(1, Math.ceil((length - GEOMETRY_TOLERANCE) / maxSize));
}

/**
 * Desplaza un anillo de vértices intercalados.
 * @param {number[]} ring se modifica, en m
 * @param {number} offsetX en m
 * @param {number} offsetY en m
 */
function translateRing(ring, offsetX, offsetY) {
    for (let index = 0; index < ring.length; index += COMPONENTS_PER_VERTEX) {
        ring[index] += offsetX;
        ring[index + 1] += offsetY;
    }
}

/**
 * Saca la forma de una grilla: contorno con marching squares, simplificado con Douglas-Peucker, agujeros repartidos entre
 * los externos y cada región partida en polígonos convexos de hasta `MAX_POLYGON_VERTICES` vértices. Todo sale en el
 * marco local del cuerpo (suma el origen de la grilla).
 * @param {DensityGrid} grid
 * @param {typeof TERRAIN} config
 * @returns {{rings: number[][], polygons: number[][]}} contornos simplificados y polígonos convexos, vértices intercalados en m
 */
function shapeOfGrid(grid, config) {
    const tolerance = config.simplifyCells * Math.max(grid.cellWidth, grid.cellHeight);
    const outers = [];
    const holes = [];
    for (const ring of contoursOfGrid(grid)) {
        const simplified = simplifyRing(ring, tolerance);
        const vertexCount = simplified.length / COMPONENTS_PER_VERTEX;
        const area = polygonArea(simplified, vertexCount);
        if (vertexCount < MINIMUM_RING_VERTICES || area === 0) continue;
        translateRing(simplified, grid.originX, grid.originY);
        (area > 0 ? outers : holes).push(simplified);
    }
    const holesByOuter = assignHolesToOuters(outers, holes);
    const limits = { maxVertices: MAX_POLYGON_VERTICES, minArea: config.minPieceCells * grid.cellWidth * grid.cellHeight };
    const polygons = outers.flatMap((outer, index) => decomposeConvex(outer, holesByOuter[index], limits));
    return { rings: [...outers, ...holes], polygons };
}

/**
 * Verdadero si el punto cae dentro del rectángulo de la grilla agrandado en `reach` por lado.
 * @param {DensityGrid} grid
 * @param {number} x en m, marco local del cuerpo
 * @param {number} y en m, marco local del cuerpo
 * @param {number} reach en m
 */
function gridNear(grid, x, y, reach) {
    return x >= grid.originX - reach && x <= grid.originX + grid.width + reach &&
        y >= grid.originY - reach && y <= grid.originY + grid.height + reach;
}

/**
 * Terreno de un cuerpo estático o cinemático (`docs/design/05-escenario.md` §5.5): dueño de las grillas de densidad de sus
 * tramos y de los fixtures que salen de ellas. Cada sólido (piso, pared o plataforma atravesable) se rasteriza como un
 * rectángulo lleno; las piezas grandes y no atravesables se parten en tramos iguales de hasta `config.maxTileSize` por
 * lado, y cada tramo tiene su grilla. La grilla es la verdad: los fixtures se rehacen de ella y nadie los edita a mano.
 * `update` rehace los tramos sucios, hasta `config.maxRebuildsPerFrame` por llamada, y solo se llama desde el loop, después
 * de los pasos de física y de aplicar lo que encolaron los contactos, nunca dentro de un callback. Los tramos
 * atravesables se registran en `OneWayPlatforms` y, al rehacerse, conservan el estado de los robots apoyados. Los fixtures
 * se quitan con `body.DestroyFixture`, nunca con `Box2D.destroy`. Patrón: Object Pool (un solo `PolygonFixtureBuilder`).
 * Quien lo crea llama a `dispose`.
 */
export class Terrain {
    /**
     * @param {object} options
     * @param {object} options.body `b2Body` que lleva los fixtures
     * @param {OneWayPlatforms|null} [options.platforms] registro de atravesables, o `null` si no hay
     * @param {number} options.friction fricción de todos los fixtures, adimensional
     * @param {boolean} [options.moving] verdadero si el cuerpo se mueve (cinemático): las atravesables lo avisan a `platforms`
     * @param {typeof TERRAIN} [options.config]
     * @param {() => number} [options.now] reloj en ms con que se mide el costo de rehacer
     */
    constructor({ body, platforms = null, friction, moving = false, config = TERRAIN, now = () => performance.now() }) {
        this.body = body;
        this.platforms = platforms;
        this.friction = friction;
        this.moving = moving;
        this.config = config;
        this.now = now;
        this.builder = new PolygonFixtureBuilder();
        /** Tramos vivos: `{ grid, surface, oneWay, fixtures, rings, polygons, rebuiltFrame }`. */
        this.tiles = new Set();
        /** Contador de llamadas a `update`: marca el frame en que se rehízo cada tramo. */
        this.frame = 0;
        /** Sube con cada forma rehecha; `shape` lo usa para saber cuándo rearmar sus contornos y su desgaste. */
        this.shapeVersion = 0;
        this.cachedShape = { version: -1, rings: [], ringSurfaces: [], wornCells: [] };
        /** Tramos rehechos y costo (ms) de la última llamada a `update`. */
        this.lastRebuilds = 0;
        this.lastRebuildMs = 0;
    }

    /** Desplazamiento horizontal del cuerpo en el mundo, en m. */
    get offsetX() {
        return this.body.GetPosition().get_x();
    }

    /** Desplazamiento vertical del cuerpo en el mundo, en m. */
    get offsetY() {
        return this.body.GetPosition().get_y();
    }

    /**
     * Agrega un sólido: rasteriza su rectángulo en una grilla por tramo y crea sus fixtures en el momento.
     * @param {{x: number, y: number, w: number, h: number, kind?: string, material?: string}} solid centro y tamaño, en m,
     * en el marco local del cuerpo; su material sale de `surfaceOf` y vale para todos sus tramos
     * @param {{oneWay?: boolean}} [options] `oneWay`: atravesable desde abajo; nunca se parte en tramos
     * @returns {{solid: object, tiles: object[]}} el sólido y sus tramos, para `removeSolid`
     */
    addSolid(solid, { oneWay = false } = {}) {
        const { x, y, w: width, h: height } = solid;
        const columns = oneWay ? 1 : tilesAlong(width, this.config.maxTileSize);
        const rows = oneWay ? 1 : tilesAlong(height, this.config.maxTileSize);
        const tileWidth = width / columns;
        const tileHeight = height / rows;
        const surface = surfaceOf({ ...solid, oneWay });
        const handle = { solid, tiles: [] };
        for (let row = 0; row < rows; row++) {
            for (let column = 0; column < columns; column++) {
                const originX = x - width / 2 + column * tileWidth;
                const originY = y - height / 2 + row * tileHeight;
                const grid = new DensityGrid({ originX, originY, width: tileWidth, height: tileHeight });
                const fill = { minX: originX, minY: originY, maxX: originX + tileWidth, maxY: originY + tileHeight };
                grid.fillRectangle(fill);
                const tile = { grid, fill, surface, oneWay, fixtures: [], rings: [], polygons: [], rebuiltFrame: -1, wearPublishedAt: -Infinity };
                this.tiles.add(tile);
                handle.tiles.push(tile);
                this.rebuild(tile);
            }
        }
        return handle;
    }

    /**
     * Quita un sólido: desregistra sus atravesables y destruye sus fixtures.
     * @param {{tiles: object[]}} handle el que devolvió `addSolid`
     */
    removeSolid(handle) {
        for (const tile of handle.tiles) this.destroyTile(tile);
        handle.tiles.length = 0;
    }

    /**
     * Devuelve cada tramo a su rectángulo original y rehace en el momento su forma: borra la corrosión acumulada al empezar
     * una ronda. Solo se llama desde el loop, nunca dentro de un callback.
     */
    restore() {
        for (const tile of this.tiles) {
            tile.grid.fillRectangle(tile.fill);
            this.rebuild(tile);
        }
    }

    /** Quita todos los sólidos. */
    clear() {
        for (const tile of [...this.tiles]) this.destroyTile(tile);
    }

    /**
     * Rehace la forma de un tramo desde su grilla. Crea los fixtures nuevos antes de destruir los viejos para que
     * `OneWayPlatforms` traspase el estado de los robots apoyados (un puntero liberado podría reusarse) y marca el tramo
     * como limpio.
     * @param {object} tile
     */
    rebuild(tile) {
        const shape = shapeOfGrid(tile.grid, this.config);
        const material = { friction: this.friction };
        const created = shape.polygons.map((polygon) => this.builder.createPolygon(this.body, polygon, material));
        const previous = tile.fixtures;
        if (tile.oneWay && this.platforms) this.platforms.replacePlatforms(previous, created, { moving: this.moving });
        for (const fixture of previous) this.body.DestroyFixture(fixture);
        Object.assign(tile, { fixtures: created, rings: shape.rings, polygons: shape.polygons });
        tile.grid.shapeDirty = false;
        tile.grid.wearDirty = false;
        this.shapeVersion++;
    }

    /**
     * Contornos de todos los tramos para dibujar: vértices intercalados en m, en el marco local del cuerpo, con los
     * externos de área positiva y los agujeros de área negativa, con el material de cada uno (`ringSurfaces`, paralelo a
     * `rings`) y las celdas con desgaste de todos los tramos (`wornCells`, con su `surface`, para dibujar el óxido). Todo
     * se rearma solo si cambió alguna forma: el desgaste solo cambia junto con la forma.
     * @returns {{version: number, rings: number[][], ringSurfaces: string[], wornCells: object[]}}
     */
    get shape() {
        if (this.cachedShape.version !== this.shapeVersion) {
            const tiles = [...this.tiles];
            this.cachedShape = {
                version: this.shapeVersion,
                rings: tiles.flatMap((tile) => tile.rings),
                ringSurfaces: tiles.flatMap((tile) => tile.rings.map(() => tile.surface)),
                wornCells: tiles.flatMap((tile) => tile.grid.wornCells().map((cell) => ({ ...cell, surface: tile.surface }))),
            };
        }
        return this.cachedShape;
    }

    /**
     * Corroe el terreno cerca de un punto (`docs/design/05-escenario.md` §5.5): quita hasta `area` de materia de las celdas
     * a `reach` o menos, empezando por las más cercanas, y marca sucios los tramos tocados; la forma se rehace en el
     * próximo `update`. Solo se llama desde el loop, nunca dentro de un callback. `area` y lo devuelto se miden en materia
     * de acero: a cada tramo se le saca `acidAttack` de su material por cada unidad de acero (el vidrio no pierde
     * nada), así el ácido se gasta igual sobre cualquier material.
     * @param {object} options
     * @param {number} options.x punto, en m del mundo
     * @param {number} options.y punto, en m del mundo
     * @param {number} options.reach en m
     * @param {number} options.area materia de acero a quitar, en m²
     * @returns {number} área de acero equivalente quitada, en m²
     */
    erodeAt({ x, y, reach, area }) {
        const localX = x - this.offsetX;
        const localY = y - this.offsetY;
        let removed = 0;
        for (const { grid, surface } of this.tiles) {
            const { acidAttack } = SURFACES[surface];
            if (acidAttack > 0 && gridNear(grid, localX, localY, reach)) {
                removed += grid.erode({ x: localX, y: localY, reach, area: (area - removed) * acidAttack }) / acidAttack;
            }
            if (removed >= area) break;
        }
        return removed;
    }

    /**
     * Verdadero si hay materia que el ácido ataca a `reach` o menos del punto (el vidrio no cuenta): el ácido apoyado sigue
     * en contacto aunque Box2D ya no lo avise.
     * @param {{x: number, y: number, reach: number}} point punto en m del mundo y radio en m
     * @returns {boolean}
     */
    touches({ x, y, reach }) {
        const localX = x - this.offsetX;
        const localY = y - this.offsetY;
        for (const { grid, surface } of this.tiles) {
            if (SURFACES[surface].acidAttack === 0 || !gridNear(grid, localX, localY, reach)) continue;
            if (grid.cellsWithin(localX, localY, reach).candidates.length > 0) return true;
        }
        return false;
    }

    /**
     * Desregistra y destruye los fixtures de un tramo y lo saca del terreno.
     * @param {object} tile
     */
    destroyTile(tile) {
        for (const fixture of tile.fixtures) {
            if (tile.oneWay && this.platforms) this.platforms.removePlatform(fixture);
            this.body.DestroyFixture(fixture);
        }
        tile.fixtures = [];
        this.tiles.delete(tile);
        this.shapeVersion++;
    }

    /**
     * Rehace los tramos con la forma sucia, hasta `config.maxRebuildsPerFrame`; los que sobran quedan para el próximo
     * frame. Los tramos que solo cambiaron de desgaste publican el desgaste como mucho cada `config.wearRedrawInterval`.
     * @param {number} [time] reloj de juego, en s
     * @returns {number} tramos rehechos: con más de 0 hubo fixtures destruidos y quien llama invalida lo que dependa de ellos
     */
    update(time = 0) {
        this.frame++;
        this.lastRebuilds = 0;
        this.lastRebuildMs = 0;
        let startedAt = null;
        for (const tile of this.tiles) {
            if (!tile.grid.shapeDirty) {
                if (tile.grid.wearDirty && time - tile.wearPublishedAt >= this.config.wearRedrawInterval) {
                    tile.grid.wearDirty = false;
                    tile.wearPublishedAt = time;
                    this.shapeVersion++;
                }
                continue;
            }
            if (this.lastRebuilds >= this.config.maxRebuildsPerFrame) break;
            startedAt ??= this.now();
            this.rebuild(tile);
            tile.wearPublishedAt = time;
            tile.rebuiltFrame = this.frame;
            this.lastRebuilds++;
        }
        if (startedAt !== null) this.lastRebuildMs = this.now() - startedAt;
        return this.lastRebuilds;
    }

    /**
     * Cuenta las grillas, los polígonos convexos y sus vértices, para el panel de debug.
     * @returns {{grids: number, polygons: number, vertices: number}}
     */
    counts() {
        let polygons = 0;
        let vertices = 0;
        for (const tile of this.tiles) {
            polygons += tile.polygons.length;
            for (const polygon of tile.polygons) vertices += polygon.length / COMPONENTS_PER_VERTEX;
        }
        return { grids: this.tiles.size, polygons, vertices };
    }

    /** Cantidad de fixtures vivos del terreno. */
    fixtureCount() {
        let total = 0;
        for (const tile of this.tiles) total += tile.fixtures.length;
        return total;
    }

    /** Libera el constructor de fixtures y quita todos los sólidos. El cuerpo no se destruye acá. */
    dispose() {
        this.clear();
        this.builder.dispose();
    }
}
