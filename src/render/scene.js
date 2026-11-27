/**
 * Escena única del juego: una `PIXI.Application` con su canvas, el contenedor `world` (que la cámara mueve y escala, en
 * px a `pixelsPerMeter` con la Y hacia arriba) y el contenedor `hud` (pantalla). Ver `docs/design/07-sph.md` §7.4
 * y `docs/design/12-decisiones.md`. Orden de abajo a arriba: nivel, robots (`ragdollLayer`, con la Y invertida porque
 * RagImporter espera la Y hacia abajo), chispas y burbujas, agua, capas de fluido por material y capa superpuesta
 * (recogibles, mira, golpes, rueda y capas de debug del mundo). Las capas de fluido y la superpuesta van en `hud` y siguen a la
 * cámara como `world`, porque tienen que dibujarse encima del agua y de los robots. El HUD, los menús y el panel de debug
 * son HTML (`docs/design/18-interfaz.md`): el juego tiene un solo canvas.
 */
export class Scene {
    /**
     * @param {PIXI.Application} application ya inicializada
     */
    constructor(application) {
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
        this.fluidParent = new PIXI.Container();
        this.overlayLayer = new PIXI.Container();
        this.hud.addChild(this.fluidParent, this.overlayLayer);
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
 * Crea la escena: `PIXI.Application` sin resolución extra, fondo transparente, bordes suavizados, WebGL y sin ticker propio (el loop del juego
 * llama a `render`). Su canvas va primero en `container`, debajo del HUD y las pantallas HTML.
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
        autoStart: false,
    });
    container.prepend(application.canvas);
    return new Scene(application);
}
