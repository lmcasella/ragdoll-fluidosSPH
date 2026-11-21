import { inert } from "./inert.js";

/**
 * Elemento del DOM falso para probar `js/hud.js` en Node: guarda `className` (con `classList`), `style`, `textContent`,
 * `innerHTML` y los hijos. `getContext` devuelve un contexto inerte, como los canvas de `loadGame`.
 */
export class FakeElement {
    constructor(tag) {
        this.tag = tag;
        this.children = [];
        this.parent = null;
        this.classes = new Set();
        this.textContent = "";
        this.innerHTML = "";
        this.width = 0;
        this.height = 0;
        this.styleValues = {};
        const values = this.styleValues;
        this.style = new Proxy(
            {},
            {
                get: (_, prop) => (prop === "setProperty" ? (name, value) => (values[name] = value) : values[prop]),
                set: (_, prop, value) => {
                    values[prop] = value;
                    return true;
                },
            },
        );
        this.classList = {
            add: (...names) => names.forEach((n) => this.classes.add(n)),
            remove: (...names) => names.forEach((n) => this.classes.delete(n)),
            toggle: (name, force) => {
                const on = force ?? !this.classes.has(name);
                if (on) this.classes.add(name);
                else this.classes.delete(name);
                return on;
            },
            contains: (name) => this.classes.has(name),
        };
    }

    get className() {
        return [...this.classes].join(" ");
    }

    set className(value) {
        this.classes = new Set(String(value).split(/\s+/).filter(Boolean));
    }

    appendChild(child) {
        child.parent = this;
        this.children.push(child);
        return child;
    }

    getContext() {
        return inert({ createRadialGradient: () => inert(), createLinearGradient: () => inert() });
    }

    addEventListener() {}

    setAttribute() {}

    /** Todos los nodos con la clase `name` de este subárbol, en orden. */
    findAll(name, out = []) {
        if (this.classes.has(name)) out.push(this);
        for (const child of this.children) child.findAll(name, out);
        return out;
    }

    /** Primer nodo con la clase `name` de este subárbol, o `null`. */
    find(name) {
        return this.findAll(name)[0] ?? null;
    }

    /** Verdadero si este nodo o alguno de sus ancestros tiene la clase `off`. */
    get hidden() {
        for (let el = this; el; el = el.parent) if (el.classes.has("off")) return true;
        return false;
    }

    /** Texto de este nodo y de sus descendientes. */
    get allText() {
        return this.textContent + this.children.map((c) => c.allText).join("");
    }
}

/** `document` falso con `createElement` y un `body` para montar. */
export function fakeDocument() {
    return { createElement: (tag) => new FakeElement(tag), body: new FakeElement("body") };
}
