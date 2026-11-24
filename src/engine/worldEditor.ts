import {
  BorderKind,
  Burg,
  Character,
  CoatOfArmsData,
  County,
  CourtRole,
  LoreEntity,
  Point2D,
  Realm,
  RouteClassification,
  TitleTier,
  WorldState,
} from '../types/world';
import { cloneWorldState } from '../utils/cloneWorldState';
import { canAddTrait, syncCharacterTraits } from './v17TraitDB';
import { CHARACTER_TRAITS, getLowerTitleTier, getRealmSovereignRank } from './fantasyTables';
import { syncWorldBanners } from '../utils/heraldryBridge';
import { buildCustomTradeRoute, regenerateTradeRoutes } from './tradeRouteEngine';

export function resolvePlayerRealm(world: WorldState): Realm | undefined {
  if (world.playerRealmId === null) return undefined;
  if (world.playerRealmId) {
    return world.realms.find((r) => r.id === world.playerRealmId) || world.realms[0];
  }
  return world.realms[0];
}

export interface RealmEditPatch {
  name?: string;
  color?: string;
  culture?: string;
  religion?: string;
  government?: string;
  societyType?: string;
  foundingLegend?: string;
  lore?: string;
  heraldry?: CoatOfArmsData;
}

export function updateRealm(
  world: WorldState,
  realmId: string,
  patch: RealmEditPatch
): WorldState {
  const next = cloneWorldState(world);
  const realm = next.realms.find((r) => r.id === realmId);
  if (!realm) return next;

  const oldName = realm.name;
  if (patch.name !== undefined && patch.name.trim()) {
    realm.name = patch.name.trim();
  }
  if (patch.color !== undefined) realm.color = patch.color;
  if (patch.culture !== undefined && patch.culture.trim()) realm.culture = patch.culture.trim();
  if (patch.religion !== undefined && patch.religion.trim()) realm.religion = patch.religion.trim();
  if (patch.government !== undefined && patch.government.trim()) realm.government = patch.government.trim();
  if (patch.societyType !== undefined && patch.societyType.trim()) realm.societyType = patch.societyType.trim();
  if (patch.foundingLegend !== undefined) realm.foundingLegend = patch.foundingLegend;
  if (patch.lore !== undefined) realm.lore = patch.lore;
  if (patch.heraldry !== undefined) {
    realm.heraldry = patch.heraldry;
    realm.coatOfArms = patch.heraldry;
    realm.customHeraldry = true;
    const monarch = next.characters.find((c) => c.id === realm.rulerId);
    if (monarch && !monarch.customHeraldry) {
      monarch.coatOfArms = patch.heraldry;
    }
  }

  // Cascade culture/religion/title updates to Provinces & LoreEntity
  if (patch.name && patch.name.trim() !== oldName) {
    for (const ch of next.characters) {
      if (ch.realmId === realmId && ch.title && ch.title.includes(oldName)) {
        ch.title = ch.title.split(oldName).join(realm.name);
      }
    }
  }

  // Realm culture & religion are synced to LoreEntity below.

  const ruler = next.characters.find((c) => c.id === realm.rulerId);
  const capital = next.burgs.find((b) => b.id === realm.capitalBurgId);
  const rCounties = next.counties.filter((c) => c.realmId === realm.id);

  const loreId = `lore_${realm.id}`;
  const lore = next.loreEntities.find((e) => e.id === loreId);
  if (lore) {
    lore.name = realm.name;
    lore.summary = `${realm.government} (${realm.societyType || 'Stratified Feudalism'}) ruled by ${ruler?.name || 'the Crown'} from ${capital?.name || 'the Capital'}.`;
    lore.body_markdown = [
      '### Sovereignty & Royal Court',
      `- **Sovereign Monarch**: ${ruler ? ruler.name : 'Unknown'}`,
      `- **Government**: ${realm.government}`,
      `- **Society Type**: ${realm.societyType || 'Stratified Feudalism'}`,
      `- **Seat of Governance**: Citadel of ${capital ? capital.name : 'the Capital'}`,
      `- **Cultural Heritage**: ${realm.culture}`,
      `- **State Religion**: ${realm.religion}`,
      '',
      '### Feudal Fiefdoms',
      `Comprising ${rCounties.length} feudal counties:`,
      ...rCounties.map((c) => `- **${c.name}**: Development Index ${c.development}/100`),
      '',
      '### Founding Legend',
      realm.foundingLegend || realm.lore || 'Forged in the crucible of ancient wars.',
    ].join('\n');
    lore.tags = ['Kingdom', realm.culture, realm.government];
  }

  if (patch.heraldry) {
    syncWorldBanners(next);
  }
  next.paintRevision = (next.paintRevision || 0) + 1;
  next.territoryRevision = (next.territoryRevision || 0) + 1;
  return next;
}

