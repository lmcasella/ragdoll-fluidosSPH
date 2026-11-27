import { clamp } from "../core/math/scalar.js";
import { vectorLength, rotateLocalToWorld } from "../core/math/vector2.js";

/**
 * Superficies sólidas en metros del mundo (cajas y círculos con su pose) para acercar el agua dibujada a los cuerpos
 * (`docs/design/07-sph.md` §7.4). Se rearman en cada frame con `collectSurfaces`; los objetos se reutilizan.
 */

/** Puntos de trabajo: el centro de una pieza en el mundo y la dirección hacia la superficie más cercana. Se reutilizan para no crear objetos por frame. */
const surfaceCenter = { x: 0, y: 0 };
const towards = { x: 0, y: 0 };

/** Tipos de superficie: caja orientada y círculo. */
const BOX = 0;
const CIRCLE = 1;

/** Cuánto se mete el agua acercada bajo la superficie del cuerpo para que no quede una línea de fondo entre los dos, en m. */
const SKIN_OVERLAP = 0.02;

/** Lado de cada celda de la grilla de superficies, en m. */
const CELL_SIZE = 1;

/** Esquina de la grilla, en m: deja un margen de 2 m fuera del nivel. */
const GRID_ORIGIN = { x: -2, y: -2 };

/** Celdas de la grilla a lo ancho y a lo alto: cubren el nivel con margen; lo de afuera cae en la celda del borde. */
const GRID_SIZE = { width: 64, height: 40 };

const surfacePool = [];
let surfaceCount = 0;
const grid = Array.from({ length: GRID_SIZE.width * GRID_SIZE.height }, () => []);
let usedCells = [];
const skinShift = { x: 0, y: 0 };

/**
 * Anota una superficie en el pool, con la caja que la encierra (`extentX` y `extentY`, mitades en m) para ubicarla en la grilla.
 * @param {number} kind `BOX` o `CIRCLE`
 * @param {number} x centro, en m
 * @param {number} y centro, en m
 * @param {number} angle giro, en rad
 * @param {number} halfWidth semiancho de la caja, en m
 * @param {number} halfHeight semialto de la caja, en m
 * @param {number} radius radio del círculo, en m
 */
function addSurface(kind, x, y, angle, halfWidth, halfHeight, radius) {
    const surface = (surfacePool[surfaceCount] ??= {});
    surface.kind = kind;
    surface.x = x;
    surface.y = y;
    surface.cosAngle = Math.cos(angle);
    surface.sinAngle = Math.sin(angle);
    surface.halfWidth = halfWidth;
    surface.halfHeight = halfHeight;
    surface.radius = radius;
    surface.extentX = kind === BOX ? Math.abs(surface.cosAngle) * halfWidth + Math.abs(surface.sinAngle) * halfHeight : radius;
    surface.extentY = kind === BOX ? Math.abs(surface.sinAngle) * halfWidth + Math.abs(surface.cosAngle) * halfHeight : radius;
    surfaceCount++;
}

/**
 * Índice de la celda de la grilla que contiene `value`, acotado a la grilla.
 * @param {number} value coordenada, en m
 * @param {number} origin esquina de la grilla en ese eje, en m
 * @param {number} cells cantidad de celdas en ese eje
 */
function cellIndex(value, origin, cells) {
    return clamp(Math.floor((value - origin) / CELL_SIZE), 0, cells - 1);
}

/**
 * Arma la grilla: cada celda lista las superficies a menos de `reach` de ella, así cada partícula prueba solo las de su celda.
 * @param {number} reach alcance del acercamiento del agua, en m
 */
function buildGrid(reach) {
    for (const cell of usedCells) cell.length = 0;
    usedCells = [];
    for (let index = 0; index < surfaceCount; index++) {
        const surface = surfacePool[index];
        const firstColumn = cellIndex(surface.x - surface.extentX - reach, GRID_ORIGIN.x, GRID_SIZE.width);
        const lastColumn = cellIndex(surface.x + surface.extentX + reach, GRID_ORIGIN.x, GRID_SIZE.width);
        const firstRow = cellIndex(surface.y - surface.extentY - reach, GRID_ORIGIN.y, GRID_SIZE.height);
        const lastRow = cellIndex(surface.y + surface.extentY + reach, GRID_ORIGIN.y, GRID_SIZE.height);
        for (let row = firstRow; row <= lastRow; row++) {
            for (let column = firstColumn; column <= lastColumn; column++) {
                const cell = grid[row * GRID_SIZE.width + column];
                if (cell.length === 0) usedCells.push(cell);
                cell.push(surface);
            }
        }
    }
}

