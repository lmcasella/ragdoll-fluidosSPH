# 7. Fluidos / SPH (LiquidFun)

## 7.1 Modelo

LiquidFun es una variante de SPH:
- arma pares de partículas a menos de un diámetro, con peso `w = 1 − d/D`;
- calcula la presión como `max(0, η(w − w₀))`;
- los tipos de partícula (water, viscous, tensile, elastic, wall) agregan términos de fuerza o restricciones.

En la defensa se explica junto con su relación con el SPH de doble densidad de la materia (`SPHjs`).

## 7.2 Sistemas de partículas

Partículas de sistemas distintos **no interactúan entre sí**, solo con los cuerpos.

| Sistema | Contenido | Radio | Gravedad | Vida | Estado |
|---|---|---|---|---|---|
| Disparos (líquidos) | Agua, ácido, lava, miel | 0,1 m | 1 | Ilimitada | ✅ |
| Pileta | Agua de la pileta | 0,2 m (726 partículas) | 1 | Ilimitada | ✅ |
| Gases | Fuego, viento, vapor | — | Negativa o 0 | Corta (*verificado*: `set_lifetime` del grupo) | 🔨 #16 |
| Inundación | Lluvia que llena el mapa | ~0,25 m | 1 | Ilimitada | 🔨 #22 |

## 7.3 Técnicas usadas

- **Acople bidireccional** ✅: los fluidos empujan cuerpos y los cuerpos desplazan fluidos.
- **Contactos partícula↔cuerpo** ✅ (*verificado*): `BeginParticleBodyContact` informa qué parte del cuerpo tocó cada partícula. Requiere la flag `1 << 14` (`b2_fixtureContactListenerParticle`) en las partículas.
- **Etiqueta por disparo** ✅: cada grupo disparado escribe su id en el buffer de `userData` de sus partículas (*verificado*: sobrevive cuando se destruyen otras). Así se sabe de quién es cada partícula.
- **Contactos partícula↔partícula** 🔨 #30: reacciones entre fluidos ([04-fluidos](04-fluidos.md#44-reacciones-entre-fluidos--30)).
- **Escritura directa de buffers** 🔨: viento (velocidad) y reacciones (flags).

## 7.4 Render

- **Hoy** ✅:
  - cada partícula es un círculo de color sólido en un canvas 2D;
  - un filtro SVG "goo" (desenfoque más umbral de transparencia) funde las gotas;
  - el desenfoque se escala con el zoom de la cámara.

  El resultado son **manchas planas**, sin brillo ni volumen, y no escala a miles de partículas.
- **Diseño** 🔨 #26: el render metaball de la materia (`metaball.frag.glsl`).
  - Se acumulan los kernels de las partículas en una textura y un shader aplica umbral, borde, brillo y sombreado por densidad.
  - Un color por fluido, con brillo propio en lava y fuego.
  - Va en GPU (WebGL, PIXI ya está cargado) y reemplaza al filtro SVG.
