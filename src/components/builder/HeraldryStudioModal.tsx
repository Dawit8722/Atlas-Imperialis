import React, { useEffect, useMemo, useState } from 'react';
import { X, Sparkles, Check, Shuffle, Wand2 } from 'lucide-react';
import {
  ALL_TINCTURES,
  BRISURE_ORDER,
  CHARGE_META,
  FURS,
  SHAPES,
  BaseShape,
  BrisureId,
  CadencyMethod,
  ChargeId,
  DivisionId,
  HeraldicFill,
  HeraldryConfig,
  LineStyle,
  OrdinaryId,
  TinctureName,
  generateHeraldry,
  parseBlazon,
  renderHeraldry,
} from '../../engine/heraldry';
import {
  cloneHeraldryConfig,
  configToCoatOfArmsData,
} from '../../utils/heraldryBridge';
import type { CoatOfArmsData, WorldState } from '../../types/world';
import { HeraldryShield } from '../HeraldryShield';

export interface HeraldryEditTarget {
  kind: 'realm' | 'county' | 'burg' | 'character' | 'house';
  id: string;
  label: string;
  initialCoatOfArms?: CoatOfArmsData;
}

interface HeraldryStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  world: WorldState;
  target: HeraldryEditTarget | null;
  onSaveCoatOfArms: (target: HeraldryEditTarget, nextArms: CoatOfArmsData) => void;
}

const DIVISIONS: DivisionId[] = [
  'plain',
  'per-pale',
  'per-fess',
  'per-bend',
  'per-bend-sinister',
  'per-chevron',
  'quarterly',
  'per-saltire',
  'gyronny',
  'paly',
  'barry',
  'bendy',
  'chequy',
  'lozengy',
  'seme-fleur',
  'seme-mullet',
  'crusilly',
];

const LINE_STYLES: LineStyle[] = [
  'plain',
  'wavy',
  'indented',
  'embattled',
  'engrailed',
  'invected',
];

const ORDINARIES: OrdinaryId[] = [
  'none',
  'chief',
  'fess',
  'pale',
  'cross',
  'saltire',
  'chevron',
  'bend',
  'bend-sinister',
  'bordure',
  'orle',
  'pile',
  'canton',
  'flaunches',
];

const TINCTURE_NAMES = Object.keys(ALL_TINCTURES) as TinctureName[];
const FUR_NAMES = Object.keys(FURS) as (keyof typeof FURS)[];
const ALL_FILLS: HeraldicFill[] = [...TINCTURE_NAMES, ...FUR_NAMES];
const SHAPE_IDS = Object.keys(SHAPES) as BaseShape[];
const CHARGE_IDS = Object.keys(CHARGE_META) as ChargeId[];

function resolveInitialConfig(target: HeraldryEditTarget | null, world: WorldState): HeraldryConfig {
  if (target?.initialCoatOfArms?.config) {
    return cloneHeraldryConfig(target.initialCoatOfArms.config);
  }
  if (target) {
    if (target.kind === 'realm') {
      const r = world.realms.find((rm) => rm.id === target.id);
      if (r?.heraldry?.config) return cloneHeraldryConfig(r.heraldry.config);
    } else if (target.kind === 'county') {
      const c = world.counties.find((ct) => ct.id === target.id);
      if (c?.coatOfArms?.config) return cloneHeraldryConfig(c.coatOfArms.config);
    } else if (target.kind === 'burg') {
      const b = world.burgs.find((bg) => bg.id === target.id);
      if (b?.coatOfArms?.config) return cloneHeraldryConfig(b.coatOfArms.config);
      const bCounty = b?.countyId ? world.counties.find((ct) => ct.id === b.countyId) : undefined;
      if (bCounty?.coatOfArms?.config) return cloneHeraldryConfig(bCounty.coatOfArms.config);
      const bRealm = b?.stateId ? world.realms.find((rm) => rm.id === b.stateId) : undefined;
      if (bRealm?.heraldry?.config) return cloneHeraldryConfig(bRealm.heraldry.config);
    } else if (target.kind === 'character') {
      const ch = world.characters.find((c) => c.id === target.id);
      if (ch?.coatOfArms?.config) return cloneHeraldryConfig(ch.coatOfArms.config);
    } else if (target.kind === 'house') {
      const ch = world.characters.find(
        (c) => (c.houseName || '').toLowerCase() === target.id.toLowerCase() && c.coatOfArms?.config
      );
      if (ch?.coatOfArms?.config) return cloneHeraldryConfig(ch.coatOfArms.config);
    }
  }
  return cloneHeraldryConfig(generateHeraldry(target?.label || 'RealmSmith').config);
}

