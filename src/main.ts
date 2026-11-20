import { applyRename, DEFAULT_SETTINGS, previewRename, readPresets, writePresets, type RenameSettings, type SavedPreset } from './logic';

type Scope = 'all' | 'selected';
const $ = <T extends HTMLElement = HTMLElement>(id: string, _type?: { new(): T }): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
};

let luna: Luna.Client;
let session: Luna.Session | undefined;
let scope: Scope = 'all';
let settings: RenameSettings = { ...DEFAULT_SETTINGS };
let presets: SavedPreset[] = [];
let loadedPresetId: string | undefined;
let releases: Luna.Unsubscribe[] = [];
const keep = (release: Luna.Unsubscribe): void => { releases.push(release); };
function releaseSession(): void { releases.forEach((fn) => fn()); releases = []; }

function selectedTracks(): Luna.Track[] {
  if (!session) return [];
  const tracks = session.visibleTracks;
  if (scope === 'all') return tracks;
  const selected = new Set(session.context.selectionTracks.value ?? []);
  return tracks.filter((track) => selected.has(track.id));
}

function readForm(): RenameSettings {
  return {
    find: $('find', HTMLTextAreaElement).value,
    replace: $('replace', HTMLInputElement).value,
    caseSensitive: $('case-sensitive', HTMLInputElement).checked,
    eraseAll: $('erase-all', HTMLInputElement).checked,
    removeFirst: Math.max(0, Number.parseInt($('remove-first', HTMLInputElement).value, 10) || 0),
    removeLast: Math.max(0, Number.parseInt($('remove-last', HTMLInputElement).value, 10) || 0),
    specialMode: ($('special-mode') as HTMLSelectElement).value as RenameSettings['specialMode'],
    sequenceMode: ($('sequence-mode') as HTMLSelectElement).value as RenameSettings['sequenceMode'],
    sequenceStart: Math.max(1, Number.parseInt($('sequence-start', HTMLInputElement).value, 10) || 1),
    sequenceWidth: Math.min(8, Math.max(1, Number.parseInt($('sequence-width', HTMLSelectElement).value, 10) || 1)),
    sequencePosition: ($('sequence-position') as HTMLSelectElement).value as RenameSettings['sequencePosition'],
    appendText: $('append-text', HTMLInputElement).value,
  };
}

function writeForm(value: RenameSettings): void {
  settings = { ...DEFAULT_SETTINGS, ...value };
  $('find', HTMLTextAreaElement).value = settings.find;
  $('replace', HTMLInputElement).value = settings.replace;
  $('case-sensitive', HTMLInputElement).checked = settings.caseSensitive;
  $('erase-all', HTMLInputElement).checked = settings.eraseAll;
  $('remove-first', HTMLInputElement).value = String(settings.removeFirst);
  $('remove-last', HTMLInputElement).value = String(settings.removeLast);
  $('special-mode', HTMLSelectElement).value = settings.specialMode;
  $('sequence-mode', HTMLSelectElement).value = settings.sequenceMode;
  $('sequence-start', HTMLInputElement).value = String(settings.sequenceStart);
  $('sequence-width', HTMLSelectElement).value = String(settings.sequenceWidth);
  $('sequence-position', HTMLSelectElement).value = settings.sequencePosition;
  $('append-text', HTMLInputElement).value = settings.appendText;
  updateControls();
  renderPreview();
}

function updateControls(): void {
  const sequenceOn = settings.sequenceMode !== 'none';
  for (const id of ['find', 'replace', 'case-sensitive', 'remove-first', 'remove-last', 'special-mode']) {
    $(id).toggleAttribute('disabled', settings.eraseAll);
  }
  $('sequence-options').classList.toggle('disabled', !sequenceOn);
  $('sequence-start', HTMLInputElement).disabled = !sequenceOn;
  $('sequence-position', HTMLSelectElement).disabled = !sequenceOn;
  $('sequence-width', HTMLSelectElement).disabled = settings.sequenceMode !== 'numbers';
}

function renderScope(): void {
  $('scope-all').classList.toggle('active', scope === 'all');
  $('scope-selected').classList.toggle('active', scope === 'selected');
  renderPreview();
}

function renderPreview(): void {
  const root = $('preview');
  root.replaceChildren();
  const tracks = selectedTracks();
  const rows = previewRename(tracks, settings);
  $('preview-count').textContent = `${rows.length} track${rows.length === 1 ? '' : 's'}`;
  const apply = $('apply', HTMLButtonElement);
  apply.disabled = rows.length === 0 || !rows.some((row) => row.before !== row.after);
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = scope === 'selected' ? 'Select tracks in LUNA to preview them.' : 'No tracks in this session.';
    root.append(empty);
    return;
  }
  for (const row of rows) {
    const item = document.createElement('div');
    item.className = 'preview-row';
    const before = document.createElement('span'); before.textContent = row.before;
    const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = '→';
    const after = document.createElement('span'); after.className = 'after'; after.textContent = row.after || '(empty name)';
    item.append(before, arrow, after);
    root.append(item);
  }
}

function persistPresets(): void {
  try { writePresets(localStorage, presets); $('preset-status').textContent = ''; }
  catch { $('preset-status').textContent = 'Could not save presets in this host.'; }
  renderPresets();
}

