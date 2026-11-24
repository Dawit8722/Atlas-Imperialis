import type { Burg, Character, County, Realm, WorldCell } from '../types/world';

export type SelectionFocus = 'realm' | 'duchy' | 'county' | 'burg' | 'character';

export interface SelectedTerritoryMask {
  kind: 'realm' | 'duchy' | 'county' | 'barony';
  label: string;
  cellSet: Set<number>;
  strokeColor: string;
  fillColor: string;
}

interface ResolveTerritoryParams {
  selectionFocus?: SelectionFocus;
  selectedCountyId?: string;
  selectedBurgId?: string;
  selectedCharacterId?: string;
  counties: County[];
  burgs: Burg[];
  characters?: Character[];
  cells: WorldCell[];
}

const TERRITORY_STYLES: Record<
  SelectedTerritoryMask['kind'],
  { strokeColor: string; fillColor: string }
> = {
  realm: {
    strokeColor: '#f59e0b',
    fillColor: 'rgba(245, 158, 11, 0.08)',
  },
  duchy: {
    strokeColor: '#d99b1e',
    fillColor: 'rgba(234, 179, 8, 0.05)',
  },
  county: {
    strokeColor: '#e5a928',
    fillColor: 'rgba(234, 179, 8, 0.06)',
  },
  barony: {
    strokeColor: '#e5a928',
    fillColor: 'rgba(234, 179, 8, 0.06)',
  },
};

function addBurgCells(burg: Burg, cells: WorldCell[], out: Set<number>): void {
  if (burg.cellIndices && burg.cellIndices.length > 0) {
    for (const idx of burg.cellIndices) out.add(idx);
  }
  if (burg.cellIndex !== undefined) {
    out.add(burg.cellIndex);
  }
  for (let r = 0; r < cells.length; r++) {
    if (cells[r]?.burgId === burg.id) {
      out.add(r);
    }
  }
}

function addCountyCells(
  matchingCountyIds: Set<string>,
  counties: County[],
  burgs: Burg[],
  cells: WorldCell[],
  out: Set<number>
): void {
  for (const c of counties) {
    if (!matchingCountyIds.has(c.id)) continue;
    for (const idx of c.cellIndices || []) {
      out.add(idx);
    }
  }
  for (let r = 0; r < cells.length; r++) {
    const cid = cells[r]?.countyId;
    if (cid && matchingCountyIds.has(cid)) {
      out.add(r);
    }
  }
  for (const b of burgs) {
    if (b.countyId && matchingCountyIds.has(b.countyId)) {
      if (b.cellIndex !== undefined) out.add(b.cellIndex);
      for (const idx of b.cellIndices || []) out.add(idx);
    }
  }
}

function collectSubordinateLordIds(rootChar: Character, characters: Character[]): Set<string> {
  const result = new Set<string>([rootChar.id]);
  const queue: string[] = [rootChar.id];
  const byId = new Map<string, Character>(characters.map((c) => [c.id, c]));

  while (queue.length > 0) {
    const curId = queue.shift()!;
    const cur = byId.get(curId);
    if (cur?.vassalIds) {
      for (const vId of cur.vassalIds) {
        if (!result.has(vId)) {
          result.add(vId);
          queue.push(vId);
        }
      }
    }
    for (const ch of characters) {
      if (ch.liegeId === curId && !result.has(ch.id)) {
        result.add(ch.id);
        queue.push(ch.id);
      }
    }
  }
  return result;
}

function resolveCountyOrDuchyMask(
  selCounty: County,
  counties: County[],
  burgs: Burg[],
  characters: Character[],
  cells: WorldCell[],
  expandDuchy: boolean = true
): SelectedTerritoryMask | null {
  const isDuchy = expandDuchy && (selCounty.tier === 'Duchy' || selCounty.name.includes('Duchy'));
  const matchingCountyIds = new Set<string>([selCounty.id]);

  if (isDuchy) {
    if (selCounty.duchyId) {
      for (const c of counties) {
        if (c.duchyId === selCounty.duchyId) {
          matchingCountyIds.add(c.id);
        }
      }
    } else if (selCounty.rulerId) {
      const ruler = characters.find((c) => c.id === selCounty.rulerId);
      if (ruler && (ruler.titleTier === 'Duke' || ruler.role === 'Vassal Duke')) {
        const lords = collectSubordinateLordIds(ruler, characters);
        for (const c of counties) {
          if (c.rulerId && lords.has(c.rulerId) && !c.duchyId) {
            matchingCountyIds.add(c.id);
          }
        }
      }
    }
  }

  const cellSet = new Set<number>();
  addCountyCells(matchingCountyIds, counties, burgs, cells, cellSet);
  if (cellSet.size === 0) return null;

  const kind: SelectedTerritoryMask['kind'] = isDuchy ? 'duchy' : 'county';
  return {
    kind,
    label: selCounty.name,
    cellSet,
    ...TERRITORY_STYLES[kind],
  };
}