export const HeraldryStudioModal: React.FC<HeraldryStudioModalProps> = ({
  isOpen,
  onClose,
  world,
  target,
  onSaveCoatOfArms,
}) => {
  const [config, setConfig] = useState<HeraldryConfig>(() => resolveInitialConfig(target, world));
  const [blazonInput, setBlazonInput] = useState('');
  const [parseFeedback, setParseFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const init = resolveInitialConfig(target, world);
    setConfig(init);
    setBlazonInput('');
    setParseFeedback(null);
  }, [isOpen, target?.id, target?.kind]);

  const previewResult = useMemo(() => renderHeraldry(config, { width: 180, height: 216 }), [config]);
  const previewCoa = useMemo(() => configToCoatOfArmsData(previewResult), [previewResult]);

  if (!isOpen || !target) return null;

  const updateField = (patch: Partial<HeraldryConfig['field']>) => {
    setConfig((prev) => ({
      ...prev,
      field: {
        ...prev.field,
        ...patch,
        secondary:
          (patch.division ?? prev.field.division) === 'plain'
            ? undefined
            : patch.secondary ?? prev.field.secondary ?? 'Or',
      },
    }));
  };

  const updateOrdinary = (patch: Partial<HeraldryConfig['ordinary']>) => {
    setConfig((prev) => ({
      ...prev,
      ordinary: {
        ...prev.ordinary,
        ...patch,
        tincture:
          (patch.type ?? prev.ordinary.type) === 'none'
            ? undefined
            : patch.tincture ?? prev.ordinary.tincture ?? 'Or',
      },
    }));
  };

  const handleParseBlazon = () => {
    const text = blazonInput.trim();
    if (!text) return;
    const parsed = parseBlazon(text, config.shape);
    setConfig(parsed);
    setParseFeedback('Parsed blazon grammar into shield geometry.');
  };

  const currentCadency = config.cadency?.[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[88vh] bg-stone-950 border border-stone-700/80 rounded-xl shadow-2xl flex flex-col overflow-hidden text-stone-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-800 bg-stone-900/90">
          <div className="flex items-center gap-2.5 min-w-0">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold tracking-wide text-amber-200 truncate">
                Heraldry &amp; Blazon Studio · {target.label}
              </h2>
              <p className="text-[11px] text-stone-400">
                Design field partitions, ordinaries, vector charges, cadency marks, or parse classic blazon text
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[280px_1fr] min-h-0 overflow-hidden">
          {/* Left Preview + Blazon */}
          <div className="border-b md:border-b-0 md:border-r border-stone-800 bg-stone-900/40 p-5 flex flex-col items-center gap-4 overflow-y-auto">
            <div className="p-4 rounded-xl bg-stone-950/90 border border-stone-800 flex items-center justify-center w-full">
              <HeraldryShield
                coatOfArms={previewCoa}
                shape={config.shape}
                width={176}
                height={212}
                showTooltip={false}
              />
            </div>

            <div className="w-full space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">
                Official Blazon
              </div>
              <div className="p-2.5 rounded-lg bg-stone-950 border border-stone-800 text-xs italic text-amber-200 leading-relaxed">
                {previewResult.blazon}
              </div>
            </div>

            <div className="w-full space-y-1.5">
              <label className="block text-[10px] uppercase tracking-wider text-stone-400 font-semibold">
                Parse From Blazon
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={blazonInput}
                  onChange={(e) => setBlazonInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleParseBlazon();
                  }}
                  placeholder="Azure, a lion rampant Or"
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-stone-950 border border-stone-700 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={handleParseBlazon}
                  className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-amber-600/25 border border-stone-700 text-amber-300 text-xs font-medium flex items-center gap-1 cursor-pointer shrink-0"
                  title="Parse Blazon Text"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  Parse
                </button>
              </div>
              {parseFeedback && (
                <p className="text-[10px] text-emerald-400">{parseFeedback}</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                const rand = generateHeraldry(`${target.id}_${Date.now()}`, { shape: config.shape });
                setConfig(rand.config);
                setParseFeedback(null);
              }}
              className="w-full py-1.5 px-3 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Shuffle className="w-3.5 h-3.5 text-amber-400" />
              Randomize Escutcheon
            </button>
          </div>

          {/* Right Form Controls */}
          <div className="p-5 overflow-y-auto space-y-5 text-xs">
            {/* 1. Escutcheon & Field */}
            <section className="space-y-3">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-amber-300 border-b border-stone-800 pb-1">
                1. Escutcheon &amp; Field Partition
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] text-stone-400 mb-1">Shield Shape ({SHAPE_IDS.length})</label>
                  <select
                    value={config.shape}
                    onChange={(e) => setConfig((p) => ({ ...p, shape: e.target.value as BaseShape }))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100"
                  >
                    {SHAPE_IDS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-stone-400 mb-1">Division ({DIVISIONS.length})</label>
                  <select
                    value={config.field.division}
                    onChange={(e) => updateField({ division: e.target.value as DivisionId })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100"
                  >
                    {DIVISIONS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-stone-400 mb-1">Partition Line</label>
                  <select
                    value={config.field.lineStyle}
                    onChange={(e) => updateField({ lineStyle: e.target.value as LineStyle })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100"
                  >
                    {LINE_STYLES.map((ls) => (
                      <option key={ls} value={ls}>{ls}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-stone-400 mb-1">Primary Tincture / Fur</label>
                  <select
                    value={config.field.primary}
                    onChange={(e) => updateField({ primary: e.target.value as HeraldicFill })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100"
                  >
                    {ALL_FILLS.map((fill) => (
                      <option key={fill} value={fill}>{fill}</option>
                    ))}
                  </select>
                </div>
                {config.field.division !== 'plain' && (
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Secondary Tincture / Fur</label>
                    <select
                      value={config.field.secondary || 'Or'}
                      onChange={(e) => updateField({ secondary: e.target.value as HeraldicFill })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100"
                    >
                      {ALL_FILLS.map((fill) => (
                        <option key={fill} value={fill}>{fill}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </section>

            {/* 2. Ordinary */}
            <section className="space-y-3">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-amber-300 border-b border-stone-800 pb-1">
                2. Honorable Ordinary
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[10px] text-stone-400 mb-1">Ordinary ({ORDINARIES.length})</label>
                  <select
                    value={config.ordinary.type}
                    onChange={(e) => updateOrdinary({ type: e.target.value as OrdinaryId })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100"
                  >
                    {ORDINARIES.map((ord) => (
                      <option key={ord} value={ord}>{ord}</option>
                    ))}
                  </select>
                </div>
                {config.ordinary.type !== 'none' && (
                  <>
                    <div>
                      <label className="block text-[10px] text-stone-400 mb-1">Line Style</label>
                      <select
                        value={config.ordinary.lineStyle}
                        onChange={(e) => updateOrdinary({ lineStyle: e.target.value as LineStyle })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100"
                      >
                        {LINE_STYLES.map((ls) => (
                          <option key={ls} value={ls}>{ls}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-stone-400 mb-1">Tincture</label>
                      <select
                        value={config.ordinary.tincture || 'Or'}
                        onChange={(e) => updateOrdinary({ tincture: e.target.value as TinctureName })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100"
                      >
                        {TINCTURE_NAMES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-stone-400 mb-1">Fimbriation</label>
                      <select
                        value={config.ordinary.fimbriated || ''}
                        onChange={(e) =>
                          updateOrdinary({
                            fimbriated: e.target.value ? (e.target.value as TinctureName) : undefined,
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100"
                      >
                        <option value="">None</option>
                        {TINCTURE_NAMES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* 3. Charge */}
            <section className="space-y-3">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-amber-300 border-b border-stone-800 pb-1">
                3. Vector Charge ({CHARGE_IDS.length} Charges)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-[10px] text-stone-400 mb-1">Charge</label>
                  <select
                    value={config.charge?.type || 'none'}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'none') {
                        setConfig((p) => ({ ...p, charge: null }));
                      } else {
                        setConfig((p) => ({
                          ...p,
                          charge: {
                            type: val as ChargeId,
                            count: p.charge?.count || 1,
                            context: p.charge?.context || 'field',
                            tincture: p.charge?.tincture || 'Or',
                            counterchanged: p.charge?.counterchanged || false,
                          },
                        }));
                      }
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100"
                  >
                    <option value="none">None</option>
                    {CHARGE_IDS.map((cid) => (
                      <option key={cid} value={cid}>
                        {CHARGE_META[cid].singular}
                      </option>
                    ))}
                  </select>
                </div>

                {config.charge && (
                  <>
                    <div>
                      <label className="block text-[10px] text-stone-400 mb-1">Count &amp; Placement</label>
                      <div className="flex gap-1.5">
                        <select
                          value={config.charge.count}
                          onChange={(e) =>
                            setConfig((p) =>
                              p.charge
                                ? { ...p, charge: { ...p.charge, count: Number(e.target.value) as 1 | 3 } }
                                : p
                            )
                          }
                          className="w-16 px-2 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100"
                        >
                          <option value={1}>1</option>
                          <option value={3}>3</option>
                        </select>
                        <select
                          value={config.charge.context}
                          onChange={(e) =>
                            setConfig((p) =>
                              p.charge
                                ? {
                                    ...p,
                                    charge: {
                                      ...p.charge,
                                      context: e.target.value as 'field' | 'on-chief' | 'on-fess' | 'on-ordinary',
                                    },
                                  }
                                : p
                            )
                          }
                          className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100"
                        >
                          <option value="field">Field</option>
                          <option value="on-chief">On Chief</option>
                          <option value="on-fess">On Fess</option>
                          <option value="on-ordinary">On Ordinary</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] text-stone-400 mb-1">Charge Tincture</label>
                      <select
                        disabled={config.charge.counterchanged}
                        value={config.charge.tincture || 'Or'}
                        onChange={(e) =>
                          setConfig((p) =>
                            p.charge
                              ? { ...p, charge: { ...p.charge, tincture: e.target.value as TinctureName } }
                              : p
                          )
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100 disabled:opacity-45"
                      >
                        {TINCTURE_NAMES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.charge.counterchanged}
                        onChange={(e) =>
                          setConfig((p) =>
                            p.charge
                              ? { ...p, charge: { ...p.charge, counterchanged: e.target.checked } }
                              : p
                          )
                        }
                      />
                      <span>Counterchanged</span>
                    </label>
                  </>
                )}
              </div>
            </section>

            {/* 4. Cadency / Brisure */}
            <section className="space-y-3">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-amber-300 border-b border-stone-800 pb-1">
                4. Cadency &amp; Marks of Difference
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] text-stone-400 mb-1">Cadency Method</label>
                  <select
                    value={currentCadency?.method || 'none'}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'none') {
                        setConfig((p) => ({ ...p, cadency: [] }));
                      } else {
                        const method = val as Exclude<CadencyMethod, 'auto'>;
                        setConfig((p) => ({
                          ...p,
                          cadency: [
                            {
                              method,
                              brisure: method === 'brisure' ? currentCadency?.brisure || 'label' : undefined,
                              tincture: currentCadency?.tincture || 'Argent',
                              generation: 1,
                              branchSeed: target.id,
                            },
                          ],
                        }));
                      }
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100"
                  >
                    <option value="none">None (Head of House)</option>
                    <option value="brisure">Brisure</option>
                    <option value="bordure">Cadency Bordure</option>
                    <option value="bordure-compony">Bordure Compony</option>
                    <option value="bendlet">Bendlet</option>
                    <option value="baton-sinister">Baton Sinister</option>
                    <option value="canton">Cadency Canton</option>
                  </select>
                </div>

                {currentCadency && (
                  <>
                    {currentCadency.method === 'brisure' && (
                      <div>
                        <label className="block text-[10px] text-stone-400 mb-1">Brisure Mark</label>
                        <select
                          value={currentCadency.brisure || 'label'}
                          onChange={(e) =>
                            setConfig((p) => ({
                              ...p,
                              cadency: p.cadency.map((m, i) =>
                                i === 0 ? { ...m, brisure: e.target.value as BrisureId } : m
                              ),
                            }))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100"
                        >
                          {BRISURE_ORDER.map((b, idx) => (
                            <option key={b} value={b}>
                              {idx + 1}. {b}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-[10px] text-stone-400 mb-1">Mark Tincture</label>
                      <select
                        value={currentCadency.tincture}
                        onChange={(e) =>
                          setConfig((p) => ({
                            ...p,
                            cadency: p.cadency.map((m, i) =>
                              i === 0 ? { ...m, tincture: e.target.value as TinctureName } : m
                            ),
                          }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100"
                      >
                        {TINCTURE_NAMES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-stone-800 bg-stone-900/90">
          <span className="text-[11px] text-stone-400">
            Saving syncs banners across royal dynasties, vassal fiefs, and army standards.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onSaveCoatOfArms(target, previewCoa);
                onClose();
              }}
              className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              Save Coat of Arms
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
