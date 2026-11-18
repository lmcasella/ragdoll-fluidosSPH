# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versiones según [SemVer](https://semver.org/lang/es/).
Cada merge a `main` se publica en GitHub Pages. La primera entrada `## [x.y.z]` define la versión: si es nueva, el deploy crea el tag `vX.Y.Z` y su release.

## [Unreleased]

## [0.1.0] - 2026-11-17

### Added
- Deploy automático a GitHub Pages en cada merge a `main`, con tests previos y `version.json` publicado.
- Tests de humo: sintaxis del script principal, validez de los `.rag.json` y estabilidad de los robots.
- Giro de dirección del personaje según hacia dónde apunta o camina.
- Dos jugadores con teclado (WASD + Espacio, flechas + Enter) y gamepad.
- Ragdolls cargados con RagImporter; ambos jugadores usan el robot con clips `walk`, `jump` y `dead`.
- Armas de fluidos: ácido, lava y miel, con daño y ralentización.