function resolveBaronyMask(selBurg: Burg, cells: WorldCell[]): SelectedTerritoryMask | null {
  const cellSet = new Set<number>();
  addBurgCells(selBurg, cells, cellSet);
  if (cellSet.size === 0) return null;

  return {
    kind: 'barony',
    label: selBurg.name,
    cellSet,
    ...TERRITORY_STYLES.barony,
  };
}

function resolveCharacterMask(
  selChar: Character,
  counties: County[],
  burgs: Burg[],
  characters: Character[],
  cells: WorldCell[]
): SelectedTerritoryMask | null {
  // Monarchs rule the entire state, which is highlighted at the realm level
  if (
    selChar.role === 'Monarch' ||
    selChar.titleTier === 'King' ||
    selChar.titleTier === 'Emperor'
  ) {
    return null;
  }

  const isDuke = selChar.titleTier === 'Duke' || selChar.role === 'Vassal Duke';
  const isCount = selChar.titleTier === 'Count' || selChar.role === 'Vassal Count';

  const lordIds = collectSubordinateLordIds(selChar, characters);
  const directCounties = counties.filter((c) => c.rulerId === selChar.id);
  const duchyIds = new Set<string>();

  for (const c of directCounties) {
    if (c.duchyId && (c.tier === 'Duchy' || c.name.includes('Duchy') || isDuke)) {
      duchyIds.add(c.duchyId);
    }
  }
  if (isDuke && selChar.countyId) {
    const homeCounty = counties.find((c) => c.id === selChar.countyId);
    if (homeCounty?.duchyId) duchyIds.add(homeCounty.duchyId);
  }

  const matchedCountyIds = new Set<string>();
  for (const c of counties) {
    if (c.rulerId && lordIds.has(c.rulerId)) {
      matchedCountyIds.add(c.id);
    } else if (c.duchyId && duchyIds.has(c.duchyId)) {
      matchedCountyIds.add(c.id);
    }
  }

  if (matchedCountyIds.size === 0 && (isDuke || isCount) && selChar.countyId) {
    matchedCountyIds.add(selChar.countyId);
  }

  const cellSet = new Set<number>();
  if (matchedCountyIds.size > 0) {
    addCountyCells(matchedCountyIds, counties, burgs, cells, cellSet);
  }

  for (const b of burgs) {
    if (b.ownerId && lordIds.has(b.ownerId)) {
      addBurgCells(b, cells, cellSet);
    }
  }

  if (cellSet.size === 0) return null;

  const kind: SelectedTerritoryMask['kind'] =
    isDuke || duchyIds.size > 0
      ? 'duchy'
      : isCount || matchedCountyIds.size > 0
      ? 'county'
      : 'barony';

  return {
    kind,
    label: selChar.name,
    cellSet,
    ...TERRITORY_STYLES[kind],
  };
}

