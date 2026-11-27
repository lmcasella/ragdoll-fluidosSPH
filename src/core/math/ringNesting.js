import { polygonArea } from "./geometry.js";

/** Valores por vértice en un arreglo intercalado (x, y). */
const COMPONENTS_PER_VERTEX = 2;

/**
 * Indica si un punto está dentro de un polígono, con la regla par-impar: cuenta cuántas aristas cruza un rayo desde el
 * punto hacia +x. Un punto exactamente sobre el borde puede caer de cualquiera de los dos lados.
 * @param {number} x en m
 * @param {number} y en m
 * @param {ArrayLike<number>} vertices vértices intercalados `[x0, y0, x1, y1, …]`, en m
 * @returns {boolean}
 */
export function pointInPolygon(x, y, vertices) {
    const count = vertices.length / COMPONENTS_PER_VERTEX;
    let inside = false;
    for (let index = 0, previous = count - 1; index < count; previous = index++) {
        const fromX = vertices[COMPONENTS_PER_VERTEX * previous];
        const fromY = vertices[COMPONENTS_PER_VERTEX * previous + 1];
        const toX = vertices[COMPONENTS_PER_VERTEX * index];
        const toY = vertices[COMPONENTS_PER_VERTEX * index + 1];
        const straddlesRay = fromY > y !== toY > y;
        if (straddlesRay && x < fromX + ((y - fromY) * (toX - fromX)) / (toY - fromY)) inside = !inside;
    }
    return inside;
}

/**
 * Reparte los agujeros de una grilla entre sus contornos externos: cada agujero va al externo más chico que lo contiene
 * (así un agujero dentro de una isla que a su vez está dentro de otro agujero pertenece a la isla). Se decide con el primer
 * vértice del agujero. Un agujero que ningún externo contiene se descarta. Ver `docs/design/05-escenario.md` §5.5.
 * @param {ArrayLike<number>[]} outers contornos externos antihorarios, vértices intercalados en m
 * @param {ArrayLike<number>[]} holes agujeros horarios, vértices intercalados en m
 * @returns {ArrayLike<number>[][]} en la posición `i`, los agujeros del externo `outers[i]`
 */
export function assignHolesToOuters(outers, holes) {
    const holesByOuter = outers.map(() => []);
    const outerAreas = outers.map((outer) => polygonArea(outer, outer.length / COMPONENTS_PER_VERTEX));
    for (const hole of holes) {
        let ownerIndex = -1;
        for (let index = 0; index < outers.length; index++) {
            const isSmaller = ownerIndex < 0 || outerAreas[index] < outerAreas[ownerIndex];
            if (isSmaller && pointInPolygon(hole[0], hole[1], outers[index])) ownerIndex = index;
        }
        if (ownerIndex >= 0) holesByOuter[ownerIndex].push(hole);
    }
    return holesByOuter;
}
