import { tintOf } from "../core/color.js";
import { createSurfaceFilter, encodeSurface, setSurfaceFilterLights, updateSurfaceFilter, updateSurfaceFilterFrame } from "./surfaceFilter.js";
import { createLabel } from "./labelText.js";
import { drawNut } from "./pickupView.js";

/** Material con que se pintan las cajas y sus pedazos: la madera, dibujada en el marco de cada caja (`docs/design/13-arte.md` §13.2). */
const CRATE_SURFACE = "wood";

/** Grosor del borde de la caja, en m: tapa las uniones entre el relleno y el borde que come el filtro. */
const EDGE_WIDTH_M = 0.04;

/** Valor máximo de un canal de color de 8 bits. */
const CHANNEL_MAX = 255;

/** Bits que se desplaza el canal verde dentro de un color de 24 bits. */
const GREEN_SHIFT = 8;

/** Bits que se desplaza el canal rojo dentro de un color de 24 bits. */
const RED_SHIFT = 16;

/** Lado del panel del color del arma, en m (la caja mide 0,7 m). */
const PANEL_SIDE_M = 0.42;

/** Grosor del borde del panel, en m. */
const PANEL_OUTLINE_M = 0.04;

/** Color del borde del panel. */
const PANEL_OUTLINE_COLOR = "#ffffff";

/** Radio de la tuerca de la reparación sobre la caja, en m. */
const PANEL_NUT_RADIUS_M = 0.24;

/**
 * Tinte que escala el canal verde del color codificado de la madera (que se dibuja con desgaste 1) por `wear`, de 0 a 1:
 * el filtro de `surfaceFilter.js` lee ese canal como el desgaste del material, y el rojo pasa sin cambio.
 * @param {number} wear 0 es madera limpia y 1 es la más quemada
 * @returns {number} color `0xRRGGBB`
 */
function wearTint(wear) {
    const green = Math.round(wear * CHANNEL_MAX);
    return (CHANNEL_MAX << RED_SHIFT) | (green << GREEN_SHIFT) | CHANNEL_MAX;
}

/**
 * Dibuja un rectángulo de madera centrado en el origen del gráfico, con el color codificado del desgaste máximo para que
 * `wearTint` lo gradúe después sin volver a dibujar.
 * @param {PIXI.Graphics} graphics gráfico vacío
 * @param {{width: number, height: number}} size ancho y alto, en m
 * @param {number} pixelsPerMeter px por metro de la geometría
 */
function drawWoodRectangle(graphics, size, pixelsPerMeter) {
    const halfWidth = (size.width / 2) * pixelsPerMeter;
    const halfHeight = (size.height / 2) * pixelsPerMeter;
    graphics
        .rect(-halfWidth, -halfHeight, 2 * halfWidth, 2 * halfHeight)
        .fill({ color: encodeSurface({ surface: CRATE_SURFACE, wear: 1 }) })
        .stroke({ width: EDGE_WIDTH_M * pixelsPerMeter, color: encodeSurface({ surface: CRATE_SURFACE, wear: 1 }) });
}

/**
 * Vista de las cajas (`docs/design/04-fluidos.md` §4.2, `docs/design/13-arte.md` §13.2) en modo retenido: cada caja y cada
 * pedazo es un `PIXI.Graphics` que se arma una vez y por frame solo cambia de posición, giro, tinte y visibilidad (Object Pool,
 * las entradas solo crecen cuando aparecen más cajas o pedazos que nunca). Cuerpo y pedazos cuelgan de la capa del nivel y
 * cada uno lleva su propio filtro de materiales (`createSurfaceFilter`), creado con la entrada: la madera se dibuja en el marco
 * local del cuerpo (`updateSurfaceFilterFrame`), así la veta y los listones se mueven y giran con él, con la luz del escenario.
 * Un pedazo muestra su tramo de la caja entera (su desplazamiento dentro de ella). El desgaste va en el tinte, de 0 (nueva)
 * a 1 (a punto de romperse). Encima, en la capa superpuesta, el panel del color del arma con su inicial, o la tuerca de la
 * reparación, gira con la caja. No lee Box2D: recibe los datos planos de `Crates`.
 */
