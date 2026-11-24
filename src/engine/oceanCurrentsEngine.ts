import { WorldCell, WorldState, ClimateTemplate } from '../types/world';

export interface OceanCurrentPoint {
  x: number;
  y: number;
  vx: number;
  vy: number;
  temperatureAnomaly: number; // positive = warm current (Gulf stream), negative = cold subpolar current
}

export class OceanCurrentsEngine {
  /**
   * Simulates planetary circular oceanic currents (gyres).
   * Generates warm poleward currents along western continental margins
   * (simulating the Gulf Stream / North Atlantic Drift) and cool equatorward currents on eastern margins.
   */
  static applyOceanicCurrents(
    cells: WorldCell[],
    width = 1000,
    height = 700,
    seaLevel = 0.28,
    climateTemplate: ClimateTemplate = 'Temperate Hearth'
  ): { warmCoastCount: number } {
    let warmCoastCount = 0;

    // Glacial Age, Nordic Boreal, and Arid Steppe suppress mild Gulf Stream warming
    const currentScale =
      climateTemplate === 'Glacial Age'
        ? 0.15
        : climateTemplate === 'Nordic Boreal'
        ? 0.25
        : climateTemplate === 'Arid Steppe'
        ? 0.30
        : climateTemplate === 'Equatorial'
        ? 0.35
        : 0.75;

    for (const cell of cells) {
      if (cell.elevation < seaLevel) continue; // Ocean cells themselves

      // Only coastal cells near sea level receive maritime thermal moderation
      if (!cell.isCoast && cell.elevation > seaLevel + 0.14) continue;

      const nx = cell.x / width;
      const ny = cell.y / height;

      // Determine cool mid-latitude band based on hemisphere template
      const inTemperateCoolBand =
        climateTemplate === 'Southern Hemisphere'
          ? ny >= 0.52 && ny <= 0.84
          : climateTemplate === 'Whole World'
          ? (ny >= 0.14 && ny <= 0.32) || (ny >= 0.68 && ny <= 0.86)
          : ny >= 0.14 && ny <= 0.52;

      // Western/windward maritime margins experience warm drift; eastern margins stay cooler
      const isWindwardMaritime = nx >= 0.08 && nx <= 0.58;

      if (inTemperateCoolBand && isWindwardMaritime && cell.isCoast) {
        const currentStrength = 0.09 * currentScale;
        cell.temperature = Math.min(1.0, cell.temperature + currentStrength);
        cell.moisture = Math.min(1.0, cell.moisture + currentStrength * 0.45);
        warmCoastCount++;

        if (cell.biome === 'Boreal Taiga' || cell.biome === 'Glacial Tundra') {
          if (cell.temperature > 0.35 && cell.moisture > 0.34) {
            cell.biome = 'Temperate Forest';
          } else if (cell.temperature > 0.28 && cell.moisture > 0.54) {
            cell.biome = 'Misty Wetland';
          }
        }
      }
    }

    return { warmCoastCount };
  }

  /**
   * Climatic Drift: Reacts to prolonged multi-year weather anomalies.
   * If a "Scorching Heatwave" persists for consecutive seasons/years,
   * soil moisture drops permanently, causing biomes to drift from Steppe to Savanna or Desert.
   */
  static applyClimaticDrift(
    world: WorldState,
    consecutiveHeatwaveCount: number
  ): { driftedCells: number; summary: string } {
    if (consecutiveHeatwaveCount < 2) return { driftedCells: 0, summary: 'Climate Stable' };

    let driftedCells = 0;
    const severity = Math.min(0.20, (consecutiveHeatwaveCount - 1) * 0.05);
    const seaLevel = world.settings.terrainSim?.seaLevel ?? 0.28;

    for (const cell of world.cells) {
      if (cell.elevation < seaLevel) continue;

      // Desiccate cell moisture
      cell.moisture = Math.max(0.02, cell.moisture - severity);

      // Dynamic Biome Transitions
      if (cell.biome === 'Steppe Grassland' && cell.moisture < 0.18) {
        cell.biome = 'Arid Savanna';
        driftedCells++;
      } else if (cell.biome === 'Arid Savanna' && cell.moisture < 0.10) {
        cell.biome = 'Scorched Desert';
        driftedCells++;
      } else if (cell.biome === 'Temperate Forest' && cell.moisture < 0.24) {
        cell.biome = 'Steppe Grassland';
        driftedCells++;
      } else if (cell.biome === 'Misty Wetland' && cell.moisture < 0.35) {
        cell.biome = 'Temperate Forest';
        driftedCells++;
      }
    }

    let summary = 'Climate Stable';
    if (driftedCells > 0) {
      summary = `Severe Drought: ${driftedCells} territories desiccated by prolonged heatwave!`;
      world.history.unshift({
        id: `hist_climate_drift_${Date.now() % 10000}`,
        year: world.currentYear,
        title: `Climatic Shift: The Great Desiccation`,
        category: 'Great Cataclysm',
        description: `Three consecutive seasons of blistering heatwaves have parched the soil. ${driftedCells} borderland cells have drifted into arid savanna and desert scrub, devastating harvests!`,
      });
    }

    return { driftedCells, summary };
  }
}