export interface CountyEditPatch {
  name?: string;
  tier?: 'Duchy' | 'County';
  tradition?: string;
  development?: number;
  color?: string;
  culture?: string;
  religion?: string;
  coatOfArms?: CoatOfArmsData;
}

export function updateCounty(
  world: WorldState,
  countyId: string,
  patch: CountyEditPatch
): WorldState {
  const next = cloneWorldState(world);
  const county = next.counties.find((c) => c.id === countyId);
  if (!county) return next;

  const oldName = county.name;
  if (patch.name !== undefined && patch.name.trim()) county.name = patch.name.trim();
  if (patch.tier !== undefined) county.tier = patch.tier;
  if (patch.tradition !== undefined && patch.tradition.trim()) county.tradition = patch.tradition.trim();
  if (patch.development !== undefined && !Number.isNaN(patch.development)) {
    county.development = Math.max(1, Math.min(100, Math.round(patch.development)));
  }
  if (patch.color !== undefined) county.color = patch.color;
  if (patch.culture !== undefined && patch.culture.trim()) county.culture = patch.culture.trim();
  if (patch.religion !== undefined && patch.religion.trim()) county.religion = patch.religion.trim();
  if (patch.coatOfArms !== undefined) {
    county.coatOfArms = patch.coatOfArms;
    county.customHeraldry = true;
  }

  // Sync County <-> Province
  const prov = (next.provinces || []).find((p) => p.id === county.id);
  if (prov) {
    prov.name = county.name;
  }

  // Cascade title & duchyName changes if county/duchy name changed
  if (patch.name && county.name !== oldName) {
    if (county.tier === 'Duchy' || county.duchyId === county.id) {
      county.duchyName = county.name;
      if (county.duchyId) {
        for (const member of next.counties) {
          if (member.duchyId === county.duchyId) {
            member.duchyName = county.name;
          }
        }
      }
    }
    const ruler = next.characters.find((c) => c.id === county.rulerId);
    if (ruler && ruler.title && ruler.title.includes(oldName)) {
      ruler.title = ruler.title.split(oldName).join(county.name);
    }
  }

  // Sync LoreEntity
  const realm = next.realms.find((r) => r.id === county.realmId);
  const ruler = next.characters.find((c) => c.id === county.rulerId);
  const seat = next.burgs.find((b) => b.id === county.capitalBurgId);
  const tierLabel = county.tier === 'Duchy' || county.name.includes('Duchy') ? 'Duchy' : 'County';
  const lore = next.loreEntities.find((e) => e.id === `lore_${county.id}`);
  if (lore) {
    lore.name = county.name;
    lore.summary = `${tierLabel} of ${realm?.name || 'the Crown'}, seated at ${seat?.name || 'its fortress'} (Dev ${county.development || 15}).`;
    lore.body_markdown = [
      '### Feudal Charter & Governance',
      `- **Rank**: ${tierLabel}`,
      `- **Overlord**: ${realm?.name || 'Independent March'}`,
      `- **Ruler**: ${ruler ? `${ruler.title} ${ruler.name}` : 'Vacant Seat'}`,
      `- **Capital Seat**: ${seat?.name || 'Stronghold'}`,
      `- **Tradition**: ${county.tradition}`,
      `- **Development Index**: ${county.development || 15} (${county.cellIndices.length} provinces)`,
    ].join('\n');
    lore.tags = [tierLabel, realm?.name || 'Fief'];
  }

  if (patch.coatOfArms) {
    syncWorldBanners(next);
  }
  next.paintRevision = (next.paintRevision || 0) + 1;
  next.territoryRevision = (next.territoryRevision || 0) + 1;
  return next;
}

export interface HouseEditPatch {
  houseName?: string;
  motto?: string;
  coatOfArms?: CoatOfArmsData;
}

