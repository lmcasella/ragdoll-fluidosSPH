/**
 * Una capa de dibujo en Canvas 2D que la escena PIXI muestra como sprite: el canvas queda fuera de pantalla (no entra
 * al DOM) y su textura se vuelve a subir una vez por frame, después de dibujar (ver `docs/design/07-sph.md` §7.4).
 */
export class CanvasLayer {
    /**
     * @param {object} options
     * @param {Document} options.doc crea el canvas fuera de pantalla
     * @param {string} options.name nombre de la capa (queda en `canvas.id`)
     * @param {PIXI.Container} options.parent contenedor que recibe el sprite
     * @param {number} options.width ancho en px
     * @param {number} options.height alto en px
     */
    constructor({ doc, name, parent, width, height }) {
        this.canvas = doc.createElement("canvas");
        this.canvas.id = name;
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext("2d");
        this.texture = PIXI.Texture.from(this.canvas);
        this.sprite = new PIXI.Sprite(this.texture);
        parent.addChild(this.sprite);
    }

    get width() {
        return this.canvas.width;
    }

    get height() {
        return this.canvas.height;
    }

    /**
     * Cambia el tamaño del canvas y de su textura, en px de pantalla.
     * @param {number} width
     * @param {number} height
     */
    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.texture.source.resize(width, height);
    }

    /** Deja el contexto sin transformación y el canvas vacío. */
    clear() {
        this.ctx.resetTransform();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /** Sube el canvas a la textura de la escena; se llama una vez por frame, después de dibujar. */
    upload() {
        this.texture.source.update();
    }
}
