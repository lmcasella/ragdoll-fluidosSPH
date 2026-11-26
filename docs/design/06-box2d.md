# 6. Box2D (LiquidFun = Box2D v2)

La materia usa Phaser Box2D (v3, API por ids). Nosotros usamos LiquidFun, que es Box2D v2 con API de objetos, en el build Emscripten (`vendor/liquidfun.js`, namespace `Box2D`). Equivalencias:

| Concepto de la materia | Nosotros | Estado |
|---|---|---|
| `b2World_Step` + acumulador | `stepWorld` de RagImporter: 1/60 s en 8 subpasos, con acumulador y escala de tiempo (cámara lenta) | ✅ |
| Ragdoll activo: revolute con motor y límites | RagImporter: control PD de cada articulación hacia el clip, más balance de la raíz | ✅ |
| `groupIndex` negativo / filtros | RagImporter evita el auto-choque de cada robot; los dos robots sí chocan entre sí | ✅ |
| Eventos `begin` / `hit` con `approachSpeed` | `JSContactListener.BeginContact`: velocidad de acercamiento = velocidad relativa de los cuerpos proyectada sobre la normal de `GetWorldManifold` (*verificado*; el build no expone `PostSolve` ni `PreSolve`) | ✅ |
| "Juntá durante el paso, actuá después" | Los callbacks solo encolan; `DamageSystem.process` aplica el daño después de `stepWorld` | ✅ |
| Sensores (`isSensor`) | Sensor de la pileta (`buildLevel`); los rayos ignoran sensores | ✅ |
| Sensores para recoger | Puntos de aparición de armas | ✅ #14 |
| Cuerpos cinemáticos | Plataformas móviles | 🔨 #33 |
| Impulsos (`ApplyLinearImpulse`) | Golpe: impulso en el punto de impacto + empuje de todo el robot por velocidad ([03-robots](03-robots.md#32-golpe-melee-)) | ✅ |

**Contact listener:** el mundo tiene uno solo (`JSContactListener` en `src/combat/damage.js`). RagImporter no lo usa, así que queda para el juego. Cualquier sistema nuevo que necesite contactos se engancha ahí, no instala otro.

**Memoria nativa:** reglas en `CLAUDE.md` (patrón "Memoria nativa").
