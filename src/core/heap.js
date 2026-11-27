/** Cantidad de componentes de un vector 2D en los buffers de partículas del motor (`x`, `y`). */
export const VECTOR_COMPONENTS = 2;

/** Desplazamiento de bits que pasa un offset en bytes del heap a un índice de palabra de 4 bytes (`Float32Array` e `Int32Array`). */
const WORD_SHIFT = 2;

/**
 * Índice de palabra de 4 bytes de un puntero del heap, para leer un buffer del motor con `Box2D.HEAPF32`.
 * @param {number} pointer offset en bytes dentro del heap, por ejemplo `Box2D.getPointer(system.GetPositionBuffer())`
 * @returns {number}
 */
export function wordIndexOf(pointer) {
    return pointer >> WORD_SHIFT;
}
