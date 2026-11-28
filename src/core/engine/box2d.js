import { mergeBounds } from "../math/geometry.js";

/** Tipos de cuerpo de Box2D: los valores de `b2BodyType`, que devuelve `body.GetType()`. */
export const BODY_TYPE = Object.freeze({ STATIC: 0, KINEMATIC: 1, DYNAMIC: 2 });

/** Handle nulo de Box2D: el fin de las listas enlazadas de fixtures, cuerpos y contactos. */
const NULL_POINTER = 0;

/** Índice del AABB de un fixture que Box2D calcula (`GetAABB(childIndex)`): una forma simple tiene un solo hijo. */
const SINGLE_CHILD = 0;

/**
 * Llama a `visit(fixture, context)` por cada fixture de `body`, en el orden de su lista. Recorre la lista enlazada de
 * Box2D sin crear objetos nativos (`new Box2D.*`), así que no hay nada que liberar: los datos del recorrido viajan en
 * `context`, que se reutiliza.
 * Los fixtures son del mundo: nunca se destruyen con `Box2D.destroy`.
 * @param {object} body `b2Body`
 * @param {(fixture: object, context: object) => void} visit se llama una vez por fixture
 * @param {object} context datos del recorrido que recibe `visit`
 */
export function forEachFixture(body, visit, context) {
    for (let fixture = body.GetFixtureList(); Box2D.getPointer(fixture) !== NULL_POINTER; fixture = fixture.GetNext()) {
        visit(fixture, context);
    }
}

/**
 * Escribe en `out` la caja (AABB) de `fixture` en el mundo. No crea objetos nativos (`new Box2D.*`), así que no hay nada que liberar: lee los vectores del propio fixture.
 * @param {object} fixture `b2Fixture`
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} out recibe la caja, en m
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}} `out`
 */
export function fixtureBounds(fixture, out) {
    const aabb = fixture.GetAABB(SINGLE_CHILD);
    const lower = aabb.get_lowerBound();
    const upper = aabb.get_upperBound();
    out.minX = lower.get_x();
    out.minY = lower.get_y();
    out.maxX = upper.get_x();
    out.maxY = upper.get_y();
    return out;
}

/**
 * Llama a `visit(body, context)` por cada cuerpo de `bodies`, en el orden en que se insertaron.
 * @param {Map<string, object>|object[]} bodies cuerpos: un `Map` por identificador, como `rag.bodies` de RagImporter, o un arreglo
 * @param {(body: object, context: object) => void} visit se llama una vez por cuerpo
 * @param {object} context datos del recorrido que recibe `visit`
 */
export function forEachBody(bodies, visit, context) {
    for (const body of bodies.values()) visit(body, context);
}

/**
 * Llama a `visit(body, context)` por cada cuerpo del mundo, en el orden de su lista enlazada de Box2D. No reserva
 * memoria nativa. No crear ni destruir cuerpos desde `visit`.
 * @param {object} world `b2World`
 * @param {(body: object, context: object) => void} visit se llama una vez por cuerpo
 * @param {object} context datos del recorrido que recibe `visit`
 */
export function forEachWorldBody(world, visit, context) {
    for (let body = world.GetBodyList(); Box2D.getPointer(body) !== NULL_POINTER; body = body.GetNext()) {
        visit(body, context);
    }
}

/** Datos de trabajo de `boundsOfBody` y `boundsOfBodies`: la caja que se acumula y una caja para leer cada fixture. */
const boundsScan = { target: null, fixtureBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };

/**
 * Suma a la caja acumulada la de un fixture.
 * @param {object} fixture `b2Fixture`
 * @param {{target: object, fixtureBox: object}} scan caja acumulada y caja de trabajo
 */
function mergeFixtureBounds(fixture, scan) {
    mergeBounds(scan.target, fixtureBounds(fixture, scan.fixtureBox));
}

/**
 * Suma a la caja acumulada la de todos los fixtures de un cuerpo.
 * @param {object} body `b2Body`
 * @param {{target: object, fixtureBox: object}} scan caja acumulada y caja de trabajo
 */
function mergeBodyBounds(body, scan) {
    forEachFixture(body, mergeFixtureBounds, scan);
}

/**
 * Escribe en `out` la caja que une los fixtures de un cuerpo, en el mundo. Un cuerpo sin fixtures deja la caja vacía
 * (`Infinity` y `-Infinity`). No crea objetos.
 * @param {object} body `b2Body`
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} out recibe la caja, en m
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}} `out`
 */
export function boundsOfBody(body, out) {
    resetBounds(out);
    boundsScan.target = out;
    mergeBodyBounds(body, boundsScan);
    boundsScan.target = null;
    return out;
}

/**
 * Escribe en `out` la caja que une los fixtures de todos los cuerpos de `bodies`, en el mundo. No crea objetos.
 * @param {Map<string, object>|object[]} bodies cuerpos: un `Map` por identificador o un arreglo
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} out recibe la caja, en m
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}} `out`
 */
export function boundsOfBodies(bodies, out) {
    resetBounds(out);
    boundsScan.target = out;
    forEachBody(bodies, mergeBodyBounds, boundsScan);
    boundsScan.target = null;
    return out;
}

