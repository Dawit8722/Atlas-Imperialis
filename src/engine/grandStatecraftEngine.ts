import {
  WorldState,
  Character,
  TradeNode,
  TradeNodePolicy,
  TradeNodeShare,
  EstateKind,
  EstatePrivilege,
  DietAgenda,
  RealmEstatesState,
  CoalitionState,
} from '../types/world';
import { computeArmyMarchPath } from './armyPathfinding';
import { buildArmyRegiments } from './warfareEngine';
import { pickSmartBattleTactic } from './battleStrategy';
import { ensureRealmBudget } from './economyEngine';

function nextId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function isPortBurg(b: { type?: string; settlementSite?: string }): boolean {
  return b.type === 'Trade Port' || b.type === 'Fishing Port' || b.settlementSite === 'Estuary Harbor';
}

// ============================================================================
// 1. TOPOLOGICALLY SORTED TRADE NODE DAG ENGINE (KAHN'S ALGORITHM)
// ============================================================================

export class TradeNodeEngine {
  static ensureTradeNodesInitialized(w: WorldState): TradeNode[] {
    if (w.tradeNodes && w.tradeNodes.length > 0) {
      return w.tradeNodes;
    }

    const burgs = w.burgs || [];
    const counties = w.counties || [];
    if (burgs.length === 0) {
      w.tradeNodes = [];
      return w.tradeNodes;
    }

    // Pick up to 6 strategic trade hubs spaced across realms & coastal gateways
    const sortedHubs = [...burgs].sort((a, b) => {
      const aCoastal = isPortBurg(a) ? 1800 : 0;
      const bCoastal = isPortBurg(b) ? 1800 : 0;
      const aScore = (a.population || 1000) + aCoastal + (a.isCapital ? 1200 : 0);
      const bScore = (b.population || 1000) + bCoastal + (b.isCapital ? 1200 : 0);
      return bScore - aScore;
    });

    const hubs: typeof burgs = [];
    for (const candidate of sortedHubs) {
      if (hubs.length >= 6) break;
      const tooClose = hubs.some((h) => Math.hypot(h.x - candidate.x, h.y - candidate.y) < 155);
      if (!tooClose) hubs.push(candidate);
    }
    if (hubs.length === 0) hubs.push(sortedHubs[0]);

    const nodeBuckets: Record<string, string[]> = {};
    for (const h of hubs) nodeBuckets[h.id] = [];

    for (const c of counties) {
      const seat = burgs.find((b) => b.id === c.capitalBurgId);
      const cx = seat?.x ?? 500;
      const cy = seat?.y ?? 350;
      let bestHub = hubs[0];
      let bestD = Infinity;
      for (const h of hubs) {
        const d = Math.hypot(h.x - cx, h.y - cy);
        if (d < bestD) {
          bestD = d;
          bestHub = h;
        }
      }
      nodeBuckets[bestHub.id].push(c.id);
    }

    // Order hubs strictly from inland -> coastal/wealthiest so DAG edges always point toward higher rank (guaranteed acyclic!)
    const orderedHubs = [...hubs].sort((a, b) => {
      const rankA = (isPortBurg(a) ? 20000 : 0) + (a.population || 1000);
      const rankB = (isPortBurg(b) ? 20000 : 0) + (b.population || 1000);
      return rankA - rankB;
    });

    const nodes: TradeNode[] = orderedHubs.map((hub, idx) => {
      const nodeId = `tnode_${hub.id}`;
      // Connect inland nodes to 1-2 strictly higher-ranked downstream hubs
      const downstreamNodeIds: string[] = [];
      if (idx < orderedHubs.length - 1) {
        const candidates = orderedHubs
          .slice(idx + 1)
          .sort((a, b) => Math.hypot(a.x - hub.x, a.y - hub.y) - Math.hypot(b.x - hub.x, b.y - hub.y));
        if (candidates[0]) downstreamNodeIds.push(`tnode_${candidates[0].id}`);
        if (candidates[1] && orderedHubs.length >= 4 && Math.hypot(candidates[1].x - hub.x, candidates[1].y - hub.y) < 420) {
          downstreamNodeIds.push(`tnode_${candidates[1].id}`);
        }
      }

      return {
        id: nodeId,
        name: isPortBurg(hub) ? `${hub.name} Bay` : `${hub.name} Basin`,
        hubBurgId: hub.id,
        x: hub.x,
        y: hub.y,
        countyIds: nodeBuckets[hub.id] || [],
        downstreamNodeIds,
        localValue: 10,
        incomingValue: 0,
        totalValue: 10,
        shares: [],
      };
    });

    w.tradeNodes = nodes;
    TradeNodeEngine.stepTradeNodes(w, 0);
    return w.tradeNodes;
  }

  static setRealmTradePolicy(
    nodeId: string,
    realmId: string,
    policy: TradeNodePolicy,
    w: WorldState
  ): { success: boolean; summary: string } {
    const nodes = TradeNodeEngine.ensureTradeNodesInitialized(w);
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return { success: false, summary: 'Trade node not found.' };

    const share = node.shares.find((s) => s.realmId === realmId);
    if (share) {
      share.policy = policy;
    } else {
      const realm = (w.realms || []).find((r) => r.id === realmId);
      node.shares.push({
        realmId,
        realmName: realm?.name || 'Realm',
        power: 1,
        sharePct: 0,
        policy,
        collectedGold: 0,
        steeredGold: 0,
      });
    }
    TradeNodeEngine.stepTradeNodes(w, 0);
    return { success: true, summary: `${node.name}: merchant directive set to ${policy}.` };
  }

