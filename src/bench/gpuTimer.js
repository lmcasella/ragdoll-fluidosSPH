import { BENCH } from "./benchScript.js";

const GPU_TIMER_EXTENSION = "EXT_disjoint_timer_query_webgl2";
const NANOSECONDS_PER_MILLISECOND = 1e6;

/**
 * Tiempo de GPU de un tramo de dibujo con `EXT_disjoint_timer_query_webgl2`. Una consulta por frame; los resultados se leen
 * sin bloquear en `poll`, cuando la GPU ya los tiene (llegan uno o dos frames después). Sin la extensión, `available` es
 * falso y no hace nada. Las consultas se reutilizan.
 */
export class GpuTimer {
    /**
     * @param {WebGL2RenderingContext|null} glContext contexto del renderer de PIXI
     * @param {number} [maxPending] consultas en vuelo como máximo
     */
    constructor(glContext, maxPending = BENCH.gpuMaxPending) {
        this.glContext = glContext;
        this.extension = glContext?.getExtension?.(GPU_TIMER_EXTENSION) ?? null;
        this.maxPending = maxPending;
        this.current = null;
        this.pending = [];
        this.pool = [];
        this.results = [];
    }

    get available() {
        return this.extension !== null;
    }

    /** Empieza a medir; si hay demasiadas consultas en vuelo, este frame no se mide. */
    begin() {
        if (!this.extension || this.pending.length >= this.maxPending) return;
        this.current = this.pool.pop() ?? this.glContext.createQuery();
        this.glContext.beginQuery(this.extension.TIME_ELAPSED_EXT, this.current);
    }

    /** Termina el tramo que empezó `begin`. */
    end() {
        if (this.current === null) return;
        this.glContext.endQuery(this.extension.TIME_ELAPSED_EXT);
        this.pending.push(this.current);
        this.current = null;
    }

    /**
     * Lee las consultas ya resueltas, en orden, y descarta las que el navegador marcó como no confiables.
     * @returns {number[]} ms de GPU; el arreglo se reutiliza en la llamada siguiente
     */
    poll() {
        const { glContext, extension, pending, results } = this;
        results.length = 0;
        while (extension && pending.length > 0 && glContext.getQueryParameter(pending[0], glContext.QUERY_RESULT_AVAILABLE)) {
            const query = pending.shift();
            if (!glContext.getParameter(extension.GPU_DISJOINT_EXT)) {
                results.push(glContext.getQueryParameter(query, glContext.QUERY_RESULT) / NANOSECONDS_PER_MILLISECOND);
            }
            this.pool.push(query);
        }
        return results;
    }
}
