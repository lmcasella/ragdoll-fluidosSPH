import { LightMapPass } from "./lightMapPass.js";

/**
 * Escena única del juego: una `PIXI.Application` con su canvas, el contenedor `world` (que la cámara mueve y escala, en
 * px a `pixelsPerMeter` con la Y hacia arriba). Ver `docs/design/07-sph.md` §7.4
 * y `docs/design/12-decisiones.md`. Debajo de `world` va `backgroundLayer`, el fondo con parallax (`docs/design/13-arte.md`
 * §13.1): queda fuera de `world` porque cada una de sus capas tiene su propia posición y zoom. Orden de abajo a arriba,
 * todo dentro de `world` (una sola cámara): nivel (con cajas), robots (`ragdollLayer`, con la Y invertida porque
 * RagImporter espera la Y hacia abajo), chispas y burbujas, capas de
 * fluido por material, agua (debajo de ella quedan las partículas, que el agua refracta) y capa superpuesta (recogibles, mira, golpes, rueda y capas de debug del mundo), que se dibujan
 * encima del agua y de los robots. Solo el nivel (plataformas, terreno y cajas) tapa la luz: `renderLightMap` dibuja con
 * él el mapa de oclusión y el de luz antes de cada frame (`lightMapPass.js`); los robots y los líquidos no la tapan. El HUD, los menús y el panel de debug son HTML
 * (`docs/design/18-interfaz.md`): el juego tiene un solo canvas.
 */
export class Scene {
    /**
     * @param {PIXI.Application} application ya inicializada
     */
    constructor(application) {
        this.application = application;
        this.backgroundLayer = new PIXI.Container();
        this.world = new PIXI.Container();
        application.stage.addChild(this.backgroundLayer, this.world);
        this.levelLayer = new PIXI.Container();
        this.ragdollLayer = new PIXI.Container();
        this.ragdollLayer.scale.y = -1;
        this.effectsLayer = new PIXI.Container();
        this.waterLayer = new PIXI.Container();
        this.fluidParent = new PIXI.Container();
        this.overlayLayer = new PIXI.Container();
        this.world.addChild(this.levelLayer, this.ragdollLayer, this.effectsLayer, this.fluidParent, this.waterLayer, this.overlayLayer);
        this.lightMapPass = new LightMapPass({ world: this.world, casters: [this.levelLayer] });
    }

    /**
     * Registra los filtros de material de las capas que tapan la luz (el nivel y las cajas), que se apagan al dibujar el mapa de oclusión.
     * @param {...PIXI.Filter} filters
     */
    addOccluderFilters(...filters) {
        this.lightMapPass.addOccluderFilters(...filters);
    }

    /**
     * Dibuja el mapa de oclusión y el de luz del frame; se llama una vez por frame, después de poner la cámara y antes de `render`.
     * @param {{originX: number, originY: number, pixelsPerMeter: number}} camera origen del mundo en px de pantalla y px por metro
     * @param {{data: Float32Array, count: number}} lightSet luces de `createLightSet`
     */
    renderLightMap(camera, lightSet) {
        const { renderer } = this.application;
        this.lightMapPass.render(renderer, { width: renderer.screen.width, height: renderer.screen.height, camera, lightSet });
    }

    /**
     * Cambia el tamaño del canvas de la escena, en px de pantalla.
     * @param {number} width
     * @param {number} height
     */
    resize(width, height) {
        this.application.renderer.resize(width, height);
    }

    /** Dibuja la escena; se llama una vez por frame, al final. */
    render() {
        this.application.render();
    }
}

/**
 * Crea la escena: `PIXI.Application` sin resolución extra, fondo transparente, bordes suavizados, WebGL, con `useBackBuffer` (sin él
 * PIXI saltea los filtros que leen lo que hay detrás, como los del agua) y sin ticker propio (el loop del juego llama a `render`). Su canvas va primero en `container`, debajo del HUD y las pantallas HTML.
 * @param {object} options
 * @param {HTMLElement} options.container elemento que recibe el canvas
 * @param {number} options.width ancho en px
 * @param {number} options.height alto en px
 * @returns {Promise<Scene>}
 */
export async function createScene({ container, width, height }) {
    const application = new PIXI.Application();
    await application.init({
        width,
        height,
        resolution: 1,
        backgroundAlpha: 0,
        antialias: true,
        preference: "webgl",
        useBackBuffer: true,
        autoStart: false,
    });
    container.prepend(application.canvas);
    return new Scene(application);
}
