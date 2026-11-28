import { tintOf } from "../core/color.js";
import { TAU, lerp } from "../core/math/scalar.js";
import { drawWrench } from "./itemShapes.js";

/** Grosor del borde de la tuerca, en m. */
const NUT_OUTLINE_M = 0.06;

/**
 * Tuerca del ítem de reparación (#156): lados del hexágono, radio del agujero relativo al del ícono y colores `[r, g, b]`
 * del relleno y del borde.
 */
export const NUT = { sides: 6, hole: 0.4, fill: [190, 200, 210], edge: [80, 220, 120] };

/**
 * Aspecto y movimiento de los ítems sueltos (`docs/design/04-fluidos.md` §4.2). Distancias en m, tiempos en s, colores `[r, g, b]`
 * de 0 a 255 y opacidades de 0 a 1.
 * - `bob`: el ítem sube y baja `amplitude` con el `period` dado;
 * - `bottle`: el frasco de los líquidos. Ancho y alto del cuerpo, alto del hombro, ancho y alto del cuello, ancho y alto de la
 *   tapa, grosor de la pared de vidrio, color y opacidad del vidrio, color y grosor de su borde, color de la tapa y la parte
 *   del interior que llena el líquido (`fillShare`, de 0 a 1);
 * - `liquid`: la superficie del líquido son `crestCount` crestas (círculos de `crestRadius`) que suben y bajan desfasadas; las
 *   burbujas se aclaran hacia el blanco `bubbleLighten` (de 0 a 1). `materials` da por material (la clave `material` del punto: `WATER`, `HONEY`, `LAVA` o `ACID`; el color sale del punto): `waveAmplitude` y `wavePeriod` de la superficie, y opcionalmente `glow` (el líquido oscurece hasta
 *   `depth`, de 0 a 1, y vuelve cada `period`) y `bubbles` (`count` burbujas de `radius` que suben cada `period`);
 * - `repair`: la tuerca de `nutRadius`, la llave de `wrenchLength` y `wrenchColor` que da una vuelta cada `wrenchTurnPeriod`, y
 *   el halo de `haloRadius`, `haloAlpha` y el color `NUT.edge`.
 */
export const ITEM_ICON = {
    bob: { amplitude: 0.08, period: 2 },
    bottle: {
        bodyWidth: 0.44,
        bodyHeight: 0.5,
        shoulderHeight: 0.08,
        neckWidth: 0.2,
        neckHeight: 0.1,
        capWidth: 0.28,
        capHeight: 0.1,
        wall: 0.03,
        glassColor: [210, 235, 255],
        glassAlpha: 0.3,
        outlineColor: [235, 245, 255],
        outlineWidth: 0.03,
        capColor: [110, 80, 55],
        fillShare: 0.65,
    },
    liquid: {
        crestCount: 5,
        crestRadius: 0.05,
        bubbleLighten: 0.5,
        materials: {
            WATER: { wavePeriod: 0.6, waveAmplitude: 0.06 },
            HONEY: { wavePeriod: 3, waveAmplitude: 0.025 },
            LAVA: { wavePeriod: 1.4, waveAmplitude: 0.03, glow: { period: 1.2, depth: 0.35 }, bubbles: { count: 3, period: 1.6, radius: 0.03 } },
            ACID: { wavePeriod: 1, waveAmplitude: 0.04, bubbles: { count: 4, period: 1.1, radius: 0.025 } },
        },
    },
    repair: { nutRadius: 0.3, wrenchLength: 0.75, wrenchColor: [60, 80, 110], wrenchTurnPeriod: 3, haloRadius: 0.5, haloAlpha: 0.3 },
};

/** Mayor cantidad de burbujas que lleva un material de `ITEM_ICON.liquid.materials`: las que se crean por ítem. */
const BUBBLE_SLOTS = Math.max(0, ...Object.values(ITEM_ICON.liquid.materials).map((material) => material.bubbles?.count ?? 0));

/** Parte del ancho útil del interior que separa a una burbuja de la siguiente (la razón áurea), para repartirlas sin patrón. */
const BUBBLE_SPREAD = 0.618;

/** Valor máximo de un canal de color de 8 bits. */
const COLOR_CHANNEL_MAX = 255;

/** Mitad: pasa un ancho a su semiancho y un seno de [-1, 1] a [0, 1]. */
const HALF = 0.5;

