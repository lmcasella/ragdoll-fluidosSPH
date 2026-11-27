/**
 * Longitud de un vector 2D.
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function vectorLength(x, y) {
    return Math.hypot(x, y);
}

/**
 * Distancia entre dos puntos.
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @returns {number} en las unidades de las coordenadas
 */
export function distance(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
}

/**
 * Escribe en `out` el vector `(x, y)` con longitud 1; el vector nulo queda en `(0, 0)`. No crea objetos: sirve en el loop por frame.
 * @param {number} x
 * @param {number} y
 * @param {{x: number, y: number}} out recibe el resultado
 * @returns {{x: number, y: number}} `out`
 */
export function normalize(x, y, out) {
    const length = Math.hypot(x, y) || 1;
    out.x = x / length;
    out.y = y / length;
    return out;
}

/**
 * Producto escalar de dos vectores 2D.
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @returns {number}
 */
export function dot(ax, ay, bx, by) {
    return ax * bx + ay * by;
}

/**
 * Componente Z del producto vectorial `a × b`: positivo si `b` queda a la izquierda de `a`.
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @returns {number}
 */
export function cross(ax, ay, bx, by) {
    return ax * by - ay * bx;
}

/**
 * Pasa el punto local `(localX, localY)` de un cuerpo girado a coordenadas de mundo y lo escribe en `out`.
 * Recibe el coseno y el seno del ángulo para que el llamador los calcule una sola vez por cuerpo.
 * @param {number} localX en m
 * @param {number} localY en m
 * @param {number} angleCos coseno del ángulo del cuerpo
 * @param {number} angleSin seno del ángulo del cuerpo
 * @param {number} originX posición del cuerpo en el mundo, en m
 * @param {number} originY posición del cuerpo en el mundo, en m
 * @param {{x: number, y: number}} out recibe el punto en el mundo, en m
 * @returns {{x: number, y: number}} `out`
 */
export function rotateLocalToWorld(localX, localY, angleCos, angleSin, originX, originY, out) {
    out.x = originX + angleCos * localX - angleSin * localY;
    out.y = originY + angleSin * localX + angleCos * localY;
    return out;
}