export function updateHouse(
  world: WorldState,
  oldHouseName: string,
  _realmId: string | undefined,
  patch: HouseEditPatch
): WorldState {
  const next = cloneWorldState(world);
  const cleanOld = oldHouseName.trim();
  const cleanNew = patch.houseName?.trim() || cleanOld;
  if (!cleanOld) return next;

  const oldLower = cleanOld.toLowerCase();

  for (const ch of next.characters) {
    if ((ch.houseName || '').trim().toLowerCase() === oldLower) {
      ch.houseName = cleanNew;
      if (patch.motto !== undefined) {
        ch.houseMotto = patch.motto;
      }
      if (patch.coatOfArms !== undefined) {
        ch.coatOfArms = patch.coatOfArms;
        ch.customHeraldry = true;
        ch.hasPersonalBanner = true;
      }
      if (cleanNew !== cleanOld && ch.name.includes(`of House ${cleanOld}`)) {
        ch.name = ch.name.split(`of House ${cleanOld}`).join(`of House ${cleanNew}`);
      } else if (cleanNew !== cleanOld && ch.name.includes(cleanOld)) {
        ch.name = ch.name.split(cleanOld).join(cleanNew);
      }

      const charLore = next.loreEntities.find((e) => e.id === `lore_${ch.id}`);
      if (charLore) {
        charLore.name = `${ch.title}: ${ch.name}`;
        charLore.summary = `${ch.role} of House ${ch.houseName} (${ch.aiArchetype}). Driven by ${(ch.ambition || 'ambition').toLowerCase()}.`;
        if (charLore.tags) {
          charLore.tags = charLore.tags.map((t) => (t.toLowerCase() === oldLower ? cleanNew : t));
        }
      }
    }
  }

  if (next.cadetHouses) {
    for (const key of Object.keys(next.cadetHouses)) {
      const entry = next.cadetHouses[key];
      if (!entry) continue;
      if ((entry.name || '').toLowerCase() === oldLower) {
        entry.name = cleanNew;
        if (patch.coatOfArms !== undefined) {
          entry.coatOfArms = patch.coatOfArms;
        }
      }
      if ((entry.parentDynasty || '').toLowerCase() === oldLower) {
        entry.parentDynasty = cleanNew;
      }
      if ((entry.feudTargetDynasty || '').toLowerCase() === oldLower) {
        entry.feudTargetDynasty = cleanNew;
      }
    }
  }

  if (patch.coatOfArms) {
    for (const realm of next.realms) {
      const monarch = next.characters.find((c) => c.id === realm.rulerId);
      if (monarch && (monarch.houseName || '').trim().toLowerCase() === cleanNew.toLowerCase() && !realm.customHeraldry) {
        realm.heraldry = patch.coatOfArms;
        realm.coatOfArms = patch.coatOfArms;
      }
    }
    syncWorldBanners(next);
  }
  next.paintRevision = (next.paintRevision || 0) + 1;
  return next;
}

export interface BurgEditPatch {
  name?: string;
  type?: Burg['type'];
  population?: number;
  tradeGood?: string;
  developmentLevel?: number;
  lore?: string;
  culture?: string;
  coatOfArms?: CoatOfArmsData;
}

export function updateBurg(
  world: WorldState,
  burgId: string,
  patch: BurgEditPatch
): WorldState {
  const next = cloneWorldState(world);
  const burg = next.burgs.find((b) => b.id === burgId);
  if (!burg) return next;

  const oldName = burg.name;
  if (patch.name !== undefined && patch.name.trim()) burg.name = patch.name.trim();
  if (patch.type !== undefined) {
    burg.type = patch.type;
    burg.isCapital = patch.type === 'Capital Citadel';
  }
  if (patch.population !== undefined && !Number.isNaN(patch.population)) {
    burg.population = Math.max(50, Math.round(patch.population));
  }
  if (patch.tradeGood !== undefined && patch.tradeGood.trim()) burg.tradeGood = patch.tradeGood.trim();
  if (patch.developmentLevel !== undefined && !Number.isNaN(patch.developmentLevel)) {
    burg.developmentLevel = Math.max(1, Math.min(100, Math.round(patch.developmentLevel)));
  }
  if (patch.lore !== undefined) burg.lore = patch.lore;
  if (patch.culture !== undefined && patch.culture.trim()) burg.culture = patch.culture.trim();
  if (patch.coatOfArms !== undefined) {
    burg.coatOfArms = patch.coatOfArms;
    burg.customHeraldry = true;
  }

  // Sync Holding
  const holding = (next.holdings || []).find((h) => h.id === burg.id || h.name === oldName);
  if (holding) {
    holding.name = burg.name;
    if (patch.developmentLevel !== undefined) holding.dev = burg.developmentLevel ?? holding.dev;
    if (patch.type !== undefined) {
      holding.estateType =
        burg.type === 'Capital Citadel' || burg.type === 'Royal Metropolis' || burg.type === 'Border Fortress'
          ? 'Castle'
          : burg.type === 'Ancient Sanctuary'
          ? 'Temple'
          : 'City';
    }
  }

  // Update holder title if it referenced old burg name
  if (patch.name && burg.name !== oldName) {
    for (const ch of next.characters) {
      if (ch.id === burg.ownerId && ch.title && ch.title.includes(oldName)) {
        ch.title = ch.title.split(oldName).join(burg.name);
      }
    }
  }

  // Sync LoreEntity
  const lore = next.loreEntities.find((e) => e.id === `lore_${burg.id}`);
  if (lore) {
    lore.name = `${burg.name} (${burg.type})`;
    lore.summary = `${burg.type} of ${burg.population.toLocaleString()} souls, renowned for ${burg.tradeGood}.`;
    lore.body_markdown = [
      '### Citadel Demographics & Commerce',
      `- **Classification**: ${burg.type}`,
      `- **Population**: ${burg.population.toLocaleString()} souls`,
      `- **Primary Export**: ${burg.tradeGood}`,
      `- **Cultural Identity**: ${burg.culture}`,
      '',
      '### Lore & Architecture',
      burg.lore || 'Ancient ramparts watch over the surrounding marches.',
    ].join('\n');
    lore.tags = ['Citadel', burg.type];
  }

  next.burgRevision = (next.burgRevision || 0) + 1;
  next.paintRevision = (next.paintRevision || 0) + 1;
  return next;
}

