/**
 * `PIXI` falso para probar en Node (sin WebGL) lo que arma el juego: contenedores con hijos en orden, sprites con su
 * textura, `Graphics` que cuenta cuántas veces se vació y filtros. Lo mínimo que usan `src/render/` y RagImporter.
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
        this.position = new FakePoint();
        this.scale = new FakePoint(1, 1);
        this.visible = true;
        this.zIndex = 0;
        this.filters = null;
        this.sortableChildren = false;
    }

    addChild(...children) {
        this.children.push(...children);
        return children[0];
    }

    removeChild() {}

    destroy() {}
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
class FakeGraphics extends FakeContainer {
    constructor() {
        super();
        this.clears = 0;
        this.rectangles = 0;
    }

    clear() {
        this.clears++;
        this.rectangles = 0;
        return this;
    }

    rect() {
        this.rectangles++;
        return this;
    }

    fill() {
        return this;
    }

    stroke() {
        return this;
    }
}

class FakeFilter {
    constructor(options) {
        this.options = options;
    }
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
        Filter: FakeFilter,
        GlProgram: { from: (options) => options },
    };
    return globalThis.PIXI;
}