  static topologicalOrder(nodes: TradeNode[]): TradeNode[] {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const inDeg = new Map<string, number>();
    for (const n of nodes) inDeg.set(n.id, 0);
    for (const n of nodes) {
      for (const dst of n.downstreamNodeIds || []) {
        if (byId.has(dst)) {
          inDeg.set(dst, (inDeg.get(dst) || 0) + 1);
        }
      }
    }

    const queue: TradeNode[] = [];
    for (const n of nodes) {
      if ((inDeg.get(n.id) || 0) === 0) queue.push(n);
    }

    const sorted: TradeNode[] = [];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      sorted.push(cur);
      for (const dst of cur.downstreamNodeIds || []) {
        if (!byId.has(dst)) continue;
        const nextDeg = (inDeg.get(dst) || 0) - 1;
        inDeg.set(dst, nextDeg);
        if (nextDeg === 0) {
          queue.push(byId.get(dst)!);
        }
      }
    }

    // Fallback append in case manually edited save had a partial link
    if (sorted.length < nodes.length) {
      for (const n of nodes) {
        if (!sorted.includes(n)) sorted.push(n);
      }
    }
    return sorted;
  }

  static stepTradeNodes(w: WorldState, monthsDelta: number = 1): void {
    const nodes = TradeNodeEngine.ensureTradeNodesInitialized(w);
    if (nodes.length === 0) return;

    const weatherTradeMult = w.activeWeatherMod?.tradeFlowMult ?? 1.0;
    const burgsByCounty = new Map<string, typeof w.burgs>();
    for (const b of w.burgs || []) {
      const arr = burgsByCounty.get(b.countyId) || [];
      arr.push(b);
      burgsByCounty.set(b.countyId, arr);
    }

    // Reset incoming flows before topological sweep
    for (const node of nodes) {
      node.incomingValue = 0;
    }

    const ordered = TradeNodeEngine.topologicalOrder(nodes);
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const monarchGoldGain = new Map<string, number>();

    for (const node of ordered) {
      const existingPolicyByRealm = new Map<string, TradeNodePolicy>(
        (node.shares || []).map((s) => [s.realmId, s.policy])
      );

      let localValue = 0;
      const powerByRealm = new Map<string, number>();

      for (const cid of node.countyIds) {
        const cBurgs = burgsByCounty.get(cid) || [];
        for (const b of cBurgs) {
          const market = w.burgMarkets?.[b.id];
          const turnover = market?.totalMarketVolume || 0;
          const dev = b.developmentLevel || 20;
          const popRaw = (b.population || 1500) < 50 ? (b.population || 1.5) * 1000 : (b.population || 1500);
          const popK = Math.max(0.4, popRaw / 1000);
          const val = (0.35 + dev * 0.025 + Math.min(6.0, popK * 0.12) + Math.min(10.0, turnover * 0.0012)) * weatherTradeMult;
          localValue += val;

          if (b.stateId) {
            const pwr =
              (isPortBurg(b) ? 18 : 6) +
              dev * 0.45 +
              (b.tradeConnectivity || 1) * 12 +
              (b.isCapital ? 15 : 0);
            powerByRealm.set(b.stateId, (powerByRealm.get(b.stateId) || 0) + pwr);
          }
        }
      }

      // Apply lifestyle perks + burghers estate privileges + embargo / spymaster smuggling checks
      const hubBurg = (w.burgs || []).find((b) => b.id === node.hubBurgId);
      const hubRealm = hubBurg ? (w.realms || []).find((r) => r.id === hubBurg.stateId) : undefined;

      for (const r of w.realms || []) {
        const ruler = w.characters?.find((c) => c.id === r.rulerId && c.isAlive !== false);
        const perks = ruler?.lifestylePerks || [];
        const burgherPrivs = w.estatesByRealm?.[r.id]?.estates?.Burghers?.grantedPrivilegeIds || [];
        let mult = 1.0;
        if (perks.includes('steward_trade_guild')) mult += 0.25;
        if (perks.includes('diplo_free_ports')) mult += 0.2;
        if (burgherPrivs.includes('burghers_free_enterprise')) mult += 0.2;

        // Embargo penalty vs Spymaster smuggling bypass
        const isEmbargoedHere =
          hubRealm &&
          hubRealm.id !== r.id &&
          Boolean(
            hubRealm.embargoedRealmIds?.includes(r.id) || r.embargoedRealmIds?.includes(hubRealm.id)
          );
        if (isEmbargoedHere) {
          const spymaster = (w.characters || []).find(
            (c) => c.isAlive !== false && c.realmId === r.id && c.role === 'Spymaster'
          );
          const smuggleSkill = (spymaster?.baseIntrigue || 0) >= 14 || (ruler?.baseIntrigue || 0) >= 16;
          mult *= smuggleSkill ? 0.52 : 0.18;
        }

        const base = powerByRealm.get(r.id) || 0;
        if (base > 0) {
          powerByRealm.set(r.id, Math.round(base * mult * 10) / 10);
        } else if ((node.shares || []).some((s) => s.realmId === r.id)) {
          powerByRealm.set(r.id, Math.round(4 * mult * 10) / 10);
        }
      }

      node.localValue = Math.round(localValue * 10) / 10;
      node.totalValue = Math.round((node.localValue + node.incomingValue) * 10) / 10;

      const totalPower = Array.from(powerByRealm.values()).reduce((a, b) => a + b, 0) || 1;
      const isTerminal = !node.downstreamNodeIds || node.downstreamNodeIds.length === 0;

      const newShares: TradeNodeShare[] = [];
      let steeredTotal = 0;

      for (const [realmId, power] of powerByRealm.entries()) {
        const realm = w.realms?.find((r) => r.id === realmId);
        const sharePct = Math.round((power / totalPower) * 1000) / 10;
        const defaultPolicy: TradeNodePolicy =
          isTerminal || realm?.capitalBurgId === node.hubBurgId ? 'Collect' : 'Steer';
        const policy: TradeNodePolicy = isTerminal
          ? 'Collect'
          : existingPolicyByRealm.get(realmId) || defaultPolicy;

        const slice = node.totalValue * (power / totalPower);
        const collectedGold = policy === 'Collect' ? Math.round(slice * 10) / 10 : 0;
        const steeredGold = policy === 'Steer' ? Math.round(slice * 1.03 * 10) / 10 : 0;
        steeredTotal += steeredGold;

        if (collectedGold > 0) {
          monarchGoldGain.set(realmId, (monarchGoldGain.get(realmId) || 0) + collectedGold);
        }

        newShares.push({
          realmId,
          realmName: realm?.name || 'Realm',
          power: Math.round(power * 10) / 10,
          sharePct,
          policy,
          collectedGold,
          steeredGold,
        });
      }

      newShares.sort((a, b) => b.power - a.power);
      node.shares = newShares;

      if (!isTerminal && steeredTotal > 0) {
        const perTarget = steeredTotal / node.downstreamNodeIds.length;
        for (const dstId of node.downstreamNodeIds) {
          const dst = nodeMap.get(dstId);
          if (dst) dst.incomingValue = Math.round((dst.incomingValue + perTarget) * 10) / 10;
        }
      }
    }

    if (monthsDelta > 0) {
      for (const r of w.realms || []) {
        const budget = ensureRealmBudget(r, w);
        const gain = monarchGoldGain.get(r.id) || 0;
        // Customs tariffs collected from real node trade share go strictly into realm.treasury (Crown Fisc)
        const tariffFactor = 0.065;
        const customsCollected = Math.round(gain * tariffFactor * monthsDelta * 10) / 10;
        if (customsCollected > 0) {
          r.treasury = Math.round(((r.treasury || 0) + customsCollected) * 10) / 10;
        }
        const monthlyCustoms = Math.round((customsCollected / monthsDelta) * 10) / 10;
        budget.lastReport.customsTariffs = monthlyCustoms;
        const rep = budget.lastReport;
        rep.netBalance =
          Math.round(
            (rep.domainTax +
              rep.vassalTax +
              rep.customsTariffs +
              rep.mintingIncome -
              rep.civilListStipend -
              rep.armyMaintenance -
              rep.buildingSubsidies -
              rep.loanInterest) *
              10
          ) / 10;
      }
    }
  }
}