export class CrateView {
    /**
     * @param {object} options
     * @param {PIXI.Container} options.levelParent capa del nivel, en px a `pixelsPerMeter` con la cámara aplicada
     * @param {PIXI.Container} options.parent capa superpuesta, con la misma cámara
     * @param {number} options.pixelsPerMeter px por metro de la geometría
     * @param {object[]} options.weapons tabla de armas (`id`, `name`, `color`)
     * @param {number} options.crateSide lado de la caja, en m
     * @param {{width: number, height: number}} options.pieceSize ancho y alto de cada pedazo, en m
     * @param {(filter: PIXI.Filter) => void} options.registerOccluder recibe cada filtro de material al crearse, para que el mapa de luz lo apague al dibujar la oclusión
     */
    constructor({ levelParent, parent, pixelsPerMeter, weapons, crateSide, pieceSize, registerOccluder }) {
        this.pixelsPerMeter = pixelsPerMeter;
        this.weapons = weapons;
        this.crateSide = crateSide;
        this.pieceSize = pieceSize;
        this.registerOccluder = registerOccluder;
        this.lightSet = null;
        this.camera = { originX: 0, originY: 0, pixelsPerMeter: 1 };
        this.frame = { centerX: 0, centerY: 0, angle: 0, offsetX: 0, offsetY: 0 };
        this.bodyContainer = new PIXI.Container();
        levelParent.addChild(this.bodyContainer);
        this.panelContainer = new PIXI.Container();
        parent.addChild(this.panelContainer);
        this.crateEntries = [];
        this.pieceEntries = [];
    }

    /**
     * Guarda las luces del frame: `update` se las pasa a cada filtro en uso, sin redibujar nada.
     * @param {{data: Float32Array, count: number}} lightSet luces de `createLightSet`
     */
    setLights(lightSet) {
        this.lightSet = lightSet;
    }

    /**
     * Actualiza las cajas y los pedazos de este frame.
     * @param {object} frame
     * @param {{point: object, x: number, y: number, angle: number, wear: number}[]} frame.crates cajas, en m y rad
     * @param {{x: number, y: number, angle: number, offsetX: number, offsetY: number}[]} frame.pieces pedazos, en m y rad; el desplazamiento es su posición dentro de la caja entera
     * @param {{x: number, y: number}} frame.screenOrigin px de pantalla del origen del mundo
     * @param {number} frame.screenScale px de pantalla por metro
     */
    update({ crates, pieces, screenOrigin, screenScale }) {
        this.camera.originX = screenOrigin.x;
        this.camera.originY = screenOrigin.y;
        this.camera.pixelsPerMeter = screenScale;
        const scale = this.pixelsPerMeter;
        for (let index = 0; index < crates.length; index++) {
            const crate = crates[index];
            const entry = this.crateEntryAt(index);
            if (entry.point !== crate.point) this.buildPanel(entry, crate.point);
            this.place(entry.body, crate, scale);
            this.shade(entry.filter, crate);
            entry.body.tint = wearTint(crate.wear);
            this.place(entry.panel, crate, scale);
            entry.body.visible = true;
            entry.panel.visible = entry.drawable;
        }
        for (let index = crates.length; index < this.crateEntries.length; index++) {
            this.crateEntries[index].body.visible = false;
            this.crateEntries[index].panel.visible = false;
        }
        for (let index = 0; index < pieces.length; index++) {
            const entry = this.pieceEntryAt(index);
            this.place(entry.graphics, pieces[index], scale);
            this.shade(entry.filter, pieces[index]);
            entry.graphics.visible = true;
        }
        for (let index = pieces.length; index < this.pieceEntries.length; index++) this.pieceEntries[index].graphics.visible = false;
    }

