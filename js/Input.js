/**
 * Teclas físicas (KeyboardEvent.code), independientes de la distribución del teclado. `up` y `down` mueven en
 * mantenido; `jump` es la tecla de salto (también `drop` si `down` está apretada).
 */
export const KEYBOARD_LAYOUTS = [
    {
        left: ["KeyA"],
        right: ["KeyD"],
        up: ["KeyW"],
        down: ["KeyS"],
        jump: ["KeyW"],
        fire: ["Space"],
        start: ["Escape"],
        punch: ["KeyF"],
        block: ["KeyG"],
        grapple: ["KeyE"],
        prevWeapon: ["KeyQ"],
        nextWeapon: ["KeyR"],
        weapons: ["Digit1", "Digit2", "Digit3", "Digit4"],
    },
    {
        left: ["ArrowLeft"],
        right: ["ArrowRight"],
        up: ["ArrowUp"],
        down: ["ArrowDown"],
        jump: ["ArrowUp"],
        fire: ["Enter", "NumpadEnter"],
        start: ["Escape"],
        punch: ["Numpad5"],
        block: ["NumpadSubtract"],
        grapple: ["Numpad0"],
        prevWeapon: ["ControlRight"],
        nextWeapon: ["NumpadAdd"],
        weapons: ["Numpad1", "Numpad2", "Numpad3", "Numpad4"],
    },
];

/**
 * Botones del mapeo "standard" de la Gamepad API. `weapons` es la cruceta en el orden de la posición en la tabla de
 * armas: arriba 1, derecha 2, abajo 3, izquierda 4.
 */
export const PAD = {
    jump: 0,
    punch: 1,
    grapple: 2,
    block: 6,
    prevWeapon: 4,
    nextWeapon: 5,
    fire: 7,
    start: 9,
    weapons: [12, 15, 13, 14],
};

/**
 * Controles del menú, independientes de los de juego. Gamepad (mapeo "standard", cualquier pad real conectado):
 * `confirm` son A y Start; `back`, B; la cruceta son los botones 12 a 15; el stick izquierdo usa `STICK_DEADZONE`.
 * Teclado de respaldo (KeyboardEvent.code): el gamepad gana siempre que empuja un eje.
 */
export const MENU_CONTROLS = {
    pad: { confirm: [0, 9], back: [1], up: 12, down: 13, left: 14, right: 15 },
    keys: {
        up: ["ArrowUp", "KeyW"],
        down: ["ArrowDown", "KeyS"],
        left: ["ArrowLeft", "KeyA"],
        right: ["ArrowRight", "KeyD"],
        confirm: ["Enter", "NumpadEnter"],
        back: ["Escape"],
    },
};

/** Repetición de una dirección del menú mantenida: `delay` hasta la primera repetición y después una cada `rate`, en s. */
export const MENU_REPEAT = { delay: 0.4, rate: 0.12 };

const STICK_DEADZONE = 0.35;
const AIM_DEADZONE = 0.4;

/** Umbral de `ly` para `drop`: más alto que la zona muerta para que caminar en diagonal no baje sin querer. */
export const DROP_THRESHOLD = 0.6;

/** Segundos máximos de LB (o su tecla) apretado para que al soltar cuente como toque corto (arma anterior). */
export const TAP_MAX = 0.25;

