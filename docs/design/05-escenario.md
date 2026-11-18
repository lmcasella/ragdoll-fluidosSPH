# 5. Escenario

Código: `js/level.js` (`LEVEL`, `buildLevel`, `fillPool`), `js/camera.js`.

## 5.1 Mapa y cámara

- **Mundo de tamaño fijo** ✅: 56 × 32 m, en metros e independiente de la ventana. Definido como datos en `LEVEL`.
- **Geometría actual** ✅:
  - dos islas de piso (x 0–18 y 38–56, tope a y = 4);
  - el hueco central es la pileta;
  - paredes a los costados;
  - plataformas a varias alturas, cada una a ≤ 3,5 m de la anterior para que se alcancen saltando (el salto llega a ~4 m);
  - plataformas chicas sobre la pileta para cruzarla.
- **Aparición** ✅: J1 en x = 7,5 y J2 en x = 48,5. La altura sale de un rayo vertical desde el techo ([08-raycast](08-raycast.md)).
- **Cámara compartida** ✅: encuadra a los dos robots con margen (6 × 4 m), hace zoom según la distancia (máximo ×1,6), nunca muestra fuera del mapa y se suaviza en el tiempo.
- **Pendiente:**
  - mapa definitivo con puntos de armas (#25);
  - plataformas **cinemáticas** (#33);
  - plataformas de **piedra temporal** (lava + agua, #30).

**Limitación (hoy):** el build no expone `PreSolve`, así que hoy todas las plataformas son sólidas. Hay una vía alternativa con el filtro de contactos: [5.3](#53-plataformas-atravesables-desde-abajo-).

## 5.2 Pileta ✅

> **🔨 #62:** el agua de la pileta pasa a ser un campo de alturas (Saint-Venant 1D) que arranca en reposo exacto. Los robots flotan por Arquímedes, y el sensor se mantiene como regla de juego ([14.3](14-agua.md#143-campo-de-alturas-saint-venant-1d-shallowwater), [14.5](14-agua.md#145-flotación-de-arquímedes-por-pieza)).

- **Agua:** SPH real en el hueco central (x 18–38, del fondo hasta y = 3), en un **sistema de partículas propio** Un robot que cae salpica.
  - ✅ #22: es el **agua del nivel**, compartido con la lluvia de la inundación. Radio **0,25 m** (`LEVEL.pool.radius`; 477 partículas en la pileta, medido) y `maxCount` = `LEVEL.flood.maxParticles` (5.500) al crearlo en `fillPool`. Se dibuja con radio **0,28 m** (decisión del usuario: no agrandar las partículas).
  - ✅ #40: las fuerzas del sistema (`LEVEL.pool.physics`: damping 1,0, viscosidad 0,1) y las flags de sus partículas (`LEVEL.pool.flags`: `VISCOUS | STATIC_PRESSURE`) son datos, para que el agua en reposo quede quieta y se nivele en lugar de verse como un pelotero ([07-sph §7.5](07-sph.md#75-parámetros-por-sistema--40)).
- **Sensor:** un sensor de Box2D cubre la pileta hasta y = 2,2. El robot que se hunde ahí queda **destruido** (vida 0, todo rojo) y pierde la ronda. Con la inundación **no se mueve** ([02-partida](02-partida.md#21-inundación--22)).
- **Disparos:** los sistemas de disparos y del agua del nivel no interactúan entre sí en LiquidFun.
  - ✅ #22: hasta ahora, las partículas de los disparos que caían al agua se eliminaban (corte `y < max(pool.surface si x está sobre la pileta, nivel de la inundación)`), porque si no la atravesaban.
  - ✅ #39: **ya no se eliminan.** El puente detecta los disparos dentro del agua (pileta, inundación o charcos) y los frena y los hace flotar o hundirse según el fluido ([07-sph §7.6](07-sph.md#76-puente-agua--disparos--39)).
- **Inundación:** la lluvia de la muerte súbita cae sobre la pileta y la hace subir (#22, [02-partida](02-partida.md#21-inundación--22)).

## 5.3 Plataformas atravesables desde abajo 🔨

Pedido del usuario (remapeo del 18/11), **sin issue ni milestone todavía**. Solo diseño y verificación. Un robot atraviesa una plataforma (`kind: "platform"`) al subir desde abajo, y la atraviesa hacia abajo con `drop` (abajo + A, [10](10-controles.md#101-mapeo--remapeo-pedido-por-el-usuario-el-1811)).

### Verificado en el binding (`vendor/liquidfun.js`, 18/11)

| Vía | Qué hay | ¿Sirve? |
|---|---|---|
| `PreSolve` (desactivar el contacto en cada paso) | `JSContactListener` solo expone `BeginContact`, `EndContact`, `BeginParticleContact`, `EndParticleContact`, `BeginParticleBodyContact` y `EndParticleBodyContact`. **No** hay `PreSolve` ni `PostSolve` | No |
| `b2Contact.SetEnabled(false)` desde `BeginContact` | `SetEnabled` existe, pero según el fuente de Box2D 2.3, `b2Contact::Update` vuelve a habilitar el contacto en cada paso antes de `PreSolve`. Desactivado desde `BeginContact`, solo dura un paso. Además, cambiar el contacto dentro de un callback rompe "juntar durante el paso" | No |
| Filtro de contactos: `JSContactFilter` con `ShouldCollide(fixtureA, fixtureB)`, `b2World.SetContactFilter` y `b2Fixture.Refilter()` | Los tres existen | **Sí** |
| Datos de filtro (`b2Filter` con `categoryBits`/`maskBits`/`groupIndex`, `b2Fixture.SetFilterData`) | Existen, pero habría que escribir el filtro de las fixtures de la instancia de RagImporter, y es por robot, no por par pieza–plataforma | Descartado |

### Diseño

- **Módulo nuevo `js/platforms.js`**, clase `OneWayPlatforms(world, level, players)`. Instala un `JSContactFilter` en el mundo (hay uno solo por mundo).
- **`ShouldCollide(A, B)`:**
  - Primero reproduce la regla por defecto de Box2D con `GetFilterData` de las dos fixtures (`groupIndex` igual y distinto de 0; si no, `categoryBits`/`maskBits`). Así no cambia ningún filtro que ya use RagImporter.
  - Si un lado es una plataforma atravesable (punteros guardados al crear el nivel) y el otro es una pieza de robot, devuelve `false` cuando el par está **fantasma**: el borde inferior de la pieza (`GetAABB`) está por debajo del tope de la plataforma menos 0,05 m (viene de abajo o la está cruzando), o ese robot tiene activa una **bajada**.
  - Solo lee estado; no crea ni destruye nada. Es una consulta, compatible con "juntar durante el paso, actuar después".
- **Por qué hace falta `Refilter`:** Box2D llama a `ShouldCollide` cuando las cajas de dos fixtures empiezan a solaparse, y no lo repite mientras sigan solapadas. Una pieza que entra desde abajo y termina arriba de la plataforma seguiría sin contacto. Después de cada `stepWorld`, para cada pieza que solapa una plataforma y cambió de lado (abajo → arriba, o termina la bajada), se llama a `fixture.Refilter()`. Eso marca sus contactos para volver a filtrarlos en el paso siguiente. `Refilter` no cambia ningún dato de la fixture.
- **Bajada (`drop`):** si el robot está apoyado en una plataforma atravesable (piso por raycast desde los pies, como el salto), se activa la bajada de esa plataforma: dura hasta que el borde superior del robot queda por debajo de la plataforma, o `DROP.maxTime` (0,4 s). Al empezar y al terminar se hace `Refilter` de las piezas del robot. Si no está sobre una atravesable, `drop` cuenta como salto.
- **Contrato de RagImporter:** no escribe filtros ni destruye fixtures de la instancia. `Refilter` solo marca contactos. Es una zona gris del contrato ("el juego no destruye joints ni fixtures… ni escribe motores"): **se propone al usuario antes de implementar**.
- **Partículas:** no cambian. LiquidFun solo consulta `ShouldCollide(fixture, sistema, índice)` para partículas con la flag `b2_fixtureContactFilterParticle` (1 << 16), que el juego no usa, y esa sobrecarga no está en el binding. Las partículas siguen chocando con las plataformas desde los dos lados: la lluvia y los charcos quedan arriba ([14.7](14-agua.md#147-inundación-con-lluvia-absorbida)).
- **Campo de alturas:** no cambia. Las plataformas nunca fueron lecho ([14.3](14-agua.md#paso-estabilidad-y-bordes)).
- **Gancho:** el rayo sigue pegando en las plataformas desde abajo (los rayos no usan el filtro de contactos). Engancharse desde abajo y recoger la cuerda deja pasar al robot a través de la plataforma, que es lo esperado.

### Por verificar en ejecución

- Que `JSContactFilter.ShouldCollide` reciba los punteros de las fixtures (como `JSContactListener`) y que su valor de retorno se respete.
- Que `Refilter` vuelva a llamar a `ShouldCollide` en el paso siguiente.

### Criterios (Node, gamepad simulado)

- Saltar desde abajo de una plataforma de 0,4 m atraviesa y aterriza arriba en el mismo salto.
- `drop` sobre una plataforma baja al robot por debajo en ≤ 0,5 s, y no vuelve a subir.
- Sobre el piso de las islas, `drop` salta (9 m/s).
- Los robots siguen chocando entre sí y con el piso y las paredes. Las partículas siguen apoyadas en las plataformas.
