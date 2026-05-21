import { t } from './translations.js';

// ── Helpers ────────────────────────────────────────────────────
export function parseSongs(text) {
  return text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
}

export const SONG_FORMAT = /^.+\s[-–—]\s.+$/;

export function validate(songs) {
  const errors = [];
  songs.forEach((song, i) => {
    if (!SONG_FORMAT.test(song)) errors.push(t('errors.format', i + 1, escapeHtml(song)));
  });
  return errors;
}

export function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function randomSample(arr, n) {
  const copy = [...arr], result = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function fmtTime(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

// ── Video/time helpers (used in Bingo Player) ──────────────────
export function extractVideoId(url) {
  if (!url) return null;
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_\-]{11})/
  );
  return m ? m[1] : null;
}

// Accepts "90", "1:30", "01:30" → returns seconds integer or undefined
export function parseTimeInput(val) {
  val = (val || '').trim();
  if (val === '') return undefined;
  const mmss = val.match(/^(\d+):(\d{2})$/);
  if (mmss) return parseInt(mmss[1], 10) * 60 + parseInt(mmss[2], 10);
  const n = parseInt(val, 10);
  return isNaN(n) ? undefined : n;
}

// Converts seconds integer → "m:ss" display string (e.g. 90 → "1:30")
export function fmtMmSs(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

// On blur: reformat the input value to mm:ss (or leave blank)
export function reformatTimeInput(input) {
  const parsed = parseTimeInput(input.value);
  input.value = parsed !== undefined ? fmtMmSs(parsed) : '';
}
