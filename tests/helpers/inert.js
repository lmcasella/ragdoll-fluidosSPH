/** Objeto que acepta cualquier llamada y propiedad sin hacer nada (canvas, contexto 2D, nodos del DOM); `stored` fija propiedades. */
export function inert(stored = {}) {
    const noop = () => undefined;
    return new Proxy(noop, {
        get: (_, prop) => (prop in stored ? stored[prop] : noop),
        set: (_, prop, value) => {
            stored[prop] = value;
            return true;
        },
    });
}
