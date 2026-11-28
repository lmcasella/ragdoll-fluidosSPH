import { ROBOT_JOINT_COLOR, ROBOT_METAL_COLOR, robotVisorCode } from "../render/robotFilter.js";
import { ROBOT_DETAIL } from "./robotDetail.js";

const HALF = 0.5;

/**
 * Dibuja en `graphics` el detalle de máquina de un cuerpo (`ROBOT_DETAIL`), en px y con la Y hacia abajo, con los colores
 * que reconoce `robotFilter.js`: las hendiduras con el de junta, los tornillos y los discos de articulación con el de metal
 * pelado y el visor con el código emisivo de su jugador. Va en el `Graphics` sin tinte de la pieza, así el color de cada
 * código llega intacto al filtro.
 * @param {PIXI.Graphics} graphics
 * @param {string} bodyId cuerpo al que pertenece el `graphics`
 * @param {object} options
 * @param {number} options.pixelsPerMeter px por metro del JSON del robot
 * @param {number} options.side lado al que mira el robot, 1 o -1: espeja la X
 * @param {number} options.lineWidth grosor de las hendiduras, en px
 * @param {number} options.slot índice del jugador, para el código del visor
 */
export function drawBodyDetail(graphics, bodyId, { pixelsPerMeter, side, lineWidth, slot }) {
    const screenX = (x) => x * side * pixelsPerMeter;
    const screenY = (y) => -y * pixelsPerMeter;
    for (const line of ROBOT_DETAIL.panelLines) {
        if (line.bodyId !== bodyId) continue;
        graphics.moveTo(screenX(line.fromX), screenY(line.fromY)).lineTo(screenX(line.toX), screenY(line.toY)).stroke({ width: lineWidth, color: ROBOT_JOINT_COLOR });
    }
    for (const disc of [...ROBOT_DETAIL.screws, ...ROBOT_DETAIL.joints]) {
        if (disc.bodyId !== bodyId) continue;
        graphics.circle(screenX(disc.x), screenY(disc.y), disc.radius * pixelsPerMeter).fill(ROBOT_METAL_COLOR);
    }
    const { visor } = ROBOT_DETAIL;
    if (visor.bodyId !== bodyId) return;
    const left = screenX(visor.centerX) - visor.width * HALF * pixelsPerMeter;
    const top = screenY(visor.centerY + visor.height * HALF);
    graphics.rect(left, top, visor.width * pixelsPerMeter, visor.height * pixelsPerMeter).fill(robotVisorCode(slot));
}
