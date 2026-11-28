import { BENCH, BENCH_SCENES } from "./benchScript.js";
import { FrameRecorder } from "./frameRecorder.js";
import { buildReport } from "./benchReport.js";

const MILLISECONDS_PER_SECOND = 1000;

/** Estados del corredor: espera el primer frame, mide escenas o terminó. */
export const BENCH_STATE = { WAITING: "waiting", RUNNING: "running", DONE: "done" };

/**
 * Recorre `BENCH_SCENES` una tras otra, con un frame por llamada a `frame` (máquina de estados `BENCH_STATE`). No conoce
 * el juego: usa la fachada `game` que arma `index.js`:
 *
 * - `startScene({ map, bots })`: arranca una partida nueva en ese mapa con bots en esos jugadores;
 * - `spawn({ material, count, region })`: crea partículas;
 * - `keepAlive()`: si la partida terminó, arranca otra sin cortar la medición;
 * - `laps()`: ms por subsistema del frame que terminó;
 * - `particleCount()`: partículas vivas;
 * - `context()`: datos de la máquina para el informe.
 *
 * El tiempo de una escena es el de los frames medidos (`nowMs` de `requestAnimationFrame`) y se multiplica por
 * `timeScale`: 1 en el navegador y menor en las pruebas en Node, que no pueden correr minutos.
 */
export class BenchRunner {
    /**
     * @param {object} options
     * @param {object} options.game fachada del juego
     * @param {import("./gpuTimer.js").GpuTimer|null} [options.gpuTimer]
     * @param {number} [options.timeScale] factor de las duraciones de las escenas
     * @param {object[]} [options.scenes]
     */
    constructor({ game, gpuTimer = null, timeScale = 1, scenes = BENCH_SCENES }) {
        this.game = game;
        this.gpuTimer = gpuTimer;
        this.timeScale = timeScale;
        this.scenes = scenes;
        this.recorder = new FrameRecorder();
        this.state = BENCH_STATE.WAITING;
        this.sceneIndex = -1;
        this.lastNowMs = null;
        this.elapsed = 0;
        this.sceneFrames = 0;
        this.nextSpawnAt = [];
        this.groupNames = [];
        this.reportText = null;
    }

    get scene() {
        return this.scenes[this.sceneIndex];
    }

    /** Segundos que faltan de la escena actual. */
    get remainingSeconds() {
        return Math.max(0, Math.ceil(this.scene.seconds * this.timeScale - this.elapsed));
    }

    /** Texto del cartel (`status`) y del informe, que es `null` hasta que termina. */
    get view() {
        if (this.state === BENCH_STATE.DONE) return { status: "Medición terminada", report: this.reportText };
        if (this.state === BENCH_STATE.WAITING) return { status: "Medición: preparando", report: null };
        const status = `Medición: escena ${this.sceneIndex + 1} de ${this.scenes.length} — ${this.scene.name} — ${this.remainingSeconds} s restantes`;
        return { status, report: null };
    }

    startScene(index) {
        this.sceneIndex = index;
        this.elapsed = 0;
        this.sceneFrames = 0;
        const { map, bots, spawns } = this.scene;
        this.game.startScene({ map, bots });
        this.nextSpawnAt = spawns.map((spawn) => spawn.everySeconds);
        for (const spawn of spawns) this.game.spawn(spawn);
        this.updateGroups();
    }

    /** Grupos del frame: la escena y, si lleva filas por minuto, el minuto de partida en curso. */
    updateGroups() {
        const { name, perMinute, seconds } = this.scene;
        this.groupNames.length = 0;
        this.groupNames.push(name);
        if (!perMinute) return;
        const minuteLength = BENCH.minuteSeconds * this.timeScale;
        const lastMinute = Math.ceil(seconds / BENCH.minuteSeconds) - 1;
        this.groupNames.push(`${name} min ${Math.min(Math.floor(this.elapsed / minuteLength), lastMinute) + 1}`);
    }

    finish() {
        this.state = BENCH_STATE.DONE;
        this.reportText = buildReport({ context: this.game.context(), recorder: this.recorder });
    }

    /**
     * Llamar una vez por frame del juego, al final, con la hora de `requestAnimationFrame`. Mide el frame que terminó,
     * crea las partículas periódicas y pasa a la escena siguiente cuando se cumple la duración.
     * @param {number} nowMs
     */
    frame(nowMs) {
        const frameMs = this.lastNowMs === null ? 0 : nowMs - this.lastNowMs;
        this.lastNowMs = nowMs;
        if (this.state === BENCH_STATE.DONE) return;
        if (this.state === BENCH_STATE.WAITING) {
            this.state = BENCH_STATE.RUNNING;
            this.startScene(0);
            return;
        }
        this.elapsed += frameMs / MILLISECONDS_PER_SECOND;
        this.sceneFrames++;
        this.updateGroups();
        if (this.sceneFrames > BENCH.warmupFrames) {
            this.recorder.record(this.groupNames, frameMs, this.game.laps(), this.game.particleCount());
            if (this.gpuTimer) for (const gpuMs of this.gpuTimer.poll()) this.recorder.recordGpu(this.groupNames, gpuMs);
        }
        this.scene.spawns.forEach((spawn, index) => {
            if (spawn.everySeconds === null || this.elapsed < this.nextSpawnAt[index]) return;
            this.game.spawn(spawn);
            this.nextSpawnAt[index] += spawn.everySeconds;
        });
        this.game.keepAlive();
        if (this.elapsed < this.scene.seconds * this.timeScale) return;
        if (this.sceneIndex + 1 < this.scenes.length) this.startScene(this.sceneIndex + 1);
        else this.finish();
    }
}