/**
 * Medidas del frasco sobre su centro, en m: alturas (`bottom`, `bodyTop`, `neckBottom`, `neckTop`, `capTop`) y el nivel y el
 * semiancho útil del líquido.
 * @param {typeof ITEM_ICON.bottle} bottle
 * @returns {object}
 */
function bottleGeometry(bottle) {
    const totalHeight = bottle.bodyHeight + bottle.shoulderHeight + bottle.neckHeight + bottle.capHeight;
    const bottom = -totalHeight * HALF;
    const bodyTop = bottom + bottle.bodyHeight;
    const neckBottom = bodyTop + bottle.shoulderHeight;
    const neckTop = neckBottom + bottle.neckHeight;
    const innerBottom = bottom + bottle.wall;
    const innerHeight = bottle.bodyHeight - 2 * bottle.wall;
    return {
        bottom,
        bodyTop,
        neckBottom,
        neckTop,
        capTop: neckTop + bottle.capHeight,
        innerBottom,
        liquidLevel: innerBottom + innerHeight * bottle.fillShare,
        innerHalfWidth: bottle.bodyWidth * HALF - bottle.wall,
    };
}

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
    graphics.poly(corners).stroke({ width: NUT_OUTLINE_M * pixelsPerMeter, color: tintOf(...NUT.edge) });
}

/**
 * Íconos de los puntos de aparición, como nodos de PIXI que se arman una vez por entrada y por frame solo cambian de posición,
 * giro, color y visibilidad (`docs/design/04-fluidos.md` §4.2, `docs/design/07-sph.md` §7.4). Un punto de arma es un frasco
 * de vidrio con el líquido del color del punto que sube y baja; su superficie y sus burbujas se mueven según el material (agua
 * que se agita, miel lenta, lava que brilla y burbujea, ácido que burbujea). El ítem de reparación es una tuerca con una llave
 * que gira y un halo verde. Los valores salen de `ITEM_ICON`. Los puntos inactivos (esperando reaparecer o dentro de una caja)
 * se ocultan, y cada nodo sigue la posición actual de su punto, que cambia cuando una caja se rompe en otro lugar. Las
 * entradas se reutilizan entre frames (Object Pool) y solo crecen cuando aparecen más puntos que nunca; cambiar el punto de
 * una entrada solo repinta los colores. No importa sistemas del juego: la raíz de composición le pasa los datos planos de cada punto, con la clave y el color de su líquido, y el tiempo de animación entra en `update`.
 */
export class PickupView {
    /**
     * @param {object} options
     * @param {PIXI.Container} options.parent contenedor superpuesto, en px a `pixelsPerMeter` con la cámara aplicada
     * @param {number} options.pixelsPerMeter px por metro de la geometría
     */
    constructor({ parent, pixelsPerMeter }) {
        this.pixelsPerMeter = pixelsPerMeter;
        this.geometry = bottleGeometry(ITEM_ICON.bottle);
        this.container = new PIXI.Container();
        parent.addChild(this.container);
        this.entries = [];
    }

    /**
     * Actualiza los íconos de este frame. Un ícono se vuelve a armar solo si su entrada pasó a otro punto.
     * @param {object[]} points puntos `{ x, y, kind, material, color, active }` en m: `material` es la clave del líquido en `ITEM_ICON.liquid.materials` y `color` el `[r, g, b]` del líquido, ambos `null` en la reparación
     * @param {number} offsetY desplazamiento vertical de los puntos (el mapa del ascenso baja), en m
     * @param {number} time reloj de la animación, en s
     */
    update(points, offsetY, time) {
        this.container.position.y = offsetY * this.pixelsPerMeter;
        for (let index = 0; index < points.length; index++) {
            const entry = this.entryAt(index);
            if (entry.point !== points[index]) this.build(entry, points[index]);
            entry.node.visible = entry.drawable && points[index].active;
            entry.node.position.set(points[index].x * this.pixelsPerMeter, points[index].y * this.pixelsPerMeter);
            if (entry.node.visible) this.animate(entry, time);
        }
        for (let index = points.length; index < this.entries.length; index++) this.entries[index].node.visible = false;
    }

