/**
 * Capa de dibujo de las piezas del robot, de atrás hacia adelante (`docs/design/13-arte.md` §13.4): brazo trasero,
 * pierna trasera, torso y pelvis, cabeza (sobre el torso, para que se vea el visor), pierna frontal y brazo frontal. Es
 * el `zIndex` de cada pieza.
 */
export const ROBOT_DRAW_LAYER = { backArm: 0, backLeg: 1, core: 2, head: 3, frontLeg: 4, frontArm: 5 };

/**
 * Miembros del robot por id de cuerpo del `.rag.json`: `limb` es `arm`, `leg` o `head` y `set` el juego de miembros,
 * `original` o `copy` (`body_N_copy`); la cabeza no tiene juego. Los cuerpos que no están (torso y pelvis) son el cuerpo.
 */
export const ROBOT_LIMBS = {
    b_1: { limb: "head", set: null },
    b_3: { limb: "arm", set: "original" },
    b_13: { limb: "arm", set: "original" },
    b_14: { limb: "arm", set: "copy" },
    b_15: { limb: "arm", set: "copy" },
    b_4: { limb: "leg", set: "original" },
    b_8: { limb: "leg", set: "original" },
    b_9: { limb: "leg", set: "original" },
    b_16: { limb: "leg", set: "copy" },
    b_17: { limb: "leg", set: "copy" },
    b_18: { limb: "leg", set: "copy" },
};

/** Juego de miembros que queda del lado de la cámara según el lado al que mira el robot (`side`, ±1). */
export const FRONT_SET_BY_SIDE = { 1: "copy", [-1]: "original" };

/** Capa de cada miembro según esté atrás o adelante. */
const LAYER_BY_LIMB = {
    head: { back: ROBOT_DRAW_LAYER.head, front: ROBOT_DRAW_LAYER.head },
    arm: { back: ROBOT_DRAW_LAYER.backArm, front: ROBOT_DRAW_LAYER.frontArm },
    leg: { back: ROBOT_DRAW_LAYER.backLeg, front: ROBOT_DRAW_LAYER.frontLeg },
};

/**
 * Capa de dibujo de un cuerpo del robot.
 * @param {string} bodyId id del cuerpo en el `.rag.json`
 * @param {number} side lado al que mira el robot, 1 o -1 (`ActiveRagdoll.side`)
 * @returns {number} valor de `ROBOT_DRAW_LAYER`
 */
export function robotLayerOf(bodyId, side) {
    const row = ROBOT_LIMBS[bodyId];
    if (row === undefined) return ROBOT_DRAW_LAYER.core;
    const placement = row.set === FRONT_SET_BY_SIDE[side] ? "front" : "back";
    return LAYER_BY_LIMB[row.limb][placement];
}
