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
        punch: ["KeyF"],
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
        punch: ["ShiftRight"],
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
const PAD = {
    jump: 0,
    punch: 1,
    grapple: 2,
    prevWeapon: 4,
    nextWeapon: 5,
    fire: 7,
    weapons: [12, 15, 13, 14],
};
const STICK_DEADZONE = 0.35;
const AIM_DEADZONE = 0.4;

/** Umbral de `ly` para `drop`: más alto que la zona muerta para que caminar en diagonal no baje sin querer. */
export const DROP_THRESHOLD = 0.6;

/** Segundos máximos de LB (o su tecla) apretado para que al soltar cuente como toque corto (arma anterior). */
export const TAP_MAX = 0.25;

/**
 * Estado por jugador, leído una vez por frame con poll():
 * - mantenidos: `left`, `right`, `up`, `down`, `fire`, `grapple`;
 * - flancos del frame: `jump`, `drop`, `action`, `punch`, `weapon` (1-4 o null) y `weaponStep` (-1, 0 o +1);
 * - `aim`: dirección { x, y } del stick derecho (Y hacia arriba) o null;
 * - `pointer` (solo J1): { x, y } del mouse en píxeles mientras el mouse es la fuente de mira, o null.
 * `action` es el flanco de A, RT, la tecla de disparo o el clic, para menús y revancha; `fire` es el disparo mantenido.
 * Las fuentes se combinan con O: ninguna escribe falso sobre otra.
 */
export class Input {
    constructor(playerCount) {
        this.layouts = KEYBOARD_LAYOUTS.slice(0, playerCount);
        this.held = new Set();
        this.pressed = new Set();
        this.prevButtons = [];
        this.prevHold = this.layouts.map(() => null);
        this.states = this.layouts.map(() => ({}));

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
     * Lee teclado, mouse y gamepads. `now` (segundos) mide cuánto estuvo apretado LB para distinguir el toque corto.
     */
    poll(now = performance.now() / 1000) {
        const pads = navigator.getGamepads
            ? [...navigator.getGamepads()].filter(
                  (p) => p && p.connected,
              )
            : [];

        this.layouts.forEach((layout, k) => {
            const isHeld = (codes) => codes.some((c) => this.held.has(c));
            const wasPressed = (codes) => codes.some((c) => this.pressed.has(c));

            const state = {
                left: isHeld(layout.left),
                right: isHeld(layout.right),
                up: isHeld(layout.up),
                down: isHeld(layout.down),
                jump: wasPressed(layout.jump),
                drop: false,
                action: wasPressed(layout.fire),
                fire: isHeld(layout.fire),
                grapple: isHeld(layout.grapple),
                punch: wasPressed(layout.punch),
                weapon: null,
                weaponStep: 0,
                aim: null,
                pointer: null,
            };
            layout.weapons.forEach((code, i) => {
                if (this.pressed.has(code)) state.weapon = i + 1;
            });
            let strongDown = isHeld(layout.down);
            let prevHold = isHeld(layout.prevWeapon) || wasPressed(layout.prevWeapon);
            if (wasPressed(layout.nextWeapon)) state.weaponStep = 1;

            const pad = pads[k];
            if (pad) {
                const read = this.readPad(pad, k, state);
                strongDown ||= read.strongDown;
                prevHold ||= read.prevHold;
            }
            if (k === 0) {
                if (this.mouseClicked) state.action = true;
                if (this.mouseHeld) state.fire = true;
                if (this.mouseGrapple) state.grapple = true;
                if (state.aim) this.mouseActive = false;
                if (this.mouseActive) state.pointer = { ...this.mousePos };
            }

            if (state.jump && strongDown) {
                state.jump = false;
                state.drop = true;
            }

            const before = this.prevHold[k];
            if (prevHold && before === null) this.prevHold[k] = now;
            else if (!prevHold && before !== null) {
                if (now - before < TAP_MAX) state.weaponStep = -1;
                this.prevHold[k] = null;
            }
            this.states[k] = state;
        });

        this.pressed.clear();
        this.mouseClicked = false;
        return this.states;
    }

    /**
     * Combina el gamepad en `state` y devuelve lo que `poll` necesita aparte: si el stick izquierdo está
     * fuertemente hacia abajo y si LB está apretado.
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
        state.action ||= edge(PAD.jump) || edge(PAD.fire);
        state.fire ||= down(PAD.fire);
        state.grapple ||= down(PAD.grapple);
        state.punch ||= edge(PAD.punch);
        if (edge(PAD.nextWeapon)) state.weaponStep = 1;
        PAD.weapons.forEach((button, i) => {
            if (edge(button)) state.weapon = i + 1;
        });
        if (Math.hypot(rx, ry) > AIM_DEADZONE) state.aim = { x: rx, y: -ry };

        this.prevButtons[k] = pad.buttons.map((b) => b.pressed);
        return { strongDown: ly > DROP_THRESHOLD, prevHold: down(PAD.prevWeapon) };
    }
}
