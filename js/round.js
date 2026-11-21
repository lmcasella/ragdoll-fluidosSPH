const ROUND_OVER_TIME = 3;
const SLOW_MOTION_TIME = 1.5;
const SLOW_MOTION_SCALE = 0.3;

/** Segundos de cuenta regresiva antes de cada ronda. */
export const COUNTDOWN_TIME = 3;

/** Segundos que se muestra "¡YA!" al empezar a jugar. */
export const GO_TIME = 0.6;

/** Segundos del fin de partida en que se ignoran los botones, para no pedir la revancha sin querer. */
export const MATCH_OVER_LOCK = 1;

/**
 * Loop de partida: título, cuenta regresiva y rondas al mejor de N; gana la ronda el último robot en pie y la partida
 * quien llega a `winsNeeded`. Al terminar una ronda hay cámara lenta y un cartel, y se reinicia sin recargar.
 * Estados: `title` (el menú principal, que llama a `begin`) -> `countdown` -> `playing` -> `roundOver` ->
 * (`countdown` | `matchOver`); `matchOver` -> `countdown` (revancha, `action`) o `title` (`start`). Toda entrada a
 * `countdown` devuelve "reset". `paused` solo existe desde `countdown` o `playing` (Start de cualquier jugador, en
 * `update`), guarda el estado de origen en `resumeState` y vuelve a él con `resume`; `quit` lo lleva al título.
 */
export class Match {
    constructor(playerCount, winsNeeded = 2) {
        this.winsNeeded = winsNeeded;
        this.wins = new Array(playerCount).fill(0);
        this.round = 1;
        this.state = "title";
        this.timer = 0;
        this.roundTime = 0;
        this.roundWinner = null;
        this.matchWinner = null;
        this.resumeState = null;
    }

    /** Estado de la partida ignorando la pausa: el de origen mientras está en `paused`. */
    get phase() {
        return this.state === "paused" ? this.resumeState : this.state;
    }

    /** Sale de la pausa y vuelve exactamente al estado anterior. */
    resume() {
        if (this.state !== "paused") return;
        this.state = this.resumeState;
        this.resumeState = null;
    }

    /** Vuelve al título con la partida en cero (desde el fin de partida o la pausa); devuelve "reset". */
    quit() {
        this.state = "title";
        this.resumeState = null;
        this.wins.fill(0);
        this.round = 1;
        this.matchWinner = null;
        this.roundTime = 0;
        return "reset";
    }

    /** Escala de tiempo de la simulación (cámara lenta al terminar la ronda). */
    get timeScale() {
        const elapsed = ROUND_OVER_TIME - this.timer;
        return this.state === "roundOver" && elapsed < SLOW_MOTION_TIME ? SLOW_MOTION_SCALE : 1;
    }

    /** Empieza una partida nueva desde el título (lo llama el menú al elegir Jugar); devuelve "reset". */
    begin() {
        this.wins.fill(0);
        this.round = 1;
        this.matchWinner = null;
        return this.startCountdown();
    }

    startCountdown() {
        this.state = "countdown";
        this.timer = COUNTDOWN_TIME;
        this.roundTime = 0;
        return "reset";
    }

    /** Avanza con tiempo real (`roundTime`, en s, solo en `playing`); devuelve "reset" para volver a armar la ronda. */
    update(players, inputs, dt) {
        if (this.state === "title" || this.state === "paused") return null;

        if ((this.state === "countdown" || this.state === "playing") && inputs.some((s) => s.start)) {
            this.resumeState = this.state;
            this.state = "paused";
            return null;
        }

        if (this.state === "countdown") {
            this.timer -= dt;
            if (this.timer <= 0) {
                this.state = "playing";
                this.roundTime = 0;
            }
            return null;
        }

        if (this.state === "playing") {
            this.roundTime += dt;
            const alive = players.filter((p) => !p.dead);
            if (alive.length <= 1) {
                this.roundWinner = alive.length === 1 ? players.indexOf(alive[0]) : null;
                if (this.roundWinner !== null) this.wins[this.roundWinner]++;
                this.state = "roundOver";
                this.timer = ROUND_OVER_TIME;
            }
            return null;
        }

        if (this.state === "roundOver") {
            this.timer -= dt;
            if (this.timer > 0) return null;
            const champion = this.wins.findIndex((w) => w >= this.winsNeeded);
            if (champion >= 0) {
                this.state = "matchOver";
                this.matchWinner = champion;
                this.timer = MATCH_OVER_LOCK;
                return null;
            }
            this.round++;
            return this.startCountdown();
        }

        this.timer -= dt;
        if (this.timer > 0) return null;
        if (inputs.some((s) => s.start)) return this.quit();
        if (inputs.some((s) => s.action)) {
            this.wins.fill(0);
            this.round = 1;
            this.matchWinner = null;
            return this.startCountdown();
        }
        return null;
    }

    /** Segundos que faltan del bloqueo de botones del fin de partida; 0 fuera de `matchOver` o ya desbloqueado. */
    get lockRemaining() {
        return this.state === "matchOver" ? Math.max(0, this.timer) : 0;
    }

    /** Los peligros que dañan por tiempo (inundación) solo actúan mientras se juega la ronda. */
    get hazardsActive() {
        return this.state === "playing";
    }

    /** Los robots solo obedecen al input mientras se juega y en el cartel de fin de ronda. */
    get controlsActive() {
        return this.state === "playing" || this.state === "roundOver";
    }

    /** Cartel central, o null durante el juego. */
    get banner() {
        const state = this.phase;
        if (state === "title") {
            return { title: "WATERBOTS", subtitle: "↑↓ elegir · ←→ cambiar · A / Start / Enter sobre Jugar" };
        }
        if (state === "countdown") {
            return { title: String(Math.ceil(this.timer)), subtitle: `Ronda ${this.round}` };
        }
        if (state === "playing") {
            return this.roundTime < GO_TIME ? { title: "¡YA!", subtitle: `Ronda ${this.round}` } : null;
        }
        if (state === "roundOver") {
            return this.roundWinner === null
                ? { title: "¡Empate!", subtitle: `Ronda ${this.round}` }
                : { title: `¡J${this.roundWinner + 1} gana la ronda!`, subtitle: `Ronda ${this.round}` };
        }
        return {
            title: `J${this.matchWinner + 1} GANA LA PARTIDA`,
            subtitle: `${this.wins.join(" – ")} · A / Enter revancha · Start / Esc menú`,
        };
    }
}