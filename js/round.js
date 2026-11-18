// Loop de partida: rondas al mejor de N. Gana la ronda el último robot en pie; gana la partida quien llega
// a `winsNeeded`. Al terminar una ronda hay cámara lenta y un cartel; después se reinicia sin recargar.
const ROUND_OVER_TIME = 3;
const SLOW_MOTION_TIME = 1.5;
const SLOW_MOTION_SCALE = 0.3;

export class Match {
    constructor(playerCount, winsNeeded = 2) {
        this.winsNeeded = winsNeeded;
        this.wins = new Array(playerCount).fill(0);
        this.round = 1;
        this.state = "playing"; // "playing" | "roundOver" | "matchOver"
        this.timer = 0;
        this.roundTime = 0; // s de juego real de la ronda en curso; solo avanza en "playing"
        this.roundWinner = null;
        this.matchWinner = null;
    }

    // Escala de tiempo de la simulación (cámara lenta al terminar la ronda)
    get timeScale() {
        const elapsed = ROUND_OVER_TIME - this.timer;
        return this.state === "roundOver" && elapsed < SLOW_MOTION_TIME ? SLOW_MOTION_SCALE : 1;
    }

    // Avanza con tiempo real; devuelve "reset" cuando hay que volver a armar la ronda
    update(players, inputs, dt) {
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
                return null;
            }
            this.round++;
            this.state = "playing";
            this.roundTime = 0;
            return "reset";
        }

        // matchOver: cualquier jugador con disparar (A / RT / Espacio / Enter) pide la revancha
        if (inputs.some((s) => s.action)) {
            this.wins.fill(0);
            this.round = 1;
            this.state = "playing";
            this.matchWinner = null;
            this.roundTime = 0;
            return "reset";
        }
        return null;
    }

    // Cartel central, o null durante el juego
    get banner() {
        if (this.state === "roundOver") {
            return this.roundWinner === null
                ? { title: "¡Empate!", subtitle: `Ronda ${this.round}` }
                : { title: `¡J${this.roundWinner + 1} gana la ronda!`, subtitle: `Ronda ${this.round}` };
        }
        if (this.state === "matchOver") {
            return {
                title: `J${this.matchWinner + 1} GANA LA PARTIDA`,
                subtitle: "A / Enter / Espacio para la revancha",
            };
        }
        return null;
    }
}
