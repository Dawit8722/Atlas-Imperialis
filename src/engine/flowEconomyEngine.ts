import {
  WorldState,
  Burg,
  TraderCaravan,
  TradeRoute,
  Point2D,
} from '../types/world';
import { CommodityType } from '../types/economy';
import {
  calculateMarketPrice,
  updateBurgFoodSecurity,
  ensureEconomy,
  COMMODITIES,
} from './economyEngine';
import { generateUniqueId } from './v17GrandStrategyEngine';
import { getArmyPositionAtProgress } from './armyPathfinding';

// Zero-leak caches for O(1) per-frame lookups
const routeLengthCache = new WeakMap<TradeRoute, number>();
const routeLookupCache = new WeakMap<TradeRoute[], Map<string, TradeRoute>>();
const burgLookupCache = new WeakMap<Burg[], Map<string, Burg>>();

function getRouteArcLength(route: TradeRoute): number {
  const cached = routeLengthCache.get(route);
  if (cached !== undefined) return cached;
  const pts = route.pathPoints;
  if (!pts || pts.length < 2) {
    routeLengthCache.set(route, 0);
    return 0;
  }
  let dist = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    dist += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  }
  routeLengthCache.set(route, dist);
  return dist;
}

function getRouteMap(routes: TradeRoute[]): Map<string, TradeRoute> {
  let map = routeLookupCache.get(routes);
  if (map && map.size === routes.length) return map;
  map = new Map<string, TradeRoute>();
  for (const r of routes) map.set(r.id, r);
  routeLookupCache.set(routes, map);
  return map;
}

function getBurgMap(burgs: Burg[]): Map<string, Burg> {
  let map = burgLookupCache.get(burgs);
  if (map && map.size === burgs.length) return map;
  map = new Map<string, Burg>();
  for (const b of burgs) map.set(b.id, b);
  burgLookupCache.set(burgs, map);
  return map;
}

// ============================================================================
// 1. CARAVAN INTERPOLATION & ROAD ARTERIES
// ============================================================================

const recentRouteArrivals = new WeakMap<TradeRoute, number>();

const visualCaravanShadowCache = new WeakMap<NonNullable<WorldState['tradeNetwork']>, TraderCaravan[]>();

export class FlowEconomyEngine {
  /**
   * Smoothly interpolates the (x, y) coordinates of a caravan along its route path.
   */
  static getPointAlongPath(points: Point2D[], progress: number): Point2D {
    if (!points || points.length === 0) return { x: 500, y: 350 };
    if (points.length === 1) return points[0];

    const totalSegments = points.length - 1;
    const scaledProgress = Math.max(0, Math.min(1.0, progress)) * totalSegments;
    const segIndex = Math.min(totalSegments - 1, Math.floor(scaledProgress));
    const segT = scaledProgress - segIndex;

    const p0 = points[segIndex];
    const p1 = points[segIndex + 1];

    return {
      x: Math.round(p0.x + (p1.x - p0.x) * segT),
      y: Math.round(p0.y + (p1.y - p0.y) * segT),
    };
  }

