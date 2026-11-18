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
