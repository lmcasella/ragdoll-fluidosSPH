# 4. Fluidos

Código: disparos en `index.html` (`disparar`, tabla `ARMAS`), daño en `js/damage.js`, pileta en `js/level.js`.

## 4.1 Armas

### Disparo continuo con tanque 🔨 #13

- **Disparo:** mientras se **mantiene** el botón (A / RT, Espacio / Enter), el arma emite un **chorro continuo**, como una manguera. Conceptualmente, el robot guarda el líquido en un tanque y lo expulsa a presión.
- **Tanque:** cada arma del inventario tiene el suyo. Se vacía mientras se dispara y, vacío, el arma no dispara. **No se recarga solo**: se rellena al volver a recoger el arma ([4.2](#42-recogida-e-inventario)). Así se limita el disparo y se incentiva el golpe melee.
- **Datos por arma** (tabla de armas): caudal (partículas o grupos por segundo), velocidad de salida, capacidad del tanque y comportamiento físico. Los valores se fijan al implementar #13 y se anotan acá.

**Hoy** ✅: un grupo de 8 partículas por pulsación (radio de grupo 0,25 m, partícula de 0,1 m, salida a 20 m/s), sin límite. Armas 1/2/3: ácido, lava, miel.

### Las armas

| Fluido | Implementación LiquidFun | Comportamiento | Efecto en el robot | Estado |
|---|---|---|---|---|
| **Agua** | Sistema líquido, `b2_waterParticle` | Chorro rápido que salpica y se acumula en charcos | **Cortocircuito:** chispas eléctricas y −3 de vida por segundo mientras esté mojado y 3 s después. Arco eléctrico entre robots mojados ([08-raycast](08-raycast.md)) | 🔨 #18 |
| **Ácido** | Sistema líquido, `b2_waterParticle` | Rápido, se escurre por las superficies | Hoy: 2 de daño por partícula, que se consume ✅. Diseño: **4 por partícula y corrosión**: la parte queda corroída 4 s y recibe +50 % de daño de cualquier fuente (humo verde) | 🔨 #19 |
| **Lava** | Sistema líquido, `b2_tensileParticle` | Pesada, pegajosa, forma gotas | **Quema:** cada contacto deja la parte quemándose 1,5 s a 4 de daño por segundo. No se consume | ✅ |
| **Fuego** | Sistema de **gases** (gravedad negativa, vida ~0,6 s) | Lanzallamas de corto alcance (~3 m). Sube y se apaga solo | Daño por contacto. Seca el estado mojado | 🔨 #16 |
| **Viento** | Sistema de gases (gravedad 0, vida ~1,2 s), con velocidad escrita en cada paso | Ráfaga visible como estelas | **Sin daño.** Empuja por transferencia de cantidad de movimiento | 🔨 #17 |
| **Miel** | Sistema líquido, `b2_viscousParticle` | Espesa | Ralentiza 1 s (movimiento y salto a la mitad); la partícula se consume. Pasa a ser peligro del mapa ([4.3](#43-peligros-del-mapa)) | ✅ (arma provisoria) |

### Cortocircuito: regla compartida ✅ #22

El agua de la inundación y el arma de agua (#18) dañan igual, así que la regla vive en un solo lugar y cada fuente solo la dispara.

- **Estado `mojado`** en `ActiveRagdoll`: `soak(now)` lo deja en `WET_TIME` = **3 s** (si ya estaba mojado, lo renueva). En `updateStatus(dt)`, una vez por paso fijo, mientras quede tiempo: **−3 de vida por segundo** (`SHORT_CIRCUIT_DPS`) con `takeDamage`, **sin multiplicador por parte** (es una falla de todo el robot, no un impacto). El tiempo baja con `dt`. Se copia en `copyStateFrom` al girar.
- **Quién lo dispara:** siempre `DamageSystem.process`, después de `stepWorld` (patrón "juntar durante el paso, actuar después").
  - **Inundación (#22):** `process(now, waterLevel)` recorre los robots registrados y moja al que tiene alguna parte con el centro por debajo de `waterLevel`. No usa callbacks: el nivel lo da `Flood.level`, que vale `-Infinity` antes de los 90 s de ronda (la pileta no moja; ver [02-partida](02-partida.md#21-inundación--22)).
  - **Arma de agua (#18, después):** `onParticleBodyContact` encola el contacto de una partícula `FLUID.WATER` del sistema de disparos, como hoy el ácido, y `process` llama a `soak`. Respeta la gracia de 0,4 s del fluido propio.
- **Visual:** tinte cian intermitente mientras dura el estado ✅ (#22). Las chispas y el arco entre robots mojados son de #18 y #31.
- No se usan contactos partícula↔cuerpo para la inundación: `BeginParticleBodyContact` solo avisa cuando un contacto empieza, y un robot quieto bajo el agua podría dejar de recibir avisos. Leer todos los contactos del paso tampoco es posible: `GetBodyContacts` existe en el build pero no hay `GetBodyContactCount` (*verificado* en `vendor/liquidfun.js`, 18/11).

**¿El fuego es un fluido?** Sí, gaseoso: es SPH igual que los líquidos, pero en otro sistema de partículas con gravedad negativa (sube) y tiempo de vida corto (se extingue).

**El viento como impulso:** LiquidFun no tiene "fuerza de viento". La ráfaga es un grupo de partículas sin gravedad cuya velocidad se escribe en cada paso (*verificado*: escribir el buffer de velocidad persiste). Al tocar un cuerpo le transfieren cantidad de movimiento, y como las partículas se ven, el empuje se entiende.

## 4.2 Recogida e inventario 🔨

- **Arranque:** cada robot empieza la ronda **solo con el golpe melee**.
- **Puntos de aparición** (#14): las armas están en puntos fijos del mapa, definidos como datos del nivel. Al tocar un arma (sensor de Box2D), se suma al inventario con el tanque lleno; si ya estaba, se rellena. Reaparece en su punto a los 15 s.
- **Rueda de armas** (#15): mantener LB (Q / Ctrl derecho de respaldo) abre un círculo con las armas del inventario. Se elige con el stick o las direcciones y se equipa al soltar. El juego sigue corriendo. Reemplaza las teclas 1/2/3 y el teclado numérico.

## 4.3 Peligros del mapa

| Peligro | Implementación | Efecto | Estado |
|---|---|---|---|
| **Pileta** | Agua SPH al fondo del hueco central + sensor | Caer = robot destruido | ✅ ([05-escenario](05-escenario.md#52-pileta)) |
| **Inundación** | Lluvia en el sistema del agua del nivel, con nivel controlado | Bajo el nivel = mojado (cortocircuito) | ✅ #22 ([02-partida](02-partida.md#21-inundación--22)) |
| **Charcos de miel** | Grupos `b2_viscousParticle` al colocar el nivel | Velocidad y salto ×0,5 mientras haya contacto | 🔨 #23 |
| **Ventiladores** | Emisor de viento hacia arriba | Ascensor de aire a plataformas altas | 🔨 #24 |
| **Goteo de ácido** | Emisor periódico desde el techo | Fuerza a moverse | 💬 |
| **Cascada de lava** | Emisor continuo | Corta el mapa; se apaga con agua | 💬 |
| **Gel elástico** | Grupo `b2_elasticParticle` | Trampolín deformable | 💬 |

## 4.4 Reacciones entre fluidos 🔨 #30

Se detectan con contactos **partícula↔partícula** (`BeginParticleContact`). Para eso, los fluidos que reaccionan comparten el sistema líquido y se identifican por color o por flags.

| Reacción | Resultado |
|---|---|
| Lava + agua | La lava se vuelve **piedra** (`b2_wallParticle`, estática, gris) y sale **vapor** en el sistema de gases: **plataformas temporales** que se rompen con el tiempo |
| Fuego + agua | Se apagan los dos y queda vapor |
| Fuego + miel | Caramelo: más viscoso y quema poco (💬) |
| Ácido + agua | El ácido se diluye y pierde daño (💬) |

**Explosión de vapor** (#32): cuando reacciona mucha lava de una vez, se lanzan rayos desde el centro y solo se empuja lo que tiene línea de visión ([08-raycast](08-raycast.md)).
