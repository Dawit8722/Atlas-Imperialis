import React, { useState } from 'react';
import { ModManifest, RegistryPatchEntry } from '../../engine/modSystem/types';
import { Sparkles, Coins, Globe2, Shield, Save, X } from 'lucide-react';

interface ModStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingMods: ModManifest[];
  onSaveModPack: (manifest: ModManifest) => Promise<void>;
}

type StudioTab = 'trait' | 'commodity' | 'culture' | 'unit';

export const ModStudioModal: React.FC<ModStudioModalProps> = ({
  isOpen,
  onClose,
  existingMods,
  onSaveModPack,
}) => {
  const [tab, setTab] = useState<StudioTab>('trait');
  const [packId, setPackId] = useState(
    existingMods[0]?.id || `studio_pack_${Date.now().toString(36)}`
  );
  const [packName, setPackName] = useState(existingMods[0]?.name || 'Custom Worldsmith Pack');
  const [packAuthor, setPackAuthor] = useState(existingMods[0]?.author || 'Worldsmith');

  // 1. Trait Designer State
  const [traitName, setTraitName] = useState('Star Navigator');
  const [traitCategory, setTraitCategory] = useState<'MENTAL' | 'PHYSICAL' | 'BEHAVIORAL' | 'COMMANDER' | 'CONGENITAL' | 'LIFE_EXPERIENCE'>('MENTAL');
  const [traitDip, setTraitDip] = useState(1);
  const [traitMar, setTraitMar] = useState(0);
  const [traitSte, setTraitSte] = useState(2);
  const [traitInt, setTraitInt] = useState(0);
  const [traitLea, setTraitLea] = useState(2);
  const [traitHookName, setTraitHookName] = useState<'TRADE_INCOME' | 'ARMY_DAMAGE' | 'FERTILITY' | 'HEALTH' | 'SCHEME_POWER'>('TRADE_INCOME');
  const [traitHookMult, setTraitHookMult] = useState(1.15);
  const [traitOpposites, setTraitOpposites] = useState('');

  // 2. Commodity & Recipe State
  const [commName, setCommName] = useState('Aether Glass');
  const [commCategory, setCommCategory] = useState<'LUXURY' | 'MANUFACTURED' | 'RAW_MATERIAL' | 'ESSENTIAL_FOOD'>('LUXURY');
  const [commPrice, setCommPrice] = useState(65);
  const [commGeography, setCommGeography] = useState('Highlands/Mountains');
  const [recipeInput1, setRecipeInput1] = useState('Glassware');
  const [recipeAmt1, setRecipeAmt1] = useState(1.0);
  const [recipeInput2, setRecipeInput2] = useState('Alchemical Mercury');
  const [recipeAmt2, setRecipeAmt2] = useState(0.4);
  const [recipeYield, setRecipeYield] = useState(0.8);

  // 3. Culture & Language State
  const [cultName, setCultName] = useState('Aurelian Starfarers');
  const [cultEthos, setCultEthos] = useState('Cosmopolitan & Astral');
  const [cultHeritage, setCultHeritage] = useState('Highland Observers');
  const [cultMartial, setCultMartial] = useState('Sunlance Hussars & Astrolabe Navigators');
  const [cultLang, setCultLang] = useState('High Aurelian');
  const [cultColor, setCultColor] = useState('#0ea5e9');
  const [cultMaleNames, setCultMaleNames] = useState('Caelum, Orion, Lysander, Solon, Lucian');
  const [cultFemaleNames, setCultFemaleNames] = useState('Lyra, Selene, Astraea, Celeste, Aurelia');
  const [cultHouses, setCultHouses] = useState('Starcrest, Solborn, Vespera, Dawnspire');
  const [cultMottos, setCultMottos] = useState('Guided by the Unfading Light, Beyond the Horizon');

  // 4. Unit Class State
  const [unitName, setUnitName] = useState('Sunlance Guard');
  const [unitAtk, setUnitAtk] = useState(18);
  const [unitDef, setUnitDef] = useState(14);
  const [unitIsCav, setUnitIsCav] = useState(true);
  const [unitIsRanged, setUnitIsRanged] = useState(false);
  const [unitIsSiege, setUnitIsSiege] = useState(false);
  const [unitPlainsAff, setUnitPlainsAff] = useState(1.25);
  const [unitMountainsAff, setUnitMountainsAff] = useState(0.85);
  const [unitRecruitCost, setUnitRecruitCost] = useState(55);
  const [unitUpkeep, setUnitUpkeep] = useState(4.5);

  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const parseCsv = (raw: string) =>
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const handleSave = async () => {
    const cleanPackId =
      packId.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || `studio_pack_${Date.now().toString(36)}`;
    const existing = existingMods.find((m) => m.id === cleanPackId);

    const baseManifest: ModManifest = existing
      ? {
          ...existing,
          name: packName.trim() || existing.name,
          author: packAuthor.trim() || existing.author,
          enabled: true,
          entries: { ...(existing.entries || {}) },
        }
      : {
          id: cleanPackId,
          name: packName.trim() || 'Custom Worldsmith Pack',
          version: '1.0.0',
          author: packAuthor.trim() || 'Worldsmith',
          description: 'Created in RealmSmith No-Code Mod Studio.',
          enabled: true,
          loadOrder: existingMods.length + 1,
          entries: {},
        };

    const upsert = (
      domain: keyof NonNullable<ModManifest['entries']>,
      entry: RegistryPatchEntry
    ) => {
      const list = [...(baseManifest.entries?.[domain] || [])];
      const idx = list.findIndex((e) => e.id === entry.id);
      if (idx >= 0) list[idx] = entry;
      else list.push(entry);
      baseManifest.entries = { ...(baseManifest.entries || {}), [domain]: list };
    };

    if (tab === 'trait') {
      const id = traitName.trim();
      if (!id) return;
      upsert('traits', {
        id,
        op: 'replace',
        data: {
          name: id,
          category: traitCategory,
          rarity: 'UNCOMMON',
          source: 'LIFE_EVENT',
          stats: {
            DIPLOMACY: Number((traitDip * 0.04).toFixed(2)),
            MARTIAL: Number((traitMar * 0.04).toFixed(2)),
            STEWARDSHIP: Number((traitSte * 0.04).toFixed(2)),
            INTRIGUE: Number((traitInt * 0.04).toFixed(2)),
            LEARNING: Number((traitLea * 0.04).toFixed(2)),
          },
          hooks: { [traitHookName]: traitHookMult },
          opposites: parseCsv(traitOpposites),
          disposition: { amb_mult: 1.0, loy_mult: 1.0, par_mult: 1.0, con_mult: 1.0 },
          aiWeights: {},
        },
      });
    } else if (tab === 'commodity') {
      const id = commName.trim();
      if (!id) return;
      upsert('commodities', {
        id,
        op: 'replace',
        data: {
          commodity: id,
          category: commCategory,
          geography: commGeography,
          purpose: commCategory === 'LUXURY' ? 'Luxury & Prestige' : 'Manufactured & Textile',
          accessibility: 'Regional',
          durability: 'Semi-durable',
          basePrice: commPrice,
          defaultElasticity: 0.9,
          spoilageRate: 0.005,
          transportWeight: 1.0,
          essentialTier: commCategory === 'LUXURY' ? 3 : 2,
          priceFloor: Math.max(2, Math.round(commPrice * 0.25)),
          priceCeiling: Math.round(commPrice * 5),
        },
      });
      const inputs: Array<{ commodity: string; amount: number }> = [];
      if (recipeInput1.trim()) inputs.push({ commodity: recipeInput1.trim(), amount: recipeAmt1 });
      if (recipeInput2.trim()) inputs.push({ commodity: recipeInput2.trim(), amount: recipeAmt2 });
      if (inputs.length > 0) {
        upsert('recipes', {
          id,
          op: 'replace',
          data: {
            outputGood: id,
            inputs,
            baseYield: recipeYield,
            description: `Custom Mod Studio workshop recipe refining ${inputs.map((i) => i.commodity).join(' + ')} into ${id}.`,
          },
        });
      }
    } else if (tab === 'culture') {
      const id = cultName.trim();
      if (!id) return;
      upsert('cultures', {
        id,
        op: 'replace',
        data: {
          name: id,
          ethos: cultEthos.trim() || 'Stoic & Proud',
          heritage: cultHeritage.trim() || 'Ancient Lineage',
          martialTradition: cultMartial.trim() || 'Combined Arms',
          languageGroup: cultLang.trim() || id,
          color: cultColor,
          firstNamesMale: parseCsv(cultMaleNames),
          firstNamesFemale: parseCsv(cultFemaleNames),
          houseNames: parseCsv(cultHouses),
          mottos: parseCsv(cultMottos),
        },
      });
    } else if (tab === 'unit') {
      const id = unitName.trim();
      if (!id) return;
      upsert('units', {
        id,
        op: 'replace',
        data: {
          category: id,
          baseAttack: unitAtk,
          baseDefense: unitDef,
          isCavalry: unitIsCav,
          isRanged: unitIsRanged,
          isSiege: unitIsSiege,
          strongAgainst: unitIsCav ? ['Ranged', 'Infantry'] : ['Cavalry'],
          vulnerableTo: unitIsCav ? ['Spear'] : ['Cavalry'],
          terrainAffinities: { Plains: unitPlainsAff, Mountains: unitMountainsAff },
          defaultPlaceholder: `{realm} ${id}`,
          description: `Custom Mod Studio regiment class (${id}).`,
          recruitmentCost: unitRecruitCost,
          recruitCostPer100: unitRecruitCost,
          upkeepGold: unitUpkeep,
          upkeepGoldPer100: unitUpkeep,
          siegeProgressPerMonth: unitIsSiege ? 8 : 2,
        },
      });
    }

    setIsSaving(true);
    try {
      await onSaveModPack(baseManifest);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 no-print">
      <div className="w-full max-w-2xl bg-stone-950 border border-stone-800 rounded-xl shadow-2xl text-stone-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-800 bg-stone-900/70">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-serif font-semibold text-amber-300">
              No-Code Mod Studio
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target Mod Pack Header */}
        <div className="px-5 py-3 bg-stone-900/40 border-b border-stone-800 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-stone-400">Pack Name</span>
            <input
              value={packName}
              onChange={(e) => setPackName(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded bg-stone-950 border border-stone-800 text-stone-100"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-stone-400">Pack ID</span>
            <input
              value={packId}
              onChange={(e) => setPackId(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded bg-stone-950 border border-stone-800 font-mono text-stone-300"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-stone-400">Author</span>
            <input
              value={packAuthor}
              onChange={(e) => setPackAuthor(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded bg-stone-950 border border-stone-800 text-stone-100"
            />
          </label>
        </div>

        {/* Designer Tabs */}
        <div className="flex border-b border-stone-800 bg-stone-950 px-4 pt-2 gap-1 text-xs">
          {[
            { id: 'trait' as StudioTab, label: 'Trait', icon: Sparkles },
            { id: 'commodity' as StudioTab, label: 'Commodity & Recipe', icon: Coins },
            { id: 'culture' as StudioTab, label: 'Culture & Language', icon: Globe2 },
            { id: 'unit' as StudioTab, label: 'Unit Class', icon: Shield },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg border-b-2 transition-colors cursor-pointer ${
                  tab === t.id
                    ? 'border-amber-500 text-amber-300 bg-stone-900/70 font-semibold'
                    : 'border-transparent text-stone-400 hover:text-stone-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Designer Form Body */}
        <div className="p-5 max-h-[55vh] overflow-y-auto space-y-3 text-xs">
          {tab === 'trait' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-stone-400">Trait Name</span>
                  <input
                    value={traitName}
                    onChange={(e) => setTraitName(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-stone-900 border border-stone-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-stone-400">Category</span>
                  <select
                    value={traitCategory}
                    onChange={(e) => setTraitCategory(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded bg-stone-900 border border-stone-800"
                  >
                    <option value="MENTAL">Mental</option>
                    <option value="PHYSICAL">Physical</option>
                    <option value="BEHAVIORAL">Behavioral</option>
                    <option value="COMMANDER">Commander</option>
                    <option value="CONGENITAL">Congenital</option>
                    <option value="LIFE_EXPERIENCE">Life Experience</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { label: 'Dip', val: traitDip, set: setTraitDip },
                  { label: 'Mar', val: traitMar, set: setTraitMar },
                  { label: 'Ste', val: traitSte, set: setTraitSte },
                  { label: 'Int', val: traitInt, set: setTraitInt },
                  { label: 'Lea', val: traitLea, set: setTraitLea },
                ].map((s) => (
                  <label key={s.label} className="space-y-1">
                    <span className="text-stone-400 flex justify-between">
                      <span>{s.label}</span>
                      <span className="font-mono text-amber-300">{s.val > 0 ? `+${s.val}` : s.val}</span>
                    </span>
                    <input
                      type="range"
                      min={-5}
                      max={5}
                      value={s.val}
                      onChange={(e) => s.set(Number(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-stone-400">System Hook</span>
                  <select
                    value={traitHookName}
                    onChange={(e) => setTraitHookName(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded bg-stone-900 border border-stone-800"
                  >
                    <option value="TRADE_INCOME">Trade Income</option>
                    <option value="ARMY_DAMAGE">Army Damage</option>
                    <option value="FERTILITY">Fertility</option>
                    <option value="HEALTH">Health</option>
                    <option value="SCHEME_POWER">Scheme Power</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-stone-400">Hook Multiplier ({traitHookMult.toFixed(2)}×)</span>
                  <input
                    type="range"
                    min={0.5}
                    max={1.6}
                    step={0.05}
                    value={traitHookMult}
                    onChange={(e) => setTraitHookMult(Number(e.target.value))}
                    className="w-full accent-amber-500 mt-2"
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-stone-400">Opposite Traits (comma-separated)</span>
                <input
                  value={traitOpposites}
                  onChange={(e) => setTraitOpposites(e.target.value)}
                  placeholder="e.g. Craven, Slothful"
                  className="w-full px-2.5 py-1.5 rounded bg-stone-900 border border-stone-800"
                />
              </label>
            </>
          )}

          {tab === 'commodity' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-stone-400">Commodity Name</span>
                  <input
                    value={commName}
                    onChange={(e) => setCommName(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-stone-900 border border-stone-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-stone-400">Category</span>
                  <select
                    value={commCategory}
                    onChange={(e) => setCommCategory(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded bg-stone-900 border border-stone-800"
                  >
                    <option value="LUXURY">Luxury</option>
                    <option value="MANUFACTURED">Manufactured</option>
                    <option value="RAW_MATERIAL">Raw Material</option>
                    <option value="ESSENTIAL_FOOD">Essential Food</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-stone-400">Base Price (Gold)</span>
                  <input
                    type="number"
                    min={2}
                    max={500}
                    value={commPrice}
                    onChange={(e) => setCommPrice(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded bg-stone-900 border border-stone-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-stone-400">Geography</span>
                  <input
                    value={commGeography}
                    onChange={(e) => setCommGeography(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-stone-900 border border-stone-800"
                  />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-stone-800">
                <label className="space-y-1">
                  <span className="text-stone-400">Recipe Input 1</span>
                  <input
                    value={recipeInput1}
                    onChange={(e) => setRecipeInput1(e.target.value)}
                    className="w-full px-2 py-1.5 rounded bg-stone-900 border border-stone-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-stone-400">Input 2</span>
                  <input
                    value={recipeInput2}
                    onChange={(e) => setRecipeInput2(e.target.value)}
                    className="w-full px-2 py-1.5 rounded bg-stone-900 border border-stone-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-stone-400">Base Yield</span>
                  <input
                    type="number"
                    step={0.1}
                    min={0.1}
                    max={5}
                    value={recipeYield}
                    onChange={(e) => setRecipeYield(Number(e.target.value))}
                    className="w-full px-2 py-1.5 rounded bg-stone-900 border border-stone-800"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-stone-400">Input 1 Amount</span>
                  <input
                    type="number"
                    step={0.1}
                    min={0.1}
                    value={recipeAmt1}
                    onChange={(e) => setRecipeAmt1(Number(e.target.value))}
                    className="w-full px-2 py-1.5 rounded bg-stone-900 border border-stone-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-stone-400">Input 2 Amount</span>
                  <input
                    type="number"
                    step={0.1}
                    min={0.1}
                    value={recipeAmt2}
                    onChange={(e) => setRecipeAmt2(Number(e.target.value))}
                    className="w-full px-2 py-1.5 rounded bg-stone-900 border border-stone-800"
                  />
                </label>
              </div>
            </>
          )}

          {tab === 'culture' && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1 col-span-2">
                  <span className="text-stone-400">Culture Name</span>
                  <input
                    value={cultName}
                    onChange={(e) => setCultName(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-stone-900 border border-stone-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-stone-400">Map Color</span>
                  <input
                    type="color"
                    value={cultColor}
                    onChange={(e) => setCultColor(e.target.value)}
                    className="w-full h-8 rounded bg-stone-900 border border-stone-800 cursor-pointer"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-stone-400">Ethos</span>
                  <input
                    value={cultEthos}
                    onChange={(e) => setCultEthos(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-stone-900 border border-stone-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-stone-400">Language Group</span>
                  <input
                    value={cultLang}
                    onChange={(e) => setCultLang(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-stone-900 border border-stone-800"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-stone-400">Heritage</span>
                  <input
                    value={cultHeritage}
                    onChange={(e) => setCultHeritage(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-stone-900 border border-stone-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-stone-400">Martial Tradition</span>
                  <input
                    value={cultMartial}
                    onChange={(e) => setCultMartial(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-stone-900 border border-stone-800"
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-stone-400">Male Given Names (CSV)</span>
                <input
                  value={cultMaleNames}
                  onChange={(e) => setCultMaleNames(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-stone-900 border border-stone-800"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-stone-400">Female Given Names (CSV)</span>
                <input
                  value={cultFemaleNames}
                  onChange={(e) => setCultFemaleNames(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-stone-900 border border-stone-800"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-stone-400">Noble House Names (CSV)</span>
                  <input
                    value={cultHouses}
                    onChange={(e) => setCultHouses(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-stone-900 border border-stone-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-stone-400">House Mottos (CSV)</span>
                  <input
                    value={cultMottos}
                    onChange={(e) => setCultMottos(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-stone-900 border border-stone-800"
                  />
                </label>
              </div>
            </>
          )}

          {tab === 'unit' && (
            <>
              <label className="block space-y-1">
                <span className="text-stone-400">Unit Class Name / ID</span>
                <input
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-stone-900 border border-stone-800"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-stone-400">Base Attack ({unitAtk})</span>
                  <input
                    type="range"
                    min={2}
                    max={40}
                    value={unitAtk}
                    onChange={(e) => setUnitAtk(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-stone-400">Base Defense ({unitDef})</span>
                  <input
                    type="range"
                    min={2}
                    max={40}
                    value={unitDef}
                    onChange={(e) => setUnitDef(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </label>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={unitIsCav} onChange={(e) => setUnitIsCav(e.target.checked)} className="accent-amber-500" />
                  <span>Cavalry</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={unitIsRanged} onChange={(e) => setUnitIsRanged(e.target.checked)} className="accent-amber-500" />
                  <span>Ranged</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={unitIsSiege} onChange={(e) => setUnitIsSiege(e.target.checked)} className="accent-amber-500" />
                  <span>Siege Engine</span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-stone-400">Plains Affinity ({unitPlainsAff.toFixed(2)}×)</span>
                  <input
                    type="range"
                    min={0.5}
                    max={1.6}
                    step={0.05}
                    value={unitPlainsAff}
                    onChange={(e) => setUnitPlainsAff(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-stone-400">Mountains Affinity ({unitMountainsAff.toFixed(2)}×)</span>
                  <input
                    type="range"
                    min={0.5}
                    max={1.6}
                    step={0.05}
                    value={unitMountainsAff}
                    onChange={(e) => setUnitMountainsAff(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-stone-400">Recruit Cost (Gold / 100)</span>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={unitRecruitCost}
                    onChange={(e) => setUnitRecruitCost(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded bg-stone-900 border border-stone-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-stone-400">Monthly Upkeep (Gold / 100)</span>
                  <input
                    type="number"
                    step={0.5}
                    min={0.5}
                    max={50}
                    value={unitUpkeep}
                    onChange={(e) => setUnitUpkeep(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded bg-stone-900 border border-stone-800"
                  />
                </label>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-stone-800 bg-stone-900/50 flex items-center justify-end gap-2 text-xs">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-stone-950 font-semibold cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? 'Saving…' : 'Save to Mod Pack'}
          </button>
        </div>
      </div>
    </div>
  );
};
