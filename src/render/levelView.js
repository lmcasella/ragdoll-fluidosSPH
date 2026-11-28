import { lerp } from "../core/math/scalar.js";
import { SURFACES, surfaceOf } from "../level/surfaces.js";
import { createSurfaceFilter, encodeSurface, setSurfaceFilterLights, updateSurfaceFilter } from "./surfaceFilter.js";

/**
 * Nivel estático como geometría de `PIXI.Graphics`, que PIXI conserva entre frames (ver `docs/design/07-sph.md` §7.4).
 * Unidades de la geometría: px a `pixelsPerMeter`; la escala y la posición del mundo las pone la cámara en `world`.
 * Los sólidos fijos se pintan con el color codificado de `surfaceFilter.js` y el filtro los reemplaza por su material
 * (`docs/design/13-arte.md` §13.2); las rompibles quedan fuera del filtro.
 */
const BREAKABLE_FILL = [120, 82, 54];
const BREAKABLE_WARN = [220, 75, 45];
const BREAKABLE_STROKE = "#e0a96d";

/** Amplitud máxima de la vibración de una plataforma rompible a punto de romperse, en m. */
const BREAKABLE_SHAKE = 0.06;

/** Frecuencia angular de la vibración de una plataforma rompible, en rad/s. */
const BREAKABLE_SHAKE_RATE = 55;

/**
 * Grosor del trazo de solape de los sólidos fijos en pantalla, en px: el trazo del mismo color que el relleno agranda cada
 * forma medio píxel por lado, así dos tramos vecinos se pisan y no queda una franja de 1 px entre sus bordes suavizados.
 */
const SEAM_OVERLAP_SCREEN_PX = 1;

/** Cambio relativo del grosor del trazo (en la geometría) a partir del cual se reconstruye el nivel para seguir el zoom. */
const OVERLAP_REBUILD_TOLERANCE = 0.1;

/** Valores por vértice en un anillo intercalado: x e y. */
const VALUES_PER_VERTEX = 2;

/** Estado que se guarda de una plataforma rota para detectar cuándo cambia (las intactas guardan su `crack`, de 0 a 1). */
const BROKEN_STATE = -1;

/** Valores por rectángulo en el arreglo plano de celdas con desgaste: x, y, ancho y alto. */
const VALUES_PER_RECTANGLE = 4;

/** Niveles de desgaste que distingue el canal verde del color codificado: las celdas del mismo nivel se dibujan juntas. */
const WEAR_LEVELS = 255;

/**
 * Mezcla lineal de dos colores `[r, g, b]` (0-255) como texto CSS.
 * @param {number[]} from color con `amount` 0
 * @param {number[]} to color con `amount` 1
 * @param {number} amount de 0 a 1
 */
function mixColor(from, to, amount) {
    const channels = from.map((channel, index) => Math.round(lerp(channel, to[index], amount)));
    return `rgb(${channels.join(", ")})`;
}

/**
 * Un anillo es externo si su área con signo es positiva y agujero si es negativa (fórmula del cordón).
 * @param {number[]} ring vértices intercalados (x, y)
 * @returns {boolean}
 */
function ringIsOuter(ring) {
    let doubleArea = 0;
    for (let index = 0; index < ring.length; index += VALUES_PER_VERTEX) {
        const next = (index + VALUES_PER_VERTEX) % ring.length;
        doubleArea += ring[index] * ring[next + 1] - ring[next] * ring[index + 1];
    }
    return doubleArea > 0;
}

/**
 * Vista del nivel: sólidos fijos con el filtro de materiales y plataformas rompibles aparte. Con terreno de densidad
 * dibuja un `Graphics` por tramo y solo redibuja el tramo cuya forma o desgaste cambió; sin terreno, los rectángulos de los sólidos en un solo `Graphics`. Patrón: vista de PIXI en
 * modo retenido (crea sus `Graphics` y su filtro una sola vez; los de los tramos quitados vuelven a un pool).
 */
export class LevelView {
    /**
     * @param {object} options
     * @param {PIXI.Container} options.parent contenedor del mundo
     * @param {number} options.pixelsPerMeter px por metro de la geometría
     */
    constructor({ parent, pixelsPerMeter }) {
        this.pixelsPerMeter = pixelsPerMeter;
        this.container = new PIXI.Container();
        this.fixedContainer = new PIXI.Container();
        this.surfaceFilter = createSurfaceFilter();
        this.fixedContainer.filters = [this.surfaceFilter];
        this.fixedGraphics = new PIXI.Graphics();
        this.fixedContainer.addChild(this.fixedGraphics);
        this.breakableGraphics = new PIXI.Graphics();
        this.container.addChild(this.fixedContainer, this.breakableGraphics);
        parent.addChild(this.container);
        this.solids = null;
        this.solidCount = -1;
        this.shapeVersion = -1;
        this.tilesVersion = -1;
        this.redrawAll = false;
        this.overlapWidth = 0;
        this.breakableStates = [];
        this.breakableCount = -1;
        this.fixedBuilds = 0;
        this.breakableBuilds = 0;
        /** Tramo publicado por `Terrain.shape` → `{ graphics, shapeVersion, wearVersion }` de lo último que se dibujó. */
        this.tileEntries = new Map();
        this.freeGraphics = [];
        this.tilesToDraw = new Set();
        this.wearBuckets = Array.from({ length: WEAR_LEVELS + 1 }, () => []);
        this.collectWornCell = (x, y, width, height, wear) => {
            const level = Math.round(wear * WEAR_LEVELS);
            if (level > 0) this.wearBuckets[level].push(x, y, width, height);
        };
    }