    /**
     * Entrada del pool en `index`: la crea con todas sus partes (frasco con líquido, crestas, burbujas, vidrio y tapa; halo,
     * tuerca y llave) la primera vez; `build` decide cuáles se ven.
     * @param {number} index
     */
    entryAt(index) {
        if (this.entries[index] === undefined) {
            const node = new PIXI.Container();
            this.container.addChild(node);
            const bottle = new PIXI.Container();
            node.addChild(bottle);
            const liquid = new PIXI.Graphics();
            bottle.addChild(liquid);
            const crests = Array.from({ length: ITEM_ICON.liquid.crestCount }, () => bottle.addChild(new PIXI.Graphics()));
            const bubbles = Array.from({ length: BUBBLE_SLOTS }, () => bottle.addChild(new PIXI.Graphics()));
            const glass = new PIXI.Graphics();
            bottle.addChild(glass);
            const cap = new PIXI.Graphics();
            bottle.addChild(cap);
            const repair = new PIXI.Container();
            node.addChild(repair);
            const halo = new PIXI.Graphics();
            repair.addChild(halo);
            const nut = new PIXI.Graphics();
            repair.addChild(nut);
            const wrench = new PIXI.Graphics();
            repair.addChild(wrench);
            this.entries[index] = { node, bottle, liquid, crests, bubbles, glass, cap, repair, halo, nut, wrench, point: null, drawable: false, material: null };
        }
        return this.entries[index];
    }

    /**
     * Arma el ícono de `point` en la entrada: la tuerca con su llave y su halo para la reparación, o el frasco con el líquido
     * del color del punto. Un punto sin color o con un material sin animación de líquido no se dibuja.
     * @param {object} entry entrada del pool
     * @param {object} point punto de aparición
     */
    build(entry, point) {
        entry.point = point;
        entry.material = null;
        entry.drawable = true;
        entry.bottle.visible = false;
        entry.repair.visible = false;
        if (point.kind === "repair") {
            this.buildRepair(entry);
            return;
        }
        const material = ITEM_ICON.liquid.materials[point.material];
        if (!point.color || !material) {
            entry.drawable = false;
            return;
        }
        entry.material = material;
        this.buildBottle(entry, point.color, material);
    }

    /** Pinta la tuerca, la llave y el halo de la reparación y los muestra. */
    buildRepair(entry) {
        const { nutRadius, wrenchLength, wrenchColor, haloRadius, haloAlpha } = ITEM_ICON.repair;
        const pixelsPerMeter = this.pixelsPerMeter;
        entry.repair.visible = true;
        entry.halo.clear().circle(0, 0, haloRadius * pixelsPerMeter).fill({ color: tintOf(...NUT.edge), alpha: haloAlpha });
        entry.nut.clear();
        drawNut(entry.nut, nutRadius, pixelsPerMeter);
        entry.wrench.clear();
        drawWrench(entry.wrench, { length: wrenchLength, color: tintOf(...wrenchColor), alpha: 1, pixelsPerMeter });
    }

    /**
     * Pinta el frasco con el líquido de `color` y muestra solo las burbujas que usa `material`.
     * @param {object} entry entrada del pool
     * @param {number[]} color color `[r, g, b]` del líquido
     * @param {object} material fila de `ITEM_ICON.liquid.materials`
     */
    buildBottle(entry, color, material) {
        const { crestRadius, bubbleLighten } = ITEM_ICON.liquid;
        const geometry = this.geometry;
        const pixelsPerMeter = this.pixelsPerMeter;
        const liquidColor = tintOf(...color);
        entry.bottle.visible = true;
        entry.liquid.clear();
        entry.liquid
            .rect(-geometry.innerHalfWidth * pixelsPerMeter, geometry.innerBottom * pixelsPerMeter, 2 * geometry.innerHalfWidth * pixelsPerMeter, (geometry.liquidLevel - geometry.innerBottom) * pixelsPerMeter)
            .fill({ color: liquidColor });
        for (const crest of entry.crests) crest.clear().circle(0, 0, crestRadius * pixelsPerMeter).fill({ color: liquidColor });
        const bubbleColor = tintOf(...color.map((channel) => lerp(channel, COLOR_CHANNEL_MAX, bubbleLighten)));
        const bubbleCount = material.bubbles?.count ?? 0;
        entry.bubbles.forEach((graphics, slot) => {
            graphics.clear();
            graphics.visible = slot < bubbleCount;
            if (slot < bubbleCount) graphics.circle(0, 0, material.bubbles.radius * pixelsPerMeter).fill({ color: bubbleColor });
        });
        this.drawGlass(entry.glass, entry.cap);
    }

