import { createShadowFilter, setShadowFilterLights, updateShadowFilter } from "./shadowFilter.js";

/**
 * Escena única del juego: una `PIXI.Application` con su canvas, el contenedor `world` (que la cámara mueve y escala, en
 * px a `pixelsPerMeter` con la Y hacia arriba). Ver `docs/design/07-sph.md` §7.4
 * y `docs/design/12-decisiones.md`. Debajo de `world` va `backgroundLayer`, el fondo con parallax (`docs/design/13-arte.md`
 * §13.1): queda fuera de `world` porque cada una de sus capas tiene su propia posición y zoom. Orden de abajo a arriba,
 * todo dentro de `world` (una sola cámara): nivel (con cajas), ambos con un filtro de sombras proyectadas sobre lo de atrás
 * (`shadowFilter.js`; el de los robots va después del filtro de material, que `index.js` pone en `ragdollLayer`), robots
 * (`ragdollLayer`, con la Y invertida porque RagImporter espera la Y hacia abajo), chispas y burbujas, capas de
 * fluido por material, agua (debajo de ella quedan las partículas, que el agua refracta) y capa superpuesta (recogibles, mira, golpes, rueda y capas de debug del mundo), que se dibujan
 * encima del agua y de los robots. El HUD, los menús y el panel de debug son HTML (`docs/design/18-interfaz.md`): el
 * juego tiene un solo canvas.
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
        this.levelShadowFilter = createShadowFilter();
        this.levelLayer.filters = [this.levelShadowFilter];
        this.ragdollLayer = new PIXI.Container();
        this.ragdollLayer.scale.y = -1;
        this.ragdollShadowFilter = createShadowFilter();
        this.effectsLayer = new PIXI.Container();
        this.waterLayer = new PIXI.Container();
        this.fluidParent = new PIXI.Container();
        this.overlayLayer = new PIXI.Container();
        this.world.addChild(this.levelLayer, this.ragdollLayer, this.effectsLayer, this.fluidParent, this.waterLayer, this.overlayLayer);
    }

    /**
     * Pone la cámara y las luces del frame en los filtros de sombra de las capas del nivel y de los robots, sin crear objetos.
     * @param {{originX: number, originY: number, pixelsPerMeter: number}} camera origen del mundo en px de pantalla y px por metro
     * @param {{data: Float32Array, count: number}} lightSet luces de `createLightSet`
     */
    setShadowLights(camera, lightSet) {
        for (const filter of [this.levelShadowFilter, this.ragdollShadowFilter]) {
            updateShadowFilter(filter, camera);
            setShadowFilterLights(filter, lightSet);
        }
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