// ============================================================================
// 2. REALM ESTATES, CROWN LAND, PRIVILEGE BARGAINING & REBELLIONS
// ============================================================================

export const ESTATE_PRIVILEGES: EstatePrivilege[] = [
  {
    id: 'nobility_primacy',
    estate: 'Nobility',
    name: 'Primacy of the Nobility',
    description: '+15 Nobility Loyalty, +10 Influence, grants heavier feudal knights in war.',
    loyaltyMod: 15,
    influenceMod: 10,
    crownLandCost: 5,
  },
  {
    id: 'nobility_levy_rights',
    estate: 'Nobility',
    name: 'Feudal Levy Charters',
    description: '+10 Nobility Loyalty, +15 Influence, lowers royal levy upkeep.',
    loyaltyMod: 10,
    influenceMod: 15,
    crownLandCost: 5,
  },
  {
    id: 'clergy_church_sanctuary',
    estate: 'Clergy',
    name: 'Right of Sanctuary',
    description: '+15 Clergy Loyalty, +10 Influence, boosts monarch piety and domain calm.',
    loyaltyMod: 15,
    influenceMod: 10,
    crownLandCost: 5,
  },
  {
    id: 'clergy_religious_diplomats',
    estate: 'Clergy',
    name: 'Religious Diplomats',
    description: '+10 Clergy Loyalty, +10 Influence, speeds Aggressive Expansion decay.',
    loyaltyMod: 10,
    influenceMod: 10,
    crownLandCost: 5,
  },
  {
    id: 'burghers_free_enterprise',
    estate: 'Burghers',
    name: 'Guild Free Enterprise',
    description: '+15 Burghers Loyalty, +15 Influence, +20% Realm Trade Node Power.',
    loyaltyMod: 15,
    influenceMod: 15,
    crownLandCost: 5,
  },
  {
    id: 'burghers_indebted',
    estate: 'Burghers',
    name: 'Burgher Credit Guarantees',
    description: '+10 Burghers Loyalty, +10 Influence, grants periodic treasury stimulus.',
    loyaltyMod: 10,
    influenceMod: 10,
    crownLandCost: 5,
  },
];

export class EstatesEngine {
  static ensureEstatesInitialized(w: WorldState): Record<string, RealmEstatesState> {
    if (!w.estatesByRealm) w.estatesByRealm = {};
    for (const r of w.realms || []) {
      if (!w.estatesByRealm[r.id]) {
        w.estatesByRealm[r.id] = {
          realmId: r.id,
          crownLand: 40,
          estates: {
            Nobility: { kind: 'Nobility', loyalty: 55, influence: 42, landShare: 25, grantedPrivilegeIds: [] },
            Clergy: { kind: 'Clergy', loyalty: 58, influence: 34, landShare: 18, grantedPrivilegeIds: [] },
            Burghers: { kind: 'Burghers', loyalty: 54, influence: 36, landShare: 17, grantedPrivilegeIds: [] },
          },
        };
      }
    }
    return w.estatesByRealm;
  }

