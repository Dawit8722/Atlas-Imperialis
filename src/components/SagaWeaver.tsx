import React, { useState } from 'react';
import { WorldState, SagaStory, LoreEntity, Character } from '../types/world';
import { PRNG } from '../utils/proceduralNoise';
import { generateSagaChapterAsync } from '../engine/storyGenerator';
import { Feather, BookOpen, Sparkles, User, MapPin, Skull } from 'lucide-react';

export interface GeneratedSagaPayload {
  story: SagaStory;
  loreEntity: LoreEntity;
  updatedCharacters: Character[];
}

interface SagaWeaverProps {
  world: WorldState;
  onSagaCreated: (result: GeneratedSagaPayload) => void;
  onOpenCompendiumForEntity: (entityId: string) => void;
}

export const SagaWeaver: React.FC<SagaWeaverProps> = ({
  world,
  onSagaCreated,
  onOpenCompendiumForEntity,
}) => {
  const [protagonistId, setProtagonistId] = useState<string>(() => world.characters[0]?.id || '');
  const [antagonistId, setAntagonistId] = useState<string>(() => world.characters[1]?.id || '');
  const [burgId, setBurgId] = useState<string>(() => world.burgs[0]?.id || '');
  const [genre, setGenre] = useState<SagaStory['genre']>('Betrayal');
  const [customPremise, setCustomPremise] = useState('');
  const [selectedStory, setSelectedStory] = useState<SagaStory | null>(() => world.sagas[0] || null);
  const [isWeaving, setIsWeaving] = useState(false);
  const [authoredSource, setAuthoredSource] = useState<'ai' | 'local' | null>(null);

  const genres: SagaStory['genre'][] = [
    'Betrayal',
    'Succession Crisis',
    'Forbidden Love',
    'Dynastic Feud',
    'Religious Inquisitor',
    'Bastard\'s Revenge',
    'Heroic Defense',
    'Blackmail & Intrigue',
  ];

  const handleWeaveStory = async () => {
    setIsWeaving(true);
    try {
      const prng = new PRNG(`saga_gen_${Date.now()}`);
      const result = await generateSagaChapterAsync(
        world,
        {
          genre,
          protagonistId: protagonistId || undefined,
          antagonistId: antagonistId || undefined,
          burgId: burgId || undefined,
          customPremise: customPremise.trim() || undefined,
        },
        prng
      );

      setAuthoredSource(result.aiAuthored ? 'ai' : 'local');
      setSelectedStory(result.story);
      onSagaCreated({
        story: result.story,
        loreEntity: result.loreEntity,
        updatedCharacters: result.updatedCharacters,
      });
    } finally {
      setIsWeaving(false);
    }
  };

  const currentProtagonist = world.characters.find((c) => c.id === protagonistId);
  const currentAntagonist = world.characters.find((c) => c.id === antagonistId);

  return (
    <div className="flex-1 flex flex-col lg:flex-row bg-stone-950 text-stone-200 overflow-hidden select-text">
      {/* Left Control Deck: Saga Parameters */}
      <div className="w-full lg:w-96 p-6 border-b lg:border-b-0 lg:border-r border-white/[0.08] bg-stone-950/80 flex flex-col overflow-y-auto space-y-5 shrink-0">
        <div>
          <h2 className="font-cinzel text-lg font-bold text-amber-100 flex items-center gap-2">
            <Feather className="w-4 h-4 text-amber-400" />
            <span>Saga Studio</span>
          </h2>
          <p className="text-xs text-stone-400 mt-1">
            Craft narrative chronicles shaped by noble ambitions, flaws, and courtly intrigue.
          </p>
        </div>

        {/* Genre / Archetype */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-stone-400">
            Dramatic Archetype
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {genres.map((g) => (
              <button
                key={g}
                onClick={() => setGenre(g)}
                className={`py-2 px-2.5 rounded-lg text-xs font-medium text-left transition-colors ${
                  genre === g
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-stone-900 hover:bg-stone-800 text-stone-300'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Protagonist */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-amber-400" />
            <span>Protagonist</span>
          </label>
          <select
            value={protagonistId}
            onChange={(e) => setProtagonistId(e.target.value)}
            className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-200 focus:outline-none focus:border-amber-500"
          >
            {world.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.title})
              </option>
            ))}
          </select>
          {currentProtagonist && (
            <div className="p-2 bg-stone-950/70 border border-stone-800/80 rounded text-[11px] text-stone-400 italic">
              Ambition: {currentProtagonist.ambition} · Flaw: {currentProtagonist.tragicFlaw}
            </div>
          )}
        </div>

        {/* Antagonist */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
            <Skull className="w-3.5 h-3.5 text-red-400" />
            <span>Counterpart / Rival</span>
          </label>
          <select
            value={antagonistId}
            onChange={(e) => setAntagonistId(e.target.value)}
            className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-200 focus:outline-none focus:border-amber-500"
          >
            {world.characters
              .filter((c) => c.id !== protagonistId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (House {c.houseName})
                </option>
              ))}
          </select>
          {currentAntagonist && (
            <div className="p-2 bg-stone-950/70 border border-stone-800/80 rounded text-[11px] text-stone-400 italic">
              Secret: {currentAntagonist.darkSecret}
            </div>
          )}
        </div>

        {/* Seat of Conflict */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-sky-400" />
            <span>Seat of Conflict (Citadel)</span>
          </label>
          <select
            value={burgId}
            onChange={(e) => setBurgId(e.target.value)}
            className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-200 focus:outline-none focus:border-amber-500"
          >
            {world.burgs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.type})
              </option>
            ))}
          </select>
        </div>

        {/* Custom Narrative Premise */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-stone-400">
            Custom Premise (Optional)
          </label>
          <textarea
            value={customPremise}
            onChange={(e) => setCustomPremise(e.target.value)}
            rows={3}
            maxLength={400}
            placeholder="e.g. A poisoned chalice is discovered during the winter solstice treaty feast..."
            className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500 resize-none"
          />
        </div>

        {/* Weave Action Button */}
        <button
          type="button"
          onClick={handleWeaveStory}
          disabled={isWeaving}
          className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer text-xs"
        >
          <Sparkles className="w-4 h-4" />
          <span>{isWeaving ? 'Drafting Chapter...' : 'Write Saga Chapter'}</span>
        </button>
        {authoredSource && (
          <div className="text-[11px] text-stone-400 text-center">
            {authoredSource === 'ai' ? 'Crafted via Royal Scribe AI' : 'Crafted via Narrative Engine'}
          </div>
        )}

        {/* Sagas Ledger Index */}
        <div className="pt-2 border-t border-stone-800 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            Recorded Sagas ({world.sagas.length})
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {world.sagas.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedStory(s)}
                className={`w-full text-left p-2 rounded-lg text-xs transition-colors ${
                  selectedStory?.id === s.id
                    ? 'bg-amber-900/40 border border-amber-700/60 text-amber-200'
                    : 'bg-stone-950/40 hover:bg-stone-950 text-stone-300'
                }`}
              >
                <div className="font-serif font-bold truncate">{s.title}</div>
                <div className="text-[10px] text-stone-400">
                  Year {s.year} · {s.genre}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Reading Canvas: Parchment Manuscript */}
      <div className="flex-1 overflow-y-auto p-6 sm:p-12 bg-[#FAF7EE] text-stone-900 flex justify-center">
        {selectedStory ? (
          <div className="w-full max-w-2xl bg-white p-8 sm:p-12 shadow-xl border border-stone-300 rounded-sm space-y-6">
            <div className="border-b border-stone-300 pb-4">
              <span className="text-xs uppercase tracking-widest text-stone-500 font-sans block mb-1">
                High Saga of Year {selectedStory.year} · {selectedStory.genre}
              </span>
              <h1 className="font-serif text-3xl font-bold text-[#2c3e50] leading-tight">
                {selectedStory.title}
              </h1>
              <p className="font-serif italic text-stone-600 text-sm mt-2">
                {selectedStory.premise}
              </p>
            </div>

            {/* Literary Prose */}
            <div className="font-serif text-base leading-relaxed text-stone-800 whitespace-pre-line space-y-4">
              {selectedStory.fullProse}
            </div>

            {/* Dialogue Spotlight */}
            <div className="py-4 px-5 bg-stone-50 border-y border-stone-200 my-6">
              <p className="font-serif italic text-stone-700 text-sm leading-relaxed">
                {selectedStory.dialogueSnippet}
              </p>
            </div>

            {/* Historical Consequences */}
            <div className="pt-4 border-t border-stone-300 text-xs text-stone-600 font-serif space-y-1">
              <div className="font-sans uppercase text-[10px] font-bold tracking-wider text-stone-400">
                Historical Repercussions
              </div>
              <p className="italic">{selectedStory.consequences}</p>
            </div>

            {/* Read in WeasyPrint Compendium */}
            <div className="pt-4 flex justify-end">
              <button
                onClick={() => onOpenCompendiumForEntity(`lore_${selectedStory.id}`)}
                className="flex items-center gap-1.5 px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-medium transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>View in Compendium Lore Book</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center self-center text-stone-500 font-serif">
            Select or weave a saga chapter to read the manuscript.
          </div>
        )}
      </div>
    </div>
  );
};
