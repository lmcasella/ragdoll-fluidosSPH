import { fieldColor, waterOutline } from "./render.js";

/**
 * Agua del nivel como un `PIXI.Graphics` que se limpia y se redibuja cada frame desde el campo de alturas
 * (`docs/design/14-agua.md` §14.3, Render): un polígono relleno por tramo mojado, del lecho a `η`, con la línea de
 * superficie encima. Va después de los robots, con la opacidad de `water.config.draw`, para que las piezas sumergidas
 * se vean bajo el agua. Los datos de dibujo son `WATER_FIELD.draw`. Unidades de la geometría: px a `pixelsPerMeter`,
 * con la Y hacia arriba; la cámara la mueve y la escala en el mundo.
 */
export class WaterView {
    /**
     * @param {object} options
     * @param {PIXI.Container} options.parent contenedor del mundo donde se dibuja
     * @param {number} options.pixelsPerMeter px por metro del JSON del robot
     */
    constructor({ parent, pixelsPerMeter }) {
        this.pixelsPerMeter = pixelsPerMeter;
        this.graphics = new PIXI.Graphics();
        parent.addChild(this.graphics);
        this.outline = {};
        this.stopColor = [0, 0, 0];
        this.gradients = [];
    }

    /**
     * Degradado horizontal de `fieldColor` para el tramo mojado entre las caras `left` y `right` (m), con una parada
     * en cada cara y una en el centro de cada `step`-ésima celda. Es de espacio local: 0 es `left` y 1 es `right`.
     * Devuelve `null` si ninguna celda del tramo tiene ácido (`A` = 0) y el tramo se rellena con `draw.color`.
     * @param {object} water campo de alturas
     * @param {number} left cara izquierda del tramo, en m
     * @param {number} right cara derecha del tramo, en m
     * @param {number} step cada cuántas celdas hay una parada
     * @returns {PIXI.FillGradient|null}
     */
    gradientFor(water, left, right, step) {
        const { x0, dx, A } = water;
        const first = Math.round((left - x0) / dx);
        const end = Math.round((right - x0) / dx) - 1;
        let acid = false;
        for (let cell = first; cell <= end && !acid; cell++) acid = A[cell] > 0;
        if (!acid) return null;
        const gradient = new PIXI.FillGradient({ type: "linear", start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, textureSpace: "local" });
        this.gradients.push(gradient);
        const width = right - left;
        const addStop = (x) => {
            fieldColor(water, x, this.stopColor);
            const [red, green, blue] = this.stopColor;
            gradient.addColorStop(Math.min(1, Math.max(0, (x - left) / width)), `rgb(${red}, ${green}, ${blue})`);
        };
        addStop(left);
        for (let cell = first; cell <= end; cell += step) addStop(x0 + (cell + 0.5) * dx);
        addStop(right);
        return gradient;
    }

    /**
     * Redibuja el campo. Con `deep.floor > 0` pinta además un rectángulo del color del agua entre las caras del tramo,
     * de `floor` a `bottom`, para que no se vea el fondo efectivo (`docs/design/16-ascenso.md`).
     * @param {object} water campo de alturas
     * @param {number} screenScale escala de la cámara, en px de pantalla por metro
     * @param {{ floor: number, bottom: number }|null} deep borde del agua profunda y borde inferior de la cámara, en m
     */
    draw(water, screenScale, deep = null) {
        const { alpha, color, lineColor, lineWidth, colorStep } = water.config.draw;
        const scale = this.pixelsPerMeter;
        const { graphics, outline } = this;
        graphics.clear();
        for (const gradient of this.gradients) gradient.destroy();
        this.gradients.length = 0;
        waterOutline(water, outline);
        const { xs, ys } = outline;
        const flat = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        if (deep && deep.floor > 0 && deep.bottom < deep.floor) {
            const left = water.x0 + water.i0 * water.dx;
            graphics
                .rect(left * scale, deep.bottom * scale, (water.i1 - water.i0) * water.dx * scale, (deep.floor - deep.bottom) * scale)
                .fill({ color: flat, alpha });
        }
        const strokeStyle = { width: (lineWidth * scale) / screenScale, color: `rgb(${lineColor[0]}, ${lineColor[1]}, ${lineColor[2]})`, join: "round" };
        for (let section = 0; section < outline.count; section++) {
            const first = outline.start[section];
            const last = first + outline.size[section];
            const gradient = this.gradientFor(water, xs[first], xs[first + outline.surface[section]], colorStep);
            graphics.moveTo(xs[first] * scale, ys[first] * scale);
            for (let vertex = first + 1; vertex < last; vertex++) graphics.lineTo(xs[vertex] * scale, ys[vertex] * scale);
            graphics.closePath().fill(gradient ? { fill: gradient, alpha } : { color: flat, alpha });
            graphics.moveTo(xs[first + 1] * scale, ys[first + 1] * scale);
            const top = first + 1 + outline.surface[section];
            for (let vertex = first + 2; vertex < top; vertex++) graphics.lineTo(xs[vertex] * scale, ys[vertex] * scale);
            graphics.stroke(strokeStyle);
        }
    }

    /** Quita el `Graphics` del mundo y lo destruye junto con los degradados del último frame. */
    destroy() {
        for (const gradient of this.gradients) gradient.destroy();
        this.gradients.length = 0;
        this.graphics.parent?.removeChild(this.graphics);
        this.graphics.destroy();
    }
}