  static grantPrivilege(
    realmId: string,
    privilegeId: string,
    w: WorldState
  ): { success: boolean; summary: string } {
    const map = EstatesEngine.ensureEstatesInitialized(w);
    const rs = map[realmId];
    const priv = ESTATE_PRIVILEGES.find((p) => p.id === privilegeId);
    if (!rs || !priv) return { success: false, summary: 'Estate privilege not found.' };

    const estate = rs.estates[priv.estate];
    if (estate.grantedPrivilegeIds.includes(priv.id)) {
      return { success: false, summary: `${priv.name} is already enacted.` };
    }
    if (rs.crownLand < priv.crownLandCost) {
      return { success: false, summary: `Requires at least ${priv.crownLandCost}% Crown Land to grant.` };
    }

    rs.crownLand = Math.max(0, rs.crownLand - priv.crownLandCost);
    estate.landShare = Math.min(100, estate.landShare + priv.crownLandCost);
    estate.grantedPrivilegeIds.push(priv.id);
    estate.loyalty = Math.min(100, estate.loyalty + priv.loyaltyMod);
    estate.influence = Math.min(100, estate.influence + priv.influenceMod);

    return {
      success: true,
      summary: `Granted "${priv.name}" to the ${priv.estate} (+${priv.loyaltyMod} Loyalty, -${priv.crownLandCost}% Crown Land).`,
    };
  }

  static revokePrivilege(
    realmId: string,
    privilegeId: string,
    w: WorldState
  ): { success: boolean; summary: string } {
    const map = EstatesEngine.ensureEstatesInitialized(w);
    const rs = map[realmId];
    const priv = ESTATE_PRIVILEGES.find((p) => p.id === privilegeId);
    if (!rs || !priv) return { success: false, summary: 'Estate privilege not found.' };

    const estate = rs.estates[priv.estate];
    if (!estate.grantedPrivilegeIds.includes(priv.id)) {
      return { success: false, summary: 'Privilege not currently active.' };
    }
    if (estate.loyalty < estate.influence) {
      return {
        success: false,
        summary: `Cannot revoke while ${priv.estate} Loyalty (${Math.round(estate.loyalty)}%) is below Influence (${Math.round(estate.influence)}%).`,
      };
    }

    estate.grantedPrivilegeIds = estate.grantedPrivilegeIds.filter((id) => id !== priv.id);
    estate.loyalty = Math.max(0, estate.loyalty - (priv.loyaltyMod + 5));
    estate.influence = Math.max(0, estate.influence - priv.influenceMod);
    const reclaim = Math.min(estate.landShare, priv.crownLandCost);
    estate.landShare -= reclaim;
    rs.crownLand = Math.min(100, rs.crownLand + reclaim);

    return {
      success: true,
      summary: `Revoked "${priv.name}" and reclaimed ${reclaim}% Crown Land.`,
    };
  }

  static seizeCrownLand(
    realmId: string,
    w: WorldState
  ): { success: boolean; rebelSpawned: boolean; summary: string } {
    const map = EstatesEngine.ensureEstatesInitialized(w);
    const rs = map[realmId];
    if (!rs) return { success: false, rebelSpawned: false, summary: 'Realm estates missing.' };

    const estateTotal =
      rs.estates.Nobility.landShare + rs.estates.Clergy.landShare + rs.estates.Burghers.landShare;
    if (estateTotal <= 1) {
      return { success: false, rebelSpawned: false, summary: 'Estates hold negligible land remaining to seize.' };
    }

    const seizedTotal = Math.min(6, estateTotal);
    const kinds: EstateKind[] = ['Nobility', 'Clergy', 'Burghers'];
    const outragedEstates: EstateKind[] = [];

    for (const k of kinds) {
      const e = rs.estates[k];
      const delta = Math.round(((e.landShare / Math.max(1, estateTotal)) * seizedTotal) * 10) / 10;
      e.landShare = Math.max(0, Math.round((e.landShare - delta) * 10) / 10);
      e.loyalty = Math.max(0, e.loyalty - 20);
      if (e.loyalty < 30) outragedEstates.push(k);
    }

    rs.crownLand = Math.min(100, Math.round((100 - (rs.estates.Nobility.landShare + rs.estates.Clergy.landShare + rs.estates.Burghers.landShare)) * 10) / 10);
    rs.lastSeizeYear = w.currentYear;

    let rebelSpawned = false;
    if (outragedEstates.length > 0) {
      rebelSpawned = EstatesEngine.spawnEstateRebellion(realmId, outragedEstates[0], w);
    }

    return {
      success: true,
      rebelSpawned,
      summary: rebelSpawned
        ? `Seized Crown Land to ${rs.crownLand}% — outraged ${outragedEstates.join(' & ')} loyalty fell below 30% and raised an Estate Rebellion!`
        : `Seized Crown Land to ${rs.crownLand}%. Estates took -20 Loyalty.`,
    };
  }

