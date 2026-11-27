import { CanvasLayer } from "./canvasLayer.js";

/**
 * Escena única del juego: una `PIXI.Application` con su canvas, el contenedor `world` (que la cámara mueve y escala, en
 * px a `pixelsPerMeter` con la Y hacia arriba) y el contenedor `hud` (pantalla, sin cámara). Ver `docs/design/07-sph.md`
 * §7.4 y `docs/design/12-decisiones.md`. Orden de abajo a arriba: nivel, robots (`ragdollLayer`, con la Y invertida porque
 * RagImporter espera la Y hacia abajo), chispas y burbujas, agua, capas de fluido por material, capa superpuesta
 * (recogibles, mira, golpes, rueda y capas de debug) y panel de debug. Es un solo canvas del DOM: las capas 2D son sprites.
 */
export class Scene {
    /**
     * @param {PIXI.Application} application ya inicializada
     * @param {Document} doc crea los canvas fuera de pantalla de las capas
     * @param {number} width ancho en px
     * @param {number} height alto en px
     */
    constructor(application, doc, width, height) {
        this.application = application;
        this.world = new PIXI.Container();
        this.hud = new PIXI.Container();
        application.stage.addChild(this.world, this.hud);
        this.levelLayer = new PIXI.Container();
        this.ragdollLayer = new PIXI.Container();
        this.ragdollLayer.scale.y = -1;
        this.effectsLayer = new PIXI.Container();
        this.waterLayer = new PIXI.Container();
        this.world.addChild(this.levelLayer, this.ragdollLayer, this.effectsLayer, this.waterLayer);
        const layerOptions = { doc, parent: this.hud, width, height };
        this.fluidParent = new PIXI.Container();
        this.hud.addChild(this.fluidParent);
        this.overlayLayer = new CanvasLayer({ ...layerOptions, name: "overlayLayer" });
        this.panelLayer = new CanvasLayer({ ...layerOptions, name: "panelLayer" });
        this.layers = [this.overlayLayer, this.panelLayer];
    }

    /**
     * Cambia el tamaño del canvas de la escena y de sus capas 2D, en px de pantalla.
     * @param {number} width
     * @param {number} height
     */
    resize(width, height) {
        this.application.renderer.resize(width, height);
        for (const layer of this.layers) layer.resize(width, height);
    }

    /** Sube las capas 2D y dibuja la escena; se llama una vez por frame, al final. */
    render() {
        for (const layer of this.layers) layer.upload();
        this.application.render();
    }
}

/**
 * Crea la escena: `PIXI.Application` sin resolución extra, fondo transparente, bordes suavizados como en Canvas 2D, WebGL y sin ticker propio (el loop del juego
 * llama a `render`). Su canvas va primero en `container`, debajo del HUD y las pantallas HTML.
 * @param {object} options
 * @param {HTMLElement} options.container elemento que recibe el canvas
 * @param {Document} options.doc crea los canvas fuera de pantalla de las capas
 * @param {number} options.width ancho en px
 * @param {number} options.height alto en px
 * @returns {Promise<Scene>}
 */
export async function createScene({ container, doc, width, height }) {
    const application = new PIXI.Application();
    await application.init({
        width,
        height,
        resolution: 1,
        backgroundAlpha: 0,
        antialias: true,
        preference: "webgl",
        autoStart: false,
    });
    container.prepend(application.canvas);
    return new Scene(application, doc, width, height);
}
