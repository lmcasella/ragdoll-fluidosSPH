import { lerp } from "../core/math/scalar.js";
import { pointInPolygon } from "../core/math/ringNesting.js";
import { SURFACES, surfaceOf } from "../level/surfaces.js";
import { createSurfaceFilter, encodeSurface, updateSurfaceFilter } from "./surfaceFilter.js";

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

/** Grosor del trazo de los sólidos en pantalla, en px: no cambia con el zoom, como en el dibujo en Canvas 2D. */
const OUTLINE_SCREEN_PX = 2;

/** Cambio relativo del grosor del trazo (en la geometría) a partir del cual se reconstruye el nivel para seguir el zoom. */
const OUTLINE_REBUILD_TOLERANCE = 0.1;

/** Valores por vértice en un anillo intercalado: x e y. */
const VALUES_PER_VERTEX = 2;

/** Estado que se guarda de una plataforma rota para detectar cuándo cambia (las intactas guardan su `crack`, de 0 a 1). */
const BROKEN_STATE = -1;

/** Distancia del punto de prueba al medio de un lado, hacia afuera del anillo, en m: menos que una celda de la grilla. */
const SEAM_PROBE = 0.001;

/** Niveles de desgaste que distingue el canal verde del color codificado: las celdas del mismo nivel se dibujan juntas. */
const WEAR_LEVELS = 255;

/**
 * Caja de un anillo intercalado, en m.
 * @param {number[]} ring
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}}
 */
function ringBounds(ring) {
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (let index = 0; index < ring.length; index += VALUES_PER_VERTEX) {
        bounds.minX = Math.min(bounds.minX, ring[index]);
        bounds.maxX = Math.max(bounds.maxX, ring[index]);
        bounds.minY = Math.min(bounds.minY, ring[index + 1]);
        bounds.maxY = Math.max(bounds.maxY, ring[index + 1]);
    }
    return bounds;
}

/**
 * Lados de los anillos del terreno que dan afuera, como `[x1, y1, x2, y2]` en m. Un lado es costura entre dos tramos si
 * el punto apenas afuera de su medio (a la derecha del lado: afuera de un externo y adentro de un agujero) cae dentro
 * de materia de otro anillo, por la regla par-impar sobre los demás anillos; esos lados no se trazan.
 * @param {number[][]} rings externos y agujeros, vértices intercalados en m
 * @returns {number[][]} `[x1, y1, x2, y2, ringIndex]`, con el índice del anillo al que pertenece el lado
 */