  static spawnEstateRebellion(realmId: string, estate: EstateKind, w: WorldState): boolean {
    const realm = (w.realms || []).find((r) => r.id === realmId);
    const monarch = (w.characters || []).find((c) => c.id === realm?.rulerId && c.isAlive !== false);
    if (!realm || !monarch) return false;

    const realmBurgs = (w.burgs || []).filter((b) => b.stateId === realmId);
    const targetBurg = realmBurgs.find((b) => b.id === realm.capitalBurgId) || realmBurgs[0];
    const originBurg = realmBurgs.find((b) => b.id !== targetBurg?.id) || targetBurg;
    if (!targetBurg || !originBurg) return false;

    const targetHolding = (w.holdings || []).find(
      (h) => h.id === `holding_${targetBurg.id}` || h.id === targetBurg.id || h.provinceId === targetBurg.countyId
    );
    if (!targetHolding) return false;

    const rebelChar =
      (w.characters || []).find(
        (c) => c.isAlive !== false && c.realmId === realmId && c.id !== monarch.id
      ) || monarch;

    const strength = Math.max(180, Math.round((targetBurg.garrisonCount || 500) * 0.9));
    const path = computeArmyMarchPath(originBurg.x, originBurg.y, targetBurg.x, targetBurg.y, w);
    const warId = nextId('war_estate_rebel');

    if (!w.activeWars) w.activeWars = [];
    w.activeWars.push({
      id: warId,
      attackerRealmId: realmId,
      defenderRealmId: realmId,
      attackerLeaderId: rebelChar.id,
      defenderLeaderId: monarch.id,
      casusBelli: `${estate} Estate Uprising`,
      warScore: -10,
      monthsActive: 0,
      targetHoldingIds: [targetHolding.id],
      battlesFought: 0,
    });

    if (!w.armies) w.armies = [];
    w.armies.push({
      id: nextId('army_estate_rebel'),
      warId,
      commanderId: rebelChar.id,
      commanderName: `${estate} Insurgents (${rebelChar.name})`,
      attackerId: rebelChar.id,
      defenderId: monarch.id,
      targetHoldingId: targetHolding.id,
      regiments: buildArmyRegiments(rebelChar, strength, w, realmId),
      startX: originBurg.x,
      startY: originBurg.y,
      targetX: targetBurg.x,
      targetY: targetBurg.y,
      waypoints: path.waypoints,
      totalMarchCost: path.totalMarchCost,
      progress: originBurg.id === targetBurg.id ? 0.55 : 0.05,
      strength,
      speed: path.speed,
      color: '#f97316',
      isDefender: false,
      tactic: pickSmartBattleTactic(undefined, 'Plains', false, rebelChar),
    });

    if (!w.history) w.history = [];
    w.history.unshift({
      id: nextId('hist_estate_rebel'),
      year: w.currentYear,
      title: `${estate} Uprising Against Crown Land Seizure`,
      category: 'War & Conquest',
      description: `Outraged by the seizure of hereditary estates below 30% loyalty, ${estate} levies raised banners against ${monarch.name}.`,
      primaryActorId: rebelChar.id,
      secondaryActorId: monarch.id,
      realmId,
    });
    return true;
  }

  static callDiet(
    realmId: string,
    chosenEstate: EstateKind,
    w: WorldState
  ): { success: boolean; summary: string } {
    const map = EstatesEngine.ensureEstatesInitialized(w);
    const rs = map[realmId];
    if (!rs) return { success: false, summary: 'Realm estates missing.' };

    const estate = rs.estates[chosenEstate];
    estate.loyalty = Math.min(100, estate.loyalty + 8);
    estate.influence = Math.min(100, estate.influence + 5);

    const targetBurg = (w.burgs || []).find((b) => b.stateId === realmId);
    const baseDev = targetBurg?.developmentLevel || 25;
    const monarch = (w.characters || []).find((c) => c.id === (w.realms || []).find((r) => r.id === realmId)?.rulerId);

    const agenda: DietAgenda =
      chosenEstate === 'Burghers'
        ? {
            id: nextId('diet'),
            estate: 'Burghers',
            title: `Expand ${targetBurg?.name || 'Royal'} Commerce`,
            description: `Raise treasury reserves to ${Math.round((monarch?.treasury || 200) + 120)} gold for guild expansion.`,
            targetType: 'treasury',
            targetValue: Math.round((monarch?.treasury || 200) + 120),
            targetRealmId: realmId,
            rewardLoyalty: 12,
            rewardGold: 95,
            expiresYear: (w.currentYear || 1042) + 5,
            completed: false,
          }
        : chosenEstate === 'Nobility'
        ? {
            id: nextId('diet'),
            estate: 'Nobility',
            title: `Fortify ${targetBurg?.name || 'Frontier'} Bastion`,
            description: `Raise ${targetBurg?.name || 'capital'} development to ${baseDev + 4}.`,
            targetType: 'dev',
            targetValue: baseDev + 4,
            targetRealmId: realmId,
            rewardLoyalty: 12,
            rewardGold: 75,
            expiresYear: (w.currentYear || 1042) + 5,
            completed: false,
          }
        : {
            id: nextId('diet'),
            estate: 'Clergy',
            title: 'Endow the Cathedral Chapter',
            description: 'Maintain realm peace or prosperity over the next 2 years.',
            targetType: 'treasury',
            targetValue: Math.round((monarch?.treasury || 200) + 60),
            targetRealmId: realmId,
            rewardLoyalty: 14,
            rewardGold: 70,
            expiresYear: (w.currentYear || 1042) + 5,
            completed: false,
          };

    rs.activeDiet = agenda;
    rs.lastDietYear = w.currentYear;

    return {
      success: true,
      summary: `Diet convened with the ${chosenEstate} (+8 Loyalty). Mandate issued: "${agenda.title}".`,
    };
  }

