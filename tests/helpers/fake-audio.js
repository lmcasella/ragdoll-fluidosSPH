/**
 * `AudioContext` falso para las pruebas: arranca suspendido, `resume()` lo pasa a `running`, y cada fuente que se
 * inicia queda en `plays` (efectos) o `tracks` (música en loop) con la URL del archivo y su `playbackRate`. Los
 * archivos fallan si su URL está en `FakeAudioContext.broken`.
 */
export function createFakeAudioContext() {
    const plays = [];
    const tracks = [];
    const created = [];

    class Param {
        value = 0;
        setValueAtTime(v) {
            this.value = v;
        }
        linearRampToValueAtTime(v) {
            this.value = v;
        }
        cancelScheduledValues() {}
    }

    class FakeAudioContext {
        static broken = new Set();
        state = "suspended";
        currentTime = 0;
        destination = {};

        constructor() {
            created.push(this);
        }

        resume() {
            this.state = "running";
            return Promise.resolve();
        }

        createGain() {
            return { gain: new Param(), connect() {}, disconnect() {} };
        }

        async decodeAudioData(data) {
            if (FakeAudioContext.broken.has(data.url)) throw new Error("decode");
            return { url: data.url };
        }

        createBufferSource() {
            const source = {
                buffer: null,
                loop: false,
                playbackRate: new Param(),
                connect() {},
                stopped: false,
                stopAt: Infinity,
                stop(when = 0) {
                    this.stopped = true;
                    this.stopAt = when;
                },
                start() {
                    (this.loop ? tracks : plays).push(this);
                },
            };
            return source;
        }
    }

    const live = (time) => tracks.filter((track) => track.stopAt > time);

    return { FakeAudioContext, plays, tracks, created, live };
}