/** Máximo de vértices de un polígono de Box2D (`b2_maxPolygonVertices`). */
export const MAX_POLYGON_VERTICES = 8;

/** Bytes de un vértice en el heap: dos `float` de 32 bits (x, y). */
const VERTEX_BYTES = 8;

/** Corrimiento para pasar un puntero del heap a índice de `Box2D.HEAPF32` (elementos de 4 bytes). */
const FLOAT_INDEX_SHIFT = 2;

/** Vértices de un polígono de Box2D: menos de tres no encierran área. */
const MINIMUM_POLYGON_VERTICES = 3;

/** Vértices de una caja. */
const BOX_VERTICES = 4;

/** Valores por vértice en un arreglo intercalado (x, y). */
const COMPONENTS_PER_VERTEX = 2;

/** Fricción por defecto de Box2D para un fixture, adimensional. */
const DEFAULT_FRICTION = 0.2;

/** Filtro de colisión por defecto de Box2D: categoría 1, choca con todo, sin grupo. */
const DEFAULT_FILTER = { categoryBits: 0x0001, maskBits: 0xffff, groupIndex: 0 };

/**
 * Crea fixtures poligonales convexos sin memoria nativa por llamada. Reserva una sola vez un `b2PolygonShape`, un
 * `b2FixtureDef` y un buffer del heap para `MAX_POLYGON_VERTICES` vértices, y los reutiliza en cada fixture
 * (patrón Object Pool). Quien lo crea llama a `dispose()` al terminar; los fixtures creados son del cuerpo y se quitan
 * con `body.DestroyFixture`, nunca con `Box2D.destroy`.
 */
export class PolygonFixtureBuilder {
    constructor() {
        this.shape = new Box2D.b2PolygonShape();
        this.definition = new Box2D.b2FixtureDef();
        this.definition.set_shape(this.shape);
        this.vertexPointer = Box2D._malloc(VERTEX_BYTES * MAX_POLYGON_VERTICES);
        this.vertexArray = Box2D.wrapPointer(this.vertexPointer, Box2D.b2Vec2);
        this.boxCorners = new Float32Array(BOX_VERTICES * COMPONENTS_PER_VERTEX);
    }

    /**
     * Crea un fixture con un polígono convexo en `body`.
     * @param {object} body `b2Body`
     * @param {ArrayLike<number>} vertices vértices intercalados `[x0, y0, …]` en m, locales al cuerpo, antihorarios y convexos
     * @param {{density?: number, friction?: number, isSensor?: boolean, filter?: {categoryBits: number, maskBits: number, groupIndex: number}, userData?: number}} [material]
     * densidad en kg/m², fricción adimensional, si es sensor, filtro de colisión y dato de usuario (un entero)
     * @returns {object} el `b2Fixture` creado
     */
    createPolygon(body, vertices, { density = 0, friction = DEFAULT_FRICTION, isSensor = false, filter = DEFAULT_FILTER, userData = 0 } = {}) {
        const count = vertices.length / COMPONENTS_PER_VERTEX;
        if (count < MINIMUM_POLYGON_VERTICES || count > MAX_POLYGON_VERTICES) {
            throw new RangeError(`un polígono de Box2D lleva de ${MINIMUM_POLYGON_VERTICES} a ${MAX_POLYGON_VERTICES} vértices, no ${count}`);
        }
        const base = this.vertexPointer >> FLOAT_INDEX_SHIFT;
        for (let index = 0; index < vertices.length; index++) Box2D.HEAPF32[base + index] = vertices[index];
        this.shape.Set(this.vertexArray, count);
        this.definition.set_density(density);
        this.definition.set_friction(friction);
        this.definition.set_isSensor(isSensor);
        this.definition.set_userData(userData);
        const nativeFilter = this.definition.get_filter();
        nativeFilter.set_categoryBits(filter.categoryBits);
        nativeFilter.set_maskBits(filter.maskBits);
        nativeFilter.set_groupIndex(filter.groupIndex);
        return body.CreateFixture(this.definition);
    }

    /**
     * Crea un fixture con una caja alineada con los ejes del cuerpo.
     * @param {object} body `b2Body`
     * @param {{x: number, y: number, width: number, height: number}} box centro y tamaño, en m, locales al cuerpo
     * @param {object} [material] ver `createPolygon`
     * @returns {object} el `b2Fixture` creado
     */
    createBox(body, box, material) {
        const left = box.x - box.width / 2;
        const right = box.x + box.width / 2;
        const bottom = box.y - box.height / 2;
        const top = box.y + box.height / 2;
        this.boxCorners.set([left, bottom, right, bottom, right, top, left, top]);
        return this.createPolygon(body, this.boxCorners, material);
    }

    /** Libera el polígono, la definición y el buffer del heap. Los fixtures ya creados no se tocan. */
    dispose() {
        Box2D._free(this.vertexPointer);
        Box2D.destroy(this.definition);
        Box2D.destroy(this.shape);
    }
}

/**
 * Deja una caja vacía: lista para que `mergeBounds` la agrande.
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} bounds caja que se modifica
 */
function resetBounds(bounds) {
    bounds.minX = Infinity;
    bounds.minY = Infinity;
    bounds.maxX = -Infinity;
    bounds.maxY = -Infinity;
}