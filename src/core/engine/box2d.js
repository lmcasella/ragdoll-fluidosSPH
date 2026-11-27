/** Handle nulo de Box2D: el fin de las listas enlazadas de fixtures, cuerpos y contactos. */
const NULL_POINTER = 0;

/** Índice del AABB de un fixture que Box2D calcula (`GetAABB(childIndex)`): una forma simple tiene un solo hijo. */
const SINGLE_CHILD = 0;

/**
 * Llama a `visit(fixture, context)` por cada fixture de `body`, en el orden de su lista. Recorre la lista enlazada de
 * Box2D sin reservar memoria nativa ni objetos de JS: los datos del recorrido viajan en `context`, que se reutiliza.
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
 * Escribe en `out` la caja (AABB) de `fixture` en el mundo. No reserva memoria nativa: lee los vectores del propio fixture.
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
 * @param {Map<string, object>} bodies cuerpos por identificador, como `rag.bodies` de RagImporter
 * @param {(body: object, context: object) => void} visit se llama una vez por cuerpo
 * @param {object} context datos del recorrido que recibe `visit`
 */
export function forEachBody(bodies, visit, context) {
    for (const body of bodies.values()) visit(body, context);
}