export interface CharacterEditPatch {
  name?: string;
  age?: number;
  gender?: 'male' | 'female';
  isAlive?: boolean;
  role?: CourtRole;
  title?: string;
  houseName?: string;
  baseDiplomacy?: number;
  baseMartial?: number;
  baseStewardship?: number;
  baseIntrigue?: number;
  baseLearning?: number;
  baseProwess?: number;
  addTrait?: string;
  removeTrait?: string;
  knownFatherId?: string | null;
  motherId?: string | null;
  spouseId?: string | null;
  liegeId?: string | null;
  coatOfArms?: CoatOfArmsData;
}

const clampStat = (val: number) => Math.max(0, Math.min(30, Math.round(val)));

export function updateCharacter(
  world: WorldState,
  charId: string,
  patch: CharacterEditPatch
): { world: WorldState; error?: string } {
  const next = cloneWorldState(world);
  const char = next.characters.find((c) => c.id === charId);
  if (!char) return { world: next, error: 'Character not found.' };

  if (patch.addTrait) {
    if (patch.addTrait === 'Pregnant' && char.gender !== 'female') {
      return { world, error: 'Only female characters can carry the Pregnant trait.' };
    }
    const existing = Array.from(
      new Set([
        ...(char.v17Traits || []),
        ...(char.personalityTraits || []),
        ...(char.congenitalTraits || []),
        ...(char.physicalHealthTraits || []),
        ...(char.commanderTraits || []),
        ...(char.lifestyleTraits || []),
      ])
    );
    const check = canAddTrait(existing, patch.addTrait);
    if (!check.valid) {
      return { world, error: check.conflict || `Cannot add trait "${patch.addTrait}".` };
    }
    const toRemoveSet = new Set(check.toRemove);
    char.personalityTraits = (char.personalityTraits || []).filter((t) => !toRemoveSet.has(t));
    char.congenitalTraits = (char.congenitalTraits || []).filter((t) => !toRemoveSet.has(t));
    char.physicalHealthTraits = (char.physicalHealthTraits || []).filter((t) => !toRemoveSet.has(t));
    char.commanderTraits = (char.commanderTraits || []).filter((t) => !toRemoveSet.has(t));
    char.lifestyleTraits = (char.lifestyleTraits || []).filter((t) => !toRemoveSet.has(t));
    char.v17Traits = (char.v17Traits || []).filter((t) => !toRemoveSet.has(t));
    char.v17Traits.push(patch.addTrait);
    const matchedCatalog = CHARACTER_TRAITS.find(
      (t) => t.name.toLowerCase() === patch.addTrait!.toLowerCase() || t.id === patch.addTrait
    );
    if (matchedCatalog?.category === 'personality' && !char.personalityTraits.includes(patch.addTrait)) {
      char.personalityTraits.push(patch.addTrait);
    } else if (matchedCatalog?.category === 'congenital' && !char.congenitalTraits.includes(patch.addTrait)) {
      char.congenitalTraits.push(patch.addTrait);
    } else if ((matchedCatalog?.category === 'health' || matchedCatalog?.category === 'physical') && !char.physicalHealthTraits.includes(patch.addTrait)) {
      char.physicalHealthTraits.push(patch.addTrait);
    } else if (matchedCatalog?.category === 'commander' && !char.commanderTraits.includes(patch.addTrait)) {
      char.commanderTraits.push(patch.addTrait);
    } else if ((matchedCatalog?.category === 'lifestyle' || matchedCatalog?.category === 'fame') && !char.lifestyleTraits.includes(patch.addTrait)) {
      char.lifestyleTraits.push(patch.addTrait);
    } else if (matchedCatalog?.category === 'education') {
      char.educationTrait = patch.addTrait;
    } else if (matchedCatalog?.category === 'status') {
      char.statusTrait = patch.addTrait;
    }
    if (patch.addTrait === 'Pregnant') {
      if (!char.physicalHealthTraits.includes('Pregnant')) {
        char.physicalHealthTraits.push('Pregnant');
      }
      if (char.monthsPregnant === undefined || char.monthsPregnant < 0) {
        char.monthsPregnant = 0;
      }
      if (!char.pregnantBy) {
        char.pregnantBy = char.spouseId || char.loverId;
      }
    }
    syncCharacterTraits(char);
  }

  if (patch.removeTrait) {
    const rem = patch.removeTrait;
    char.personalityTraits = (char.personalityTraits || []).filter((t) => t !== rem);
    char.congenitalTraits = (char.congenitalTraits || []).filter((t) => t !== rem);
    char.physicalHealthTraits = (char.physicalHealthTraits || []).filter((t) => t !== rem);
    char.commanderTraits = (char.commanderTraits || []).filter((t) => t !== rem);
    char.lifestyleTraits = (char.lifestyleTraits || []).filter((t) => t !== rem);
    char.v17Traits = (char.v17Traits || []).filter((t) => t !== rem);
    if (char.educationTrait === rem) char.educationTrait = undefined;
    if (char.statusTrait === rem) char.statusTrait = undefined;
    if (rem === 'Pregnant') {
      char.monthsPregnant = undefined;
      char.pregnantBy = undefined;
      char.conceivedInWedlockWith = undefined;
    }
    syncCharacterTraits(char);
  }

  if (patch.name !== undefined && patch.name.trim()) char.name = patch.name.trim();
  if (patch.age !== undefined && !Number.isNaN(patch.age)) {
    char.age = Math.max(0, Math.min(120, Math.round(patch.age)));
    char.birthYear = next.currentYear - char.age;
  }
  if (patch.gender !== undefined) char.gender = patch.gender;
  if (patch.isAlive !== undefined) {
    char.isAlive = patch.isAlive;
    if (!patch.isAlive && !char.deathYear) {
      char.deathYear = next.currentYear;
      char.causeOfDeath = char.causeOfDeath || 'Entered into the Ancestral Rolls';
    } else if (patch.isAlive) {
      char.deathYear = undefined;
    }
  }
  if (patch.role !== undefined) char.role = patch.role;
  if (patch.title !== undefined && patch.title.trim()) char.title = patch.title.trim();
  if (patch.houseName !== undefined && patch.houseName.trim()) char.houseName = patch.houseName.trim();
  if (patch.baseDiplomacy !== undefined) char.baseDiplomacy = clampStat(patch.baseDiplomacy);
  if (patch.baseMartial !== undefined) char.baseMartial = clampStat(patch.baseMartial);
  if (patch.baseStewardship !== undefined) char.baseStewardship = clampStat(patch.baseStewardship);
  if (patch.baseIntrigue !== undefined) char.baseIntrigue = clampStat(patch.baseIntrigue);
  if (patch.baseLearning !== undefined) char.baseLearning = clampStat(patch.baseLearning);
  if (patch.baseProwess !== undefined) char.baseProwess = clampStat(patch.baseProwess);
  if (patch.coatOfArms !== undefined) {
    char.coatOfArms = patch.coatOfArms;
    char.hasPersonalBanner = true;
    char.customHeraldry = true;
  }
  if (patch.name !== undefined && patch.name.trim()) {
    for (const army of next.armies || []) {
      if (army.commanderId === char.id) {
        army.commanderName = char.name;
      }
    }
  }

  if (patch.knownFatherId !== undefined) {
    char.knownFatherId = patch.knownFatherId || undefined;
    if (char.knownFatherId) {
      const father = next.characters.find((c) => c.id === char.knownFatherId);
      if (father) {
        father.children = Array.from(new Set([...(father.children || []), char.id]));
      }
    }
  }
  if (patch.motherId !== undefined) {
    char.motherId = patch.motherId || undefined;
    if (char.motherId) {
      const mother = next.characters.find((c) => c.id === char.motherId);
      if (mother) {
        mother.children = Array.from(new Set([...(mother.children || []), char.id]));
      }
    }
  }
  if (patch.spouseId !== undefined) {
    if (char.spouseId && char.spouseId !== patch.spouseId) {
      const oldSpouse = next.characters.find((c) => c.id === char.spouseId);
      if (oldSpouse && oldSpouse.spouseId === char.id) oldSpouse.spouseId = undefined;
    }
    char.spouseId = patch.spouseId || undefined;
    if (char.spouseId) {
      const newSpouse = next.characters.find((c) => c.id === char.spouseId);
      if (newSpouse) newSpouse.spouseId = char.id;
    }
  }
  if (patch.liegeId !== undefined) {
    char.liegeId = patch.liegeId || undefined;
  }

  const realm = next.realms.find((r) => r.id === char.realmId);
  const lore = next.loreEntities.find((e) => e.id === `lore_${char.id}`);
  if (lore) {
    lore.name = `${char.title}: ${char.name}`;
    lore.summary = `${char.role} of House ${char.houseName} (${char.aiArchetype}). Driven by ${(char.ambition || 'ambition').toLowerCase()}.`;
    lore.tags = ['Character', char.houseName, char.role, char.aiArchetype];
    lore.stateId = realm?.id || char.realmId;
  }

  if (patch.coatOfArms !== undefined) {
    syncWorldBanners(next);
  }
  next.paintRevision = (next.paintRevision || 0) + 1;
  return { world: next };
}