  /**
   * Delivers cargo into destination market, updates prices, food security,
   * commercial volume, and pays tariffs to the destination settlement lord & coffer.
   */
  static deliverCaravanArrival(w: WorldState, c: TraderCaravan): void {
    const destMarket = w.economy?.burgMarkets?.[c.toBurgId || ''];
    const originMarket = w.economy?.burgMarkets?.[c.fromBurgId || ''];
    const destBurg = w.burgs?.find((b) => b.id === c.toBurgId);
    const originBurg = w.burgs?.find((b) => b.id === c.fromBurgId);

    if (destMarket && destMarket.markets[c.commodity as CommodityType]) {
      const m = destMarket.markets[c.commodity as CommodityType];
      const deliveredUnits = c.cargoUnits || 10;

      // 1. Deliver goods into destination stockpile
      const maxCapacity = m.maxStockpileCapacity || 1200;
      m.stockpile = Math.min(maxCapacity, m.stockpile + deliveredUnits);

      // 2. Damped price equilibrium adjustment respecting realm inflation
      const realmId = destBurg?.stateId || '';
      const coinPurity = w.economy?.realmCoinPurity?.[realmId] ?? 1.0;
      const inflationFactor = 1.0 / Math.max(0.2, coinPurity);

      m.lastMonthPrice = m.currentPrice;
      m.currentPrice = calculateMarketPrice(m, inflationFactor, 0.25);

      // 3. Immediately re-evaluate food security if food commodity arrived
      if (c.commodity === 'Grain' || c.commodity === 'Livestock' || c.commodity === 'Dried Fish') {
        updateBurgFoodSecurity(destMarket, destBurg);
      }

      // 4. Record commercial turnover volume
      const tradeValue = Math.round(deliveredUnits * m.currentPrice * 10) / 10;
      destMarket.totalMarketVolume += Math.round(tradeValue);
      if (w.economy) {
        w.economy.totalTradeFlowVolume = (w.economy.totalTradeFlowVolume || 0) + Math.round(tradeValue);
      }

      // 5. Physical settlement: destMarket.treasury -> originMarket.treasury + Crown Customs Tariff (zero fiat minting)
      const destCash = Math.max(0, destMarket.treasury ?? destBurg?.treasury ?? 0);
      const settledGold = Math.min(destCash, Math.max(0, tradeValue));

      if (settledGold > 0) {
        const tariffRate = destMarket.tariffRate || 0.05;
        const customsDuty = Math.round(settledGold * tariffRate * 10) / 10;
        const merchantProceeds = Math.round((settledGold - customsDuty) * 10) / 10;

        // Debit destination municipal market & sync burg coffer
        const nextDestCash = Math.round((destCash - settledGold) * 10) / 10;
        destMarket.treasury = nextDestCash;
        if (destBurg) destBurg.treasury = nextDestCash;

        // Credit origin municipal market & sync burg coffer
        if (originMarket) {
          const origCash = originMarket.treasury ?? originBurg?.treasury ?? 180;
          const nextOrigCash = Math.round((origCash + merchantProceeds) * 10) / 10;
          originMarket.treasury = nextOrigCash;
          if (originBurg) originBurg.treasury = nextOrigCash;
        } else if (originBurg) {
          originBurg.treasury = Math.round(((originBurg.treasury || 0) + merchantProceeds) * 10) / 10;
        }

        // Credit customs tariff into destination realm's Crown Fisc
        const destRealm = destBurg ? w.realms?.find((r) => r.id === destBurg.stateId) : undefined;
        if (destRealm && customsDuty > 0) {
          destRealm.treasury = Math.round(((destRealm.treasury || 0) + customsDuty) * 10) / 10;
        }
      }
    }
  }

  // ==========================================================================
  // 2. COMMERCIAL ARBITRAGE & CONDITIONAL CARAVAN SPAWNING
  // ==========================================================================

