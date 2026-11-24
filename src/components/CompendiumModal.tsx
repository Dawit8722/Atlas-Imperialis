import React, { useState, useMemo, useEffect } from 'react';
import { LoreEntity, LoreCategory } from '../types/world';
import {
  buildCompendiumHTML,
  buildCompendiumMarkdown,
  generatePythonExporterScript,
  downloadTextFile,
} from '../engine/compendiumExporter';
import { X, Printer, Download, Search, Code, Check, Pencil, Plus, Trash2, Save } from 'lucide-react';

interface CompendiumModalProps {
  isOpen: boolean;
  onClose: () => void;
  entities: LoreEntity[];
  currentYear: number;
  selectedEntityId?: string;
  isBuilderMode?: boolean;
  onUpsertLore?: (entity: LoreEntity) => void;
  onDeleteLore?: (entityId: string) => void;
}

export const CompendiumModal: React.FC<CompendiumModalProps> = ({
  isOpen,
  onClose,
  entities,
  currentYear,
  selectedEntityId,
  isBuilderMode = false,
  onUpsertLore,
  onDeleteLore,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeEntityId, setActiveEntityId] = useState<string | null>(selectedEntityId || null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [viewMode, setViewMode] = useState<'reader' | 'python_code'>('reader');
  const [editingEntity, setEditingEntity] = useState<LoreEntity | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !selectedEntityId) return;
    const bareId = selectedEntityId.replace(/^(lore_|char_|burg_|county_|realm_)+/, '');
    const matched =
      entities.find((e) => e.id === selectedEntityId) ||
      entities.find((e) => e.id === `lore_${selectedEntityId}`) ||
      entities.find(
        (e) =>
          e.id === `lore_${bareId}` ||
          e.characterId === selectedEntityId ||
          e.characterId === bareId ||
          e.burgId === selectedEntityId ||
          e.burgId === bareId ||
          e.stateId === selectedEntityId ||
          e.stateId === bareId
      );

    if (matched) {
      setSelectedCategory('All');
      setSearchQuery('');
      setViewMode('reader');
      setActiveEntityId(matched.id);
      requestAnimationFrame(() => {
        document.getElementById(`entity-${matched.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else {
      setActiveEntityId(selectedEntityId);
    }
  }, [isOpen, selectedEntityId, entities]);

  const categories: string[] = [
    'All',
    'The High Sagas & Epics',
    'Kingdoms & Empires',
    'Dynasties & Dramatis Personae',
    'Settlements & Citadels',
    'Geography & Landmarks',
    'Cultures & Peoples',
    'Religions & Pantheons',
    'Chronicles & Historical Eras',
  ];

  // Filtered and Sorted Entities (matching session.query(LoreEntity).order_by(LoreEntity.category).all())
  const sortedEntities = useMemo(() => {
    return [...entities].sort((a, b) => a.category.localeCompare(b.category));
  }, [entities]);

  const filteredEntities = useMemo(() => {
    return sortedEntities.filter((e) => {
      const matchesCategory = selectedCategory === 'All' || e.category === selectedCategory;
      const matchesQuery =
        !searchQuery ||
        e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [sortedEntities, selectedCategory, searchQuery]);

  if (!isOpen) return null;

  // Actions
  const handlePrint = async () => {
    if (window.desktopAPI?.exportPdf) {
      await window.desktopAPI.exportPdf(`WorldLoreBook-Year-${currentYear}.pdf`);
      return;
    }
    window.print();
  };

  const handleDownloadHTML = () => {
    const html = buildCompendiumHTML(entities);
    downloadTextFile('WorldLoreBook.html', html, 'text/html');
  };

  const handleDownloadMarkdown = () => {
    const md = buildCompendiumMarkdown(entities, currentYear);
    downloadTextFile('WorldLoreBook.md', md, 'text/markdown');
  };

  const handleDownloadJSON = () => {
    const json = JSON.stringify(entities, null, 2);
    downloadTextFile('WorldLoreBook.json', json, 'application/json');
  };

  const handleCopyPython = () => {
    const py = generatePythonExporterScript(entities);
    navigator.clipboard.writeText(py);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-6 select-text overflow-hidden">
      {/* Modal Container */}
      <div className="w-full max-w-6xl h-[92vh] flex flex-col bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl overflow-hidden no-print">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950">
          <div className="flex items-center gap-3">
            <span className="text-xl">📜</span>
            <div>
              <h2 className="font-serif font-bold text-lg text-stone-100 leading-tight">
                Compendium of the Realm
              </h2>
              <p className="text-xs text-stone-400">
                A4 WeasyPrint Lore Book Exporter · Year {currentYear}
              </p>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === 'reader' ? 'python_code' : 'reader')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-lg text-xs font-medium transition-colors"
            >
              <Code className="w-3.5 h-3.5" />
              <span>{viewMode === 'reader' ? 'Python Snippet' : 'Book Reader'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium shadow transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print A4 PDF</span>
            </button>

            <div className="relative group">
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-xs font-medium transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download...</span>
              </button>
              {/* Dropdown */}
              <div className="absolute right-0 mt-1 w-44 bg-stone-900 border border-stone-800 rounded-lg shadow-xl py-1 z-30 hidden group-hover:block">
                <button
                  onClick={handleDownloadHTML}
                  className="w-full text-left px-3 py-2 text-xs text-stone-300 hover:bg-stone-800 hover:text-white"
                >
                  HTML (WeasyPrint ready)
                </button>
                <button
                  onClick={handleDownloadMarkdown}
                  className="w-full text-left px-3 py-2 text-xs text-stone-300 hover:bg-stone-800 hover:text-white"
                >
                  Markdown (.md)
                </button>
                <button
                  onClick={handleDownloadJSON}
                  className="w-full text-left px-3 py-2 text-xs text-stone-300 hover:bg-stone-800 hover:text-white"
                >
                  JSON Lore Entities
                </button>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* View: Python Code or Book Reader */}
        {viewMode === 'python_code' ? (
          <div className="flex-1 flex flex-col p-6 bg-stone-950 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-stone-400">
                Direct implementation of your <code className="text-amber-400">core/exporter.py</code> script pre-loaded with current world state:
              </div>
              <button
                onClick={handleCopyPython}
                className="flex items-center gap-1.5 px-3 py-1 bg-amber-700/80 hover:bg-amber-600 text-white rounded text-xs font-medium transition-colors"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5" /> : null}
                <span>{copiedCode ? 'Copied to Clipboard!' : 'Copy Script'}</span>
              </button>
            </div>
            <pre className="flex-1 p-4 bg-stone-900 border border-stone-800 rounded-xl font-mono text-xs text-stone-200 overflow-x-auto leading-relaxed">
              {generatePythonExporterScript(entities)}
            </pre>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Sidebar: Categories & Entity Index */}
            <div className="w-80 border-r border-stone-800 bg-stone-950/70 flex flex-col">
              {/* Search Bar */}
              <div className="p-3 border-b border-stone-800">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-stone-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search lore entities..."
                    className="w-full pl-8 pr-3 py-1.5 bg-stone-900 border border-stone-800 rounded-lg text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-600"
                  />
                </div>
              </div>

              {/* Category Filter List */}
              <div className="p-2 border-b border-stone-800 flex flex-wrap gap-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                      selectedCategory === cat
                        ? 'bg-amber-700/80 text-white shadow-sm'
                        : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Entity Quick Navigation */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                <div className="px-2 py-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase font-semibold text-stone-500 tracking-wider">
                    Indexed Entities ({filteredEntities.length})
                  </span>
                  {isBuilderMode && onUpsertLore && (
                    <button
                      type="button"
                      onClick={() => {
                        const newId = `lore_custom_${Date.now()}`;
                        const draft: LoreEntity = {
                          id: newId,
                          category: (selectedCategory !== 'All' ? selectedCategory : 'Chronicles & Historical Eras') as LoreCategory,
                          name: 'New Chronicle Chapter',
                          summary: 'A foundational chronicle recorded in the realm archives.',
                          body_markdown: '### Historical Record\nWrite the canonical lore, treaties, or legends of this world.',
                          tags: ['Custom'],
                        };
                        setSelectedCategory('All');
                        setSearchQuery('');
                        setViewMode('reader');
                        setActiveEntityId(newId);
                        setEditingEntity(draft);
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-semibold cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>New Chapter</span>
                    </button>
                  )}
                </div>
                {filteredEntities.map((e) => (
                  <a
                    key={e.id}
                    href={`#entity-${e.id}`}
                    onClick={() => setActiveEntityId(e.id)}
                    className={`block px-3 py-2 rounded-lg text-xs transition-colors ${
                      activeEntityId === e.id
                        ? 'bg-amber-900/30 border border-amber-700/50 text-amber-200'
                        : 'text-stone-300 hover:bg-stone-900 hover:text-white'
                    }`}
                  >
                    <div className="font-serif font-medium truncate">{e.name}</div>
                    <div className="text-[10px] text-stone-400 truncate">{e.category}</div>
                  </a>
                ))}
              </div>
            </div>

            {/* Right Pane: A4 Document Viewer */}
            <div className="flex-1 overflow-y-auto p-8 sm:p-12 bg-[#FAF7EE] text-stone-900 flex justify-center">
              <div className="w-full max-w-[210mm] min-h-[297mm] bg-white p-12 shadow-2xl border border-stone-300 rounded-sm">
                {/* Book Header Matching WeasyPrint */}
                <h1 className="compendium-title text-center text-3xl font-serif text-[#2c3e50] font-bold mb-10 pb-4 border-b border-stone-300">
                  Compendium of the Realm
                </h1>

                {/* Chapters */}
                <div className="space-y-8">
                  {isBuilderMode && editingEntity && !filteredEntities.some((x) => x.id === editingEntity.id) && (
                    <div className="p-4 bg-stone-50 border border-amber-500 rounded-md space-y-3 font-sans">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                          New Lore Chapter
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingEntity(null)}
                            className="px-2.5 py-1 rounded border border-stone-300 text-xs text-stone-700 hover:bg-stone-100 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onUpsertLore?.(editingEntity);
                              setActiveEntityId(editingEntity.id);
                              setEditingEntity(null);
                            }}
                            className="flex items-center gap-1 px-3 py-1 rounded bg-amber-700 hover:bg-amber-600 text-white text-xs font-semibold cursor-pointer"
                          >
                            <Save className="w-3 h-3" />
                            <span>Save Chapter</span>
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={editingEntity.name}
                          onChange={(ev) => setEditingEntity({ ...editingEntity, name: ev.target.value })}
                          placeholder="Chapter title..."
                          className="px-2.5 py-1.5 border border-stone-300 rounded text-xs bg-white text-stone-900"
                        />
                        <select
                          value={editingEntity.category}
                          onChange={(ev) => setEditingEntity({ ...editingEntity, category: ev.target.value as LoreCategory })}
                          className="px-2.5 py-1.5 border border-stone-300 rounded text-xs bg-white text-stone-900"
                        >
                          {categories.filter((c) => c !== 'All').map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <input
                        type="text"
                        value={editingEntity.summary}
                        onChange={(ev) => setEditingEntity({ ...editingEntity, summary: ev.target.value })}
                        placeholder="Short one-line summary..."
                        className="w-full px-2.5 py-1.5 border border-stone-300 rounded text-xs bg-white text-stone-900"
                      />
                      <textarea
                        rows={7}
                        value={editingEntity.body_markdown}
                        onChange={(ev) => setEditingEntity({ ...editingEntity, body_markdown: ev.target.value })}
                        className="w-full px-2.5 py-2 border border-stone-300 rounded font-mono text-xs bg-white text-stone-900"
                      />
                    </div>
                  )}

                  {filteredEntities.map((e) => {
                    const isEditing = isBuilderMode && editingEntity?.id === e.id;
                    return (
                      <div
                        key={e.id}
                        id={`entity-${e.id}`}
                        className="pdf-chapter pb-6 border-b border-stone-300"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="category-tag text-xs uppercase font-sans text-stone-500 font-semibold tracking-wider block mb-1">
                            {e.category}
                          </span>
                          {isBuilderMode && !isEditing && (
                            <div className="flex items-center gap-1.5 font-sans shrink-0">
                              {onUpsertLore && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmDeleteId(null);
                                    setEditingEntity({ ...e });
                                  }}
                                  className="flex items-center gap-1 px-2 py-0.5 rounded border border-stone-300 hover:border-amber-600 text-stone-700 hover:text-amber-800 text-[11px] font-medium cursor-pointer"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>Edit</span>
                                </button>
                              )}
                              {onDeleteLore && (
                                confirmDeleteId === e.id ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onDeleteLore(e.id);
                                        setConfirmDeleteId(null);
                                      }}
                                      className="px-2 py-0.5 rounded bg-rose-700 text-white text-[11px] font-semibold cursor-pointer"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="px-2 py-0.5 rounded border border-stone-300 text-stone-600 text-[11px] cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(e.id)}
                                    className="p-1 rounded border border-stone-300 hover:border-rose-600 text-stone-500 hover:text-rose-700 cursor-pointer"
                                    title="Delete Lore Entry"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )
                              )}
                            </div>
                          )}
                        </div>

                        {isEditing && editingEntity ? (
                          <div className="mt-2 p-4 bg-stone-50 border border-amber-500 rounded-md space-y-2.5 font-sans">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={editingEntity.name}
                                onChange={(ev) => setEditingEntity({ ...editingEntity, name: ev.target.value })}
                                className="px-2.5 py-1.5 border border-stone-300 rounded text-xs bg-white text-stone-900 font-semibold"
                              />
                              <select
                                value={editingEntity.category}
                                onChange={(ev) => setEditingEntity({ ...editingEntity, category: ev.target.value as LoreCategory })}
                                className="px-2.5 py-1.5 border border-stone-300 rounded text-xs bg-white text-stone-900"
                              >
                                {categories.filter((c) => c !== 'All').map((c) => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                            </div>
                            <input
                              type="text"
                              value={editingEntity.summary}
                              onChange={(ev) => setEditingEntity({ ...editingEntity, summary: ev.target.value })}
                              className="w-full px-2.5 py-1.5 border border-stone-300 rounded text-xs bg-white text-stone-900"
                            />
                            <textarea
                              rows={8}
                              value={editingEntity.body_markdown}
                              onChange={(ev) => setEditingEntity({ ...editingEntity, body_markdown: ev.target.value })}
                              className="w-full px-2.5 py-2 border border-stone-300 rounded font-mono text-xs bg-white text-stone-900"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingEntity(null)}
                                className="px-3 py-1 rounded border border-stone-300 text-xs text-stone-700 hover:bg-stone-100 cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onUpsertLore?.(editingEntity);
                                  setEditingEntity(null);
                                }}
                                className="flex items-center gap-1 px-3 py-1 rounded bg-amber-700 hover:bg-amber-600 text-white text-xs font-semibold cursor-pointer"
                              >
                                <Save className="w-3 h-3" />
                                <span>Save Entry</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <h2 className="text-xl font-serif text-[#2c3e50] font-bold mb-2">
                              {e.name}
                            </h2>
                            <p className="summary italic text-stone-600 text-sm mb-3 font-serif">
                              {e.summary}
                            </p>
                            <div className="font-serif text-sm leading-relaxed text-stone-800 whitespace-pre-line space-y-2">
                              {e.body_markdown}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hidden Print Root: Rendered strictly when window.print() is fired */}
      <div className="print-only hidden compendium-print-root">
        <h1 className="compendium-title">Compendium of the Realm</h1>
        {sortedEntities.map((e) => (
          <div key={e.id} className="pdf-chapter">
            <span className="category-tag">{e.category}</span>
            <h2>{e.name}</h2>
            <p className="summary">{e.summary}</p>
            <div className="entity-body whitespace-pre-line">{e.body_markdown}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
