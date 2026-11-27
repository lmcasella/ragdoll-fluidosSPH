/** Alfa de la línea de la mira. */
const LASER_ALPHA = 0.6;

/** Grosor de la línea de la mira, en px de pantalla: no cambia con el zoom. */
const LASER_WIDTH_PX = 1.5;

/** Radio del punto de impacto de la mira, en px de pantalla. */
const IMPACT_RADIUS_PX = 4;

/**
 * Mira láser de cada jugador, como un `PIXI.Graphics` por jugador que se limpia y se redibuja cada frame: una línea desde la
 * boca del arma hasta el primer impacto (o el alcance máximo) y un punto si hubo impacto (`docs/design/08-raycast.md`).
 * Los grosores se dividen por la escala de la cámara para mantenerlos en píxeles de pantalla.
 */
export class AimLaserView {
    /**
     * @param {object} options
     * @param {PIXI.Container} options.parent contenedor superpuesto, en px a `pixelsPerMeter` con la cámara aplicada
     * @param {number} options.pixelsPerMeter px por metro de la geometría
     * @param {number} options.playerCount cantidad de jugadores
     */
    constructor({ parent, pixelsPerMeter, playerCount }) {
        this.pixelsPerMeter = pixelsPerMeter;
        this.graphics = Array.from({ length: playerCount }, () => new PIXI.Graphics());
        parent.addChild(...this.graphics);
    }

    /**
     * Dibuja la mira del jugador `playerIndex`; con `laser` en `null` solo borra la del frame anterior.
     * @param {number} playerIndex jugador (0 = J1)
     * @param {{x1: number, y1: number, x2: number, y2: number, hit: boolean}|null} laser extremos de la mira, en m
     * @param {string} color color CSS de la mira
     * @param {number} screenScale escala de la cámara, en px de pantalla por metro
     */
    draw(playerIndex, laser, color, screenScale) {
        const graphics = this.graphics[playerIndex];
        graphics.clear();
        if (!laser) return;
        const scale = this.pixelsPerMeter;
        const pixelsToGeometry = scale / screenScale;
        graphics
            .moveTo(laser.x1 * scale, laser.y1 * scale)
            .lineTo(laser.x2 * scale, laser.y2 * scale)
            .stroke({ width: LASER_WIDTH_PX * pixelsToGeometry, color, alpha: LASER_ALPHA });
        if (laser.hit) graphics.circle(laser.x2 * scale, laser.y2 * scale, IMPACT_RADIUS_PX * pixelsToGeometry).fill({ color });
    }
}
