/**
 * Ganancias y variación del sonido. `music` y `sfx` son la ganancia de cada bus (0 a 1), `fade` el fundido entre
 * pistas de música en s y `rate` la variación aleatoria máxima de `playbackRate` (fracción, ±).
 */
export const AUDIO = { music: 0.35, sfx: 0.8, fade: 1, rate: 0.05 };

/**
 * Efectos por evento. `files` son las variantes (nombres de `audio/sfx/*.ogg` sin extensión): se elige una al azar sin
 * repetir la anterior. `volume` es la ganancia propia (0 a 1) y `cooldown` (opcional) los s mínimos entre dos
 * disparos del mismo evento para la misma clave (por ejemplo, el robot).
 */
export const SOUNDS = {
    hit: { files: ["hit_1", "hit_2", "hit_3"], volume: 1 },
    hurt: { files: ["hurt_054", "hurt_055", "hurt_057", "hurt_061", "hurt_064", "hurt_075", "hurt_078"], volume: 1, cooldown: 0.3 },
    block: { files: ["block_1", "block_2", "block_3"], volume: 1 },
    blockBreak: { files: ["block_break_1", "block_break_2", "block_break_3"], volume: 1 },
    land: { files: ["land_hurt_1", "land_hurt_2", "land_hurt_3"], volume: 1 },
    step: { files: ["feet_04", "feet_05", "feet_08", "feet_10", "feet_12", "feet_14", "feet_17"], volume: 0.4, cooldown: 0.22 },
    death: { files: ["death_1"], volume: 1 },
    pickup: { files: ["pickup_1", "pickup_2", "pickup_3", "pickup_4", "pickup_5"], volume: 1 },
    roundEnd: { files: ["round_end"], volume: 1 },
};

/** Pistas de música por nombre (archivos de `audio/music/*.ogg` sin extensión). */
export const MUSIC = {
    combat: "mu_combat",
    suddenDeath: "mu_sudden_death",
    mainMenu: "mu_mainmenu",
};

const sfxUrl = (name) => `./audio/sfx/${name}.ogg`;
const musicUrl = (name) => `./audio/music/${name}.ogg`;

/**
 * Sonido del juego con Web Audio: buffers decodificados una vez, un bus de música y uno de efectos. Sin
 * `AudioContext` (Node, navegadores sin soporte) todo es no-op; un archivo que no carga deja mudo a su evento. No lee
 * dispositivos: la raíz de composición llama a `unlock` con el primer gesto del usuario.
 */
export class GameAudio {
    /**
     * @param {Function} [Context] Constructor de `AudioContext`; por defecto el del entorno, si existe.
     * @param {Function} [random] Fuente de números en [0, 1).
     */
    constructor(Context = globalThis.AudioContext ?? globalThis.webkitAudioContext, random = Math.random) {
        this.random = random;
        this.context = null;
        this.buffers = new Map();
        this.lastVariant = new Map();
        this.lastPlayed = new Map();
        this.wanted = null;
        this.current = null;
        if (!Context) return;
        try {
            this.context = new Context();
        } catch {
            return;
        }
        this.musicGain = this.bus(AUDIO.music);
        this.sfxGain = this.bus(AUDIO.sfx);
    }

    bus(value) {
        const gain = this.context.createGain();
        gain.gain.value = value;
        gain.connect(this.context.destination);
        return gain;
    }

    get running() {
        return this.context !== null && this.context.state === "running";
    }

    /** Descarga y decodifica todos los archivos de `SOUNDS` y `MUSIC`; los que fallan quedan sin buffer. */
    async load() {
        if (!this.context) return;
        const urls = new Set([
            ...Object.values(SOUNDS).flatMap((row) => row.files.map(sfxUrl)),
            ...Object.values(MUSIC).map(musicUrl),
        ]);
        await Promise.all([...urls].map((url) => this.loadBuffer(url)));
    }

    async loadBuffer(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) return;
            this.buffers.set(url, await this.context.decodeAudioData(await response.arrayBuffer()));
        } catch {
            return;
        }
        this.syncMusic();
    }

    /** Intenta reanudar el contexto, que los navegadores arrancan suspendido; llamar desde un gesto del usuario. */
    unlock() {
        const context = this.context;
        if (!context || context.state === "running") return;
        Promise.resolve(context.resume()).then(
            () => this.syncMusic(),
            () => undefined,
        );
    }

    /**
     * Reproduce una variante del evento, con `playbackRate` aleatorio.
     * @param {string} event Clave de `SOUNDS`.
     * @param {number|string} [key] Quién lo origina (por ejemplo, el índice del robot), para el `cooldown`.
     * @param {number} [now] Reloj en s con el que se mide el `cooldown`.
     * @returns {boolean} Si sonó.
     */
    play(event, key = 0, now = 0) {
        const row = SOUNDS[event];
        if (!row || !this.running) return false;
        const id = `${event}:${key}`;
        if (row.cooldown && now - (this.lastPlayed.get(id) ?? -Infinity) < row.cooldown) return false;
        const loaded = row.files.map(sfxUrl).filter((url) => this.buffers.has(url));
        if (loaded.length === 0) return false;
        const last = this.lastVariant.get(event);
        const options = loaded.length > 1 ? loaded.filter((url) => url !== last) : loaded;
        const url = options[Math.floor(this.random() * options.length)];
        this.lastVariant.set(event, url);
        this.lastPlayed.set(id, now);

        const context = this.context;
        const source = context.createBufferSource();
        source.buffer = this.buffers.get(url);
        source.playbackRate.value = 1 + (this.random() * 2 - 1) * AUDIO.rate;
        const gain = context.createGain();
        gain.gain.value = row.volume;
        source.connect(gain);
        gain.connect(this.sfxGain);
        source.onended = () => gain.disconnect();
        source.start();
        return true;
    }

    /**
     * Pide una pista de música (clave de `MUSIC`); suena en loop y, si ya hay otra, hay fundido cruzado. Con `null` no
     * cambia nada.
     * @param {string|null} name Clave de `MUSIC`.
     */
    playMusic(name) {
        if (!name) return;
        this.wanted = name;
        this.syncMusic();
    }

    syncMusic() {
        if (!this.running || !this.wanted || this.current?.name === this.wanted) return;
        const buffer = this.buffers.get(musicUrl(MUSIC[this.wanted]));
        if (!buffer) return;
        const context = this.context;
        const t = context.currentTime;
        const old = this.current;
        if (old) {
            old.gain.gain.cancelScheduledValues(t);
            old.gain.gain.setValueAtTime(old.gain.gain.value, t);
            old.gain.gain.linearRampToValueAtTime(0, t + AUDIO.fade);
            old.source.stop(t + AUDIO.fade);
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(1, t + AUDIO.fade);
        source.connect(gain);
        gain.connect(this.musicGain);
        source.start(t);
        this.current = { name: this.wanted, source, gain };
    }
}
