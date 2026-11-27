/**
 * `PIXI` falso para probar en Node (sin WebGL) lo que arma el juego: contenedores con hijos en orden, sprites con su
 * textura, `Graphics` que cuenta cuántas veces se vació y filtros. Partículas y su contenedor, y un renderer que cuenta las texturas generadas. Lo mínimo que usan `src/render/` y RagImporter.
 */

class FakePoint {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    set(x, y = x) {
        this.x = x;
        this.y = y;
    }
}

export class FakeContainer {
    constructor() {
        this.children = [];
        this.parent = null;
        this.position = new FakePoint();
        this.scale = new FakePoint(1, 1);
        this.rotation = 0;
        this.tint = 0xffffff;
        this.visible = true;
        this.zIndex = 0;
        this.filters = null;
        this.sortableChildren = false;
        this.destroyed = false;
    }

    addChild(...children) {
        for (const child of children) {
            child.parent = this;
            this.children.push(child);
        }
        return children[0];
    }

    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) this.children.splice(index, 1);
        child.parent = null;
    }

    /** Marca el contenedor como destruido y, con `{ children: true }`, también a sus hijos, como PIXI. */
    destroy(options) {
        this.destroyed = true;
        if (options?.children) for (const child of this.children) child.destroy(options);
    }
}

class FakeTextureSource {
    constructor(canvas, onResize) {
        this.updates = 0;
        this.width = canvas.width;
        this.height = canvas.height;
        this.onResize = onResize;
    }

    update() {
        this.updates++;
    }

    resize(width, height) {
        this.width = width;
        this.height = height;
        this.onResize();
    }
}

/**
 * Textura falsa que imita a la de PIXI v8: avisa de su cambio de tamaño (`update`) y los sprites solo escuchan el aviso
 * si `dynamic` ya estaba en verdadero al crearse.
 */
class FakeTexture {
    constructor(canvas) {
        this.canvas = canvas;
        this.dynamic = false;
        this.listeners = [];
        this.source = new FakeTextureSource(canvas, () => this.listeners.forEach((listener) => listener()));
    }

    on(listener) {
        this.listeners.push(listener);
    }

    static from(canvas) {
        return new FakeTexture(canvas);
    }
}

/** Sprite falso: `renderedWidth` y `renderedHeight` son el tamaño con que PIXI dibujaría el cuadrilátero (sus límites guardados). */
class FakeSprite extends FakeContainer {
    constructor(texture) {
        super();
        this.texture = texture;
        this.refreshBounds();
        if (texture.dynamic) texture.on(() => this.refreshBounds());
    }

    refreshBounds() {
        this.renderedWidth = this.texture.source.width;
        this.renderedHeight = this.texture.source.height;
    }
}
/**
 * `Graphics` falso: cuenta cuántos se construyeron (`constructed`) y guarda lo trazado desde el último `clear`:
 * `circles` (`x`, `y`, `radius`), `polygons` (lista plana de puntos), `moveTos`, `lineTos`, `arcs`, `cuts`, `fills` y `strokes` (los estilos recibidos).
 */
class FakeGraphics extends FakeContainer {
    static constructed = 0;

    constructor() {
        super();
        FakeGraphics.constructed++;
        this.clears = 0;
        this.reset();
    }

    reset() {
        this.rectangles = 0;
        this.arcs = 0;
        this.moveTos = 0;
        this.cuts = 0;
        this.circles = [];
        this.polygons = [];
        this.lineTos = 0;
        this.fills = [];
        this.strokes = [];
    }

    clear() {
        this.clears++;
        this.reset();
        return this;
    }

    rect() {
        this.rectangles++;
        return this;
    }

    circle(x, y, radius) {
        this.circles.push({ x, y, radius });
        return this;
    }

    poly(points) {
        this.polygons.push([...points]);
        return this;
    }

    moveTo() {
        this.moveTos++;
        return this;
    }

    arc() {
        this.arcs++;
        return this;
    }

    cut() {
        this.cuts++;
        return this;
    }

    lineTo() {
        this.lineTos++;
        return this;
    }

    closePath() {
        return this;
    }

    fill(style) {
        this.fills.push(style);
        return this;
    }

    stroke(style) {
        this.strokes.push(style);
        return this;
    }
}

