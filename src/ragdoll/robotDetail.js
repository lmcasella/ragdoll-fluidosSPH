/**
 * Detalle de máquina del robot (`docs/design/13-arte.md` §13.4), en m y en el marco de cada cuerpo del `.rag.json`, para un
 * robot que mira a la derecha (a la izquierda se espeja la X). `bodyId` es el cuerpo sobre el que se dibuja.
 * - `visor`: franja emisiva de la cabeza, de `width` por `height` centrada en (`centerX`, `centerY`).
 * - `panelLines`: hendiduras del torso y la pelvis, de (`fromX`, `fromY`) a (`toX`, `toY`).
 * - `screws`: tornillos de `radius`, en (`x`, `y`).
 * - `joints`: discos de metal pelado de `radius` sobre las uniones de los joints (hombro, codo, cadera y rodilla); el
 *   disco de cada miembro va sobre su cuerpo, así queda en la capa del miembro (`robotLayers.js`).
 */
export const ROBOT_DETAIL = {
    visor: { bodyId: "b_1", centerX: 0.05, centerY: 0.03, width: 0.15, height: 0.07 },
    panelLines: [
        { bodyId: "b_2", fromX: -0.16, fromY: 0, toX: 0.16, toY: 0 },
        { bodyId: "b_2", fromX: -0.14, fromY: -0.09, toX: 0.14, toY: -0.09 },
        { bodyId: "b_6", fromX: -0.11, fromY: -0.02, toX: 0.11, toY: -0.02 },
    ],
    screws: [
        { bodyId: "b_2", x: -0.12, y: 0.12, radius: 0.022 },
        { bodyId: "b_2", x: 0.12, y: 0.12, radius: 0.022 },
        { bodyId: "b_2", x: 0, y: -0.17, radius: 0.022 },
    ],
    joints: [
        { bodyId: "b_13", x: 0.03056, y: 0.12658, radius: 0.05 },
        { bodyId: "b_13", x: -0.04801, y: -0.08293, radius: 0.05 },
        { bodyId: "b_15", x: 0.03056, y: 0.12658, radius: 0.05 },
        { bodyId: "b_15", x: -0.04801, y: -0.08293, radius: 0.05 },
        { bodyId: "b_9", x: 0.08227, y: -0.08384, radius: 0.05 },
        { bodyId: "b_18", x: 0.08227, y: -0.08384, radius: 0.05 },
        { bodyId: "b_8", x: 0.03693, y: -0.13107, radius: 0.05 },
        { bodyId: "b_17", x: 0.03693, y: -0.13107, radius: 0.05 },
    ],
};

/**
 * Pone en `output` el punto del mundo, en m, donde está el visor de un robot: de ahí sale su luz.
 * @param {*} headBody `Box2D.b2Body` de la cabeza (`ROBOT_DETAIL.visor.bodyId`)
 * @param {number} side lado al que mira el robot, 1 o -1
 * @param {{x: number, y: number}} output se sobrescribe
 * @returns {{x: number, y: number}} el mismo `output`
 */
export function visorWorldPoint(headBody, side, output) {
    const { centerX, centerY } = ROBOT_DETAIL.visor;
    const angle = headBody.GetAngle();
    const localX = centerX * side;
    const position = headBody.GetPosition();
    output.x = position.get_x() + localX * Math.cos(angle) - centerY * Math.sin(angle);
    output.y = position.get_y() + localX * Math.sin(angle) + centerY * Math.cos(angle);
    return output;
}
