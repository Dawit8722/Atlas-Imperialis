import React from 'react';
import { HistoricalEvent, Season } from '../types/world';
import {
  Play,
  Pause,
  FastForward,
  History,
  ChevronRight,
  Sprout,
  Sun,
  Leaf,
  Snowflake,
  Dices,
} from 'lucide-react';

interface TimelineBarProps {
  currentYear: number;
  currentSeason?: Season;
  onCycleSeason?: () => void;
  onAdvanceYears: (years: number) => void;
  onAdvanceMonths?: (months: number) => void;
  recentEvents: HistoricalEvent[];
  onOpenChronicles: () => void;
  onTriggerCourtEvent?: () => void;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  isBuilderMode?: boolean;
}

const SEASON_META: Record<
  Season,
  { Icon: React.ComponentType<{ className?: string }>; colorClass: string }
> = {
  Spring: { Icon: Sprout, colorClass: 'text-emerald-400' },
  Summer: { Icon: Sun, colorClass: 'text-amber-400' },
  Autumn: { Icon: Leaf, colorClass: 'text-orange-400' },
  Winter: { Icon: Snowflake, colorClass: 'text-sky-300' },
};

export const TimelineBar: React.FC<TimelineBarProps> = ({
  currentYear,
  currentSeason = 'Spring',
  onCycleSeason,
  onAdvanceYears,
  onAdvanceMonths,
  recentEvents,
  onOpenChronicles,
  onTriggerCourtEvent,
  isPlaying = false,
  onTogglePlay,
  isBuilderMode = false,
}) => {
  const latestEvent = recentEvents[0];
  const lockedTitle = 'Switch to Simulator Mode to advance time';
  const seasonMeta = SEASON_META[currentSeason] || SEASON_META.Spring;
  const SeasonIcon = seasonMeta.Icon;

  return (
    <footer className="h-11 w-full bg-stone-950/95 backdrop-blur-xl border-t border-white/[0.08] px-4 sm:px-5 flex items-center justify-between gap-4 text-xs select-none z-30">
      {/* Date, Season & Time Progression */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2 font-cinzel text-amber-100 font-semibold tracking-wide whitespace-nowrap">
          <History className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="tabular-nums">Year {currentYear}</span>
          {onCycleSeason && (
            <>
              <span className="text-stone-700 font-sans">·</span>
              <button
                type="button"
                onClick={onCycleSeason}
                title="Click to cycle season"
                className="inline-flex items-center gap-1.5 font-sans text-xs font-medium text-stone-300 hover:text-amber-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                <SeasonIcon className={`w-3.5 h-3.5 shrink-0 ${seasonMeta.colorClass}`} />
                <span>{currentSeason}</span>
              </button>
            </>
          )}
        </div>

        <div className="w-px h-4 bg-stone-800" />

        <div className="flex items-center gap-1">
          {onTogglePlay && (
            <button
              type="button"
              onClick={() => !isBuilderMode && onTogglePlay()}
              disabled={isBuilderMode}
              className={`p-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                isBuilderMode
                  ? 'text-stone-600 cursor-not-allowed'
                  : isPlaying
                  ? 'bg-amber-600 text-white cursor-pointer'
                  : 'text-stone-300 hover:bg-stone-800 hover:text-white cursor-pointer'
              }`}
              title={isBuilderMode ? lockedTitle : isPlaying ? 'Pause Timeline' : 'Auto-advance Timeline'}
            >
              {isPlaying && !isBuilderMode ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {onAdvanceMonths && (
            <button
              type="button"
              onClick={() => !isBuilderMode && onAdvanceMonths(1)}
              disabled={isBuilderMode}
              className={`px-2 py-1 rounded-md font-mono text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                isBuilderMode
                  ? 'text-stone-600 cursor-not-allowed'
                  : 'text-amber-200 hover:bg-stone-800 hover:text-white cursor-pointer'
              }`}
              title={isBuilderMode ? lockedTitle : 'Advance 1 Month'}
            >
              +1m
            </button>
          )}

          <button
            type="button"
            onClick={() => !isBuilderMode && onAdvanceYears(1)}
            disabled={isBuilderMode}
            className={`px-2 py-1 rounded-md font-mono text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
              isBuilderMode
                ? 'text-stone-600 cursor-not-allowed'
                : 'text-stone-300 hover:bg-stone-800 hover:text-white cursor-pointer'
            }`}
            title={isBuilderMode ? lockedTitle : 'Advance 1 Year'}
          >
            +1y
          </button>

          <button
            type="button"
            onClick={() => !isBuilderMode && onAdvanceYears(5)}
            disabled={isBuilderMode}
            className={`px-2 py-1 rounded-md font-mono text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
              isBuilderMode
                ? 'text-stone-600 cursor-not-allowed'
                : 'text-stone-300 hover:bg-stone-800 hover:text-white cursor-pointer'
            }`}
            title={isBuilderMode ? lockedTitle : 'Advance 5 Years'}
          >
            +5y
          </button>

          <button
            type="button"
            onClick={() => !isBuilderMode && onAdvanceYears(25)}
            disabled={isBuilderMode}
            className={`flex items-center gap-1 px-2 py-1 rounded-md font-mono text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
              isBuilderMode
                ? 'text-stone-600 cursor-not-allowed'
                : 'text-amber-300 hover:bg-stone-800 hover:text-amber-200 cursor-pointer'
            }`}
            title={isBuilderMode ? lockedTitle : 'Advance 25 Years'}
          >
            <FastForward
              className={`w-3 h-3 shrink-0 ${isBuilderMode ? 'text-stone-600' : 'text-amber-400'}`}
            />
            <span>+25y</span>
          </button>
        </div>
      </div>

      {/* Latest Chronicle Headline */}
      <div className="hidden md:flex items-center justify-center min-w-0 flex-1">
        {latestEvent ? (
          <button
            type="button"
            onClick={onOpenChronicles}
            className="flex items-center gap-2 text-stone-400 hover:text-stone-200 truncate max-w-2xl cursor-pointer text-left group"
          >
            <span className="font-mono text-amber-400 font-semibold shrink-0 text-[11px] tabular-nums">
              {latestEvent.year}
            </span>
            <span className="text-stone-600">·</span>
            <span className="font-medium text-stone-300 group-hover:text-amber-200 truncate text-xs">
              {latestEvent.title}
            </span>
          </button>
        ) : (
          <span className="text-stone-500 text-xs truncate">
            Peace reigns across the realm.
          </span>
        )}
      </div>

      {/* Court Event & Chronicles Shortcuts */}
      <div className="flex items-center gap-3 shrink-0">
        {onTriggerCourtEvent && (
          <button
            type="button"
            onClick={onTriggerCourtEvent}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-stone-900 hover:bg-stone-800 border border-amber-500/40 text-amber-200 hover:text-amber-100 transition-colors cursor-pointer text-xs font-medium whitespace-nowrap shrink-0"
            title="Trigger an interactive Court Event for the active ruler or noble"
          >
            <Dices className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="hidden sm:inline">Court Event</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenChronicles}
          className="flex items-center gap-1.5 text-stone-300 hover:text-amber-300 transition-colors cursor-pointer text-xs font-medium whitespace-nowrap shrink-0"
        >
          <span>Chronicles</span>
          <span className="font-mono text-stone-500 tabular-nums">({recentEvents.length})</span>
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        </button>
      </div>
    </footer>
  );
};
