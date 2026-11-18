// Utilidades sobre los clips de un .rag.json, aplicadas antes de RagImporter.parse.

// Agrega una copia del clip `sourceKey` invertida en el tiempo (t → length − t) con la clave `newKey`.
// Provisorio hasta que RagImporter soporte velocidad negativa (Gann4Life/RagAssembler2D#231).
export function withReversedClip(json, sourceKey, newKey) {
    const source = json.clips.find((c) => c.key === sourceKey);
    if (!source) throw new Error(`No existe el clip "${sourceKey}"`);
    const reversed = {
        ...source,
        key: newKey,
        name: `${source.name} (reversa)`,
        tracks: source.tracks.map((track) => ({
            ...track,
            keys: track.keys
                .map((k) => ({ ...k, t: source.length - k.t }))
                .sort((a, b) => a.t - b.t),
        })),
        // En un clip con loop el evento en t = 0 pasaría a t = length, que está fuera de rango
        events: (source.events ?? []).map((e) => ({
            ...e,
            t: source.loop ? (source.length - e.t) % source.length : source.length - e.t,
        })),
    };
    return { ...json, clips: [...json.clips, reversed] };
}

/**
 * Devuelve una copia del JSON sin las pistas de `jointNames` en los clips `clipKeys`. Las articulaciones que la mira
 * maneja con override no deben llevar pistas en los clips que corren mientras se apunta: RagImporter suma
 * `shortestDelta(clip, override)` al ángulo del clip sin normalizarlo, y si ambos difieren más de π el motor recibe
 * un error de ~2π y gira el brazo por el otro lado (#57).
 * @param {object} json Documento .rag.json.
 * @param {string[]} clipKeys Claves de los clips a limpiar.
 * @param {string[]} jointNames Nombres de las articulaciones cuyas pistas se quitan.
 * @returns {object} Documento nuevo; el original no se modifica.
 */
export function withoutJointTracks(json, clipKeys, jointNames) {
    const ids = new Set(json.joints.filter((j) => jointNames.includes(j.name)).map((j) => j.id));
    return {
        ...json,
        clips: json.clips.map((clip) =>
            clipKeys.includes(clip.key)
                ? { ...clip, tracks: clip.tracks.filter((t) => !ids.has(t.target)) }
                : clip,
        ),
    };
}