    /**
     * Reconstruye la geometría solo si cambió: los sólidos fijos cuando cambia el conjunto de sólidos o el terreno (y de
     * este, solo los tramos que cambiaron) y los rompibles cuando cambia su grieta o su rotura, y las dos cuando el zoom
     * cambia el grosor del trazo más que `OVERLAP_REBUILD_TOLERANCE`. El desplazamiento vertical se aplica como posición,
     * sin reconstruir.
     * @param {{ solids: object[] }} level sólidos en metros (`x`, `y`, `w`, `h` del centro)
     * @param {number} offsetY desplazamiento vertical del nivel, en m
     * @param {number} now reloj de juego, en s (fase de la vibración)
     * @param {number} screenScale escala de la cámara, en px de pantalla por metro
     * @param {{version: number, tilesVersion: number, tiles: object[]}|null} [terrainShape] tramos del terreno de densidad
     * que publica `Terrain.shape` (contornos en m con su material, caja, grilla para el desgaste y versiones); con ellos
     * los sólidos fijos se dibujan con su forma real, y sin ellos como rectángulos (`docs/design/05-escenario.md` §5.5)
     * @param {{x: number, y: number}} [screenOrigin] px de pantalla del origen del mundo, para fijar la textura al mundo
     */
    update(level, offsetY, now, screenScale, terrainShape = null, screenOrigin = { x: 0, y: 0 }) {
        const { solids } = level;
        const overlapWidth = (SEAM_OVERLAP_SCREEN_PX * this.pixelsPerMeter) / screenScale;
        if (Math.abs(overlapWidth - this.overlapWidth) > this.overlapWidth * OVERLAP_REBUILD_TOLERANCE) {
            this.overlapWidth = overlapWidth;
            this.solidCount = -1;
            this.redrawAll = true;
        }
        const shapeVersion = terrainShape ? terrainShape.version : -1;
        if (solids !== this.solids || solids.length !== this.solidCount || shapeVersion !== this.shapeVersion) {
            this.solids = solids;
            this.solidCount = solids.length;
            this.shapeVersion = shapeVersion;
            this.breakableCount = -1;
            this.buildFixed(solids, terrainShape);
        }
        if (this.breakableChanged(solids)) this.buildBreakable(solids, now);
        this.container.position.y = offsetY * this.pixelsPerMeter;
        updateSurfaceFilter(this.surfaceFilter, {
            originX: screenOrigin.x,
            originY: screenOrigin.y - offsetY * screenScale,
            pixelsPerMeter: screenScale,
            lightShiftY: offsetY,
        });
    }

    /**
     * Pasa las luces del frame al filtro de materiales, sin redibujar nada. Las luces van en coordenadas del mundo físico.
     * @param {{data: Float32Array, count: number}} lightSet luces de `createLightSet`
     */
    setLights(lightSet) {
        setSurfaceFilterLights(this.surfaceFilter, lightSet);
    }

    /**
     * Compara la grieta y la rotura de cada rompible con las del frame anterior y las guarda.
     * @param {object[]} solids
     * @returns {boolean} verdadero si alguna cambió o cambió la cantidad de rompibles
     */
    breakableChanged(solids) {
        let changed = false;
        let count = 0;
        for (const solid of solids) {
            if (!solid.breakable) continue;
            const state = solid.broken ? BROKEN_STATE : (solid.crack ?? 0);
            if (this.breakableStates[count] !== state) {
                this.breakableStates[count] = state;
                changed = true;
            }
            count++;
        }
        if (count !== this.breakableCount) changed = true;
        this.breakableCount = count;
        return changed;
    }

    /**
     * Dibuja los sólidos fijos con el color codificado de cada material. Con terreno, los tramos que cambiaron
     * (`drawTerrainTiles`); sin terreno, los rectángulos de los sólidos por material, con relleno y trazo.
     */
    buildFixed(solids, terrainShape) {
        if (terrainShape) this.drawTerrainTiles(terrainShape);
        else this.drawRectangles(solids);
        this.redrawAll = false;
        this.fixedBuilds++;
    }

    /** Dibuja los sólidos sin grilla: por material, sus rectángulos con relleno y trazo. */
    drawRectangles(solids) {
        const graphics = this.fixedGraphics;
        graphics.clear();
        for (const surface of Object.keys(SURFACES)) {
            const ofSurface = solids.filter((solid) => !solid.breakable && surfaceOf(solid) === surface);
            if (ofSurface.length === 0) continue;
            for (const solid of ofSurface) this.addRectangle(graphics, solid, 0);
            graphics.fill({ color: encodeSurface({ surface, wear: 0 }) });
            graphics.stroke({ width: this.overlapWidth, color: encodeSurface({ surface, wear: 0 }) });
        }
    }

