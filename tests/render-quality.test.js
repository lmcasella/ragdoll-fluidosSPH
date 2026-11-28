/**
 * Calidad de dibujo (#364): los filtros de materiales, robots, líquidos y agua del nivel se crean con la resolución de
 * `RENDER_QUALITY.filterResolution`, definida en un solo lugar.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers/fluid-bench.js";
import { installFakePixi } from "./helpers/fake-pixi.js";

const { RENDER_QUALITY } = await import("../src/render/renderQuality.js");
const { lookOf } = await import("../src/render/fluidDraw.js");
const { createLiquidFilter } = await import("../src/render/liquidFilter.js");
const { createWaterFilter, createWaterHeights } = await import("../src/render/waterFilter.js");
const { createSurfaceFilter } = await import("../src/render/surfaceFilter.js");
const { createRobotFilter } = await import("../src/render/robotFilter.js");
const { MATERIALS } = await import("../src/fluids/materials.js");

const WATER = 4;
const ACID = 1;
const EXPECTED_FILTER_RESOLUTION = 0.75;
const WATER_COLUMNS = { x0: 0, dx: 1, count: 4 };
const WATER_COLOR = [40, 120, 255];
const LINE_COLOR = [170, 220, 255];
const LINE_WIDTH = 2;

test("los filtros de materiales, robots, líquidos y agua llevan la resolución de RENDER_QUALITY", () => {
    installFakePixi();
    assert.equal(RENDER_QUALITY.filterResolution, EXPECTED_FILTER_RESOLUTION);
    const heights = createWaterHeights(WATER_COLUMNS.count).source;
    const filters = {
        surface: createSurfaceFilter(),
        robot: createRobotFilter(),
        liquid: createLiquidFilter(lookOf(ACID)),
        refractiveLiquid: createLiquidFilter(lookOf(WATER)),
        water: createWaterFilter({ look: lookOf(WATER), color: WATER_COLOR, acidColor: MATERIALS.acid.tint, lineColor: LINE_COLOR, lineWidth: LINE_WIDTH, heights, columns: WATER_COLUMNS }),
    };
    for (const [name, filter] of Object.entries(filters)) {
        assert.equal(filter.options.resolution, RENDER_QUALITY.filterResolution, `filtro ${name}`);
    }
});
