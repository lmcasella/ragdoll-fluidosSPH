// Cámara compartida: encuadra a todos los puntos dados (los jugadores) con margen, hace zoom según la
// distancia entre ellos y no muestra nada fuera de los límites del mundo. Coordenadas del mundo en metros, Y hacia arriba.
const MARGIN_X = 6;
const MARGIN_Y = 4;
const MAX_ZOOM = 1.6;
const SMOOTHING = 4;

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

        // El zoom mínimo muestra el mundo entero; nunca más lejos que eso
        const fitWorld = Math.max(
            this.viewW / (worldW * this.ppm),
            this.viewH / (worldH * this.ppm),
        );
        const fitPlayers = Math.min(
            this.viewW / (needW * this.ppm),
            this.viewH / (needH * this.ppm),
        );
        const zoom = Math.min(Math.max(fitPlayers, fitWorld), MAX_ZOOM);

        const halfW = this.viewW / (2 * this.ppm * zoom);
        const halfH = this.viewH / (2 * this.ppm * zoom);
        const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi));
        const x = clamp((left + right) / 2, minX + halfW, maxX - halfW);
        const y = clamp((bottom + top) / 2, minY + halfH, maxY - halfH);

        const t = snap ? 1 : 1 - Math.exp(-SMOOTHING * dt);
        this.zoom += (zoom - this.zoom) * t;
        this.x += (x - this.x) * t;
        this.y += (y - this.y) * t;
    }

    // Deja el contexto dibujando en metros, Y hacia arriba
    apply(ctx) {
        const s = this.scale;
        ctx.setTransform(s, 0, 0, -s, this.viewW / 2 - this.x * s, this.viewH / 2 + this.y * s);
    }

    toWorld(screenX, screenY) {
        const s = this.scale;
        return {
            x: this.x + (screenX - this.viewW / 2) / s,
            y: this.y - (screenY - this.viewH / 2) / s,
        };
    }
}
