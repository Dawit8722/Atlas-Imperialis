import { WorldState, Burg, BurgDemographics } from '../types/world';
import { updateBurgFoodSecurity } from './economyEngine';
import { generateUniqueId } from './v17GrandStrategyEngine';

// ============================================================================
// ECOLOGICAL CARRYING CAPACITY & NATURAL DEMOGRAPHIC DYNAMICS
// ============================================================================

export class CarryingCapacityEngine {
  /**
   * Calculates a settlement's maximum sustainable population capacity (in actual citizens)
   * based on tier, geography, hydrology, civic development, and infrastructure.
   */
  static calculateBurgCapacity(burg: Burg, w: WorldState): number {
    const cell = w.cells?.find((c) => c.index === burg.cellIndex) || w.cells?.[0];

    let baseCap =
      burg.type === 'Capital Citadel' ? 145000 :
      burg.type === 'Royal Metropolis' ? 82000 :
      burg.type === 'Trade Port' ? 54000 :
      burg.type === 'Market Town' ? 28000 :
      burg.type === 'Fishing Port' ? 11500 :
      burg.type === 'Border Fortress' ? 9200 :
      burg.type === 'Ancient Sanctuary' ? 7800 :
      burg.type === 'Farming Village' ? 6400 :
      burg.type === 'Mountain Hamlet' ? 3500 : 7500;

    if (cell) {
      if (cell.moisture > 0.45) baseCap *= 1 + (cell.moisture - 0.45) * 0.35;
      else if (cell.moisture < 0.25) baseCap *= 0.80;
      if (cell.isCoast) baseCap *= 1.14;
      if (cell.isRiver) baseCap *= 1.18;
      if (cell.elevation > 0.60) baseCap *= Math.max(0.55, 1.0 - (cell.elevation - 0.60) * 1.1);
    }

    // Civic Development (aqueducts, sanitation, paved roads, irrigation canals)
    const dev = burg.developmentLevel || 30;
    baseCap *= 0.84 + (dev / 100) * 0.58;

    // Trade Route Connectivity lifts sustainable urban food supply
    const routeCount = burg.connectedRouteCount || 1;
    baseCap += Math.min(14000, routeCount * 1250);

    // Infrastructure & Agricultural Building Expansions
    const buildings = burg.buildings || [];
    for (const bId of buildings) {
      const lower = bId.toLowerCase();
      if (lower.includes('mill') || lower.includes('silo') || lower.includes('granary')) {
        const tier = lower.includes('_2') || lower.includes('imperial') || lower.includes('wind') ? 2 : 1;
        baseCap += tier * 3800;
      } else if (lower.includes('wall') || lower.includes('curtain')) {
        baseCap += 1400;
      } else if (lower.includes('keep') || lower.includes('citadel')) {
        baseCap += 1800;
      } else if (lower.includes('guild') || lower.includes('bourse')) {
        baseCap += 2400;
      }
    }
    const weatherHarvestMod = w.activeWeatherMod?.harvestMult ?? 1.0;
    baseCap *= Math.max(0.75, Math.min(1.15, 0.72 + weatherHarvestMod * 0.28));
    if (w.activeWeather?.frozenSeaLanes && cell?.isCoast) {
      baseCap *= 0.92;
    }

    return Math.max(1400, Math.round(baseCap));
  }