    /** Pinta el vidrio del frasco (cuerpo, hombro y cuello, con su borde) y la tapa. */
    drawGlass(glass, cap) {
        const { bottle } = ITEM_ICON;
        const geometry = this.geometry;
        const scale = this.pixelsPerMeter;
        const bodyHalf = bottle.bodyWidth * HALF;
        const neckHalf = bottle.neckWidth * HALF;
        const capHalf = bottle.capWidth * HALF;
        const outline = [
            [-bodyHalf, geometry.bottom],
            [bodyHalf, geometry.bottom],
            [bodyHalf, geometry.bodyTop],
            [neckHalf, geometry.neckBottom],
            [neckHalf, geometry.neckTop],
            [-neckHalf, geometry.neckTop],
            [-neckHalf, geometry.neckBottom],
            [-bodyHalf, geometry.bodyTop],
        ];
        glass.clear();
        glass
            .poly(outline.flatMap(([x, y]) => [x * scale, y * scale]))
            .fill({ color: tintOf(...bottle.glassColor), alpha: bottle.glassAlpha })
            .stroke({ width: bottle.outlineWidth * scale, color: tintOf(...bottle.outlineColor) });
        cap.clear();
        cap.rect(-capHalf * scale, geometry.neckTop * scale, 2 * capHalf * scale, bottle.capHeight * scale).fill({ color: tintOf(...bottle.capColor) });
    }

    /**
     * Mueve las partes del ícono de la entrada según `time`: el frasco sube y baja, las crestas suben y bajan desfasadas, las
     * burbujas suben y se desvanecen, la lava pulsa de brillo; la llave de la reparación gira.
     * @param {object} entry entrada del pool
     * @param {number} time reloj de la animación, en s
     */
    animate(entry, time) {
        const scale = this.pixelsPerMeter;
        if (entry.material === null) {
            entry.wrench.rotation = (TAU * time) / ITEM_ICON.repair.wrenchTurnPeriod;
            return;
        }
        const { material } = entry;
        const { geometry } = this;
        entry.bottle.position.y = ITEM_ICON.bob.amplitude * Math.sin((TAU * time) / ITEM_ICON.bob.period) * scale;
        const { crestCount } = ITEM_ICON.liquid;
        const innerSpan = geometry.innerHalfWidth - ITEM_ICON.liquid.crestRadius;
        entry.crests.forEach((crest, index) => {
            const phase = (TAU * time) / material.wavePeriod + (TAU * index) / crestCount;
            crest.position.set(lerp(-innerSpan, innerSpan, index / (crestCount - 1)) * scale, (geometry.liquidLevel + material.waveAmplitude * Math.sin(phase)) * scale);
        });
        this.animateGlow(entry, material, time);
        this.animateBubbles(entry, material, time);
    }

    /** Oscurece y aclara el líquido de la lava con su pulso de brillo; sin `glow` lo deja del color del punto. */
    animateGlow(entry, material, time) {
        const level = material.glow ? 1 - material.glow.depth * (HALF + HALF * Math.sin((TAU * time) / material.glow.period)) : 1;
        const channel = Math.round(level * COLOR_CHANNEL_MAX);
        const tint = tintOf(channel, channel, channel);
        entry.liquid.tint = tint;
        for (const crest of entry.crests) crest.tint = tint;
    }

    /** Sube cada burbuja del fondo a la superficie, desvaneciéndose, con un desfase entre ellas. */
    animateBubbles(entry, material, time) {
        if (!material.bubbles) return;
        const { count, period } = material.bubbles;
        const geometry = this.geometry;
        const scale = this.pixelsPerMeter;
        const span = geometry.innerHalfWidth - material.bubbles.radius;
        for (let slot = 0; slot < count; slot++) {
            const progress = (time / period + slot / count) % 1;
            const bubble = entry.bubbles[slot];
            const lateral = ((slot * BUBBLE_SPREAD) % 1) * 2 - 1;
            bubble.position.set(lateral * span * scale, lerp(geometry.innerBottom, geometry.liquidLevel, progress) * scale);
            bubble.alpha = 1 - progress;
        }
    }
}