    /**
     * Redibuja los tramos del terreno cuya forma o desgaste cambió desde que se dibujaron.
     * @param {{tilesVersion: number, tiles: object[]}} terrainShape
     */
    drawTerrainTiles(terrainShape) {
        const { tiles } = terrainShape;
        if (terrainShape.tilesVersion !== this.tilesVersion) {
            this.syncTileGraphics(tiles);
            this.tilesVersion = terrainShape.tilesVersion;
        }
        const toDraw = this.tilesToDraw;
        toDraw.clear();
        for (const tile of tiles) {
            const entry = this.tileEntries.get(tile);
            const changed = entry.shapeVersion !== tile.shapeVersion || entry.wearVersion !== tile.wearVersion;
            if (this.redrawAll || changed) toDraw.add(tile);
        }
        for (const tile of toDraw) this.drawTile(tile);
    }

    /**
     * Da un `Graphics` a cada tramo nuevo (del pool si hay uno libre) y devuelve al pool el de cada tramo que ya no está.
     * @param {object[]} tiles tramos publicados
     */
    syncTileGraphics(tiles) {
        const present = new Set(tiles);
        for (const [tile, entry] of this.tileEntries) {
            if (present.has(tile)) continue;
            entry.graphics.clear();
            this.fixedContainer.removeChild(entry.graphics);
            this.freeGraphics.push(entry.graphics);
            this.tileEntries.delete(tile);
        }
        for (const tile of tiles) {
            if (this.tileEntries.has(tile)) continue;
            const graphics = this.freeGraphics.pop() ?? new PIXI.Graphics();
            this.fixedContainer.addChild(graphics);
            this.tileEntries.set(tile, { graphics, shapeVersion: -1, wearVersion: -1 });
        }
    }

    /**
     * Dibuja un tramo: sus contornos con los agujeros recortados, el trazo de solape con los tramos vecinos y las celdas con
     * desgaste (una forma por celda, agrupadas por nivel de desgaste).
     * @param {object} tile tramo publicado
     */
    drawTile(tile) {
        const entry = this.tileEntries.get(tile);
        const { graphics } = entry;
        const { surface, rings } = tile;
        graphics.clear();
        entry.shapeVersion = tile.shapeVersion;
        entry.wearVersion = tile.wearVersion;
        const outers = rings.filter((ring) => ringIsOuter(ring));
        if (outers.length === 0) return;
        this.addRings(graphics, outers);
        graphics.fill({ color: encodeSurface({ surface, wear: 0 }) });
        this.addRings(graphics, rings.filter((ring) => !ringIsOuter(ring)));
        graphics.cut();
        this.addRings(graphics, rings);
        graphics.stroke({ width: this.overlapWidth, color: encodeSurface({ surface, wear: 0 }) });
        this.drawWear(graphics, tile);
    }

    /** Pinta las celdas con desgaste de un tramo con su desgaste en el canal verde, un relleno por nivel de desgaste. */
    drawWear(graphics, tile) {
        const scale = this.pixelsPerMeter;
        tile.grid.forEachWornCell(this.collectWornCell);
        for (let level = 1; level <= WEAR_LEVELS; level++) {
            const bucket = this.wearBuckets[level];
            if (bucket.length === 0) continue;
            for (let index = 0; index < bucket.length; index += VALUES_PER_RECTANGLE) {
                graphics.rect(bucket[index] * scale, bucket[index + 1] * scale, bucket[index + 2] * scale, bucket[index + 3] * scale);
            }
            graphics.fill({ color: encodeSurface({ surface: tile.surface, wear: level / WEAR_LEVELS }) });
            bucket.length = 0;
        }
    }

    /** Agrega cada anillo (vértices intercalados en m) como un polígono cerrado. */
    addRings(graphics, rings) {
        const scale = this.pixelsPerMeter;
        for (const ring of rings) graphics.poly(ring.map((coordinate) => coordinate * scale), true);
    }
    /** Dibuja las plataformas rompibles que no están rotas: el color pasa al de advertencia y vibran con `crack`. */
    buildBreakable(solids, now) {
        const graphics = this.breakableGraphics;
        graphics.clear();
        for (const solid of solids) {
            if (!solid.breakable || solid.broken) continue;
            const crack = solid.crack ?? 0;
            const shake = crack > 0 ? Math.sin(now * BREAKABLE_SHAKE_RATE) * BREAKABLE_SHAKE * crack : 0;
            this.addRectangle(graphics, solid, shake);
            graphics.fill(mixColor(BREAKABLE_FILL, BREAKABLE_WARN, crack));
            graphics.stroke({ width: this.overlapWidth, color: BREAKABLE_STROKE });
        }
        this.breakableBuilds++;
    }

    addRectangle(graphics, solid, shake) {
        const scale = this.pixelsPerMeter;
        graphics.rect((solid.x - solid.w / 2 + shake) * scale, (solid.y - solid.h / 2) * scale, solid.w * scale, solid.h * scale);
    }
}
