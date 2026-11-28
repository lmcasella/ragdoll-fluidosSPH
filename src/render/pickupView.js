import { tintOf } from "../core/color.js";
import { TAU } from "../core/math/scalar.js";
import { createLabel } from "./labelText.js";

/** Radio del ícono de un arma recogible, en metros (el sensor mide 0,5 m). */
export const ICON_RADIUS_M = 0.4;

/** Grosor del borde del ícono, en m. */
const ICON_OUTLINE_M = 0.06;

/** Color del borde del ícono de un arma. */
const ICON_OUTLINE_COLOR = "#ffffff";

/**
 * Tuerca del ítem de reparación (#156): lados del hexágono, radio del agujero relativo al del ícono y colores `[r, g, b]`
 * del relleno y del borde.
 */
export const NUT = { sides: 6, hole: 0.4, fill: [190, 200, 210], edge: [80, 220, 120] };

/**
 * Dibuja la tuerca hexagonal de la reparación centrada en el origen del gráfico, con el agujero circular recortado del
 * relleno; el borde se traza aparte, después del recorte, para que `cut` no lo toque.
 * @param {PIXI.Graphics} graphics gráfico ya vaciado
 * @param {number} radius radio de la tuerca, en m
 * @param {number} pixelsPerMeter px por metro de la geometría
 */
export function drawNut(graphics, radius, pixelsPerMeter) {
    const corners = [];
    for (let side = 0; side < NUT.sides; side++) {
        const angle = (TAU * side) / NUT.sides;
        corners.push(Math.cos(angle) * radius * pixelsPerMeter, Math.sin(angle) * radius * pixelsPerMeter);
    }
    graphics
        .poly(corners)
        .fill({ color: tintOf(...NUT.fill) })
        .circle(0, 0, radius * NUT.hole * pixelsPerMeter)
        .cut();
    graphics.poly(corners).stroke({ width: ICON_OUTLINE_M * pixelsPerMeter, color: tintOf(...NUT.edge) });
}

/**
 * Íconos de los puntos de aparición, como `PIXI.Graphics` que se arman una vez por punto y después solo se muestran, ocultan o
 * mueven (`docs/design/04-fluidos.md` §4.2, `docs/design/07-sph.md` §7.4). Cada punto es un círculo del color del arma con su
 * inicial, o una tuerca hexagonal con agujero para el ítem de reparación. Los puntos inactivos (esperando reaparecer o dentro
 * de una caja) se ocultan, y cada nodo sigue la posición actual de su punto, que cambia cuando una caja se rompe en otro lugar.
 * Las entradas se reutilizan entre frames (Object Pool) y solo crecen cuando aparecen más puntos que nunca.
 */
export class PickupView {
    /**
     * @param {object} options
     * @param {PIXI.Container} options.parent contenedor superpuesto, en px a `pixelsPerMeter` con la cámara aplicada
     * @param {number} options.pixelsPerMeter px por metro de la geometría
     * @param {object[]} options.weapons tabla de armas (`id`, `name`, `color`)
     */
    constructor({ parent, pixelsPerMeter, weapons }) {
        this.pixelsPerMeter = pixelsPerMeter;
        this.weapons = weapons;
        this.container = new PIXI.Container();
        parent.addChild(this.container);
        this.entries = [];
    }

    /**
     * Actualiza los íconos de este frame. Un ícono se vuelve a armar solo si su entrada pasó a otro punto.
     * @param {object[]} points puntos `{ x, y, weapon, kind, active }` en m
     * @param {number} offsetY desplazamiento vertical de los puntos (el mapa del ascenso baja), en m
     */
    update(points, offsetY) {
        this.container.position.y = offsetY * this.pixelsPerMeter;
        for (let index = 0; index < points.length; index++) {
            const entry = this.entryAt(index);
            if (entry.point !== points[index]) this.build(entry, points[index]);
            entry.node.visible = entry.drawable && points[index].active;
            entry.node.position.set(points[index].x * this.pixelsPerMeter, points[index].y * this.pixelsPerMeter);
        }
        for (let index = points.length; index < this.entries.length; index++) this.entries[index].node.visible = false;
    }

    /**
     * Entrada del pool en `index`: la crea con su gráfico y su letra la primera vez.
     * @param {number} index
     */
    entryAt(index) {
        if (this.entries[index] === undefined) {
            const node = new PIXI.Container();
            this.container.addChild(node);
            const graphics = new PIXI.Graphics();
            node.addChild(graphics);
            const label = createLabel(node, this.pixelsPerMeter);
            this.entries[index] = { node, graphics, label, point: null, drawable: false };
        }
        return this.entries[index];
    }

    /**
     * Arma el ícono de `point` en la entrada: la tuerca para la reparación, o el círculo con la inicial del arma.
     * Un punto con un arma que no está en la tabla no se dibuja.
     * @param {object} entry entrada del pool
     * @param {object} point punto de aparición
     */
    build(entry, point) {
        const scale = this.pixelsPerMeter;
        const { graphics, label } = entry;
        entry.point = point;
        graphics.clear();
        label.visible = false;
        entry.drawable = true;
        if (point.kind === "repair") {
            drawNut(graphics, ICON_RADIUS_M, scale);
            return;
        }
        const weapon = this.weapons.find((candidate) => candidate.id === point.weapon);
        if (!weapon) {
            entry.drawable = false;
            return;
        }
        const [red, green, blue] = weapon.color;
        graphics
            .circle(0, 0, ICON_RADIUS_M * scale)
            .fill({ color: tintOf(red, green, blue) })
            .stroke({ width: ICON_OUTLINE_M * scale, color: ICON_OUTLINE_COLOR });
        label.text = weapon.name[0];
        label.visible = true;
    }
}
