import { metaballPeak, metaballProfile } from "./fluidDraw.js";

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

/** Medio lado en px de la textura de campo: el alcance de una partícula sin escalar desde su centro. */
const FIELD_TEXTURE_HALF_PX = FIELD_TEXTURE_SIZE_PX / 2;

/**
 * Una capa por material presente en el frame, para que materiales distintos no se fundan entre sí (ver
 * `docs/design/07-sph.md` §7.4). Cada capa es un `PIXI.Container` con el filtro de líquido de su material (Factory Method:
 * `createFilter`) que lleva un `PIXI.ParticleContainer`;
 * este usa una sola textura de campo, generada la primera vez que aparece el material. Las partículas del contenedor son un
 * pool (Object Pool): se reutilizan entre frames y cada frame solo cambian posición, escala, rotación y tinte.
 * Las capas se crean al primer uso, en `parent`, y se ordenan por el id del material. Un material difuso (el vapor) va sin
 * filtro. `ParticleContainer` de PIXI v8 informa límites vacíos y el sistema de filtros saltea un filtro sin área,
 * así que cada frame se le escriben los límites de sus partículas en `boundsArea`.
 */
export class FluidLayers {
    /**
     * @param {object} options
     * @param {PIXI.Renderer} options.renderer genera las texturas de campo
     * @param {PIXI.Container} options.parent contenedor de las capas; sigue a la cámara como el mundo
     * @param {(kind: number) => PIXI.Filter} options.createFilter crea el filtro de la capa de un material; se llama una vez por material
     * @param {(filter: PIXI.Filter, frame: object) => void} options.updateFilter pone en un filtro los datos del frame, sin crear objetos
     * @param {number} options.pixelsPerMeter px por metro de la geometría del mundo
     */
    constructor({ renderer, parent, createFilter, updateFilter, pixelsPerMeter }) {
        this.renderer = renderer;
        this.parent = parent;
        this.parent.sortableChildren = true;
        this.createFilter = createFilter;
        this.updateFilter = updateFilter;
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
     * @param {boolean} diffuse el material se dibuja difuso, sin filtro
     * @returns {PIXI.Particle}
     */
    acquire(kind, radius, diffuse) {
        if (kind !== this.currentKind || this.currentLayer === null) {
            this.currentKind = kind;
            this.currentLayer = this.layerFor(kind, radius, diffuse);
        }
        const layer = this.currentLayer;
        if (layer.used === layer.pool.length) layer.pool.push(this.createParticle(layer.texture));
        const particle = layer.pool[layer.used];
        if (layer.used === layer.particles.particleChildren.length) layer.particles.addParticle(particle);
        layer.used++;
        return particle;
    }

    /**
     * Quita del contenedor las partículas que sobraron, escribe los límites de las que quedan y oculta las capas que no se
     * usaron en este frame.
     */
    end() {
        for (const layer of this.layers.values()) {
            const { particleChildren } = layer.particles;
            if (particleChildren.length > layer.used) layer.particles.removeParticles(layer.used);
            layer.node.visible = layer.used > 0;
            if (layer.used > 0) this.fitBounds(layer);
        }
    }

    /**
     * Pone los datos del frame (tiempo y cámara) en el filtro de cada capa que tiene uno, sin crear objetos.
     * @param {object} frame datos que entiende `updateFilter`
     */
    setFrame(frame) {
        for (const layer of this.layers.values()) {
            if (layer.filter !== null) this.updateFilter(layer.filter, frame);
        }
    }

    /**
     * Escribe en `boundsArea` del `ParticleContainer` el rectángulo (px, en coordenadas de la capa) que cubre todas sus partículas
     * con su textura escalada y girada.
     * @param {{particles: PIXI.ParticleContainer, bounds: PIXI.Rectangle}} layer capa con partículas en este frame
     */
    fitBounds(layer) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const particle of layer.particles.particleChildren) {
            const reach = FIELD_TEXTURE_HALF_PX * Math.max(Math.abs(particle.scaleX), Math.abs(particle.scaleY));
            minX = Math.min(minX, particle.x - reach);
            minY = Math.min(minY, particle.y - reach);
            maxX = Math.max(maxX, particle.x + reach);
            maxY = Math.max(maxY, particle.y + reach);
        }
        layer.bounds.x = minX;
        layer.bounds.y = minY;
        layer.bounds.width = maxX - minX;
        layer.bounds.height = maxY - minY;
        layer.particles.boundsArea = layer.bounds;
    }

    /**
     * Capa de `kind`: la crea con su textura de campo, su `ParticleContainer` y, salvo que sea difusa, su filtro si es
     * la primera vez.
     * @param {number} kind material de la partícula (`store.kind`)
     * @param {number} radius radio visible de una gota aislada del material, en m
     * @param {boolean} diffuse el material se dibuja difuso, sin filtro
     */
    layerFor(kind, radius, diffuse) {
        let layer = this.layers.get(kind);
        if (layer !== undefined) return layer;
        const texture = this.createFieldTexture(radius);
        const particles = new PIXI.ParticleContainer({ dynamicProperties: { position: true, vertex: true, rotation: true, color: true } });
        const node = new PIXI.Container();
        node.zIndex = kind;
        const filter = diffuse ? null : this.createFilter(kind);
        node.filters = filter === null ? [] : [filter];
        node.addChild(particles);
        this.parent.addChild(node);
        layer = { node, particles, texture, filter, bounds: new PIXI.Rectangle(), pool: [], used: 0 };
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