/**
 * Estado por jugador, leído una vez por frame con poll():
 * - mantenidos: `left`, `right`, `up`, `down`, `fire`, `grapple`, `block`, `jumpHeld` (el botón o tecla de salto) y
 *   `strongDown` (stick izquierdo más allá de `DROP_THRESHOLD` o tecla abajo);
 * - flancos del frame: `jump`, `drop`, `roll`, `action`, `start`, `punch`, `kick`, `weapon` (1-4 o null) y `weaponStep`
 *   (-1, 0 o +1). `roll` es el flanco de salto con `block` mantenido (de cualquier fuente) y gana sobre `jump` y
 *   `drop`; `kick` es el flanco de golpe con abajo fuerte y deja `punch` en falso;
 * - `aim`: dirección { x, y } del stick derecho (Y hacia arriba) o null; es null con la rueda abierta y en el poll
 *   en que se suelta;
 * - `wheel`: { open, x, y, pointer? } mientras la rueda de armas está abierta (LB o su tecla mantenidos `TAP_MAX`), o
 *   null. Elige solo lo que apunta, nunca el movimiento: la dirección es la del stick derecho ((0, 0) en la zona
 *   muerta) o, en J1 con la tecla y sin stick, `pointer` con el mouse en píxeles para que la raíz de composición la
 *   resuelva contra el robot. La fuente que abrió la rueda la sostiene: la otra no la cierra ni cambia su dirección;
 * - `wheelPick`: solo en el poll en que se suelta la fuente que abrió la rueda: { x, y, pointer? } o "cancel" sin
 *   dirección;
 * - `pointer` (solo J1): { x, y } del mouse en píxeles mientras el mouse es la fuente de mira, o null.
 * `padButton` (en la instancia, no por jugador) es verdadero si algún botón de algún gamepad está apretado en el poll.
 * `action` es el flanco de A, RT, la tecla de disparo o el clic, para menús y revancha; `start` es el flanco de Start (botón 9) o Escape, para iniciar y volver al menú; `fire` es el disparo mantenido.
 * Las fuentes se combinan con O: ninguna escribe falso sobre otra.
 * `menu` (en la instancia, tras cada poll) son las intenciones del menú, con `MENU_CONTROLS`: `x` e `y` (-1, 0 o +1, con
 * `y` positivo hacia abajo) valen distinto de cero solo en el frame del flanco y en las repeticiones de `MENU_REPEAT`;
 * `confirm` y `back` son flancos. Solo leen gamepads reales, no los virtuales de los bots.
 */
export class Input {
    constructor(playerCount) {
        this.layouts = KEYBOARD_LAYOUTS.slice(0, playerCount);
        this.held = new Set();
        this.pressed = new Set();
        this.prevButtons = [];
        this.prevHold = this.layouts.map(() => null);
        this.wheelSources = this.layouts.map(() => null);
        this.wheelBlocked = this.layouts.map(() => false);
        this.states = this.layouts.map(() => ({}));
        this.virtualPads = this.layouts.map(() => null);
        this.menu = { x: 0, y: 0, confirm: false, back: false };
        this.menuPrev = [];
        this.menuRepeat = { x: { dir: 0, next: 0 }, y: { dir: 0, next: 0 } };

        const gameCodes = new Set(
            this.layouts.flatMap((l) => Object.values(l).flat()),
        );

        window.addEventListener("keydown", (e) => {
            if (gameCodes.has(e.code)) e.preventDefault();
            if (e.repeat) return;
            this.held.add(e.code);
            this.pressed.add(e.code);
        });
        window.addEventListener("keyup", (e) => {
            this.held.delete(e.code);
        });
        window.addEventListener("blur", () => this.held.clear());

        this.mousePos = null;
        this.mouseActive = false;
        this.mouseClicked = false;
        window.addEventListener("mousemove", (e) => {
            this.mousePos = { x: e.clientX, y: e.clientY };
            this.mouseActive = true;
        });
        this.mouseHeld = false;
        this.mouseGrapple = false;
        window.addEventListener("mousedown", (e) => {
            if (e.button === 2) this.mouseGrapple = true;
            if (e.button !== 0) return;
            this.mouseClicked = true;
            this.mouseHeld = true;
        });
        window.addEventListener("mouseup", (e) => {
            if (e.button === 0) this.mouseHeld = false;
            if (e.button === 2) this.mouseGrapple = false;
        });
        window.addEventListener("contextmenu", (e) => e.preventDefault());
        window.addEventListener("blur", () => {
            this.mouseHeld = false;
            this.mouseGrapple = false;
        });
    }

    /**
     * Gamepad virtual del jugador `k` (un bot): un objeto con la forma de un `Gamepad` ({ axes, buttons: [{ pressed }] })
     * que `poll` lee como a un gamepad real mientras no haya uno real conectado para ese jugador. `null` lo quita.
     */
    setVirtualPad(k, pad) {
        this.virtualPads[k] = pad;
    }

