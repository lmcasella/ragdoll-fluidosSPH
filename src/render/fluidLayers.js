import { metaballPeak, metaballProfile } from "./render.js";

/** Lado en px de la textura de campo de cada material; el sprite se escala a metros al dibujarlo. */
const FIELD_TEXTURE_SIZE_PX = 64;

/** Paradas del degradado radial de la textura de campo: entre 0 y 1 del radio de influencia. */
const FIELD_GRADIENT_STOPS = 16;

/** Centro de la textura de campo, como fracción de su lado. */
const FIELD_CENTER = { x: 0.5, y: 0.5 };

/** Radio de la textura de campo, como fracción de su lado: el campo vale 0 en el borde del círculo inscripto. */
const FIELD_RADIUS_FRACTION = 0.5;

/** Color blanco de la textura de campo: cada partícula la tiñe con su color del buffer del motor. */
const FIELD_RGB = "255, 255, 255";

/** Dígitos del alfa de cada parada del degradado. */
const ALPHA_DIGITS = 4;

/** Centro de cada partícula dentro de su textura, como fracción de su lado. */
const PARTICLE_ANCHOR = 0.5;

/**
 * Una capa por material presente en el frame, para que materiales distintos no se fundan entre sí (ver
 * `docs/design/07-sph.md` §7.4). Cada capa es un `PIXI.Container` con el filtro de umbral que lleva un `PIXI.ParticleContainer`;
 * este usa una sola textura de campo, generada la primera vez que aparece el material. Las partículas del contenedor son un
 * pool (Object Pool): se reutilizan entre frames y cada frame solo cambian posición, escala, rotación y tinte.
 * Las capas se crean al primer uso, en `parent`, y se ordenan por el id del material.
 */
export class FluidLayers {
    /**
     * @param {object} options
     * @param {PIXI.Renderer} options.renderer genera las texturas de campo
     * @param {PIXI.Container} options.parent contenedor de las capas; sigue a la cámara como el mundo
     * @param {PIXI.Filter} options.filter filtro de umbral que se aplica a cada capa
     * @param {number} options.pixelsPerMeter px por metro de la geometría del mundo
     */
    constructor({ renderer, parent, filter, pixelsPerMeter }) {
        this.renderer = renderer;
        this.parent = parent;
        this.parent.sortableChildren = true;
        this.filter = filter;
        this.pixelsPerMeter = pixelsPerMeter;
        this.scalePerMeter = (2 * pixelsPerMeter) / FIELD_TEXTURE_SIZE_PX;
        this.layers = new Map();
        this.currentKind = null;
        this.currentLayer = null;
    }

    /** Marca todas las capas como sin usar; se llama una vez por frame, antes de pedir partículas. */
    begin() {
        for (const layer of this.layers.values()) layer.used = 0;
        this.currentKind = null;
        this.currentLayer = null;
    }

    /**
     * Partícula del pool de `kind` lista para escribir: `x` e `y` en px, `scaleX`, `scaleY`, `rotation` y `tint`. La textura se
     * genera con el radio visible `radius` (m) la primera vez que aparece el material.
     * @param {number} kind material de la partícula (`store.kind`)
     * @param {number} radius radio visible de una gota aislada del material, en m
     * @returns {PIXI.Particle}
     */
    acquire(kind, radius) {
        if (kind !== this.currentKind || this.currentLayer === null) {
            this.currentKind = kind;
            this.currentLayer = this.layerFor(kind, radius);
        }
        const layer = this.currentLayer;
        if (layer.used === layer.pool.length) layer.pool.push(this.createParticle(layer.texture));
        const particle = layer.pool[layer.used];
        if (layer.used === layer.particles.particleChildren.length) layer.particles.addParticle(particle);
        layer.used++;
        return particle;
    }

    /** Quita del contenedor las partículas que sobraron y oculta las capas que no se usaron en este frame. */
    end() {
        for (const layer of this.layers.values()) {
            const { particleChildren } = layer.particles;
            if (particleChildren.length > layer.used) layer.particles.removeParticles(layer.used);
            layer.node.visible = layer.used > 0;
        }
    }

    /**
     * Capa de `kind`: la crea con su textura de campo, su `ParticleContainer` y el filtro de umbral si es la primera vez.
     * @param {number} kind material de la partícula (`store.kind`)
     * @param {number} radius radio visible de una gota aislada del material, en m
     */
    layerFor(kind, radius) {
        let layer = this.layers.get(kind);
        if (layer !== undefined) return layer;
        const texture = this.createFieldTexture(radius);
        const particles = new PIXI.ParticleContainer({ dynamicProperties: { position: true, vertex: true, rotation: true, color: true } });
        const node = new PIXI.Container();
        node.zIndex = kind;
        node.filters = [this.filter];
        node.addChild(particles);
        this.parent.addChild(node);
        layer = { node, particles, texture, pool: [], used: 0 };
        this.layers.set(kind, layer);
        return layer;
    }

    /**
     * Partícula nueva del pool, centrada en su textura.
     * @param {PIXI.Texture} texture textura de campo del material
     */
    createParticle(texture) {
        return new PIXI.Particle({ texture, anchorX: PARTICLE_ANCHOR, anchorY: PARTICLE_ANCHOR });
    }

    /**
     * Textura de campo blanca con el perfil de `metaballProfile` y el pico de `metaballPeak(radius)`; se genera una sola vez por material.
     * @param {number} radius radio visible de una gota aislada del material, en m
     */
    createFieldTexture(radius) {
        const peak = metaballPeak(radius);
        const gradient = new PIXI.FillGradient({
            type: "radial",
            center: FIELD_CENTER,
            innerRadius: 0,
            outerCenter: FIELD_CENTER,
            outerRadius: FIELD_RADIUS_FRACTION,
            textureSpace: "local",
        });
        for (let stop = 0; stop <= FIELD_GRADIENT_STOPS; stop++) {
            const distanceOverRadius = stop / FIELD_GRADIENT_STOPS;
            const alpha = (peak * metaballProfile(distanceOverRadius)).toFixed(ALPHA_DIGITS);
            gradient.addColorStop(distanceOverRadius, `rgba(${FIELD_RGB}, ${alpha})`);
        }
        const graphics = new PIXI.Graphics().rect(0, 0, FIELD_TEXTURE_SIZE_PX, FIELD_TEXTURE_SIZE_PX).fill({ fill: gradient });
        const texture = this.renderer.generateTexture(graphics);
        graphics.destroy();
        gradient.destroy();
        return texture;
    }
}