  /**
   * Spawns physical merchant caravans along active trade routes ONLY when
   * commercial arbitrage, stockpile, lockdown, and route capacity conditions are met.
   */
  static spawnFlowCaravans(
    w: WorldState,
    maxToSpawn: number = 6,
    visualOnly: boolean = false,
    excludeRouteIds?: Set<string>,
    targetCaravans?: TraderCaravan[]
  ): void {
    if (!w.tradeNetwork || !w.tradeNetwork.routes || w.tradeNetwork.routes.length === 0) return;
    if (!w.tradeNetwork.caravans && !targetCaravans) w.tradeNetwork.caravans = [];
    if (!w.burgs || w.burgs.length === 0) return;

    const caravanList = targetCaravans || w.tradeNetwork.caravans;
    const GLOBAL_CAP = 65;
    if (caravanList.length >= GLOBAL_CAP) return;

    const economy = ensureEconomy(w);
    const burgMap = getBurgMap(w.burgs);
    const lockedSet = new Set(w.lockedDownProvinces || []);
    const routes = w.tradeNetwork.routes;
    const now = Date.now();

    const capitalOrHubRoutes = routes.filter((r) => {
      const f = burgMap.get(r.fromBurgId);
      const t = burgMap.get(r.toBurgId);
      return Boolean(
        f?.isCapital ||
          t?.isCapital ||
          f?.type === 'Royal Metropolis' ||
          t?.type === 'Royal Metropolis' ||
          f?.type === 'Trade Port' ||
          t?.type === 'Trade Port'
      );
    });

    let spawned = 0;
    const maxAttempts = Math.min(routes.length * 2, maxToSpawn * 7);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (spawned >= maxToSpawn || caravanList.length >= GLOBAL_CAP) break;

      // Maintain healthy balance between maritime ships & overland caravans, AND inbound vs outbound hub traffic
      let activeMaritime = 0;
      let activeOverland = 0;
      let hubOutbound = 0;
      let hubInbound = 0;

      for (const cv of caravanList) {
        if (cv.isMaritime) activeMaritime++;
        else activeOverland++;
        const fb = burgMap.get(cv.fromBurgId || '');
        const tb = burgMap.get(cv.toBurgId || '');
        if (fb?.isCapital || fb?.type === 'Royal Metropolis') hubOutbound++;
        if (tb?.isCapital || tb?.type === 'Royal Metropolis') hubInbound++;
      }

      const needMaritime = activeMaritime < 18;
      const needOverland = activeOverland < 44;
      const preferOutboundFromHub = hubOutbound <= hubInbound;

      let bestProfit = -Infinity;
      let bestCandidate: {
        route: TradeRoute;
        originBurg: Burg;
        destBurg: Burg;
        direction: 1 | -1;
        comm: CommodityType;
        cargoUnits: number;
        oMarket: { stockpile: number; currentPrice: number };
      } | null = null;

      const candidateTrials = caravanList.length < 50 ? 12 : 6;
      for (let t = 0; t < candidateTrials; t++) {
        // ~45% of candidate checks specifically sample routes touching Capitals / Cities so traffic flows both ways
        const pickHub = capitalOrHubRoutes.length > 0 && t < Math.floor(candidateTrials * 0.45);
        const pool = pickHub ? capitalOrHubRoutes : routes;
        const route = pool[Math.floor(Math.random() * pool.length)];
        if (!route || !route.pathPoints || route.pathPoints.length < 2) continue;

        // Prevent a newly arrived ship/caravan from immediately bouncing back on the exact same route
        if (excludeRouteIds?.has(route.id)) continue;
        const lastArrivalAt = recentRouteArrivals.get(route);
        if (lastArrivalAt !== undefined && now - lastArrivalAt < 4500) continue;

        // Balance maritime vs overland traffic when one side already met target
        if (route.isMaritime && !needMaritime && needOverland && Math.random() < 0.78) continue;
        if (!route.isMaritime && !needOverland && needMaritime && Math.random() < 0.78) continue;

        // Prevent crowding a single route or stacking departures at origin
        let onRoute = 0;
        let blockedDir1 = false;
        let blockedDirNeg1 = false;
        for (const cv of caravanList) {
          if (cv.routeId === route.id) {
            onRoute++;
            if (cv.progress < 0.28) {
              if (cv.direction === -1) blockedDirNeg1 = true;
              else blockedDir1 = true;
            }
          }
        }
        const routeLimit = route.isMaritime || route.type === 'Imperial Highway' ? 2 : 1;
        if (onRoute >= routeLimit) continue;

        const fromBurg = burgMap.get(route.fromBurgId);
        const toBurg = burgMap.get(route.toBurgId);
        if (!fromBurg || !toBurg) continue;

        // Condition: Neither connected settlement's province may be under plague lockdown
        if (
          (fromBurg.countyId && lockedSet.has(fromBurg.countyId)) ||
          (toBurg.countyId && lockedSet.has(toBurg.countyId))
        ) {
          continue;
        }

        // Evaluate diplomatic standing between origin & destination realms (Allies vs Enemies/Warring)
        const realmA = w.realms?.find((r) => r.id === fromBurg.stateId);
        const realmB = w.realms?.find((r) => r.id === toBurg.stateId);
        const sameRealm = fromBurg.stateId === toBurg.stateId;
        const isAllied =
          !sameRealm &&
          Boolean(
            realmA?.alliedRealmIds?.includes(toBurg.stateId) ||
              realmB?.alliedRealmIds?.includes(fromBurg.stateId)
          );
        const isAtWar =
          !sameRealm &&
          (w.activeWars || []).some(
            (war) =>
              (war.attackerRealmId === fromBurg.stateId && war.defenderRealmId === toBurg.stateId) ||
              (war.attackerRealmId === toBurg.stateId && war.defenderRealmId === fromBurg.stateId)
          );
        const isEmbargoed =
          !sameRealm &&
          Boolean(
            realmA?.embargoedRealmIds?.includes(toBurg.stateId) ||
              realmB?.embargoedRealmIds?.includes(fromBurg.stateId)
          );
        const isEnemy =
          !sameRealm &&
          (isAtWar ||
            isEmbargoed ||
            Boolean(
              realmA?.enemyRealmIds?.includes(toBurg.stateId) ||
                realmB?.enemyRealmIds?.includes(fromBurg.stateId)
            ));

        // Enemy embargoes, formal trade embargoes & active wars severely curtail cross-border merchant traffic
        if (isEnemy && Math.random() < (isAtWar ? 0.92 : isEmbargoed ? 0.88 : 0.78)) {
          continue;
        }

        // Evaluate both directions along the trade artery
        const dirs: Array<{ o: Burg; d: Burg; dir: 1 | -1 }> = [];
        if (!blockedDir1) dirs.push({ o: fromBurg, d: toBurg, dir: 1 });
        if (!blockedDirNeg1) dirs.push({ o: toBurg, d: fromBurg, dir: -1 });
        if (dirs.length === 0) continue;

        for (const { o: originBurg, d: destBurg, dir } of dirs) {
          const originMarket = economy.burgMarkets?.[originBurg.id];
          const destMarket = economy.burgMarkets?.[destBurg.id];
          if (!originMarket || !destMarket) continue;

          const isOriginHub = originBurg.isCapital || originBurg.type === 'Royal Metropolis' || originBurg.type === 'Trade Port';
          const isDestHub = destBurg.isCapital || destBurg.type === 'Royal Metropolis' || destBurg.type === 'Trade Port';

          const candidateGoods = Array.from(
            new Set<CommodityType>([
              (route.primaryGood as CommodityType) || 'Grain',
              (originBurg.tradeGood as CommodityType) || 'Timber',
              ...(isOriginHub
                ? ([
                    'Tools & Ironware',
                    'Steel Arms & Armor',
                    'Bronze & Brassware',
                    'Paper & Codices',
                    'Apothecary Remedies',
                    'Jewelry & Regalia',
                    'Distilled Spirits',
                    'Fine Woolen Cloth',
                    'Parchment & Vellum',
                    'Tapestries',
                    'Crossbow Bolts',
                    'Glassware',
                    'Wine',
                    'Ale & Beer',
                    'Silk',
                    'Spices',
                  ] as CommodityType[])
                : ([
                    'Grain',
                    'Dried Fish',
                    'Timber',
                    'Salt',
                    'Iron',
                    'Coal',
                    'Saltpeter',
                    'Cane Sugar',
                    'Wool',
                    'Livestock',
                    'Tools & Ironware',
                    'Apothecary Remedies',
                  ] as CommodityType[])),
            ])
          );

          for (const comm of candidateGoods) {
            if (!COMMODITIES[comm]) continue;
            const oMarket = originMarket.markets[comm];
            const dMarket = destMarket.markets[comm];
            if (!oMarket || !dMarket) continue;

            const originStock = oMarket.stockpile || 0;
            // Arbitrage rule: srcStock > 2 and destPrice > srcPrice * 1.15
            if (originStock <= 2 || dMarket.currentPrice <= oMarket.currentPrice * 1.15) continue;

            const effectiveTariff = isAllied
              ? (destMarket.tariffRate || 0.05) * 0.45
              : isEnemy
              ? (destMarket.tariffRate || 0.05) + 0.35
              : destMarket.tariffRate || 0.05;
            const tariffFriction = 1.0 + effectiveTariff;
            const transportCost = COMMODITIES[comm].basePrice * (route.isMaritime ? 0.05 : 0.12);
            const breakEvenPrice = oMarket.currentPrice * tariffFriction + transportCost;
            const profitPerUnit = dMarket.currentPrice - breakEvenPrice;

            if (profitPerUnit > 0) {
              const meta = COMMODITIES[comm];
              const caravanCap = Math.max(4, Math.round(50 / Math.max(0.2, meta.transportWeight)));
              const rawMoved = Math.min(caravanCap, originStock * 0.25);
              const cargoUnits = Math.max(
                1,
                Math.round(rawMoved * (isAllied ? 1.25 : isEnemy ? 0.6 : 1.0))
              );

              if (cargoUnits >= 1 && originStock >= cargoUnits) {
                let score = profitPerUnit * cargoUnits;
                if (isAllied) score *= 1.38;
                else if (isEnemy) score *= 0.48;
                // Balance inbound and outbound traffic for capitals & major cities
                if (preferOutboundFromHub && isOriginHub) score *= 1.45;
                else if (!preferOutboundFromHub && isDestHub) score *= 1.45;

                if (score > bestProfit) {
                  bestProfit = score;
                  bestCandidate = {
                    route,
                    originBurg,
                    destBurg,
                    direction: dir,
                    comm,
                    cargoUnits,
                    oMarket,
                  };
                }
              }
            }
          }
        }
      }

      if (!bestCandidate) continue;

      const { route, originBurg, destBurg, direction, comm, cargoUnits, oMarket } = bestCandidate;
      if (!visualOnly) {
        oMarket.stockpile = Math.max(0, oMarket.stockpile - cargoUnits);
      }
      const cargoRealmA = w.realms?.find((r) => r.id === originBurg.stateId);
      const isAlliedDispatch =
        originBurg.stateId !== destBurg.stateId &&
        Boolean(cargoRealmA?.alliedRealmIds?.includes(destBurg.stateId));
      const isEnemyDispatch =
        originBurg.stateId !== destBurg.stateId &&
        Boolean(cargoRealmA?.enemyRealmIds?.includes(destBurg.stateId));
      const diplomaticValueMult = isAlliedDispatch ? 1.25 : isEnemyDispatch ? 0.65 : 1.0;
      const cargoValue = Math.round(cargoUnits * oMarket.currentPrice * diplomaticValueMult);
      const startPt = direction === -1
        ? route.pathPoints[route.pathPoints.length - 1]
        : route.pathPoints[0];

      const caravan: TraderCaravan = {
        id: generateUniqueId('caravan'),
        routeId: route.id,
        fromBurgId: originBurg.id,
        toBurgId: destBurg.id,
        fromBurgName: originBurg.name,
        toBurgName: destBurg.name,
        commodity: comm,
        progress: 0.0,
        speed: route.isMaritime ? 0.08 : 0.055,
        isMaritime: route.isMaritime,
        heraldryColor: originBurg.isCapital ? '#dc2626' : route.isMaritime ? '#0284c7' : '#d97706',
        direction,
        antIndex: 0,
        cargoUnits,
        cargoValue,
        isLooted: false,
        currentX: startPt?.x ?? originBurg.x,
        currentY: startPt?.y ?? originBurg.y,
      };

      caravanList.push(caravan);
      spawned++;
    }
  }

  // ==========================================================================
  // 3. REAL-TIME 60FPS TRANSIT, DISAPPEARANCE AT DESTINATION & RESPAWN
  // ==========================================================================

  /**
   * Smoothly advances visual caravan positions in an isolated WeakMap shadow array
   * so React state (world.tradeNetwork.caravans) is never mutated inside requestAnimationFrame.
   */
  static stepVisualCaravans(w: WorldState, dt: number): TraderCaravan[] {
    if (!w.tradeNetwork || !w.tradeNetwork.routes || w.tradeNetwork.routes.length === 0) return [];
    let visualList = visualCaravanShadowCache.get(w.tradeNetwork);
    if (!visualList) {
      visualList = (w.tradeNetwork.caravans || []).map((c) => ({ ...c }));
      visualCaravanShadowCache.set(w.tradeNetwork, visualList);
    }
    if (dt <= 0) return visualList;

    const routeMap = getRouteMap(w.tradeNetwork.routes);
    const arrivedRouteIds = new Set<string>();
    let arrivedCount = 0;
    const now = Date.now();

    for (let i = visualList.length - 1; i >= 0; i--) {
      const c = visualList[i];
      if (c.isLooted) {
        visualList.splice(i, 1);
        continue;
      }

      const route = routeMap.get(c.routeId);
      if (!route || !route.pathPoints || route.pathPoints.length < 2) {
        visualList.splice(i, 1);
        continue;
      }

      const totalDist = getRouteArcLength(route);
      if (totalDist < 10) {
        visualList.splice(i, 1);
        continue;
      }

      const worldSpeed = route.isMaritime
        ? 32.0
        : route.type === 'Imperial Highway'
        ? 34.0
        : route.type === 'River Barge Route'
        ? 26.0
        : route.type === 'Mountain Pass'
        ? 18.0
        : 24.0;

      c.progress = (c.progress || 0) + (worldSpeed / totalDist) * dt;

      if (c.progress >= 1.0) {
        // Reached destination port/city: disappear cleanly & mark route cooldown so vessels never bounce back
        recentRouteArrivals.set(route, now);
        arrivedRouteIds.add(route.id);
        visualList.splice(i, 1);
        arrivedCount++;
        continue;
      }

      const effectiveT = c.direction === -1 ? Math.max(0, 1.0 - c.progress) : Math.min(1.0, c.progress);
      const pt = FlowEconomyEngine.getPointAlongPath(route.pathPoints, effectiveT);
      c.currentX = pt.x;
      c.currentY = pt.y;
    }

    if (arrivedCount > 0) {
      FlowEconomyEngine.spawnFlowCaravans(w, Math.min(8, arrivedCount), true, arrivedRouteIds, visualList);
    }
    return visualList;
  }

  // ==========================================================================
  // 4. MONTHLY SIMULATION TRANSIT, WARZONE INTERCEPTION & ARRIVAL
  // ==========================================================================

  /**
   * Advances caravans during simulation ticks, checks for wartime ambushes/raids,
   * settles delivered goods into destination stockpiles, and removes arrived caravans
   * so spawnFlowCaravans can spawn new ones if conditions are met.
   */
  static stepFlowCaravans(w: WorldState, skipProgressAdvance: boolean = false): void {
    if (!w.tradeNetwork || !w.tradeNetwork.caravans) return;
    const routeMap = getRouteMap(w.tradeNetwork.routes || []);

    for (let i = w.tradeNetwork.caravans.length - 1; i >= 0; i--) {
      const c = w.tradeNetwork.caravans[i];
      const route = routeMap.get(c.routeId);
      if (!route || !route.pathPoints || route.pathPoints.length < 2) {
        w.tradeNetwork.caravans.splice(i, 1);
        continue;
      }

      if (!skipProgressAdvance) {
        c.progress += c.speed;
        const effectiveT = c.direction === -1 ? Math.max(0, 1.0 - c.progress) : Math.min(1.0, c.progress);
        const pt = FlowEconomyEngine.getPointAlongPath(route.pathPoints, effectiveT);
        c.currentX = pt.x;
        c.currentY = pt.y;
      }

      // ----------------------------------------------------------------------
      // HAZARD 1: WARZONE AMBUSH & CARAVAN PLUNDERING
      // ----------------------------------------------------------------------
      // Only overland caravans near marching armies face ambush
      if (!c.isLooted && !c.isMaritime && w.armies && w.armies.length > 0) {
        for (const army of w.armies) {
          const armyPos = getArmyPositionAtProgress(army);
          const dist = Math.hypot((c.currentX || 0) - armyPos.x, (c.currentY || 0) - armyPos.y);

          // Within interception radius (40 map units)
          if (dist < 40 && Math.random() < 0.22) {
            c.isLooted = true;
            if (w.economy) {
              w.economy.lootedCaravansCount = (w.economy.lootedCaravansCount || 0) + 1;
            }

            const commander = w.characters?.find((ch) => ch.id === army.commanderId || ch.id === army.attackerId);
            const booty = Math.round((c.cargoValue || 50) * 0.75);

            if (commander) {
              commander.treasury = (commander.treasury || 0) + booty;
              commander.dread = Math.min(100, (commander.dread || 0) + 3);
            }

            if (!w.history) w.history = [];
            w.history.unshift({
              id: generateUniqueId('hist_looted_caravan'),
              year: w.currentYear,
              title: `Trade Caravan Plundered!`,
              category: 'War & Conquest',
              description: `A merchant caravan carrying ${c.cargoUnits} crates of ${c.commodity} from ${c.fromBurgName} was intercepted by the host of ${commander?.name || 'the enemy'}! Booty worth ${booty} gold was seized as spoils of war.`,
              primaryActorId: commander?.id,
              realmId: commander?.realmId,
            });

            // Ambushed caravan destroyed
            w.tradeNetwork.caravans.splice(i, 1);
            break;
          }
        }
      }

      if (c.isLooted) continue;

      // ----------------------------------------------------------------------
      // ARRIVAL AT DESTINATION: DELIVER GOODS & DISAPPEAR
      // ----------------------------------------------------------------------
      if (skipProgressAdvance) {
        // Settle proportional monthly trade throughput on live 1-year ticks without jumping visual positions
        if (Math.random() < c.speed) {
          FlowEconomyEngine.deliverCaravanArrival(w, c);
        }
      } else if (c.progress >= 1.0) {
        FlowEconomyEngine.deliverCaravanArrival(w, c);
        // Caravan disappears upon reaching destination (spawner creates new ones if conditions are met)
        w.tradeNetwork.caravans.splice(i, 1);
      }
    }
  }
}