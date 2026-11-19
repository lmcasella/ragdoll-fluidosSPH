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
 * `countdown` devuelve "reset".
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
        if (this.state === "title") return null;

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
        if (inputs.some((s) => s.start)) {
            this.state = "title";
            this.wins.fill(0);
            this.round = 1;
            this.matchWinner = null;
            this.roundTime = 0;
            return "reset";
        }
        if (inputs.some((s) => s.action)) {
            this.wins.fill(0);
            this.round = 1;
            this.matchWinner = null;
            return this.startCountdown();
        }
        return null;
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
        if (this.state === "title") {
            return { title: "RAGDOLL FLUIDOS", subtitle: "↑↓ elegir · ←→ cambiar · A / Start / Enter sobre Jugar" };
        }
        if (this.state === "countdown") {
            return { title: String(Math.ceil(this.timer)), subtitle: `Ronda ${this.round}` };
        }
        if (this.state === "playing") {
            return this.roundTime < GO_TIME ? { title: "¡YA!", subtitle: `Ronda ${this.round}` } : null;
        }
        if (this.state === "roundOver") {
            return this.roundWinner === null
                ? { title: "¡Empate!", subtitle: `Ronda ${this.round}` }
                : { title: `¡J${this.roundWinner + 1} gana la ronda!`, subtitle: `Ronda ${this.round}` };
        }
        return {
            title: `J${this.matchWinner + 1} GANA LA PARTIDA`,
            subtitle: `${this.wins.join(" – ")} · A revancha · Start menú`,
        };
    }
}