import { tintOf } from "../core/color.js";
import { QUARTER_TURN, TAU } from "../core/mathConstants.js";
import { INK_COLOR, createLabel } from "./labelText.js";

/** Radios de la rueda de armas en metros, alrededor del torso: borde interno, externo y externo del sector apuntado. */
export const WHEEL_RADII = { inner: 0.45, outer: 1.6, selected: 1.75 };

/** Alfa del relleno de un sector: el apuntado es más opaco. */
const SECTOR_ALPHA = { selected: 0.95, normal: 0.6 };

/** Borde de un sector, en m: el del arma equipada es blanco y más grueso; los demás, oscuros y con alfa. */
const SECTOR_OUTLINE = { equippedWidth: 0.08, normalWidth: 0.03, equippedColor: "#ffffff", normalColor: INK_COLOR, normalAlpha: 0.8 };

/**
 * Barra de tanque bajo la letra de cada sector: ancho y alto en m, distancia bajo el centro de la letra en m, y colores del
 * fondo (con su alfa) y del relleno.
 */
const TANK_BAR = { width: 0.6, height: 0.06, below: 0.3, backColor: INK_COLOR, backAlpha: 0.6, fillColor: "#ffffff" };

/** Mitad de un ancho: las barras se centran bajo la letra. */
const HALF = 0.5;

/**
 * Rueda de armas de cada jugador, como un `PIXI.Graphics` por jugador que se limpia y se redibuja mientras está abierta
 * (`docs/design/07-sph.md` §7.4, controles en `docs/design/10-controles.md`), más una letra por sector que se reutiliza entre
 * frames (Object Pool). Los sectores están en orden, el primero centrado arriba y los demás en sentido horario. Va en la capa
 * superpuesta, encima de los fluidos.
 */
export class WeaponWheelView {
    /**
     * @param {object} options
     * @param {PIXI.Container} options.parent contenedor superpuesto, en px a `pixelsPerMeter` con la cámara aplicada
     * @param {number} options.pixelsPerMeter px por metro de la geometría
     * @param {number} options.playerCount cantidad de jugadores
     */
    constructor({ parent, pixelsPerMeter, playerCount }) {
        this.pixelsPerMeter = pixelsPerMeter;
        this.wheels = Array.from({ length: playerCount }, () => {
            const node = new PIXI.Container();
            node.visible = false;
            parent.addChild(node);
            const graphics = new PIXI.Graphics();
            node.addChild(graphics);
            return { node, graphics, labels: [] };
        });
    }

    /**
     * Dibuja la rueda del jugador `playerIndex` centrada en (`centerX`, `centerY`).
     * @param {number} playerIndex jugador (0 = J1)
     * @param {number} centerX centro, en m
     * @param {number} centerY centro, en m
     * @param {{name: string, color: number[], fill: number, equipped: boolean}[]} entries sectores en orden: nombre del arma,
     *   color `[r, g, b]`, tanque de 0 a 1 y si es el arma equipada
     * @param {number} selected índice del sector apuntado (-1 ninguno): más opaco y más grande
     */
    show(playerIndex, centerX, centerY, entries, selected) {
        const wheel = this.wheels[playerIndex];
        const scale = this.pixelsPerMeter;
        const step = TAU / entries.length;
        wheel.node.visible = true;
        wheel.graphics.clear();
        entries.forEach((entry, index) => {
            const [red, green, blue] = entry.color;
            const isSelected = index === selected;
            const outerRadius = isSelected ? WHEEL_RADII.selected : WHEEL_RADII.outer;
            const from = QUARTER_TURN - (index + HALF) * step;
            const to = QUARTER_TURN - (index - HALF) * step;
            wheel.graphics
                .moveTo((centerX + Math.cos(from) * outerRadius) * scale, (centerY + Math.sin(from) * outerRadius) * scale)
                .arc(centerX * scale, centerY * scale, outerRadius * scale, from, to)
                .arc(centerX * scale, centerY * scale, WHEEL_RADII.inner * scale, to, from, true)
                .closePath()
                .fill({ color: tintOf(red, green, blue), alpha: isSelected ? SECTOR_ALPHA.selected : SECTOR_ALPHA.normal })
                .stroke(
                    entry.equipped
                        ? { width: SECTOR_OUTLINE.equippedWidth * scale, color: SECTOR_OUTLINE.equippedColor }
                        : { width: SECTOR_OUTLINE.normalWidth * scale, color: SECTOR_OUTLINE.normalColor, alpha: SECTOR_OUTLINE.normalAlpha },
                );
            const middle = (from + to) * HALF;
            const labelRadius = (WHEEL_RADII.inner + WHEEL_RADII.outer) * HALF;
            const labelX = centerX + Math.cos(middle) * labelRadius;
            const labelY = centerY + Math.sin(middle) * labelRadius;
            const label = (wheel.labels[index] ??= createLabel(wheel.node, scale));
            label.text = entry.name[0];
            label.position.set(labelX * scale, labelY * scale);
            label.visible = true;
            this.drawTankBar(wheel.graphics, labelX, labelY, entry.fill);
        });
        for (let index = entries.length; index < wheel.labels.length; index++) wheel.labels[index].visible = false;
    }

    /**
     * Barra de tanque bajo la letra de un sector: fondo y relleno proporcional.
     * @param {PIXI.Graphics} graphics gráfico de la rueda
     * @param {number} labelX centro de la letra, en m
     * @param {number} labelY centro de la letra, en m
     * @param {number} fill tanque, de 0 a 1
     */
    drawTankBar(graphics, labelX, labelY, fill) {
        const scale = this.pixelsPerMeter;
        const left = (labelX - TANK_BAR.width * HALF) * scale;
        const bottom = (labelY - TANK_BAR.below) * scale;
        const height = TANK_BAR.height * scale;
        graphics.rect(left, bottom, TANK_BAR.width * scale, height).fill({ color: TANK_BAR.backColor, alpha: TANK_BAR.backAlpha });
        graphics.rect(left, bottom, TANK_BAR.width * scale * Math.max(0, Math.min(1, fill)), height).fill({ color: TANK_BAR.fillColor });
    }

    /**
     * Oculta la rueda del jugador `playerIndex`.
     * @param {number} playerIndex jugador (0 = J1)
     */
    hide(playerIndex) {
        this.wheels[playerIndex].node.visible = false;
    }
}
