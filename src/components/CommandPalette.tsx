import React, { useState, useEffect, useMemo, useRef } from 'react';
import { WorldState, Realm, Burg, County, Character, Army } from '../types/world';
import { COMMODITIES, CommodityType } from '../engine/economyEngine';
import { getAllHouseProfiles } from '../engine/houseEngine';
import { formatCharacterRoleLabel } from '../engine/fantasyTables';
import {
  Search,
  Crown,
  Castle,
  User,
  BookOpen,
  Swords,
  ArrowRight,
  Shield,
  Coins,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type CommandPaletteItemType = 'realm' | 'county' | 'burg' | 'character' | 'house' | 'army' | 'commodity' | 'siege' | 'lore';

export interface CommandPaletteItem {
  id: string;
  type: CommandPaletteItemType;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  icon: React.ReactNode;
  data: any;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  world: WorldState;
  onSelectRealm: (realm: Realm) => void;
  onSelectCounty?: (county: County) => void;
  onSelectBurg: (burg: Burg) => void;
  onSelectCharacter: (char: Character) => void;
  onSelectHouse?: (houseName: string) => void;
  onSelectArmy?: (army: Army) => void;
  onSelectCommodity?: (commodity: CommodityType, producerBurg?: Burg) => void;
  onOpenCompendiumForEntity: (entityId: string) => void;
  onSelectWarOrSiege?: (siegeHoldingId: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  world,
  onSelectRealm,
  onSelectCounty,
  onSelectBurg,
  onSelectCharacter,
  onSelectHouse,
  onSelectArmy,
  onSelectCommodity,
  onOpenCompendiumForEntity,
  onSelectWarOrSiege,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input whenever opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Aggregate searchable items from world state
  const allItems: CommandPaletteItem[] = useMemo(() => {
    const list: CommandPaletteItem[] = [];

    // 1. Realms
    for (const realm of world.realms) {
      list.push({
        id: `realm_${realm.id}`,
        type: 'realm',
        title: realm.name,
        subtitle: `${realm.culture} · ${realm.religion} · Capital: ${world.burgs.find((b) => b.id === realm.capitalBurgId)?.name || 'Unknown'}`,
        badge: '👑 Realm',
        badgeColor: 'bg-amber-950/80 text-amber-300 border-amber-800/60',
        icon: <Crown className="w-4 h-4 text-amber-400" />,
        data: realm,
      });
    }

    // 1B. Counties & Duchies
    for (const county of world.counties || []) {
      const parentRealm = world.realms.find((r) => r.id === county.realmId);
      const isDuchy = county.tier === 'Duchy' || county.name.includes('Duchy');
      list.push({
        id: `county_${county.id}`,
        type: 'county',
        title: county.name,
        subtitle: `${isDuchy ? 'Duchy' : 'County'} · Dev ${county.development || 25} · ${parentRealm?.name || 'Independent'}`,
        badge: isDuchy ? 'Duchy' : 'County',
        badgeColor: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60',
        icon: <Shield className="w-4 h-4 text-emerald-400" />,
        data: county,
      });
    }

    // 2. Burgs / Citadels / Castles
    for (const burg of world.burgs) {
      const parentRealm = world.realms.find((r) => r.id === burg.stateId);
      list.push({
        id: `burg_${burg.id}`,
        type: 'burg',
        title: burg.name,
        subtitle: `${burg.type || 'Citadel'} · Pop: ${(burg.population < 50 ? Math.round(burg.population * 1000) : burg.population).toLocaleString()} souls · ${parentRealm?.name || 'Independent'}`,
        badge: 'Settlement',
        badgeColor: 'bg-stone-800/80 text-stone-300 border-stone-700/60',
        icon: <Castle className="w-4 h-4 text-sky-400" />,
        data: burg,
      });
    }

    // 3. Characters / Dramatis Personae
    for (const char of world.characters) {
      const realm = world.realms.find((r) => r.id === char.realmId);
      list.push({
        id: `char_${char.id}`,
        type: 'character',
        title: `${char.name} ${char.houseName ? `of House ${char.houseName}` : ''}`,
        subtitle: `${formatCharacterRoleLabel(char, world)} · ${char.title || 'Noble'} · ${realm?.name || 'Wanderer'} · Age ${char.age}`,
        badge: 'Noble',
        badgeColor: 'bg-purple-950/80 text-purple-300 border-purple-800/60',
        icon: <User className="w-4 h-4 text-purple-400" />,
        data: char,
      });
    }

    // 3A. Noble Houses & Dynasties
    for (const hp of getAllHouseProfiles(world)) {
      list.push({
        id: `house_${hp.houseName}`,
        type: 'house',
        title: `House ${hp.houseName}`,
        subtitle: `${hp.powerTier} · Influence ${hp.influenceScore}/100 · Prestige ${hp.totalPrestige.toLocaleString()} · ${hp.livingMembers.length} living, ${hp.ancestors.length} ancestors`,
        badge: 'Dynasty',
        badgeColor: 'bg-amber-950/80 text-amber-300 border-amber-700/60',
        icon: <Crown className="w-4 h-4 text-amber-300" />,
        data: hp.houseName,
      });
    }

    // 3B. Field Armies
    for (const army of world.armies || []) {
      const targetBurg = world.burgs.find(
        (b) => b.id === army.targetHoldingId || `holding_${b.id}` === army.targetHoldingId
      );
      list.push({
        id: `army_${army.id}`,
        type: 'army',
        title: `${army.commanderName || 'Field Host'} (${Math.round(army.strength).toLocaleString()} men)`,
        subtitle: `${army.isDefender ? 'Defender' : 'Attacker'} · Doctrine: ${army.tactic || 'Standard Line'} · Target: ${targetBurg?.name || 'Marching'}`,
        badge: 'Field Army',
        badgeColor: 'bg-red-950/80 text-red-300 border-red-800/60',
        icon: <Swords className="w-4 h-4 text-amber-400" />,
        data: army,
      });
    }

    // 3C. All 52 Commodities
    for (const commKey of Object.keys(COMMODITIES) as CommodityType[]) {
      const meta = COMMODITIES[commKey];
      const topProducer = world.burgs.find((b) => b.tradeGood === commKey);
      list.push({
        id: `comm_${commKey}`,
        type: 'commodity',
        title: commKey,
        subtitle: `${meta.category} · Base Price ${meta.basePrice}g${topProducer ? ` · Hub: ${topProducer.name}` : ''}`,
        badge: 'Commodity',
        badgeColor: 'bg-amber-950/80 text-amber-200 border-amber-800/60',
        icon: <Coins className="w-4 h-4 text-amber-400" />,
        data: { commodity: commKey, producerBurg: topProducer },
      });
    }

    // 4. Active Sieges & Wars
    if (world.activeSieges && world.activeSieges.length > 0) {
      for (const siege of world.activeSieges) {
        list.push({
          id: `siege_${siege.id}`,
          type: 'siege',
          title: `Siege of ${siege.holdingName}`,
          subtitle: `Fort Level ${siege.fortLevel} · Walls: ${siege.wallIntegrity}% · Garrison: ${siege.garrisonCount}`,
          badge: 'Active Siege',
          badgeColor: 'bg-red-950/80 text-red-300 border-red-800/60',
          icon: <Swords className="w-4 h-4 text-rose-400" />,
          data: siege,
        });
      }
    }

    // 5. Lore Entities
    if (world.loreEntities && world.loreEntities.length > 0) {
      for (const lore of world.loreEntities.slice(0, 15)) {
        list.push({
          id: lore.id,
          type: 'lore',
          title: lore.name,
          subtitle: `${lore.category} · ${lore.summary.slice(0, 80)}...`,
          badge: 'Lore',
          badgeColor: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60',
          icon: <BookOpen className="w-4 h-4 text-emerald-400" />,
          data: lore,
        });
      }
    }

    return list;
  }, [world]);

  // Filter items based on query
  const filteredItems = useMemo(() => {
    if (!query.trim()) {
      return allItems.slice(0, 8); // Default popular suggestions
    }
    const q = query.toLowerCase().trim();
    return allItems
      .filter((item) => item.title.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q))
      .slice(0, 12);
  }, [allItems, query]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          handleSelectItem(filteredItems[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex]);

  const handleSelectItem = (item: CommandPaletteItem) => {
    onClose();
    if (item.type === 'realm') {
      onSelectRealm(item.data);
    } else if (item.type === 'county') {
      if (onSelectCounty) onSelectCounty(item.data);
    } else if (item.type === 'burg') {
      onSelectBurg(item.data);
    } else if (item.type === 'character') {
      onSelectCharacter(item.data);
    } else if (item.type === 'house') {
      if (onSelectHouse) onSelectHouse(item.data);
    } else if (item.type === 'army') {
      if (onSelectArmy) onSelectArmy(item.data);
    } else if (item.type === 'commodity') {
      if (onSelectCommodity) onSelectCommodity(item.data.commodity, item.data.producerBurg);
    } else if (item.type === 'siege') {
      if (onSelectWarOrSiege) {
        onSelectWarOrSiege(item.data.holdingId);
      } else {
        const holdingBurg = world.burgs.find((b) => b.id === item.data.holdingId);
        if (holdingBurg) onSelectBurg(holdingBurg);
      }
    } else if (item.type === 'lore') {
      onOpenCompendiumForEntity(item.data.id);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/60 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -10 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="w-full max-w-xl bg-stone-950/95 border border-stone-800 rounded-2xl shadow-2xl overflow-hidden text-stone-200 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search Input Bar */}
          <div className="flex items-center px-4 py-3.5 border-b border-stone-800/80 gap-3">
            <Search className="w-5 h-5 text-amber-500 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder="Search kingdoms, counties, citadels, lords, armies, or commodities..."
              className="w-full bg-transparent text-sm text-stone-100 placeholder-stone-500 focus:outline-none font-sans"
            />
            <button
              onClick={onClose}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-stone-900 border border-stone-800 text-stone-400 hover:text-white"
            >
              ESC
            </button>
          </div>

          {/* Results List */}
          <div className="max-h-96 overflow-y-auto p-2 space-y-1">
            {filteredItems.length === 0 ? (
              <div className="py-12 text-center text-stone-500 text-xs">
                No feudal entities or chronicles found for <span className="text-amber-400">"{query}"</span>.
              </div>
            ) : (
              filteredItems.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={item.id}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => handleSelectItem(item)}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-amber-950/40 border border-amber-600/40 text-amber-100'
                        : 'hover:bg-stone-900/60 border border-transparent text-stone-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-stone-900 border border-stone-800 shrink-0">
                        {item.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate flex items-center gap-2">
                          <span>{item.title}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium border ${item.badgeColor}`}
                          >
                            {item.badge}
                          </span>
                        </div>
                        <div className="text-[11px] text-stone-400 truncate mt-0.5">
                          {item.subtitle}
                        </div>
                      </div>
                    </div>

                    <ArrowRight
                      className={`w-4 h-4 shrink-0 transition-transform ${
                        isSelected ? 'text-amber-400 translate-x-1' : 'text-stone-600 opacity-0'
                      }`}
                    />
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Shortcuts */}
          <div className="px-4 py-2 bg-stone-900/40 border-t border-stone-800/80 flex items-center justify-between text-[11px] text-stone-500 font-mono">
            <div className="flex items-center gap-3">
              <span>↑↓ Navigate</span>
              <span>↵ Select</span>
              <span>Esc Close</span>
            </div>
            <span className="text-amber-500/80">RealmSmith Universal Spotlight</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
