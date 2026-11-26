/**
 * Nivel estático como geometría de `PIXI.Graphics`, que PIXI conserva entre frames (ver `docs/design/07-sph.md` §7.4).
 * Unidades de la geometría: px a `pixelsPerMeter`; la escala y la posición del mundo las pone la cámara en `world`.
 */
const SOLID_FILL = "#2b2b38";
const SOLID_STROKE = "#555566";
const BREAKABLE_FILL = [120, 82, 54];
const BREAKABLE_WARN = [220, 75, 45];
const BREAKABLE_STROKE = "#e0a96d";

/** Amplitud máxima de la vibración de una plataforma rompible a punto de romperse, en m. */
const BREAKABLE_SHAKE = 0.06;

/** Frecuencia angular de la vibración de una plataforma rompible, en rad/s. */
const BREAKABLE_SHAKE_RATE = 55;

/** Grosor del trazo de los sólidos en pantalla, en px: no cambia con el zoom, como en el dibujo en Canvas 2D. */
const OUTLINE_SCREEN_PX = 2;

/** Cambio relativo del grosor del trazo (en la geometría) a partir del cual se reconstruye el nivel para seguir el zoom. */
const OUTLINE_REBUILD_TOLERANCE = 0.1;

/** Estado que se guarda de una plataforma rota para detectar cuándo cambia (las intactas guardan su `crack`, de 0 a 1). */
const BROKEN_STATE = -1;

/**
 * Mezcla lineal de dos colores `[r, g, b]` (0-255) como texto CSS.
 * @param {number[]} from color con `amount` 0
 * @param {number[]} to color con `amount` 1
 * @param {number} amount de 0 a 1
 */
function mixColor(from, to, amount) {
    const channels = from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount));
    return `rgb(${channels.join(", ")})`;
}

export class LevelView {
    /**
     * @param {object} options
     * @param {PIXI.Container} options.parent contenedor del mundo
     * @param {number} options.pixelsPerMeter px por metro de la geometría
     */
    constructor({ parent, pixelsPerMeter }) {
        this.pixelsPerMeter = pixelsPerMeter;
        this.container = new PIXI.Container();
        this.fixedGraphics = new PIXI.Graphics();
        this.breakableGraphics = new PIXI.Graphics();
        this.container.addChild(this.fixedGraphics, this.breakableGraphics);
        parent.addChild(this.container);
        this.solids = null;
        this.solidCount = -1;
        this.outlineWidth = 0;
        this.breakableStates = [];
        this.breakableCount = -1;
        this.fixedBuilds = 0;
        this.breakableBuilds = 0;
    }

    /**
     * Reconstruye la geometría solo si cambió: los sólidos fijos cuando cambia el conjunto de sólidos y los rompibles
     * cuando cambia su grieta o su rotura, y las dos cuando el zoom cambia el grosor del trazo más que `OUTLINE_REBUILD_TOLERANCE`.
     * El desplazamiento vertical se aplica como posición, sin reconstruir.
     * @param {{ solids: object[] }} level sólidos en metros (`x`, `y`, `w`, `h` del centro)
     * @param {number} offsetY desplazamiento vertical del nivel, en m
     * @param {number} now reloj de juego, en s (fase de la vibración)
     * @param {number} screenScale escala de la cámara, en px de pantalla por metro
     */
    update(level, offsetY, now, screenScale) {
        const { solids } = level;
        const outlineWidth = (OUTLINE_SCREEN_PX * this.pixelsPerMeter) / screenScale;
        if (Math.abs(outlineWidth - this.outlineWidth) > this.outlineWidth * OUTLINE_REBUILD_TOLERANCE) {
            this.outlineWidth = outlineWidth;
            this.solidCount = -1;
        }
        if (solids !== this.solids || solids.length !== this.solidCount) {
            this.solids = solids;
            this.solidCount = solids.length;
            this.breakableCount = -1;
            this.buildFixed(solids);
        }
        if (this.breakableChanged(solids)) this.buildBreakable(solids, now);
        this.container.position.y = offsetY * this.pixelsPerMeter;
    }

    /**
     * Compara la grieta y la rotura de cada rompible con las del frame anterior y las guarda.
     * @param {object[]} solids
     * @returns {boolean} verdadero si alguna cambió o cambió la cantidad de rompibles
     */
    breakableChanged(solids) {
        let changed = false;
        let count = 0;
        for (const solid of solids) {
            if (!solid.breakable) continue;
            const state = solid.broken ? BROKEN_STATE : (solid.crack ?? 0);
            if (this.breakableStates[count] !== state) {
                this.breakableStates[count] = state;
                changed = true;
            }
            count++;
        }
        if (count !== this.breakableCount) changed = true;
        this.breakableCount = count;
        return changed;
    }

    /** Dibuja todos los sólidos fijos con un solo relleno y un solo trazo. */
    buildFixed(solids) {
        const graphics = this.fixedGraphics;
        graphics.clear();
        for (const solid of solids) {
            if (solid.breakable) continue;
            this.addRectangle(graphics, solid, 0);
        }
        graphics.fill(SOLID_FILL);
        graphics.stroke({ width: this.outlineWidth, color: SOLID_STROKE });
        this.fixedBuilds++;
    }

    /** Dibuja las plataformas rompibles que no están rotas: el color pasa al de advertencia y vibran con `crack`. */
    buildBreakable(solids, now) {
        const graphics = this.breakableGraphics;
        graphics.clear();
        for (const solid of solids) {
            if (!solid.breakable || solid.broken) continue;
            const crack = solid.crack ?? 0;
            const shake = crack > 0 ? Math.sin(now * BREAKABLE_SHAKE_RATE) * BREAKABLE_SHAKE * crack : 0;
            this.addRectangle(graphics, solid, shake);
            graphics.fill(mixColor(BREAKABLE_FILL, BREAKABLE_WARN, crack));
            graphics.stroke({ width: this.outlineWidth, color: BREAKABLE_STROKE });
        }
        this.breakableBuilds++;
    }

    addRectangle(graphics, solid, shake) {
        const scale = this.pixelsPerMeter;
        graphics.rect((solid.x - solid.w / 2 + shake) * scale, (solid.y - solid.h / 2) * scale, solid.w * scale, solid.h * scale);
    }
}
