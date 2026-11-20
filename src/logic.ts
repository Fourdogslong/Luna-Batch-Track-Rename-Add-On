export type SequenceMode = 'none' | 'numbers' | 'letters';
export type SpecialMode = 'keep' | 'remove' | 'space';

export interface RenameSettings {
  find: string;
  replace: string;
  caseSensitive: boolean;
  eraseAll: boolean;
  removeFirst: number;
  removeLast: number;
  specialMode: SpecialMode;
  sequenceMode: SequenceMode;
  sequenceStart: number;
  sequenceWidth: number;
  sequencePosition: 'append' | 'prepend';
  appendText: string;
}

export interface RenamePreviewRow { id: string; before: string; after: string }

export const DEFAULT_SETTINGS: RenameSettings = {
  find: '', replace: '', caseSensitive: false, eraseAll: false, removeFirst: 0, removeLast: 0, specialMode: 'keep',
  sequenceMode: 'none', sequenceStart: 1, sequenceWidth: 2,
  sequencePosition: 'append', appendText: '',
};

export function parseTerms(value: string): string[] {
  return [...new Set(value.split(/[\n,]+/).map((term) => term.trim()).filter(Boolean))];
}

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function alphabeticSequence(value: number): string {
  let n = Math.max(1, Math.floor(value));
  let result = '';
  while (n > 0) {
    n -= 1;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

function sequenceLabel(settings: RenameSettings, index: number): string {
  if (settings.sequenceMode === 'letters') return alphabeticSequence(settings.sequenceStart + index);
  return String(settings.sequenceStart + index).padStart(Math.max(1, settings.sequenceWidth), '0');
}

export function renameName(name: string, settings: RenameSettings, sequenceIndex?: number): string {
  let result = '';
  if (!settings.eraseAll) {
    const characters = Array.from(name);
    const first = Math.min(characters.length, Math.max(0, Math.floor(settings.removeFirst || 0)));
    const last = Math.min(characters.length - first, Math.max(0, Math.floor(settings.removeLast || 0)));
    result = characters.slice(first, characters.length - last).join('');
    const terms = parseTerms(settings.find).sort((a, b) => b.length - a.length);
    if (terms.length) {
      const pattern = new RegExp(terms.map(escapeRegExp).join('|'), settings.caseSensitive ? 'g' : 'gi');
      result = result.replace(pattern, () => settings.replace);
    }
    if (settings.specialMode !== 'keep') {
      result = result.replace(/[\p{P}\p{S}]/gu, settings.specialMode === 'space' ? ' ' : '');
    }
  }
  result = result.replace(/\s+/g, ' ').trim();
  if (settings.appendText.trim()) result = `${settings.appendText.trim()}${result ? ' ' : ''}${result}`;
  if (settings.sequenceMode !== 'none' && sequenceIndex !== undefined) {
    const label = sequenceLabel(settings, sequenceIndex);
    result = settings.sequencePosition === 'prepend' ? `${label} ${result}` : `${result}${result ? ' ' : ''}${label}`;
  }
  return result.trim();
}

/** Build a stable preview: sequence numbers follow the track order in the chosen scope. */
export function previewRename(tracks: readonly Pick<Luna.Track, 'id' | 'name'>[], settings: RenameSettings): RenamePreviewRow[] {
  return tracks.map((track, index) => ({
    id: track.id,
    before: track.name.value ?? track.id,
    after: renameName(track.name.value ?? track.id, settings, index),
  }));
}

/** Rename every track in one undoable action. */
export async function applyRename(session: Luna.Session, tracks: readonly Luna.Track[], settings: RenameSettings): Promise<number> {
  const rows = previewRename(tracks, settings);
  let changed = 0;
  await session.transaction('Batch rename tracks', async () => {
    for (const row of rows) {
      if (row.before === row.after) continue;
      const track = session.tracks.byId(row.id);
      if (track) { await track.name.set(row.after); changed += 1; }
    }
  });
  return changed;
}

export interface SavedPreset { id: string; name: string; settings: RenameSettings }
export const PRESET_STORAGE_KEY = 'com.uaudio.batch-track-renamer.presets.v1';

export function readPresets(storage: Pick<Storage, 'getItem'>): SavedPreset[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(PRESET_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((p): p is SavedPreset => !!p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.settings === 'object' && p.settings !== null)
      .map((p) => ({ ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings } }));
  } catch { return []; }
}

export function writePresets(storage: Pick<Storage, 'setItem'>, presets: readonly SavedPreset[]): void {
  storage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
}
