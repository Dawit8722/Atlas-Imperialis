import { globalModRegistry } from './registryManager';
import { V17_TRAIT_DB, V17TraitDef } from '../v17TraitDB';
import { COMMODITIES, PRODUCTION_RECIPES, ExtendedCommodityMeta } from '../economyEngine';
import { ProductionRecipe } from '../../types/economy';
import { CULTURE_PRESETS, RELIGION_PRESETS } from '../fantasyTables';
import { REGIMENT_DEFINITIONS } from '../warfareEngine';
import { BATTLE_TACTICS, BattleTacticDefinition } from '../battleStrategy';
import { POLITICAL_REFORM_CATALOG } from '../governanceEngine';
import { RegimentDefinition } from '../../types/warfare';

let hasSeededVanilla = false;

export type ModdableTraitEntry = V17TraitDef & { id: string };
export type ModdableCommodityEntry = ExtendedCommodityMeta & { id: string };
export type ModdableRecipeEntry = ProductionRecipe & { id: string };
export type ModdableCultureEntry = (typeof CULTURE_PRESETS)[number] & { id: string };
export type ModdableReligionEntry = (typeof RELIGION_PRESETS)[number] & { id: string };
export type ModdableUnitEntry = RegimentDefinition & { id: string };
export type ModdableTacticEntry = BattleTacticDefinition & { id: string };

/**
 * Seeds globalModRegistry with all built-in Vanilla Core tables so user mods can
 * safely "add", "patch", or "replace" any entry by id. Safe to call multiple times.
 */
export function seedVanillaModRegistries(force = false): void {
  if (hasSeededVanilla && !force) return;

  // 1. Traits
  const traitEntries: ModdableTraitEntry[] = Object.values(V17_TRAIT_DB).map((def) => ({
    ...def,
    id: def.name,
  }));
  globalModRegistry.getRegistry<ModdableTraitEntry>('traits').seedVanilla(traitEntries);

  // 2. Commodities (52-commodity catalog)
  const commodityEntries: ModdableCommodityEntry[] = Object.entries(COMMODITIES).map(([key, meta]) => ({
    ...meta,
    id: key,
  }));
  globalModRegistry.getRegistry<ModdableCommodityEntry>('commodities').seedVanilla(commodityEntries);

  // 3. Production Recipes (26 interdependent chains)
  const recipeEntries: ModdableRecipeEntry[] = Object.entries(PRODUCTION_RECIPES).map(([key, rec]) => ({
    ...rec,
    id: key,
  }));
  globalModRegistry.getRegistry<ModdableRecipeEntry>('recipes').seedVanilla(recipeEntries);

  // 4. Culture Presets
  const cultureEntries: ModdableCultureEntry[] = CULTURE_PRESETS.map((c) => ({
    ...c,
    id: c.name,
  }));
  globalModRegistry.getRegistry<ModdableCultureEntry>('cultures').seedVanilla(cultureEntries);

  // 5. Religion Presets
  const religionEntries: ModdableReligionEntry[] = RELIGION_PRESETS.map((r) => ({
    ...r,
    id: r.name,
  }));
  globalModRegistry.getRegistry<ModdableReligionEntry>('religions').seedVanilla(religionEntries);

  // 6. Military Unit Regiments
  const unitEntries: ModdableUnitEntry[] = Object.entries(REGIMENT_DEFINITIONS).map(([key, def]) => ({
    ...def,
    id: key,
  }));
  globalModRegistry.getRegistry<ModdableUnitEntry>('units').seedVanilla(unitEntries);

  // 7. Battle Tactics
  const tacticEntries: ModdableTacticEntry[] = Object.values(BATTLE_TACTICS).map((def) => ({
    ...def,
  }));
  globalModRegistry.getRegistry<ModdableTacticEntry>('tactics').seedVanilla(tacticEntries);

  // 8. Political Reforms
  globalModRegistry.getRegistry('reforms').seedVanilla(
    POLITICAL_REFORM_CATALOG.map((ref) => ({
      ...ref,
      id: String(ref.key),
    }))
  );

  hasSeededVanilla = true;
}