export interface CreateCustomCharacterInput {
  name: string;
  houseName: string;
  houseMotto?: string;
  realmId: string;
  role: CourtRole;
  title?: string;
  gender: 'male' | 'female';
  age: number;
  isAlive?: boolean;
  knownFatherId?: string;
  motherId?: string;
  spouseId?: string;
  causeOfDeath?: string;
}

export function createCustomCharacter(
  world: WorldState,
  input: CreateCustomCharacterInput
): WorldState {
  const next = cloneWorldState(world);
  const id = `char_custom_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const alive = input.isAlive !== false;
  const age = Math.max(0, Math.min(120, Math.round(input.age)));
  const realm = next.realms.find((r) => r.id === input.realmId) || next.realms[0];
  const existingHouseMember = next.characters.find(
    (c) => c.houseName?.toLowerCase() === input.houseName.trim().toLowerCase()
  );

  const sovTier: TitleTier = realm
    ? getRealmSovereignRank(realm, input.gender).titleTier
    : 'King';
  const rawTier: TitleTier =
    input.role === 'Monarch'
      ? sovTier
      : input.role === 'Vassal Duke'
      ? 'Duke'
      : input.role === 'Vassal Count'
      ? 'Count'
      : input.role === 'Lord Mayor'
      ? 'Mayor'
      : 'Baron';
  const resolvedTier: TitleTier =
    input.role === 'Monarch' ? sovTier : getLowerTitleTier(sovTier, rawTier);

  const newChar: Character = {
    id,
    name: input.name.trim(),
    houseName: input.houseName.trim(),
    houseMotto: input.houseMotto?.trim() || existingHouseMember?.houseMotto || 'Honor & Steel',
    title: input.title?.trim() || `${input.role} of House ${input.houseName.trim()}`,
    role: input.role,
    titleTier: resolvedTier,
    gender: input.gender,
    age,
    birthYear: next.currentYear - age,
    deathYear: alive ? undefined : next.currentYear - Math.max(1, Math.min(40, Math.floor(age * 0.2))),
    causeOfDeath: alive ? undefined : input.causeOfDeath || 'Passed into the ancestral chronicles',
    isAlive: alive,
    realmId: realm?.id || input.realmId,
    liegeId: realm?.rulerId,
    knownFatherId: input.knownFatherId || undefined,
    motherId: input.motherId || undefined,
    spouseId: input.spouseId || undefined,
    baseDiplomacy: 9,
    baseMartial: 9,
    baseStewardship: 9,
    baseIntrigue: 8,
    baseLearning: 8,
    baseProwess: 10,
    personalityTraits: ['Brave', 'Stubborn'],
    educationTrait: 'Skilled Tactician',
    congenitalTraits: [],
    physicalHealthTraits: [],
    commanderTraits: [],
    lifestyleTraits: [],
    v17Traits: ['Brave', 'Stubborn', 'Skilled Tactician'],
    aiArchetype: 'Honorable Paragon',
    stress: 10,
    stressLevel: 0,
    dread: 15,
    prestige: 220,
    piety: 110,
    treasury: 120,
    ambition: 'Preserve the Lineage',
    tragicFlaw: 'Excessive Pride',
    darkSecret: 'Guards a forgotten ancestral compact.',
    sacredOath: 'To defend the ancestral banner without falter.',
    knownSecrets: [],
    hooksHeld: [],
    hooksOnMe: [],
    opinions: {},
    coatOfArms: existingHouseMember?.coatOfArms || realm?.heraldry,
  };

  syncCharacterTraits(newChar);
  next.characters.push(newChar);

  if (newChar.knownFatherId) {
    const father = next.characters.find((c) => c.id === newChar.knownFatherId);
    if (father) father.children = Array.from(new Set([...(father.children || []), newChar.id]));
  }
  if (newChar.motherId) {
    const mother = next.characters.find((c) => c.id === newChar.motherId);
    if (mother) mother.children = Array.from(new Set([...(mother.children || []), newChar.id]));
  }
  if (newChar.spouseId) {
    const spouse = next.characters.find((c) => c.id === newChar.spouseId);
    if (spouse) spouse.spouseId = newChar.id;
  }

  next.loreEntities.unshift({
    id: `lore_${newChar.id}`,
    category: 'Dynasties & Dramatis Personae',
    name: `${newChar.title}: ${newChar.name}`,
    summary: `${newChar.role} of House ${newChar.houseName}.`,
    body_markdown: `### Dramatis Persona\n- **House**: **${newChar.houseName}**\n- **Station**: ${newChar.role}\n- **Motto**: *"${newChar.houseMotto}"*`,
    characterId: newChar.id,
    stateId: newChar.realmId,
    tags: ['Character', newChar.houseName, newChar.role],
  });

  next.paintRevision = (next.paintRevision || 0) + 1;
  return next;
}

