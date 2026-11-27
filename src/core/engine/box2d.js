import { mergeBounds } from "../math/geometry.js";

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