/**
 * Arma la lista de superficies sólidas, en metros del mundo, con las piezas de los robots (las mismas formas que dibuja
 * `RagdollShapes`) y los sólidos del nivel, y la grilla que las indexa. Los polígonos se omiten: los rigs actuales no los usan.
 * @param {object[]} players robots con `renderItems`
 * @param {object[]} solids sólidos del nivel
 * @param {number} reach alcance del acercamiento del agua, en m
 * @param {number} offsetY desplazamiento vertical de los sólidos, en m
 * @returns {number} cantidad de superficies
 */
export function collectSurfaces(players, solids, reach = 0, offsetY = 0) {
    surfaceCount = 0;
    for (const solid of solids) {
        if (solid.broken) continue;
        addSurface(BOX, solid.x, solid.y + offsetY, 0, solid.w / 2, solid.h / 2, 0);
    }
    for (const player of players) {
        for (const item of player.renderItems) {
            if (item.type === "polygon") continue;
            const position = item.body.GetPosition();
            const bodyAngle = item.body.GetAngle();
            const cosBody = Math.cos(bodyAngle);
            const sinBody = Math.sin(bodyAngle);
            rotateLocalToWorld(item.centerX, item.centerY, cosBody, sinBody, position.get_x(), position.get_y(), surfaceCenter);
            addSurface(
                item.type === "box" ? BOX : CIRCLE,
                surfaceCenter.x,
                surfaceCenter.y,
                bodyAngle + item.angle,
                item.halfWidth,
                item.halfHeight,
                item.radius,
            );
        }
    }
    buildGrid(reach);
    return surfaceCount;
}

/**
 * Posición del segundo círculo de una partícula de agua. LiquidFun deja el centro de la primera fila a ~1,85 radios
 * físicos de la superficie del cuerpo (`docs/design/07-sph.md` §7.4), más lejos de lo que cubre el círculo dibujado: ahí
 * queda un hueco. El segundo círculo se acerca por la normal hasta que su borde toca la superficie y el desplazamiento
 * se apaga entre `fullReach` y `reach`. Devuelve la posición real si no hay nada que acercar. El objeto devuelto se reutiliza.
 * @param {number} x posición de la partícula, en m
 * @param {number} y posición de la partícula, en m
 * @param {number} drawRadius radio dibujado, en m
 * @param {number} reach distancia a la superficie desde la que se acerca, en m
 * @param {number} fullReach distancia a la superficie hasta la que el acercamiento es total, en m
 * @returns {{x: number, y: number}} posición del círculo, en m
 */
export function skinPosition(x, y, drawRadius, reach, fullReach) {
    let nearestDistance = reach;
    let towardsX = 0;
    let towardsY = 0;
    const cell = grid[cellIndex(y, GRID_ORIGIN.y, GRID_SIZE.height) * GRID_SIZE.width + cellIndex(x, GRID_ORIGIN.x, GRID_SIZE.width)];
    for (let index = 0; index < cell.length; index++) {
        const surface = cell[index];
        const offsetX = x - surface.x;
        const offsetY = y - surface.y;
        const localX = offsetX * surface.cosAngle + offsetY * surface.sinAngle;
        const localY = -offsetX * surface.sinAngle + offsetY * surface.cosAngle;
        let distance;
        let normalX;
        let normalY;
        if (surface.kind === BOX) {
            const insideX = Math.abs(localX) - surface.halfWidth;
            const insideY = Math.abs(localY) - surface.halfHeight;
            const outsideX = Math.max(insideX, 0);
            const outsideY = Math.max(insideY, 0);
            distance = vectorLength(outsideX, outsideY);
            if (distance === 0) continue;
            normalX = (Math.sign(localX) * outsideX) / distance;
            normalY = (Math.sign(localY) * outsideY) / distance;
        } else {
            const centerDistance = vectorLength(localX, localY);
            distance = centerDistance - surface.radius;
            if (centerDistance === 0) continue;
            normalX = localX / centerDistance;
            normalY = localY / centerDistance;
        }
        if (distance <= 0 || distance >= nearestDistance) continue;
        nearestDistance = distance;
        rotateLocalToWorld(normalX, normalY, surface.cosAngle, surface.sinAngle, 0, 0, towards);
        towardsX = towards.x;
        towardsY = towards.y;
    }
    const gap = nearestDistance - (drawRadius - SKIN_OVERLAP);
    if (nearestDistance >= reach || gap <= 0) {
        skinShift.x = x;
        skinShift.y = y;
        return skinShift;
    }
    const fade = nearestDistance <= fullReach ? 1 : (reach - nearestDistance) / (reach - fullReach);
    skinShift.x = x - towardsX * gap * fade;
    skinShift.y = y - towardsY * gap * fade;
    return skinShift;
}