  static stepEstatesMonthly(w: WorldState, monthsDelta: number = 1): void {
    const map = EstatesEngine.ensureEstatesInitialized(w);
    for (const realm of w.realms || []) {
      const rs = map[realm.id];
      if (!rs) continue;
      const monarch = (w.characters || []).find((c) => c.id === realm.rulerId && c.isAlive !== false);

      for (const k of ['Nobility', 'Clergy', 'Burghers'] as EstateKind[]) {
        const e = rs.estates[k];
        const eq = 50 + e.grantedPrivilegeIds.length * 4;
        if (e.loyalty < eq) e.loyalty = Math.min(eq, Math.round((e.loyalty + 0.4 * monthsDelta) * 10) / 10);
        else if (e.loyalty > eq + 15) e.loyalty = Math.max(eq, Math.round((e.loyalty - 0.3 * monthsDelta) * 10) / 10);
      }

      if (rs.activeDiet && !rs.activeDiet.completed) {
        const d = rs.activeDiet;
        let done = false;
        if (d.targetType === 'treasury' && (realm.treasury || 0) >= d.targetValue) {
          done = true;
        } else if (d.targetType === 'dev') {
          const cap = (w.burgs || []).find((b) => b.stateId === realm.id);
          if (cap && (cap.developmentLevel || 25) >= d.targetValue) done = true;
        }
        if (done) {
          d.completed = true;
          rs.estates[d.estate].loyalty = Math.min(100, rs.estates[d.estate].loyalty + d.rewardLoyalty);
          ensureRealmBudget(realm, w);
          realm.treasury = Math.round(((realm.treasury || 0) + d.rewardGold) * 10) / 10;
        }
      }

      if (rs.estates.Burghers.grantedPrivilegeIds.includes('burghers_indebted')) {
        ensureRealmBudget(realm, w);
        realm.treasury = Math.round(((realm.treasury || 0) + 3 * monthsDelta) * 10) / 10;
      }
      if (monarch && rs.estates.Clergy.grantedPrivilegeIds.includes('clergy_church_sanctuary')) {
        monarch.piety = (monarch.piety || 0) + 1.5 * monthsDelta;
      }
    }
  }
}

// ============================================================================
// 3. AGGRESSIVE EXPANSION & PUNITIVE COALITIONS
// ============================================================================

export class AggressiveExpansionEngine {
  static ensureAE(w: WorldState): Record<string, Record<string, number>> {
    if (!w.aggressiveExpansion) w.aggressiveExpansion = {};
    if (!w.coalitions) w.coalitions = [];
    return w.aggressiveExpansion;
  }

  static getAEBetween(observerRealmId: string, aggressorRealmId: string, w: WorldState): number {
    return w.aggressiveExpansion?.[observerRealmId]?.[aggressorRealmId] || 0;
  }

  static recordConquestAE(
    aggressorRealmId: string,
    victimRealmId: string,
    baseAE: number,
    w: WorldState
  ): void {
    const aeMap = AggressiveExpansionEngine.ensureAE(w);
    const aggBurg = (w.burgs || []).find((b) => b.stateId === aggressorRealmId);

    for (const r of w.realms || []) {
      if (r.id === aggressorRealmId) continue;
      const observerBurg = (w.burgs || []).find((b) => b.stateId === r.id);
      const dist =
        aggBurg && observerBurg
          ? Math.hypot(aggBurg.x - observerBurg.x, aggBurg.y - observerBurg.y)
          : 260;
      const distFactor = Math.max(0.35, 1.15 - dist / 650);
      const victimBonus = r.id === victimRealmId ? 1.45 : 1.0;
      const gain = Math.round(baseAE * distFactor * victimBonus);

      if (!aeMap[r.id]) aeMap[r.id] = {};
      aeMap[r.id][aggressorRealmId] = Math.min(100, (aeMap[r.id][aggressorRealmId] || 0) + gain);
    }

    AggressiveExpansionEngine.stepAEAndCoalitions(w, 0);
  }

  static stepAEAndCoalitions(w: WorldState, monthsDelta: number = 1): void {
    const aeMap = AggressiveExpansionEngine.ensureAE(w);

    if (monthsDelta > 0) {
      for (const observerId of Object.keys(aeMap)) {
        const clergyRelax = w.estatesByRealm?.[observerId]?.estates?.Clergy?.grantedPrivilegeIds?.includes(
          'clergy_religious_diplomats'
        )
          ? 0.1
          : 0;
        for (const aggId of Object.keys(aeMap[observerId])) {
          const decay = (0.28 + clergyRelax) * monthsDelta;
          aeMap[observerId][aggId] = Math.max(0, Math.round((aeMap[observerId][aggId] - decay) * 10) / 10);
        }
      }
    }

    // Check formation or disbanding of Coalitions against each Realm
    const updatedCoalitions: CoalitionState[] = [];
    for (const targetRealm of w.realms || []) {
      const outragedIds: string[] = [];
      for (const observer of w.realms || []) {
        if (observer.id === targetRealm.id) continue;
        const ae = aeMap[observer.id]?.[targetRealm.id] || 0;
        if (ae >= 50) outragedIds.push(observer.id);
      }

      const existing = (w.coalitions || []).find((c) => c.targetRealmId === targetRealm.id);
      if (outragedIds.length >= 2) {
        const coalition: CoalitionState = existing
          ? { ...existing, memberRealmIds: outragedIds }
          : {
              id: nextId('coalition'),
              targetRealmId: targetRealm.id,
              memberRealmIds: outragedIds,
              formedYear: w.currentYear,
            };
        updatedCoalitions.push(coalition);

        if (!existing && w.history) {
          w.history.unshift({
            id: nextId('hist_coalition'),
            year: w.currentYear,
            title: `Coalition Formed Against ${targetRealm.name}`,
            category: 'Diplomacy',
            description: `Alarmed by aggressive conquest, ${outragedIds.length} realms united into a defensive Coalition against ${targetRealm.name}.`,
            realmId: targetRealm.id,
          });
        }
      }
    }
    w.coalitions = updatedCoalitions;
  }
}