    /** Si hay un gamepad real conectado para el jugador `k` (los gamepads se asignan por orden de conexión). */
    hasRealPad(k) {
        const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected) : [];
        return k < pads.length;
    }

    /**
     * Lee teclado, mouse y gamepads. `now` (segundos) mide cuánto estuvo apretado LB para distinguir el toque corto.
     */
    poll(now = performance.now() / 1000) {
        const pads = navigator.getGamepads
            ? [...navigator.getGamepads()].filter(
                  (p) => p && p.connected,
              )
            : [];
        this.padButton = pads.some((p) => [...p.buttons].some((b) => b.pressed));

        this.layouts.forEach((layout, k) => {
            const isHeld = (codes) => codes.some((c) => this.held.has(c));
            const wasPressed = (codes) => codes.some((c) => this.pressed.has(c));

            const state = {
                left: isHeld(layout.left),
                right: isHeld(layout.right),
                up: isHeld(layout.up),
                down: isHeld(layout.down),
                jump: wasPressed(layout.jump),
                jumpHeld: isHeld(layout.jump),
                strongDown: false,
                drop: false,
                roll: false,
                action: wasPressed(layout.fire),
                start: wasPressed(layout.start),
                fire: isHeld(layout.fire),
                grapple: isHeld(layout.grapple),
                block: isHeld(layout.block),
                punch: wasPressed(layout.punch),
                kick: false,
                weapon: null,
                weaponStep: 0,
                aim: null,
                pointer: null,
                wheel: null,
                wheelPick: null,
            };
            layout.weapons.forEach((code, i) => {
                if (this.pressed.has(code)) state.weapon = i + 1;
            });
            let strongDown = isHeld(layout.down);
            const keyHold = isHeld(layout.prevWeapon) || wasPressed(layout.prevWeapon);
            let padHold = false;
            let stick = null;
            if (wasPressed(layout.nextWeapon)) state.weaponStep = 1;

            const pad = pads[k] ?? this.virtualPads[k];
            if (pad) {
                const read = this.readPad(pad, k, state);
                strongDown ||= read.strongDown;
                padHold = read.prevHold;
                stick = read.stick;
            }
            state.strongDown = strongDown;
            const prevHold = keyHold || padHold;
            if (k === 0) {
                if (this.mouseClicked) state.action = true;
                if (this.mouseHeld) state.fire = true;
                if (this.mouseGrapple) state.grapple = true;
                if (state.aim) this.mouseActive = false;
                if (this.mouseActive) state.pointer = { ...this.mousePos };
            }

            if (state.jump && state.block) {
                state.jump = false;
                state.roll = true;
            } else if (state.jump && strongDown) {
                state.jump = false;
                state.drop = true;
            }
            if (state.punch && strongDown) {
                state.punch = false;
                state.kick = true;
            }

            const before = this.prevHold[k];
            const held = { pad: padHold, key: keyHold };
            const direction = (source) => {
                if (stick) return { x: stick.x, y: stick.y };
                if (source === "key" && k === 0 && this.mouseActive) return { x: 0, y: 0, pointer: { ...this.mousePos } };
                return { x: 0, y: 0 };
            };
            let source = this.wheelSources[k];
            if (source && !held[source]) {
                const d = direction(source);
                state.wheelPick = d.x === 0 && d.y === 0 && !d.pointer ? "cancel" : d;
                source = null;
                this.wheelBlocked[k] = true;
            } else if (!source && prevHold && !this.wheelBlocked[k] && before !== null && now - before >= TAP_MAX) {
                source = padHold ? "pad" : "key";
            }
            this.wheelSources[k] = source;
            if (source) state.wheel = { open: true, ...direction(source) };
            if (source || state.wheelPick) state.aim = null;

            if (prevHold && before === null) this.prevHold[k] = now;
            else if (!prevHold && before !== null) {
                if (now - before < TAP_MAX) state.weaponStep = -1;
                this.prevHold[k] = null;
            }
            if (!prevHold) this.wheelBlocked[k] = false;
            this.states[k] = state;
        });

        this.menu = this.readMenu(pads, now);
        this.pressed.clear();
        this.mouseClicked = false;
        return this.states;
    }

    /** Intenciones del menú de este poll: gamepads reales primero, teclado como respaldo. */
    readMenu(pads, now) {
        const { pad: buttons, keys } = MENU_CONTROLS;
        const dir = { x: 0, y: 0 };
        let confirm = false;
        let back = false;
        pads.forEach((pad, i) => {
            const prev = this.menuPrev[i] ?? [];
            const down = (b) => pad.buttons[b]?.pressed ?? false;
            const edge = (b) => down(b) && !prev[b];
            const [lx = 0, ly = 0] = pad.axes;
            const axis = (neg, pos, v) =>
                (v > STICK_DEADZONE || down(pos) ? 1 : 0) - (v < -STICK_DEADZONE || down(neg) ? 1 : 0);
            dir.x ||= axis(buttons.left, buttons.right, lx);
            dir.y ||= axis(buttons.up, buttons.down, ly);
            confirm ||= buttons.confirm.some(edge);
            back ||= buttons.back.some(edge);
            this.menuPrev[i] = pad.buttons.map((b) => b.pressed);
        });
        const held = (codes) => codes.some((c) => this.held.has(c));
        dir.x ||= (held(keys.right) ? 1 : 0) - (held(keys.left) ? 1 : 0);
        dir.y ||= (held(keys.down) ? 1 : 0) - (held(keys.up) ? 1 : 0);
        const tapped = (codes) => codes.some((c) => this.pressed.has(c));
        return {
            x: this.repeatMenu(this.menuRepeat.x, dir.x, now),
            y: this.repeatMenu(this.menuRepeat.y, dir.y, now),
            confirm: confirm || tapped(keys.confirm),
            back: back || tapped(keys.back),
        };
    }

    /** Devuelve `dir` en el flanco y en cada repetición con retardo; 0 en el resto. */
    repeatMenu(state, dir, now) {
        if (dir === 0) {
            state.dir = 0;
            return 0;
        }
        if (dir !== state.dir) {
            state.dir = dir;
            state.next = now + MENU_REPEAT.delay;
            return dir;
        }
        if (now < state.next) return 0;
        state.next = now + MENU_REPEAT.rate;
        return dir;
    }

    /**
     * Combina el gamepad en `state` y devuelve lo que `poll` necesita aparte: si el stick izquierdo está
     * fuertemente hacia abajo, si LB está apretado y la dirección del stick derecho (null en la zona muerta).
     */
    readPad(pad, k, state) {
        const prev = this.prevButtons[k] ?? [];
        const down = (i) => pad.buttons[i]?.pressed ?? false;
        const edge = (i) => down(i) && !prev[i];
        const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes;

        state.left ||= lx < -STICK_DEADZONE;
        state.right ||= lx > STICK_DEADZONE;
        state.up ||= ly < -STICK_DEADZONE;
        state.down ||= ly > STICK_DEADZONE;
        state.jump ||= edge(PAD.jump);
        state.jumpHeld ||= down(PAD.jump);
        state.action ||= edge(PAD.jump) || edge(PAD.fire);
        state.start ||= edge(PAD.start);
        state.fire ||= down(PAD.fire);
        state.grapple ||= down(PAD.grapple);
        state.block ||= down(PAD.block);
        state.punch ||= edge(PAD.punch);
        if (edge(PAD.nextWeapon)) state.weaponStep = 1;
        PAD.weapons.forEach((button, i) => {
            if (edge(button)) state.weapon = i + 1;
        });
        const stick = Math.hypot(rx, ry) > AIM_DEADZONE ? { x: rx, y: -ry } : null;
        if (stick) state.aim = stick;

        this.prevButtons[k] = pad.buttons.map((b) => b.pressed);
        return { strongDown: ly > DROP_THRESHOLD, prevHold: down(PAD.prevWeapon), stick };
    }
}