    /**
     * Pone el nodo en la posición y el giro de `item`.
     * @param {PIXI.Container} node
     * @param {{x: number, y: number, angle: number}} item en m y rad
     * @param {number} scale px por metro
     */
    place(node, item, scale) {
        node.position.set(item.x * scale, item.y * scale);
        node.rotation = item.angle;
    }

    /**
     * Pasa al filtro la cámara, la luz y el marco local de `item`.
     * @param {PIXI.Filter} filter filtro de la entrada
     * @param {{x: number, y: number, angle: number, offsetX?: number, offsetY?: number}} item en m y rad
     */
    shade(filter, item) {
        updateSurfaceFilter(filter, this.camera);
        if (this.lightSet) setSurfaceFilterLights(filter, this.lightSet);
        this.frame.centerX = item.x;
        this.frame.centerY = item.y;
        this.frame.angle = item.angle;
        this.frame.offsetX = item.offsetX ?? 0;
        this.frame.offsetY = item.offsetY ?? 0;
        updateSurfaceFilterFrame(filter, this.frame);
    }

    /**
     * Gráfico de madera de `size` con su propio filtro, ya agregado a la capa del nivel.
     * @param {{width: number, height: number}} size ancho y alto, en m
     * @returns {{graphics: PIXI.Graphics, filter: PIXI.Filter}}
     */
    createWoodNode(size) {
        const graphics = new PIXI.Graphics();
        drawWoodRectangle(graphics, size, this.pixelsPerMeter);
        const filter = createSurfaceFilter();
        graphics.filters = [filter];
        this.registerOccluder(filter);
        this.bodyContainer.addChild(graphics);
        return { graphics, filter };
    }

    /** Entrada del pool de cajas en `index`: la crea con su cuerpo de madera, su filtro, su panel y su letra la primera vez. */
    crateEntryAt(index) {
        if (this.crateEntries[index] === undefined) {
            const { graphics: body, filter } = this.createWoodNode({ width: this.crateSide, height: this.crateSide });
            const panel = new PIXI.Container();
            this.panelContainer.addChild(panel);
            const panelGraphics = new PIXI.Graphics();
            panel.addChild(panelGraphics);
            const label = createLabel(panel, this.pixelsPerMeter);
            this.crateEntries[index] = { body, filter, panel, panelGraphics, label, point: null, drawable: false };
        }
        return this.crateEntries[index];
    }

    /** Pedazo del pool en `index`: lo crea con su tabla de madera, desgastada al máximo, y su filtro la primera vez. */
    pieceEntryAt(index) {
        if (this.pieceEntries[index] === undefined) {
            const { graphics, filter } = this.createWoodNode(this.pieceSize);
            this.pieceEntries[index] = { graphics, filter };
        }
        return this.pieceEntries[index];
    }

    /**
     * Arma el panel de la entrada para el ítem de `point`: la tuerca de la reparación, o el cuadrado del color del arma con su
     * inicial. Un arma que no está en la tabla no dibuja panel.
     * @param {object} entry entrada del pool
     * @param {object} point punto de aparición de `Pickups`
     */
    buildPanel(entry, point) {
        const { panelGraphics, label } = entry;
        const scale = this.pixelsPerMeter;
        entry.point = point;
        panelGraphics.clear();
        label.visible = false;
        entry.drawable = true;
        if (point.kind === "repair") {
            drawNut(panelGraphics, PANEL_NUT_RADIUS_M, scale);
            return;
        }
        const weapon = this.weapons.find((candidate) => candidate.id === point.weapon);
        if (!weapon) {
            entry.drawable = false;
            return;
        }
        const [red, green, blue] = weapon.color;
        const half = (PANEL_SIDE_M / 2) * scale;
        panelGraphics
            .rect(-half, -half, 2 * half, 2 * half)
            .fill({ color: tintOf(red, green, blue) })
            .stroke({ width: PANEL_OUTLINE_M * scale, color: PANEL_OUTLINE_COLOR });
        label.text = weapon.name[0];
        label.visible = true;
    }
}
