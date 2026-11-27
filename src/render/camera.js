import { clamp, exponentialApproachFactor, lerp } from "../core/math/scalar.js";

/**
 * Acota `value` a [`lower`, `upper`]; si el intervalo está invertido (el mundo es más chico que la vista) devuelve su centro.
 * @param {number} value
 * @param {number} lower
 * @param {number} upper
 * @returns {number}
 */
function clampOrCenter(value, lower, upper) {
    return lower > upper ? (lower + upper) / 2 : clamp(value, lower, upper);
}
/**
 * Cámara compartida: encuadra a todos los puntos dados (los jugadores) con margen y hace zoom según la distancia entre
 * ellos. Con mundo acotado no muestra nada fuera de sus límites; con alto infinito (Infinito) puede alejarse hasta
 * `MAX_VIEW_HEIGHT` m de alto y mostrar el fondo fuera de las paredes. Coordenadas del mundo en metros, Y hacia arriba.
 */
const MARGIN_X = 6;
const MARGIN_Y = 4;
const SMOOTHING = 4;

/** Escala máxima de la cámara, en px/m: el zoom máximo es esta escala sobre `pixelsPerMeter`. */
export const MAX_SCALE = 64;

/** Alto máximo (m) que muestra la cámara cuando el mundo no tiene techo. */
export const MAX_VIEW_HEIGHT = 40;

export class Camera {
    constructor(bounds, pixelsPerMeter) {
        this.bounds = bounds;
        this.ppm = pixelsPerMeter;
        this.x = (bounds.minX + bounds.maxX) / 2;
        this.y = (bounds.minY + bounds.maxY) / 2;
        this.zoom = 1;
        this.viewW = 1;
        this.viewH = 1;
    }

    get scale() {
        return this.ppm * this.zoom;
    }

    resize(viewW, viewH) {
        this.viewW = viewW;
        this.viewH = viewH;
    }

    /** Cambia los límites del mundo sin tocar la posición ni el zoom; `maxY` puede ser `Infinity`. */
    setBounds(bounds) {
        this.bounds = bounds;
    }

    /** Borde superior de la vista (m). */
    get top() {
        return this.y + this.viewH / (2 * this.scale);
    }

    update(points, dt, snap = false) {
        const { minX, maxX, minY, maxY } = this.bounds;
        const worldW = maxX - minX;
        const worldH = maxY - minY;

        let left = Infinity;
        let right = -Infinity;
        let bottom = Infinity;
        let top = -Infinity;
        for (const p of points) {
            left = Math.min(left, p.x);
            right = Math.max(right, p.x);
            bottom = Math.min(bottom, p.y);
            top = Math.max(top, p.y);
        }
        const needW = right - left + MARGIN_X * 2;
        const needH = top - bottom + MARGIN_Y * 2;

        const fitEntire = Math.max(
            this.viewW / (worldW * this.ppm),
            this.viewH / (worldH * this.ppm),
        );
        const fitWorld = Number.isFinite(worldH) ? fitEntire : Math.min(fitEntire, this.viewH / (MAX_VIEW_HEIGHT * this.ppm));
        const fitPlayers = Math.min(
            this.viewW / (needW * this.ppm),
            this.viewH / (needH * this.ppm),
        );
        const zoom = clamp(fitPlayers, fitWorld, MAX_SCALE / this.ppm);

        const halfW = this.viewW / (2 * this.ppm * zoom);
        const halfH = this.viewH / (2 * this.ppm * zoom);
        const x = clampOrCenter((left + right) / 2, minX + halfW, maxX - halfW);
        const y = clampOrCenter((bottom + top) / 2, minY + halfH, maxY - halfH);

        const t = snap ? 1 : exponentialApproachFactor(SMOOTHING * dt);
        this.zoom = lerp(this.zoom, zoom, t);
        this.x = lerp(this.x, x, t);
        this.y = lerp(this.y, y, t);
    }

    /**
     * Pone la cámara en un contenedor PIXI cuya geometría está en px a `pixelsPerMeter`: el zoom con Y invertida
     * y la posición que deja el punto de la cámara en el centro de la vista.
     * @param {PIXI.Container} container
     */
    applyTo(container) {
        container.scale.set(this.zoom, -this.zoom);
        container.position.set(this.viewW / 2 - this.x * this.scale, this.viewH / 2 + this.y * this.scale);
    }

    /** Píxeles de pantalla `{ x, y }` (Y hacia abajo) de un punto del mundo en metros; inversa de `toWorld`. */
    toScreen(worldX, worldY, out = { x: 0, y: 0 }) {
        const s = this.scale;
        out.x = this.viewW / 2 + (worldX - this.x) * s;
        out.y = this.viewH / 2 - (worldY - this.y) * s;
        return out;
    }

    toWorld(screenX, screenY) {
        const s = this.scale;
        return {
            x: this.x + (screenX - this.viewW / 2) / s,
            y: this.y - (screenY - this.viewH / 2) / s,
        };
    }
}