function exposedEdges(rings) {
    const bounds = rings.map(ringBounds);
    const insideOtherMaterial = (x, y, self) => {
        let inside = false;
        rings.forEach((ring, index) => {
            const box = bounds[index];
            if (index === self || x < box.minX || x > box.maxX || y < box.minY || y > box.maxY) return;
            if (pointInPolygon(x, y, ring)) inside = !inside;
        });
        return inside;
    };
    const edges = [];
    rings.forEach((ring, self) => {
        for (let index = 0; index < ring.length; index += VALUES_PER_VERTEX) {
            const next = (index + VALUES_PER_VERTEX) % ring.length;
            const [x1, y1, x2, y2] = [ring[index], ring[index + 1], ring[next], ring[next + 1]];
            const length = Math.hypot(x2 - x1, y2 - y1);
            if (length === 0) continue;
            const probeX = (x1 + x2) / 2 + ((y2 - y1) / length) * SEAM_PROBE;
            const probeY = (y1 + y2) / 2 - ((x2 - x1) / length) * SEAM_PROBE;
            if (!insideOtherMaterial(probeX, probeY, self)) edges.push([x1, y1, x2, y2, self]);
        }
    });
    return edges;
}

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
 * Vista del nivel: sólidos fijos con el filtro de materiales y plataformas rompibles aparte. Patrón: vista de PIXI en
 * modo retenido (crea sus `Graphics` y su filtro una sola vez).
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
        this.fixedGraphics = new PIXI.Graphics();
        this.surfaceFilter = createSurfaceFilter();
        this.fixedGraphics.filters = [this.surfaceFilter];
        this.breakableGraphics = new PIXI.Graphics();
        this.container.addChild(this.fixedGraphics, this.breakableGraphics);
        parent.addChild(this.container);
        this.solids = null;
        this.solidCount = -1;
        this.shapeVersion = -1;
        this.outlineWidth = 0;
        this.breakableStates = [];
        this.breakableCount = -1;
        this.fixedBuilds = 0;
        this.breakableBuilds = 0;
    }

    /**
     * Reconstruye la geometría solo si cambió: los sólidos fijos cuando cambia el conjunto de sólidos y los rompibles
     * cuando cambia su grieta o su rotura, y las dos cuando el zoom cambia el grosor del trazo más que `OUTLINE_REBUILD_TOLERANCE`.
     * El desplazamiento vertical se aplica como posición, sin reconstruir.
     * @param {{ solids: object[] }} level sólidos en metros (`x`, `y`, `w`, `h` del centro)
     * @param {number} offsetY desplazamiento vertical del nivel, en m
     * @param {number} now reloj de juego, en s (fase de la vibración)
     * @param {number} screenScale escala de la cámara, en px de pantalla por metro
     * @param {{version: number, rings: number[][], ringSurfaces: string[], wornCells: object[]}|null} [terrainShape]
     * contornos del terreno de densidad en m (externos de área positiva, agujeros de área negativa) con su material y su
     * versión, y celdas con desgaste; con ellos los sólidos fijos se dibujan con su forma real, y sin ellos como
     * rectángulos (`docs/design/05-escenario.md` §5.5). El desgaste solo cambia junto con la versión.
     * @param {{x: number, y: number}} [screenOrigin] px de pantalla del origen del mundo, para fijar la textura al mundo
     */
    update(level, offsetY, now, screenScale, terrainShape = null, screenOrigin = { x: 0, y: 0 }) {
        const { solids } = level;
        const outlineWidth = (OUTLINE_SCREEN_PX * this.pixelsPerMeter) / screenScale;
        if (Math.abs(outlineWidth - this.outlineWidth) > this.outlineWidth * OUTLINE_REBUILD_TOLERANCE) {
            this.outlineWidth = outlineWidth;
            this.solidCount = -1;
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
        });
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
     * Dibuja los sólidos fijos con el color codificado de cada material: por material, un relleno y un trazo. Con terreno,
     * los contornos con sus agujeros recortados, las celdas con desgaste (una forma por celda, agrupadas por nivel de
     * desgaste) y el trazo de los lados expuestos, sin las costuras entre tramos; sin terreno, los rectángulos.
     */
    buildFixed(solids, terrainShape) {
        const graphics = this.fixedGraphics;
        graphics.clear();
        const edges = terrainShape ? exposedEdges(terrainShape.rings) : [];
        for (const surface of Object.keys(SURFACES)) {
            if (terrainShape) this.drawTerrainSurface(graphics, surface, terrainShape, edges);
            else this.drawRectangleSurface(graphics, surface, solids);
        }
        this.fixedBuilds++;
    }

    /** Dibuja los sólidos sin grilla de un material: sus rectángulos con relleno y trazo. */
    drawRectangleSurface(graphics, surface, solids) {
        const ofSurface = solids.filter((solid) => !solid.breakable && surfaceOf(solid) === surface);
        if (ofSurface.length === 0) return;
        for (const solid of ofSurface) this.addRectangle(graphics, solid, 0);
        graphics.fill({ color: encodeSurface({ surface, wear: 0, edge: false }) });
        graphics.stroke({ width: this.outlineWidth, color: encodeSurface({ surface, wear: 0, edge: true }) });
    }

    /** Dibuja los contornos, el desgaste y el trazo de los lados expuestos (`edges`) de los tramos de terreno de un material. */
    drawTerrainSurface(graphics, surface, terrainShape, edges) {
        const { rings, ringSurfaces, wornCells } = terrainShape;
        const ofSurface = rings.filter((ring, index) => ringSurfaces[index] === surface);
        const outers = ofSurface.filter((ring) => ringIsOuter(ring));
        if (outers.length === 0) return;
        this.addRings(graphics, outers);
        graphics.fill({ color: encodeSurface({ surface, wear: 0, edge: false }) });
        this.addRings(graphics, ofSurface.filter((ring) => !ringIsOuter(ring)));
        graphics.cut();
        this.drawWear(graphics, surface, wornCells);
        const scale = this.pixelsPerMeter;
        for (const [x1, y1, x2, y2, ringIndex] of edges) {
            if (ringSurfaces[ringIndex] === surface) graphics.moveTo(x1 * scale, y1 * scale).lineTo(x2 * scale, y2 * scale);
        }
        graphics.stroke({ width: this.outlineWidth, color: encodeSurface({ surface, wear: 0, edge: true }) });
    }

    /** Pinta las celdas con desgaste de un material con su desgaste en el canal verde, un relleno por nivel de desgaste. */
    drawWear(graphics, surface, wornCells) {
        const scale = this.pixelsPerMeter;
        const cellsByLevel = new Map();
        for (const cell of wornCells) {
            if (cell.surface !== surface) continue;
            const level = Math.round(cell.wear * WEAR_LEVELS);
            if (level === 0) continue;
            if (!cellsByLevel.has(level)) cellsByLevel.set(level, []);
            cellsByLevel.get(level).push(cell);
        }
        for (const [level, cells] of cellsByLevel) {
            for (const { x, y, width, height } of cells) graphics.rect(x * scale, y * scale, width * scale, height * scale);
            graphics.fill({ color: encodeSurface({ surface, wear: level / WEAR_LEVELS, edge: false }) });
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
            graphics.stroke({ width: this.outlineWidth, color: BREAKABLE_STROKE });
        }
        this.breakableBuilds++;
    }

    addRectangle(graphics, solid, shake) {
        const scale = this.pixelsPerMeter;
        graphics.rect((solid.x - solid.w / 2 + shake) * scale, (solid.y - solid.h / 2) * scale, solid.w * scale, solid.h * scale);
    }
}