export function resolveSelectedTerritoryMask(
  params: ResolveTerritoryParams
): SelectedTerritoryMask | null {
  const {
    selectionFocus,
    selectedCountyId,
    selectedBurgId,
    selectedCharacterId,
    counties,
    burgs,
    characters = [],
    cells,
  } = params;

  if (selectionFocus === 'realm') {
    return null;
  }

  if (selectionFocus === 'burg' || (!selectionFocus && selectedBurgId)) {
    const selBurg = burgs.find((b) => b.id === selectedBurgId);
    // Settlements are emphasized via the amber-gold circle ring rather than a 1-cell polygon;
    // keep the parent County outline active around the settlement.
    if (selBurg?.countyId) {
      const parentCounty = counties.find((c) => c.id === selBurg.countyId);
      if (parentCounty) {
        return resolveCountyOrDuchyMask(parentCounty, counties, burgs, characters, cells, false);
      }
    }
    return null;
  }

  if (selectionFocus === 'duchy') {
    const selCounty = counties.find((c) => c.id === selectedCountyId);
    if (selCounty) {
      return resolveCountyOrDuchyMask(selCounty, counties, burgs, characters, cells, true);
    }
  }

  if (selectionFocus === 'county' || (!selectionFocus && selectedCountyId)) {
    const selCounty = counties.find((c) => c.id === selectedCountyId);
    if (selCounty) {
      // Strictly select ONLY this single county (never re-expand a duchy seat into the whole duchy)
      return resolveCountyOrDuchyMask(selCounty, counties, burgs, characters, cells, false);
    }
  }

  if (selectionFocus === 'character' || (!selectionFocus && selectedCharacterId)) {
    const selChar = characters.find((c) => c.id === selectedCharacterId);
    if (selChar) {
      return resolveCharacterMask(selChar, counties, burgs, characters, cells);
    }
  }

  return null;
}

export function resolveHoveredTerritoryMask(params: {
  hoveredCell: WorldCell | null;
  hoveredBurg: Burg | null;
  zoom: number;
  seaLevel: number;
  counties: County[];
  burgs: Burg[];
  realms?: Realm[];
  characters?: Character[];
  cells: WorldCell[];
  activeSelectionMask?: SelectedTerritoryMask | null;
}): SelectedTerritoryMask | null {
  const {
    hoveredCell,
    hoveredBurg,
    zoom,
    seaLevel,
    counties,
    burgs,
    realms = [],
    characters = [],
    cells,
    activeSelectionMask,
  } = params;

  // Resolve cell from hoveredCell or hoveredBurg (no 1-cell settlement polygons)
  const targetCell =
    hoveredCell && hoveredCell.elevation >= seaLevel
      ? hoveredCell
      : hoveredBurg && hoveredBurg.cellIndex !== undefined
      ? cells[hoveredBurg.cellIndex]
      : null;

  if (!targetCell || targetCell.elevation < seaLevel) return null;

  // Tier 0 (Zoomed-Out State View < 1.25x): highlight the entire State / Realm so players can select states cleanly
  if (zoom < 1.25 && targetCell.realmId) {
    const realmSet = new Set<number>();
    for (let r = 0; r < cells.length; r++) {
      if (cells[r]?.realmId === targetCell.realmId && cells[r].elevation >= seaLevel) {
        realmSet.add(r);
      }
    }
    if (realmSet.size > 0) {
      const realm = realms.find((rm) => rm.id === targetCell.realmId);
      return {
        kind: 'realm',
        label: realm?.name || 'State',
        cellSet: realmSet,
        ...TERRITORY_STYLES.realm,
      };
    }
  }

  if (!targetCell.countyId) return null;

  const cellCounty = counties.find((c) => c.id === targetCell.countyId);
  if (!cellCounty) return null;

  // If hovering a County INSIDE an already-selected Duchy, drill down and highlight ONLY that County
  const hoveringInsideSelectedDuchy = Boolean(
    activeSelectionMask &&
      activeSelectionMask.kind === 'duchy' &&
      activeSelectionMask.cellSet.has(targetCell.index)
  );

  // Tier 1 (Meso 1.25x–1.9x): highlight Duchy unless drilling down inside a selected Duchy
  if (zoom < 1.9 && !hoveringInsideSelectedDuchy) {
    let duchyCounty: County | undefined =
      cellCounty.tier === 'Duchy' || cellCounty.name.includes('Duchy') ? cellCounty : undefined;
    if (!duchyCounty && cellCounty.duchyId) {
      duchyCounty = counties.find(
        (c) => (c.tier === 'Duchy' || c.name.includes('Duchy')) && c.duchyId === cellCounty.duchyId
      );
    }
    if (duchyCounty) {
      return resolveCountyOrDuchyMask(duchyCounty, counties, burgs, characters, cells, true);
    }
  }

  // Tier 2/3 or drill-down inside a selected Duchy: highlight ONLY the exact County
  const cellSet = new Set<number>();
  addCountyCells(new Set([cellCounty.id]), counties, burgs, cells, cellSet);
  if (cellSet.size === 0) return null;

  return {
    kind: 'county',
    label: cellCounty.name,
    cellSet,
    ...TERRITORY_STYLES.county,
  };
}