  /**
   * Computes authentic medieval social estate & occupational composition for a settlement.
   */
  static computeBurgDemographics(
    burg: Burg,
    annualGrowthRatePct: number
  ): BurgDemographics {
    const pop = Math.max(100, burg.population || 1500);
    const dev = burg.developmentLevel || 30;
    const buildings = burg.buildings || [];

    const hasCathedral = burg.isHolySite || buildings.some((b) => b.toLowerCase().includes('wonder') || b.toLowerCase().includes('cathedral'));
    const hasGuild = buildings.some((b) => b.toLowerCase().includes('guild') || b.toLowerCase().includes('bourse'));

    // Base shares by settlement role
    let artisanShare = 0.14;
    let clergyShare = 0.04;
    let urbanSharePct = 22;

    if (burg.type === 'Capital Citadel') {
      artisanShare = 0.40 + (dev / 100) * 0.08;
      clergyShare = 0.09;
      urbanSharePct = 76;
    } else if (burg.type === 'Royal Metropolis') {
      artisanShare = 0.42 + (dev / 100) * 0.07;
      clergyShare = 0.08;
      urbanSharePct = 72;
    } else if (burg.type === 'Trade Port') {
      artisanShare = 0.46 + (dev / 100) * 0.06;
      clergyShare = 0.06;
      urbanSharePct = 74;
    } else if (burg.type === 'Market Town') {
      artisanShare = 0.36 + (dev / 100) * 0.06;
      clergyShare = 0.06;
      urbanSharePct = 58;
    } else if (burg.type === 'Ancient Sanctuary') {
      artisanShare = 0.16;
      clergyShare = 0.34;
      urbanSharePct = 42;
    } else if (burg.type === 'Border Fortress') {
      artisanShare = 0.16;
      clergyShare = 0.05;
      urbanSharePct = 36;
    } else if (burg.type === 'Fishing Port') {
      artisanShare = 0.24;
      clergyShare = 0.04;
      urbanSharePct = 34;
    } else if (burg.type === 'Farming Village') {
      artisanShare = 0.11;
      clergyShare = 0.035;
      urbanSharePct = 15;
    } else if (burg.type === 'Mountain Hamlet') {
      artisanShare = 0.13;
      clergyShare = 0.035;
      urbanSharePct = 16;
    }

    if (hasGuild) artisanShare += 0.04;
    if (hasCathedral) clergyShare += 0.03;

    // Soldiery derived directly from garrison + watch
    const rawGarrison = burg.garrisonCount || Math.round(pop * 0.035);
    const soldiery = Math.min(Math.round(pop * 0.42), Math.max(12, rawGarrison));
    const clergy = Math.max(4, Math.round(pop * clergyShare));
    const artisans = Math.max(15, Math.round(Math.min(pop - soldiery - clergy - Math.round(pop * 0.18), pop * artisanShare)));
    const peasantry = Math.max(20, pop - soldiery - clergy - artisans);

    return {
      peasantry,
      artisans,
      clergy,
      soldiery,
      urbanSharePct: Math.min(92, Math.max(10, Math.round(urbanSharePct + (hasGuild ? 4 : 0)))),
      annualGrowthRatePct: Math.round(annualGrowthRatePct * 100) / 100,
    };
  }

  /**
   * Evaluates carrying capacity, overcrowding ratios, food security, and natural
   * demographic composition across all settlements.
   */
  static updateAllBurgs(w: WorldState, applyDemographicTick: boolean = true): void {
    if (!w.burgs) return;

    for (const b of w.burgs) {
      const cap = CarryingCapacityEngine.calculateBurgCapacity(b, w);
      b.carryingCapacity = cap;

      const currentPop = Math.max(120, b.population || 1500);
      b.overcrowdingRatio = Math.round((currentPop / Math.max(1, cap)) * 100) / 100;

      const bMarket = w.economy?.burgMarkets?.[b.id];
      if (bMarket) {
        updateBurgFoodSecurity(bMarket, b);

        const grain = bMarket.markets['Grain'];
        const livestock = bMarket.markets['Livestock'];
        const fish = bMarket.markets['Dried Fish'];
        const totalStock = (grain?.stockpile || 0) + (livestock?.stockpile || 0) + (fish?.stockpile || 0) * 0.6;
        const monthlyDemand =
          (grain?.monthlyConsumption || 0) + (livestock?.monthlyConsumption || 0) + (fish?.monthlyConsumption || 0) * 0.6 || 12;

        b.foodSurplus = Math.round((totalStock - monthlyDemand * 2) * 10) / 10;
      }

      const annualGrowthPct = CarryingCapacityEngine.processFamineAndOvercrowding(b, w, applyDemographicTick);
      b.demographics = CarryingCapacityEngine.computeBurgDemographics(b, annualGrowthPct);
    }
  }