export function upsertLoreEntity(world: WorldState, entity: LoreEntity): WorldState {
  const next = cloneWorldState(world);
  const idx = next.loreEntities.findIndex((e) => e.id === entity.id);
  if (idx >= 0) {
    next.loreEntities[idx] = { ...entity };
  } else {
    next.loreEntities.unshift({ ...entity });
  }
  return next;
}

export function deleteLoreEntity(world: WorldState, entityId: string): WorldState {
  const next = cloneWorldState(world);
  next.loreEntities = next.loreEntities.filter((e) => e.id !== entityId);
  return next;
}

export function addCustomBorderEdge(
  world: WorldState,
  kind: BorderKind,
  points: Point2D[],
  label?: string
): WorldState {
  if (!points || points.length < 2) return world;
  const next = cloneWorldState(world);
  const existing = next.customBorders ? [...next.customBorders] : [];
  existing.push({
    id: `border_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    kind,
    points: points.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })),
    label: label?.trim() || undefined,
  });
  next.customBorders = existing;
  next.paintRevision = (next.paintRevision || 0) + 1;
  next.territoryRevision = (next.territoryRevision || 0) + 1;
  return next;
}

export function deleteCustomBorderEdge(world: WorldState, borderId: string): WorldState {
  const next = cloneWorldState(world);
  next.customBorders = (next.customBorders || []).filter((b) => b.id !== borderId);
  next.paintRevision = (next.paintRevision || 0) + 1;
  next.territoryRevision = (next.territoryRevision || 0) + 1;
  return next;
}

export function clearAllCustomBorders(world: WorldState): WorldState {
  const next = cloneWorldState(world);
  next.customBorders = [];
  next.borderKindOverrides = {};
  next.paintRevision = (next.paintRevision || 0) + 1;
  next.territoryRevision = (next.territoryRevision || 0) + 1;
  return next;
}

export function addCustomTradeRoute(
  world: WorldState,
  points: Point2D[],
  routeType: RouteClassification = 'Merchant Road',
  options?: { snapToBurgs?: boolean; usePathfinding?: boolean }
): WorldState {
  const built = buildCustomTradeRoute(world, points, routeType, options);
  if (!built) return world;
  const next = cloneWorldState(world);
  const network = next.tradeNetwork
    ? {
        ...next.tradeNetwork,
        routes: [...next.tradeNetwork.routes, built.route],
        caravans: [...next.tradeNetwork.caravans, built.caravan],
      }
    : {
        routes: [built.route],
        caravans: [built.caravan],
        tradeHubs: [],
      };
  next.tradeNetwork = network;
  next.paintRevision = (next.paintRevision || 0) + 1;
  return next;
}

export function deleteTradeRoute(world: WorldState, routeId: string): WorldState {
  if (!world.tradeNetwork) return world;
  const next = cloneWorldState(world);
  if (!next.tradeNetwork) return next;
  next.tradeNetwork = {
    ...next.tradeNetwork,
    routes: next.tradeNetwork.routes.filter((r) => r.id !== routeId),
    caravans: next.tradeNetwork.caravans.filter((c) => c.routeId !== routeId),
  };
  next.paintRevision = (next.paintRevision || 0) + 1;
  return next;
}

export function regenerateWorldTradeRoutes(
  world: WorldState,
  scope: 'all' | 'overland' | 'maritime' = 'all',
  preserveCustom = true
): WorldState {
  const next = cloneWorldState(world);
  next.tradeNetwork = regenerateTradeRoutes(world, scope, preserveCustom);
  next.paintRevision = (next.paintRevision || 0) + 1;
  return next;
}

export interface CultureEditPatch {
  name?: string;
  ethos?: string;
  heritage?: string;
  languageGroup?: string;
  color?: string;
}

export function updateCulture(
  world: WorldState,
  cultureNameOrId: string,
  patch: CultureEditPatch
): WorldState {
  const next = cloneWorldState(world);
  const cleanOld = cultureNameOrId.trim();
  if (!cleanOld) return next;
  const oldLower = cleanOld.toLowerCase();
  const culture = (next.cultures || []).find(
    (c) => c.id === cleanOld || c.name.trim().toLowerCase() === oldLower
  );
  const prevName = culture?.name || cleanOld;
  const nextName = patch.name !== undefined && patch.name.trim() ? patch.name.trim() : prevName;

  if (culture) {
    culture.name = nextName;
    if (patch.ethos !== undefined && patch.ethos.trim()) culture.ethos = patch.ethos.trim();
    if (patch.heritage !== undefined && patch.heritage.trim()) culture.heritage = patch.heritage.trim();
    if (patch.languageGroup !== undefined && patch.languageGroup.trim()) culture.languageGroup = patch.languageGroup.trim();
    if (patch.color !== undefined) culture.color = patch.color;
  }

  if (nextName !== prevName) {
    const prevLower = prevName.toLowerCase();
    for (const r of next.realms || []) {
      if ((r.culture || '').trim().toLowerCase() === prevLower) r.culture = nextName;
    }
    for (const c of next.counties || []) {
      if ((c.culture || '').trim().toLowerCase() === prevLower) c.culture = nextName;
    }
    for (const b of next.burgs || []) {
      if ((b.culture || '').trim().toLowerCase() === prevLower) b.culture = nextName;
    }
    for (const lore of next.loreEntities || []) {
      if (lore.tags) {
        lore.tags = lore.tags.map((t) => (t.toLowerCase() === prevLower ? nextName : t));
      }
      if (culture && lore.id === `lore_${culture.id}`) {
        lore.name = nextName;
      }
    }
  }

  next.paintRevision = (next.paintRevision || 0) + 1;
  return next;
}

export interface ReligionEditPatch {
  name?: string;
  deity?: string;
  clergyTitle?: string;
  symbol?: string;
  color?: string;
}

export function updateReligion(
  world: WorldState,
  religionNameOrId: string,
  patch: ReligionEditPatch
): WorldState {
  const next = cloneWorldState(world);
  const cleanOld = religionNameOrId.trim();
  if (!cleanOld) return next;
  const oldLower = cleanOld.toLowerCase();
  const religion = (next.religions || []).find(
    (r) => r.id === cleanOld || r.name.trim().toLowerCase() === oldLower
  );
  const prevName = religion?.name || cleanOld;
  const nextName = patch.name !== undefined && patch.name.trim() ? patch.name.trim() : prevName;

  if (religion) {
    religion.name = nextName;
    if (patch.deity !== undefined && patch.deity.trim()) religion.deity = patch.deity.trim();
    if (patch.clergyTitle !== undefined && patch.clergyTitle.trim()) religion.clergyTitle = patch.clergyTitle.trim();
    if (patch.symbol !== undefined && patch.symbol.trim()) religion.symbol = patch.symbol.trim();
    if (patch.color !== undefined) religion.color = patch.color;
  }

  if (nextName !== prevName) {
    const prevLower = prevName.toLowerCase();
    for (const r of next.realms || []) {
      if ((r.religion || '').trim().toLowerCase() === prevLower) r.religion = nextName;
    }
    for (const c of next.counties || []) {
      if ((c.religion || '').trim().toLowerCase() === prevLower) c.religion = nextName;
    }
    for (const lore of next.loreEntities || []) {
      if (lore.tags) {
        lore.tags = lore.tags.map((t) => (t.toLowerCase() === prevLower ? nextName : t));
      }
      if (religion && lore.id === `lore_${religion.id}`) {
        lore.name = nextName;
      }
    }
  }

  next.paintRevision = (next.paintRevision || 0) + 1;
  return next;
}

export function updateArmy(
  world: WorldState,
  armyId: string,
  patch: { name?: string; commanderName?: string }
): WorldState {
  const next = cloneWorldState(world);
  const army = (next.armies || []).find((a) => a.id === armyId);
  if (!army) return next;
  if (patch.name !== undefined) {
    army.name = patch.name.trim() || undefined;
  }
  if (patch.commanderName !== undefined && patch.commanderName.trim()) {
    army.commanderName = patch.commanderName.trim();
  }
  next.paintRevision = (next.paintRevision || 0) + 1;
  return next;
}

export function renameMapPin(
  world: WorldState,
  pinId: string,
  label: string
): WorldState {
  const next = cloneWorldState(world);
  const pin = (next.mapPins || []).find((p) => p.id === pinId);
  if (!pin) return next;
  pin.label = label;
  next.paintRevision = (next.paintRevision || 0) + 1;
  return next;
}