/** `Text` falso: cuenta cuántos se construyeron (`constructed`) y guarda el texto, el estilo, la resolución y el ancla. */
class FakeText extends FakeContainer {
    static constructed = 0;

    constructor({ text = "", style = {}, resolution = 1 } = {}) {
        super();
        FakeText.constructed++;
        this.text = text;
        this.style = style;
        this.resolution = resolution;
        this.anchor = new FakePoint();
    }
}

/** `FillGradient` falso: cuenta cuántos se construyeron (`constructed`) y guarda sus opciones y las paradas de color en el orden en que se agregan. */
class FakeFillGradient {
    static constructed = 0;

    constructor(options) {
        FakeFillGradient.constructed++;
        this.options = options;
        this.colorStops = [];
        this.destroyed = false;
    }

    addColorStop(offset, color) {
        this.colorStops.push({ offset, color });
        return this;
    }

    destroy() {
        this.destroyed = true;
    }
}

/**
 * Partícula falsa de ParticleContainer: cuenta cuántas se construyeron (constructed) y guarda los campos que escribe el juego.
 */
class FakeParticle {
    static constructed = 0;

    constructor({ texture, anchorX = 0, anchorY = 0 }) {
        FakeParticle.constructed++;
        this.texture = texture;
        this.anchorX = anchorX;
        this.anchorY = anchorY;
        this.x = 0;
        this.y = 0;
        this.scaleX = 1;
        this.scaleY = 1;
        this.rotation = 0;
        this.tint = 0xffffff;
    }
}

/** ParticleContainer falso: lista de partículas con alta y baja, como PIXI v8. */
class FakeParticleContainer extends FakeContainer {
    constructor(options) {
        super();
        this.options = options;
        this.particleChildren = [];
    }

    addParticle(particle) {
        this.particleChildren.push(particle);
        return particle;
    }

    removeParticles(start = 0, end = this.particleChildren.length) {
        return this.particleChildren.splice(start, end - start);
    }
}

/** `Rectangle` falso: posición y tamaño, como PIXI v8. */
class FakeRectangle {
    constructor(x = 0, y = 0, width = 0, height = 0) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }
}

/** Filtro falso: guarda sus opciones y, como PIXI v8, expone cada grupo de uniforms de `resources` con sus valores en `uniforms`. */
class FakeFilter {
    static constructed = 0;

    constructor(options) {
        FakeFilter.constructed++;
        this.options = options;
        this.resources = {};
        for (const [group, definitions] of Object.entries(options.resources ?? {})) {
            const uniforms = {};
            for (const [name, definition] of Object.entries(definitions)) uniforms[name] = definition.value;
            this.resources[group] = { uniforms };
        }
    }
}

/** Fuente de textura de datos falsa: guarda el buffer y cuenta las construcciones y las actualizaciones. */
class FakeBufferImageSource {
    static constructed = 0;

    constructor(options) {
        FakeBufferImageSource.constructed++;
        this.options = options;
        this.resource = options.resource;
        this.updates = 0;
    }

    update() {
        this.updates++;
    }

    destroy() {}
}

class FakeApplication {
    async init(options) {
        this.options = options;
        this.canvas = globalThis.document.createElement("canvas");
        this.canvas.width = options.width;
        this.canvas.height = options.height;
        this.stage = new FakeContainer();
        this.renders = 0;
        this.renderer = {
            generatedTextures: 0,
            generateTexture: (graphics) => {
                this.renderer.generatedTextures++;
                return { source: {}, graphics };
            },
            resize: (width, height) => {
                this.canvas.width = width;
                this.canvas.height = height;
            },
        };
    }

    render() {
        this.renders++;
    }
}

/** Instala el `PIXI` falso en `globalThis` y lo devuelve. */
export function installFakePixi() {
    globalThis.PIXI = {
        Application: FakeApplication,
        Container: FakeContainer,
        Sprite: FakeSprite,
        Texture: FakeTexture,
        Graphics: FakeGraphics,
        Text: FakeText,
        Particle: FakeParticle,
        ParticleContainer: FakeParticleContainer,
        FillGradient: FakeFillGradient,
        Rectangle: FakeRectangle,
        Filter: FakeFilter,
        BufferImageSource: FakeBufferImageSource,
        GlProgram: { from: (options) => options },
    };
    return globalThis.PIXI;
}