  /**
   * Applies continuous Verhulst logistic population growth, Malthusian overcrowding pressure,
   * seasonal/famine mortality, epidemic attrition, and siege casualties.
   * Returns the annualized demographic growth rate percentage.
   */
  static processFamineAndOvercrowding(
    b: Burg,
    w: WorldState,
    applyDemographicTick: boolean = true
  ): number {
    // A. Chronic Famine & Bread Riots
    if (b.foodSecurity === 'FAMINE' || b.isStarving) {
      b.starvingMonths = (b.starvingMonths || 0) + 1;

      if (applyDemographicTick && b.starvingMonths === 3 && Math.random() < 0.45) {
        const owner = w.characters?.find((c) => c.id === b.ownerId);
        if (owner) {
          owner.stress = Math.min(300, (owner.stress || 0) + 25);
          owner.prestige = Math.max(0, (owner.prestige || 100) - 30);
          owner.dread = Math.min(100, (owner.dread || 0) + 10);
        }

        b.developmentLevel = Math.max(5, (b.developmentLevel || 30) - 2);

        if (!w.history) w.history = [];
        w.history.unshift({
          id: generateUniqueId('hist_famine_riot'),
          year: w.currentYear,
          title: `Bread Riots in ${b.name}`,
          category: 'Great Cataclysm',
          description: `Desperate commoners in ${b.name} broke open municipal granaries after ${b.starvingMonths} months of starvation! Banners were torn down and trade was paralyzed.`,
          primaryActorId: owner?.id,
          realmId: b.stateId,
        });
      }
    } else if (b.starvingMonths && b.starvingMonths > 0) {
      b.starvingMonths = Math.max(0, b.starvingMonths - 1);
    }

    // B. Continuous Verhulst Logistic Demographic Model
    const currentPop = Math.max(120, b.population || 1500);
    const cap = Math.max(500, b.carryingCapacity || currentPop * 1.25);
    const loadRatio = currentPop / cap; // P / K
    const dev = b.developmentLevel || 30;
    const season = w.currentSeason || 'Summer';

    // Environmental & trade vitality
    const tradePull = Math.min(0.0005, ((b.connectedRouteCount || 1) - 1) * 0.00012);
    const devVitality = 0.00055 + (dev / 100) * 0.00055 + tradePull; // ~0.66% - 1.9% baseline annual potential
    const weatherMod = w.activeWeatherMod?.harvestMult ?? 1.0;
    const seasonalFactor = (season === 'Winter' ? 0.72 : season === 'Autumn' ? 1.15 : 1.0) * Math.max(0.6, weatherMod);

    let monthlyDeltaRate = 0;

    if (b.foodSecurity === 'FAMINE' || b.isStarving) {
      // Acute starvation mortality
      const severity = Math.min(3, Math.max(1, b.starvingMonths || 1));
      monthlyDeltaRate = -(0.009 + severity * 0.005);
    } else if (b.foodSecurity === 'RATIONED') {
      // Food scarcity halts births and triggers modest urban emigration
      monthlyDeltaRate = -0.0018 - Math.max(0, loadRatio - 0.85) * 0.0025;
    } else if (b.foodSecurity === 'STRAINED') {
      // Strained grain supply dampens logistic growth
      monthlyDeltaRate = devVitality * seasonalFactor * 0.35 * Math.max(-0.5, 0.94 - loadRatio);
    } else {
      // SECURE: Smooth S-curve logistic growth r * (1 - P / K)
      // Above carrying capacity (P > K), Malthusian crowding gradually pushes emigration
      monthlyDeltaRate = devVitality * seasonalFactor * (1.0 - loadRatio);
      if (loadRatio > 1.0) {
        monthlyDeltaRate = Math.max(-0.0045, monthlyDeltaRate * 2.2);
      }
    }

    // C. Epidemic / Plague Attrition (mitigated 35%-50% by Apothecary Remedies)
    const activePlague = (w.epidemics || []).find((ep) =>
      ep.infectedProvinceIds.includes(b.countyId)
    );
    if (activePlague) {
      const crowdAmplifier = Math.max(0.85, Math.min(1.8, loadRatio));
      let plagueLoss = (0.006 + activePlague.lethality * 0.014) * crowdAmplifier;
      const medMarket = w.economy?.burgMarkets?.[b.id]?.markets?.['Apothecary Remedies'];
      const medStock = medMarket?.stockpile || 0;
      const medNeed = Math.max(1, medMarket?.monthlyConsumption || 2);
      if (medStock > 0) {
        const medCoverage = Math.min(1.0, medStock / medNeed);
        const mitigation = 0.35 + 0.15 * medCoverage;
        plagueLoss *= (1 - mitigation);
        if (applyDemographicTick && medMarket) {
          medMarket.stockpile = Math.max(0, Math.round((medStock - Math.min(medStock, medNeed * 0.25)) * 10) / 10);
        }
      }
      monthlyDeltaRate -= plagueLoss;
    }

    // D. Active Siege / Wartime Attrition
    const underSiege = (w.activeSieges || []).some(
      (s) => s.holdingId === b.id || s.holdingName.includes(b.name)
    );
    if (underSiege) {
      monthlyDeltaRate = Math.min(monthlyDeltaRate, 0) - 0.0055;
    }

    const annualGrowthRatePct = ((Math.pow(1 + monthlyDeltaRate, 12) - 1) * 100);

    if (applyDemographicTick) {
      const nextPop = Math.max(120, Math.round(currentPop * (1.0 + monthlyDeltaRate)));
      const popChangeRatio = nextPop / currentPop;
      b.population = nextPop;
      b.levyPool = Math.max(15, Math.round(nextPop * 0.042));

      // Propagate organic rural growth/decline to surrounding county cells
      if (w.cells && b.countyId && Math.abs(popChangeRatio - 1) > 0.0001) {
        const county = w.counties?.find((c) => c.id === b.countyId);
        if (county && county.capitalBurgId === b.id) {
          const ruralScale = 1 + (popChangeRatio - 1) * 0.65;
          for (const idx of county.cellIndices || []) {
            const cell = w.cells[idx];
            if (cell && cell.populationDensity && cell.populationDensity > 0) {
              cell.populationDensity = Math.max(
                1,
                Math.min(240, Math.round(cell.populationDensity * ruralScale * 10) / 10)
              );
            }
          }
        }
      }
    }

    return annualGrowthRatePct;
  }
}