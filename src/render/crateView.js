import { tintOf } from "../core/color.js";
import { createSurfaceFilter, encodeSurface, setSurfaceFilterLights, updateSurfaceFilter } from "./surfaceFilter.js";
import { createLabel } from "./labelText.js";
import { drawNut } from "./pickupView.js";

/** Material con que se pintan las cajas y sus pedazos: el acero de las plataformas (`docs/design/13-arte.md` §13.2). */
const CRATE_SURFACE = "steel";

/** Grosor del borde de la caja, en m: el canal azul lo marca para que el filtro lo aclare como el contorno de las plataformas. */
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
 * Tinte que escala el canal verde del color codificado del acero (que se dibuja con desgaste 1) por `wear`, de 0 a 1:
 * el filtro de `surfaceFilter.js` lee ese canal como el desgaste del material, y el rojo y el azul pasan sin cambio.
 * @param {number} wear 0 es acero limpio y 1 es el más oxidado
 * @returns {number} color `0xRRGGBB`
 */
function wearTint(wear) {
    const green = Math.round(wear * CHANNEL_MAX);
    return (CHANNEL_MAX << RED_SHIFT) | (green << GREEN_SHIFT) | CHANNEL_MAX;
}

/**
 * Dibuja un cuadrado de acero centrado en el origen del gráfico, con el color codificado del desgaste máximo para que `wearTint`
 * lo gradúe después sin volver a dibujar.
 * @param {PIXI.Graphics} graphics gráfico vacío
 * @param {number} side lado, en m
 * @param {number} pixelsPerMeter px por metro de la geometría
 */
function drawSteelSquare(graphics, side, pixelsPerMeter) {
    const half = (side / 2) * pixelsPerMeter;
    graphics
        .rect(-half, -half, 2 * half, 2 * half)
        .fill({ color: encodeSurface({ surface: CRATE_SURFACE, wear: 1, edge: false }) })
        .stroke({ width: EDGE_WIDTH_M * pixelsPerMeter, color: encodeSurface({ surface: CRATE_SURFACE, wear: 1, edge: true }) });
}

/**
 * Vista de las cajas (`docs/design/04-fluidos.md` §4.2, `docs/design/13-arte.md` §13.2) en modo retenido: cada caja y cada
 * pedazo es un `PIXI.Graphics` que se arma una vez y por frame solo cambia de posición, giro, tinte y visibilidad (Object Pool,
 * las entradas solo crecen cuando aparecen más cajas o pedazos que nunca). Cuerpo y pedazos cuelgan de la capa del nivel,
 * con su propio filtro de materiales (`createSurfaceFilter`), así se ven del acero de las plataformas con su luz; el desgaste
 * va en el tinte, de 0 (nueva) a 1 (a punto de romperse). Encima, en la capa superpuesta, el panel del color del arma con su
 * inicial, o la tuerca de la reparación, gira con la caja. No lee Box2D: recibe los datos planos de `Crates`.
 */
export class CrateView {
    /**
     * @param {object} options
     * @param {PIXI.Container} options.levelParent capa del nivel, en px a `pixelsPerMeter` con la cámara aplicada
     * @param {PIXI.Container} options.parent capa superpuesta, con la misma cámara
     * @param {number} options.pixelsPerMeter px por metro de la geometría
     * @param {object[]} options.weapons tabla de armas (`id`, `name`, `color`)
     * @param {number} options.crateSide lado de la caja, en m
     * @param {number} options.pieceSide lado de cada pedazo, en m
     */
    constructor({ levelParent, parent, pixelsPerMeter, weapons, crateSide, pieceSide }) {
        this.pixelsPerMeter = pixelsPerMeter;
        this.weapons = weapons;
        this.crateSide = crateSide;
        this.pieceSide = pieceSide;
        this.filter = createSurfaceFilter();
        this.bodyContainer = new PIXI.Container();
        this.bodyContainer.filters = [this.filter];
        levelParent.addChild(this.bodyContainer);
        this.panelContainer = new PIXI.Container();
        parent.addChild(this.panelContainer);
        this.crateEntries = [];
        this.pieceEntries = [];
    }

    /**
     * Pasa las luces del frame al filtro de materiales, sin redibujar nada.
     * @param {{data: Float32Array, count: number}} lightSet luces de `createLightSet`
     */
    setLights(lightSet) {
        setSurfaceFilterLights(this.filter, lightSet);
    }

    /**
     * Actualiza las cajas y los pedazos de este frame.
     * @param {object} frame
     * @param {{point: object, x: number, y: number, angle: number, wear: number}[]} frame.crates cajas, en m y rad
     * @param {{x: number, y: number, angle: number}[]} frame.pieces pedazos, en m y rad
     * @param {{x: number, y: number}} frame.screenOrigin px de pantalla del origen del mundo
     * @param {number} frame.screenScale px de pantalla por metro
     */
    update({ crates, pieces, screenOrigin, screenScale }) {
        updateSurfaceFilter(this.filter, { originX: screenOrigin.x, originY: screenOrigin.y, pixelsPerMeter: screenScale });
        const scale = this.pixelsPerMeter;
        for (let index = 0; index < crates.length; index++) {
            const crate = crates[index];
            const entry = this.crateEntryAt(index);
            if (entry.point !== crate.point) this.buildPanel(entry, crate.point);
            this.place(entry.body, crate, scale);
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
            const graphics = this.pieceAt(index);
            this.place(graphics, pieces[index], scale);
            graphics.visible = true;
        }
        for (let index = pieces.length; index < this.pieceEntries.length; index++) this.pieceEntries[index].visible = false;
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

    /** Entrada del pool de cajas en `index`: la crea con su cuerpo de acero, su panel y su letra la primera vez. */
    crateEntryAt(index) {
        if (this.crateEntries[index] === undefined) {
            const body = new PIXI.Graphics();
            drawSteelSquare(body, this.crateSide, this.pixelsPerMeter);
            this.bodyContainer.addChild(body);
            const panel = new PIXI.Container();
            this.panelContainer.addChild(panel);
            const panelGraphics = new PIXI.Graphics();
            panel.addChild(panelGraphics);
            const label = createLabel(panel, this.pixelsPerMeter);
            this.crateEntries[index] = { body, panel, panelGraphics, label, point: null, drawable: false };
        }
        return this.crateEntries[index];
    }

    /** Pedazo del pool en `index`: lo crea con su cuadrado de acero, desgastado al máximo, la primera vez. */
    pieceAt(index) {
        if (this.pieceEntries[index] === undefined) {
            const graphics = new PIXI.Graphics();
            drawSteelSquare(graphics, this.pieceSide, this.pixelsPerMeter);
            this.bodyContainer.addChild(graphics);
            this.pieceEntries[index] = graphics;
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