// ============================================================================
// 4. SOVEREIGN LIFESTYLE PERK TREES & AMBITIONS (BOUND TO LIVING MONARCH)
// ============================================================================

export type LifestyleBranch = 'Martial' | 'Stewardship' | 'Intrigue' | 'Diplomacy';

export interface LifestylePerkDef {
  id: string;
  branch: LifestyleBranch;
  name: string;
  description: string;
  xpCost: number;
  requiresId?: string;
}

export interface LifestyleAmbitionDef {
  id: string;
  branch: LifestyleBranch;
  name: string;
  description: string;
  rewardPrestige: number;
  rewardXp: number;
}

export const LIFESTYLE_PERKS: LifestylePerkDef[] = [
  { id: 'martial_drill', branch: 'Martial', name: 'Iron Drill', description: '+2 Martial, +2 Prowess, +60 Men-at-Arms.', xpCost: 100 },
  { id: 'martial_siegecraft', branch: 'Martial', name: 'Siege Engineers', description: '+2 Martial, accelerates garrison siege assault.', xpCost: 100, requiresId: 'martial_drill' },
  { id: 'martial_exemplar', branch: 'Martial', name: 'Supreme Strategist', description: '+3 Martial, +150 Prestige, inspires loyal knights.', xpCost: 120, requiresId: 'martial_siegecraft' },

  { id: 'steward_taxation', branch: 'Stewardship', name: 'Cadastral Rolls', description: '+2 Stewardship, +180 Royal Treasury grant.', xpCost: 100 },
  { id: 'steward_trade_guild', branch: 'Stewardship', name: 'Mercantile Charter', description: '+2 Stewardship, +25% Trade Node Power across nodes.', xpCost: 100, requiresId: 'steward_taxation' },
  { id: 'steward_architect', branch: 'Stewardship', name: 'Royal Architect', description: '+3 Stewardship, strengthens burghers and development.', xpCost: 120, requiresId: 'steward_trade_guild' },

  { id: 'intrigue_whispers', branch: 'Intrigue', name: 'Whisper Network', description: '+2 Intrigue, reveals court conspiracies faster.', xpCost: 100 },
  { id: 'intrigue_blackmail', branch: 'Intrigue', name: 'Dread Sovereign', description: '+2 Intrigue, +20 Dread.', xpCost: 100, requiresId: 'intrigue_whispers' },
  { id: 'intrigue_shadow_crown', branch: 'Intrigue', name: 'Master of Shadows', description: '+3 Intrigue, suppresses rival factions.', xpCost: 120, requiresId: 'intrigue_blackmail' },

  { id: 'diplo_envoys', branch: 'Diplomacy', name: 'Silver-Tongued Envoys', description: '+2 Diplomacy, +120 Prestige.', xpCost: 100 },
  { id: 'diplo_free_ports', branch: 'Diplomacy', name: 'Maritime Treaties', description: '+2 Diplomacy, +20% Trade Node Power.', xpCost: 100, requiresId: 'diplo_envoys' },
  { id: 'diplo_peacemaker', branch: 'Diplomacy', name: 'Architect of Concord', description: '+3 Diplomacy, accelerates Aggressive Expansion recovery.', xpCost: 120, requiresId: 'diplo_free_ports' },
];

export const LIFESTYLE_AMBITIONS: LifestyleAmbitionDef[] = [
  { id: 'amb_accumulate_wealth', branch: 'Stewardship', name: 'Fill the Crown Coffers', description: 'Hold at least 800 Gold in the royal treasury.', rewardPrestige: 220, rewardXp: 90 },
  { id: 'amb_forge_host', branch: 'Martial', name: 'Forge a Standing Host', description: 'Field at least 240 elite Men-at-Arms.', rewardPrestige: 240, rewardXp: 90 },
  { id: 'amb_master_of_court', branch: 'Diplomacy', name: 'Earn Peerless Renown', description: 'Reach 600 Royal Prestige.', rewardPrestige: 200, rewardXp: 100 },
  { id: 'amb_shadow_fear', branch: 'Intrigue', name: 'Rule Through Dread', description: 'Achieve at least 45 Dread across the realm.', rewardPrestige: 180, rewardXp: 90 },
];

export class LifestylePerksEngine {
  static bindMonarchDefaults(char: Character | undefined): void {
    if (!char) return;
    if (!char.lifestylePerks) char.lifestylePerks = [];
    if (char.lifestyleXp === undefined) char.lifestyleXp = 110;
    if (!char.completedAmbitions) char.completedAmbitions = [];
  }