function renderPresets(): void {
  const select = $('presets', HTMLSelectElement);
  select.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = ''; placeholder.textContent = presets.length ? 'Choose a saved preset…' : 'No saved presets';
  select.append(placeholder);
  for (const preset of presets) {
    const option = document.createElement('option'); option.value = preset.id; option.textContent = preset.name; select.append(option);
  }
  select.value = loadedPresetId ?? '';
  const active = presets.find((preset) => preset.id === loadedPresetId);
  $('preset-name', HTMLInputElement).value = active?.name ?? '';
  $('rename-preset', HTMLButtonElement).disabled = !loadedPresetId;
  $('delete-preset', HTMLButtonElement).disabled = !loadedPresetId;
  $('save-preset', HTMLButtonElement).textContent = loadedPresetId ? 'Save changes' : 'Save as…';
}

function wireUI(): void {
  for (const id of ['find', 'replace', 'case-sensitive', 'erase-all', 'remove-first', 'remove-last', 'special-mode', 'sequence-mode', 'sequence-start', 'sequence-width', 'sequence-position', 'append-text']) {
    $(id).addEventListener('input', () => {
      settings = readForm(); updateControls(); renderPreview();
    });
    $(id).addEventListener('change', () => {
      settings = readForm(); updateControls(); renderPreview();
    });
  }
  $('scope-all').onclick = () => { scope = 'all'; renderScope(); };
  $('scope-selected').onclick = () => { scope = 'selected'; renderScope(); };
  $('presets').onchange = () => {
    loadedPresetId = $('presets', HTMLSelectElement).value || undefined;
    const preset = presets.find((item) => item.id === loadedPresetId);
    if (preset) { $('preset-name', HTMLInputElement).value = preset.name; writeForm(preset.settings); }
    else $('preset-name', HTMLInputElement).value = '';
    renderPresets();
  };
  $('save-preset').onclick = () => {
    settings = readForm();
    if (loadedPresetId) {
      presets = presets.map((item) => item.id === loadedPresetId ? { ...item, settings: { ...settings } } : item);
    } else {
      const name = $('preset-name', HTMLInputElement).value.trim();
      if (!name) { $('preset-status').textContent = 'Enter a preset name first.'; return; }
      const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const preset = { id, name, settings: { ...settings } };
      presets = [...presets, preset]; loadedPresetId = id;
    }
    persistPresets();
  };
  $('rename-preset').onclick = () => {
    const preset = presets.find((item) => item.id === loadedPresetId);
    if (!preset) return;
    const name = $('preset-name', HTMLInputElement).value.trim();
    if (name) { presets = presets.map((item) => item.id === preset.id ? { ...item, name } : item); persistPresets(); }
    else $('preset-status').textContent = 'Enter a preset name first.';
  };
  $('delete-preset').onclick = () => {
    if (!loadedPresetId) return;
    presets = presets.filter((item) => item.id !== loadedPresetId); loadedPresetId = undefined; persistPresets();
  };
  $('apply').onclick = async () => {
    if (!session) return;
    settings = readForm();
    const tracks = selectedTracks();
    if (!tracks.length) return;
    const button = $('apply', HTMLButtonElement);
    button.disabled = true;
    $('status').textContent = 'Renaming…';
    try {
      const count = await applyRename(session, tracks, settings);
      $('status').textContent = `${count} track${count === 1 ? '' : 's'} renamed`;
      if (count > 0 && $('reset-after-rename-input', HTMLInputElement).checked) {
        writeForm(DEFAULT_SETTINGS);
        loadedPresetId = undefined;
        $('preset-name', HTMLInputElement).value = '';
        $('preset-status').textContent = '';
        renderPresets();
      }
    } catch (error) {
      $('status').textContent = `Rename failed: ${String((error as Error).message ?? error)}`;
    }
    renderPreview();
  };
}

async function bindSession(): Promise<void> {
  releaseSession();
  session = luna.sessions.current();
  if (!session) {
    $('status').textContent = 'Connect to a LUNA session';
    $('preview').replaceChildren(); $('apply', HTMLButtonElement).disabled = true; renderScope(); return;
  }
  $('status').textContent = 'Loading session…';
  await session.ready();
  presets = readPresets(localStorage);
  renderPresets();
  $('status').textContent = '';
  keep(session.tracks.onChange(() => renderScope()));
  keep(session.context.selectionTracks.onChange(renderScope));
  renderScope();
}

async function connect(): Promise<void> {
  for (;;) {
    try {
      luna = await Luna.connect();
      break;
    } catch (error) {
      if (!(error instanceof Luna.NotRunning)) {
        $('status').textContent = String((error as Error).message ?? error);
        return;
      }
      $('status').textContent = 'Waiting for LUNA…';
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  try {
    Luna.bindShortcuts(luna);
    await luna.sessions.ready();
    luna.sessions.focused.onChange(() => void bindSession());
    luna.sessions.items.onChange(() => void bindSession());
    luna.status.onChange(() => { if (luna.status.value === 'disconnected') $('status').textContent = 'Reconnecting…'; });
    wireUI(); renderPresets(); writeForm(DEFAULT_SETTINGS); await bindSession();
  } catch (error) {
    $('status').textContent = String((error as Error).message ?? error);
  }
}

void connect();
