# 1. Concepto y materia

## 1.1 Concepto

**Pelea 1 contra 1 de robots ragdoll en un escenario de plataformas con verticalidad, donde las armas son fluidos.**

Dos robots con ragdoll activo se disparan agua, ácido, lava, fuego y viento, y también se pegan a mano. Los fluidos son partículas SPH de verdad: salpican, se acumulan, empujan, se pegan y reaccionan entre sí. Los robots reaccionan como cuerpos físicos que intentan mantenerse en pie, así que caen, se tambalean y se empujan. Debajo del mapa hay una pileta de agua: caer ahí destruye al robot.

**Pilares**

1. **La física es el juego.** Cada mecánica sale de la simulación, no de animaciones armadas: el daño viene de contactos reales, el empuje de impulsos reales y los efectos de fluidos de partículas reales.
2. **Fluidos con personalidad.** Cada fluido se comporta distinto, tanto en lo físico como en lo táctico, y se combinan entre sí (lava + agua = piedra y vapor).
3. **Legible y caótico.** Lo que pasa tiene que entenderse de un vistazo (destello rojo en la parte golpeada, chispas cuando un robot se moja, el viento visible), aunque el resultado sea caótico.
4. **Partidas cortas, cero instalación.** Rondas de 1 a 2 minutos en el navegador, dos jugadores en la misma pantalla, con gamepad.

**Referencias:** Gang Beasts y Human: Fall Flat (ragdoll activo), Stick Fight (1v1 con física), Noita (simulación de materiales como mecánica).

## 1.2 Cómo cumple con la materia

La materia pide un juego web con URL pública que implemente **al menos dos unidades** "con sentido y coherencia". Este proyecto usa tres, cada una con un rol central en el juego:

| Unidad | Qué usamos | Dónde se ve | Detalle |
|---|---|---|---|
| **Box2D** | Ragdoll activo con motores, eventos de contacto, sensores, cuerpos cinemáticos, paso fijo | Robots, golpes, daño por impacto, empujones, pileta | [06-box2d](06-box2d.md) |
| **Fluidos / SPH** | LiquidFun: tipos de partícula, varios sistemas, acople con cuerpos, contactos partícula↔cuerpo y partícula↔partícula, render metaball | Armas, peligros, pileta, inundación, reacciones | [07-sph](07-sph.md) |
| **Raycast** | `world.RayCast` con callbacks (más cercano, ignorar, línea de visión), rayos en abanico y desde un centro | Mira láser, golpe, piso, aparición, arco eléctrico, explosión | [08-raycast](08-raycast.md) |

En la defensa oral se muestra el costo de cada técnica con un panel de métricas ([09-arquitectura](09-arquitectura.md#93-presupuestos-y-métricas)).