  static unlockPerkForMonarch(
    monarch: Character,
    perkId: string,
    w: WorldState
  ): { success: boolean; summary: string } {
    LifestylePerksEngine.bindMonarchDefaults(monarch);
    const def = LIFESTYLE_PERKS.find((p) => p.id === perkId);
    if (!def) return { success: false, summary: 'Perk definition not found.' };
    if (monarch.lifestylePerks!.includes(def.id)) {
      return { success: false, summary: `${def.name} is already unlocked by ${monarch.name}.` };
    }
    if (def.requiresId && !monarch.lifestylePerks!.includes(def.requiresId)) {
      const req = LIFESTYLE_PERKS.find((p) => p.id === def.requiresId);
      return { success: false, summary: `Requires prerequisite perk "${req?.name || def.requiresId}".` };
    }
    if ((monarch.lifestyleXp || 0) < def.xpCost) {
      return { success: false, summary: `Requires ${def.xpCost} Lifestyle XP (Current: ${Math.round(monarch.lifestyleXp || 0)}).` };
    }

    monarch.lifestyleXp = Math.max(0, (monarch.lifestyleXp || 0) - def.xpCost);
    monarch.lifestylePerks!.push(def.id);

    if (def.id === 'martial_drill') {
      monarch.baseMartial = (monarch.baseMartial || 10) + 2;
      monarch.baseProwess = (monarch.baseProwess || 10) + 2;
      monarch.menAtArms = (monarch.menAtArms || 100) + 60;
    } else if (def.id === 'martial_siegecraft') {
      monarch.baseMartial = (monarch.baseMartial || 10) + 2;
    } else if (def.id === 'martial_exemplar') {
      monarch.baseMartial = (monarch.baseMartial || 10) + 3;
      monarch.prestige = (monarch.prestige || 100) + 150;
    } else if (def.id === 'steward_taxation') {
      monarch.baseStewardship = (monarch.baseStewardship || 10) + 2;
      const realm = monarch.realmId ? w.realms?.find((r) => r.id === monarch.realmId) : undefined;
      if (realm) {
        ensureRealmBudget(realm, w);
        realm.treasury = Math.round(((realm.treasury || 0) + 180) * 10) / 10;
      } else {
        monarch.treasury = (monarch.treasury || 0) + 180;
      }
    } else if (def.id === 'steward_trade_guild') {
      monarch.baseStewardship = (monarch.baseStewardship || 10) + 2;
    } else if (def.id === 'steward_architect') {
      monarch.baseStewardship = (monarch.baseStewardship || 10) + 3;
    } else if (def.id === 'intrigue_whispers') {
      monarch.baseIntrigue = (monarch.baseIntrigue || 10) + 2;
    } else if (def.id === 'intrigue_blackmail') {
      monarch.baseIntrigue = (monarch.baseIntrigue || 10) + 2;
      monarch.dread = Math.min(100, (monarch.dread || 0) + 20);
    } else if (def.id === 'intrigue_shadow_crown') {
      monarch.baseIntrigue = (monarch.baseIntrigue || 10) + 3;
    } else if (def.id === 'diplo_envoys') {
      monarch.baseDiplomacy = (monarch.baseDiplomacy || 10) + 2;
      monarch.prestige = (monarch.prestige || 100) + 120;
    } else if (def.id === 'diplo_free_ports') {
      monarch.baseDiplomacy = (monarch.baseDiplomacy || 10) + 2;
    } else if (def.id === 'diplo_peacemaker') {
      monarch.baseDiplomacy = (monarch.baseDiplomacy || 10) + 3;
    }

    if (!w.history) w.history = [];
    w.history.unshift({
      id: nextId('hist_perk'),
      year: w.currentYear,
      title: `Sovereign Mastery: ${def.name}`,
      category: 'Dynastic Drama',
      description: `${monarch.name} mastered "${def.name}" (${def.branch}), strengthening the realm's governance.`,
      primaryActorId: monarch.id,
      realmId: monarch.realmId,
    });

    return { success: true, summary: `${monarch.name} unlocked ${def.name} (${def.branch})!` };
  }

  static setMonarchAmbition(
    monarch: Character,
    ambitionId: string
  ): { success: boolean; summary: string } {
    LifestylePerksEngine.bindMonarchDefaults(monarch);
    const amb = LIFESTYLE_AMBITIONS.find((a) => a.id === ambitionId);
    if (!amb) return { success: false, summary: 'Ambition not found.' };
    monarch.activeAmbition = amb.id;
    monarch.ambition = amb.name;
    return { success: true, summary: `Sovereign ambition set: ${amb.name}.` };
  }

  static stepMonarchLifestyleMonthly(w: WorldState, monthsDelta: number = 1): void {
    const processedIds = new Set<string>();
    for (const r of w.realms || []) {
      const monarch = (w.characters || []).find((c) => c.id === r.rulerId && c.isAlive !== false);
      if (!monarch || processedIds.has(monarch.id)) continue;
      processedIds.add(monarch.id);

      LifestylePerksEngine.bindMonarchDefaults(monarch);
      const gain =
        (6 +
          ((monarch.baseLearning || 10) * 0.35) +
          ((monarch.baseStewardship || 10) + (monarch.baseMartial || 10)) * 0.12) *
        monthsDelta;
      monarch.lifestyleXp = Math.min(800, Math.round(((monarch.lifestyleXp || 0) + gain) * 10) / 10);

      if (monarch.activeAmbition) {
        const amb = LIFESTYLE_AMBITIONS.find((a) => a.id === monarch.activeAmbition);
        if (amb && !(monarch.completedAmbitions || []).includes(amb.id)) {
          let achieved = false;
          const monarchRealm = monarch.realmId ? w.realms?.find((r) => r.id === monarch.realmId) : undefined;
          if (amb.id === 'amb_accumulate_wealth' && ((monarchRealm?.treasury ?? monarch.treasury ?? 0) >= 800)) achieved = true;
          if (amb.id === 'amb_forge_host' && (monarch.menAtArms || 0) >= 240) achieved = true;
          if (amb.id === 'amb_master_of_court' && (monarch.prestige || 0) >= 600) achieved = true;
          if (amb.id === 'amb_shadow_fear' && (monarch.dread || 0) >= 45) achieved = true;

          if (achieved) {
            monarch.completedAmbitions = [...(monarch.completedAmbitions || []), amb.id];
            monarch.prestige = (monarch.prestige || 100) + amb.rewardPrestige;
            monarch.lifestyleXp = Math.min(800, (monarch.lifestyleXp || 0) + amb.rewardXp);
            monarch.activeAmbition = undefined;
          }
        }
      }
    }
  }
}
