import { applyTranslations, detectLang, t } from './translations.js';
import { parseSongs } from './utils.js';
import { DECADE_SONGS } from './data.js';
import { initGenerator } from './generator.js';
import { initYouTubeAPI } from './youtube.js';
import { initSpotify } from './spotify.js';
import { renderPrepareTable, initPrepare } from './prepare.js';
import { initPlayer } from './player.js';

// ── Tab switching ──────────────────────────────────────────────
const ALL_TABS = ['tab-generator', 'tab-prepare', 'tab-player'];

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  ALL_TABS.forEach(id => {
    document.getElementById(id).style.display = id === tabId ? '' : 'none';
  });
  if (tabId === 'tab-prepare') renderPrepareTable(switchTab);
  if (tabId === 'tab-player')  document.getElementById('play-bingo-error').style.display = 'none';
}

// ── Init ───────────────────────────────────────────────────────
const currentLang = detectLang();
document.getElementById('lang-select').value = currentLang;
applyTranslations(currentLang);

// Update song counter on initial load
const songsInput  = document.getElementById('songs-input');
const songCounter = document.getElementById('song-counter');
songCounter.textContent = t('songs.counter', parseSongs(songsInput.value).length);

// ── Language switcher ──────────────────────────────────────────
document.getElementById('lang-select').addEventListener('change', e => {
  applyTranslations(e.target.value);
  songCounter.textContent = t('songs.counter', parseSongs(songsInput.value).length);
});

// ── Live song counter ──────────────────────────────────────────
const errorList = document.getElementById('error-list');
songsInput.addEventListener('input', () => {
  songCounter.textContent = t('songs.counter', parseSongs(songsInput.value).length);
  errorList.style.display = 'none';
  songsInput.classList.remove('error');
});

// ── Decade example buttons ─────────────────────────────────────
document.querySelectorAll('.decade-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const songs = DECADE_SONGS[btn.dataset.decade];
    if (!songs) return;
    songsInput.value = songs;
    songsInput.dispatchEvent(new Event('input'));
  });
});

// ── Reset song list ────────────────────────────────────────────
document.getElementById('btn-reset-songs').addEventListener('click', () => {
  songsInput.value = '';
  songsInput.dispatchEvent(new Event('input'));
});

// ── Tab click listeners ────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ── Module inits ───────────────────────────────────────────────
initGenerator();
initYouTubeAPI();
initSpotify();
initPrepare(switchTab);
initPlayer(switchTab);
