import { WorldState } from '../types/world';
import { cloneCoatOfArmsData } from './heraldryBridge';

export function cloneWorldState(world: WorldState): WorldState {
  const { mesh, sim, rivers, cells } = world;

  // Permanently retain ALL war, battle, skirmish, siege, and peace chronicle entries; cap routine non-military events to 400
  const rawHistory = world.history || [];
  let nonMilitaryKept = 0;
  const history = rawHistory.filter((ev) => {
    if (!ev) return false;
    const isPermanentWarRecord =
      ev.category === 'War & Conquest' ||
      ev.category === 'Battle' ||
      Boolean(ev.warRecord) ||
      /^(hist_battle|hist_clash|hist_war|hist_siege|hist_peace|hist_duel|hist_raid)/i.test(ev.id || '');
    if (isPermanentWarRecord) return true;
    nonMilitaryKept += 1;
    return nonMilitaryKept <= 400;
  });
  const rawLore = world.loreEntities || [];
  const loreEntities =
    rawLore.length <= 450
      ? [...rawLore]
      : [
          ...rawLore.filter((e) => !e.id.startsWith('lore_dyn_')),
          ...rawLore.filter((e) => e.id.startsWith('lore_dyn_')).slice(0, 60),
        ];

  return {
    ...world,
    settings: {
      ...world.settings,
      terrainSim: { ...world.settings.terrainSim },
    },
    // Shallow-clone cell scalar fields while sharing static polygon arrays
    cells: cells.map((c) => ({ ...c })),
    realms: world.realms.map((r) => ({
      ...r,
      countyIds: [...(r.countyIds || [])],
      heraldry: cloneCoatOfArmsData(r.heraldry),
      coatOfArms: r.coatOfArms ? cloneCoatOfArmsData(r.coatOfArms) : undefined,
      alliedRealmIds: r.alliedRealmIds ? [...r.alliedRealmIds] : undefined,
      enemyRealmIds: r.enemyRealmIds ? [...r.enemyRealmIds] : undefined,
      diplomaticRelations: r.diplomaticRelations ? { ...r.diplomaticRelations } : undefined,
      truceUntilYearByRealm: r.truceUntilYearByRealm ? { ...r.truceUntilYearByRealm } : undefined,
      budget: r.budget
        ? {
            ...r.budget,
            lastReport: { ...r.budget.lastReport },
            pendingCycleTotals: r.budget.pendingCycleTotals
              ? { ...r.budget.pendingCycleTotals }
              : undefined,
          }
        : undefined,
    })),
    counties: world.counties.map((c) => ({
      ...c,
      cellIndices: [...(c.cellIndices || [])],
      baronyBurgIds: c.baronyBurgIds ? [...c.baronyBurgIds] : undefined,
      coatOfArms: c.coatOfArms ? cloneCoatOfArmsData(c.coatOfArms) : undefined,
    })),
    burgs: world.burgs.map((b) => ({
      ...b,
      buildings: b.buildings ? [...b.buildings] : [],
      exports: b.exports ? [...b.exports] : [],
      imports: b.imports ? [...b.imports] : [],
      vassalIds: b.vassalIds ? [...b.vassalIds] : [],
      cellIndices: b.cellIndices ? [...b.cellIndices] : [],
      economicLedger: b.economicLedger ? { ...b.economicLedger } : undefined,
      demographics: b.demographics ? { ...b.demographics } : undefined,
      strata: b.strata
        ? Object.fromEntries(Object.entries(b.strata).map(([k, v]) => [k, { ...v }]))
        : undefined,
      buildingSlots: b.buildingSlots
        ? Object.fromEntries(Object.entries(b.buildingSlots).map(([k, v]) => [k, { ...v }]))
        : undefined,
      coatOfArms: b.coatOfArms ? cloneCoatOfArmsData(b.coatOfArms) : undefined,
    })),
    characters: world.characters.map((ch) => ({
      ...ch,
      personalityTraits: [...(ch.personalityTraits || [])],
      congenitalTraits: [...(ch.congenitalTraits || [])],
      physicalHealthTraits: [...(ch.physicalHealthTraits || [])],
      commanderTraits: [...(ch.commanderTraits || [])],
      lifestyleTraits: [...(ch.lifestyleTraits || [])],
      v17Traits: [...(ch.v17Traits || [])],
      knownSecrets: [...(ch.knownSecrets || [])],
      hooksHeld: (ch.hooksHeld || []).map((h) => ({ ...h })),
      hooksOnMe: (ch.hooksOnMe || []).map((h) => ({ ...h })),
      opinions: { ...(ch.opinions || {}) },
      children: ch.children ? [...ch.children] : undefined,
      claims: ch.claims ? ch.claims.map((cl) => ({ ...cl })) : undefined,
      crimes: ch.crimes ? ch.crimes.map((cr) => ({ ...cr })) : undefined,
      grudges: ch.grudges ? ch.grudges.map((g) => ({ ...g })) : undefined,
      vassalIds: ch.vassalIds ? [...ch.vassalIds] : undefined,
      heldHoldingIds: ch.heldHoldingIds ? [...ch.heldHoldingIds] : undefined,
      activeScheme: ch.activeScheme ? { ...ch.activeScheme } : undefined,
      courtPosition: ch.courtPosition ? { ...ch.courtPosition } : undefined,
      organicGravitas: ch.organicGravitas ? { ...ch.organicGravitas } : undefined,
      coatOfArms: ch.coatOfArms ? cloneCoatOfArmsData(ch.coatOfArms) : undefined,
      lifestylePerks: ch.lifestylePerks ? [...ch.lifestylePerks] : undefined,
      lifestyleXp: ch.lifestyleXp,
      completedAmbitions: ch.completedAmbitions ? [...ch.completedAmbitions] : undefined,
    })),
    history,
    sagas: [...world.sagas],
    loreEntities,
    cultures: world.cultures.map((cu) => ({ ...cu })),
    religions: world.religions.map((re) => ({ ...re })),
    tradeNetwork: world.tradeNetwork
      ? {
          routes: world.tradeNetwork.routes.map((r) => ({
            ...r,
            pathPoints: [...r.pathPoints],
          })),
          caravans: world.tradeNetwork.caravans.map((cv) => ({ ...cv })),
          tradeHubs: world.tradeNetwork.tradeHubs.map((th) => ({
            ...th,
            primaryExports: [...th.primaryExports],
          })),
          cellTrafficVolume: world.tradeNetwork.cellTrafficVolume,
          cellPopulationDensity: world.tradeNetwork.cellPopulationDensity,
        }
      : undefined,
    armies: world.armies
      ? world.armies.map((a) => ({
          ...a,
          regiments: a.regiments ? a.regiments.map((reg) => ({ ...reg })) : undefined,
          claim: a.claim ? { ...a.claim } : undefined,
          waypoints: a.waypoints ? a.waypoints.map((wp) => ({ ...wp })) : undefined,
          lastBattleReport: a.lastBattleReport
            ? {
                ...a.lastBattleReport,
                duelResult: a.lastBattleReport.duelResult ? { ...a.lastBattleReport.duelResult } : undefined,
              }
            : undefined,
        }))
      : [],
    activeSieges: world.activeSieges ? world.activeSieges.map((s) => ({ ...s })) : [],
    activeWars: world.activeWars
      ? world.activeWars.map((w) => ({
          ...w,
          targetHoldingIds: [...(w.targetHoldingIds || [])],
          casusBellis: w.casusBellis ? w.casusBellis.map((cb) => ({ ...cb })) : undefined,
          alliedRealmIds: w.alliedRealmIds ? [...w.alliedRealmIds] : undefined,
        }))
      : [],
    provinces: world.provinces
      ? world.provinces.map((p) => ({
          ...p,
          neighbors: [...p.neighbors],
          holdingIds: [...p.holdingIds],
          cellIndices: [...p.cellIndices],
        }))
      : undefined,
    holdings: world.holdings ? world.holdings.map((h) => ({ ...h })) : undefined,
    factions: world.factions
      ? world.factions.map((f) => ({
          ...f,
          members: [...f.members],
        }))
      : [],
    favors: world.favors ? world.favors.map((fv) => ({ ...fv })) : [],
    epidemics: world.epidemics
      ? world.epidemics.map((e) => ({
          ...e,
          infectedProvinceIds: [...e.infectedProvinceIds],
        }))
      : [],
    cadetHouses: world.cadetHouses
      ? Object.fromEntries(
          Object.entries(world.cadetHouses).map(([k, ch]) => [
            k,
            {
              ...ch,
              coatOfArms: ch.coatOfArms ? cloneCoatOfArmsData(ch.coatOfArms) : undefined,
            },
          ])
        )
      : {},
    lockedDownProvinces: world.lockedDownProvinces ? [...world.lockedDownProvinces] : [],
    foreignNations: world.foreignNations ? world.foreignNations.map((fn) => ({ ...fn })) : [],
    realmLaws: world.realmLaws ? { ...world.realmLaws } : undefined,
    politicalSystem: world.politicalSystem ? { ...world.politicalSystem } : undefined,
    pendingBills: world.pendingBills
      ? world.pendingBills.map((b) => ({
          ...b,
          persuadedIds: [...b.persuadedIds],
          votes: b.votes.map((v) => ({ ...v })),
        }))
      : [],
    legislativeHistory: world.legislativeHistory
      ? world.legislativeHistory.slice(0, 40).map((b) => ({
          ...b,
          persuadedIds: [...b.persuadedIds],
          votes: b.votes.map((v) => ({ ...v })),
        }))
      : [],
    reformPilots: world.reformPilots ? world.reformPilots.map((rp) => ({ ...rp })) : [],
    governanceHealth: world.governanceHealth ? { ...world.governanceHealth } : undefined,
    economy: world.economy
      ? {
          ...world.economy,
          burgMarkets: Object.fromEntries(
            Object.entries(world.economy.burgMarkets || {}).map(([id, bm]) => [
              id,
              {
                ...bm,
                connectedBurgIds: [...(bm.connectedBurgIds || [])],
                markets: Object.fromEntries(
                  Object.entries(bm.markets || {}).map(([good, cm]) => [good, { ...cm }])
                ) as any,
              },
            ])
          ),
          bankInstitutions: (world.economy.bankInstitutions || []).map((bi) => ({
            ...bi,
            activeLoans: (bi.activeLoans || []).map((l) => ({ ...l })),
          })),
          fiscalProfiles: Object.fromEntries(
            Object.entries(world.economy.fiscalProfiles || {}).map(([id, fp]) => [id, { ...fp }])
          ),
          realmCoinPurity: { ...(world.economy.realmCoinPurity || {}) },
          realmCurrencies: world.economy.realmCurrencies
            ? Object.fromEntries(
                Object.entries(world.economy.realmCurrencies).map(([id, rc]) => [id, { ...rc }])
              )
            : undefined,
        }
      : undefined,
    tradeNodes: world.tradeNodes
      ? world.tradeNodes.map((tn) => ({
          ...tn,
          countyIds: [...tn.countyIds],
          downstreamNodeIds: [...tn.downstreamNodeIds],
          shares: tn.shares.map((s) => ({ ...s })),
        }))
      : undefined,
    estatesByRealm: world.estatesByRealm
      ? Object.fromEntries(
          Object.entries(world.estatesByRealm).map(([rid, re]) => [
            rid,
            {
              ...re,
              activeDiet: re.activeDiet ? { ...re.activeDiet } : undefined,
              estates: {
                Nobility: { ...re.estates.Nobility, grantedPrivilegeIds: [...re.estates.Nobility.grantedPrivilegeIds] },
                Clergy: { ...re.estates.Clergy, grantedPrivilegeIds: [...re.estates.Clergy.grantedPrivilegeIds] },
                Burghers: { ...re.estates.Burghers, grantedPrivilegeIds: [...re.estates.Burghers.grantedPrivilegeIds] },
              },
            },
          ])
        )
      : undefined,
    aggressiveExpansion: world.aggressiveExpansion
      ? Object.fromEntries(
          Object.entries(world.aggressiveExpansion).map(([k, v]) => [k, { ...v }])
        )
      : undefined,
    coalitions: world.coalitions
      ? world.coalitions.map((co) => ({ ...co, memberRealmIds: [...co.memberRealmIds] }))
      : undefined,
    activeWeatherMod: world.activeWeatherMod ? { ...world.activeWeatherMod } : undefined,
    customRivers: world.customRivers
      ? world.customRivers.map((cr) => ({
          ...cr,
          points: cr.points ? cr.points.map((pt) => ({ ...pt })) : [],
        }))
      : undefined,
    customBorders: world.customBorders
      ? world.customBorders.map((cb) => ({
          ...cb,
          points: cb.points ? cb.points.map((pt) => ({ ...pt })) : [],
        }))
      : undefined,
    borderKindOverrides: world.borderKindOverrides ? { ...world.borderKindOverrides } : undefined,
    mapPins: world.mapPins ? world.mapPins.map((pin) => ({ ...pin })) : undefined,
    pendingDiplomaticProposals: world.pendingDiplomaticProposals
      ? world.pendingDiplomaticProposals.map((p) => ({ ...p, reasons: [...(p.reasons || [])] }))
      : undefined,
    mesh,
    sim,
    rivers,
  };
}