import { t } from './translations.js';
import { escapeHtml, fmtTime } from './utils.js';
import { ytPlayer, ytLoad, ytStop, ytCommand, clearPlayerError } from './youtube.js';
import { spotifyState, spotifySearchTrack, spotifyPlayTrack } from './spotify.js';

// ── Playback state ─────────────────────────────────────────────
let playlist        = [];
let currentIndex    = -1;
let segmentDuration = 60000; // ms of the current segment
let segmentElapsed  = 0;     // ms elapsed before the last pause
let segmentStart    = 0;     // Date.now() when playback (re)started
let isPaused        = false;
let segmentTimer    = null;
let progressTimer   = null;
let isPreviewMode   = false; // true while playing a single preview
let spotifyIsPlaying  = false; // true when current audio is coming from Spotify
let currentSpotifyUri = null;  // URI of the track currently playing on Spotify
let previewStopTimer  = null;

function usingSpotify() { return spotifyIsPlaying; }

// ── Fullscreen state ───────────────────────────────────────────
let isFullscreen = false;

function updateFullscreenUI() {
  if (!isFullscreen) return;
  const song = playlist[currentIndex];
  if (!song) return;

  // Split "Song Title - Artist" into title + artist parts
  const sep = song.name.match(/\s[-–—]\s/);
  const splitAt = sep ? song.name.indexOf(sep[0]) : -1;
  const title  = splitAt > 0 ? song.name.slice(0, splitAt) : song.name;
  const artist = splitAt > 0 ? song.name.slice(splitAt + sep[0].length) : '';

  document.getElementById('fs-song-title').textContent  = title;
  document.getElementById('fs-song-artist').textContent = artist;

  // Last 5 played songs (before the current one), most recent first
  const historyDiv = document.getElementById('fs-history');
  const lastPlayed = playlist.slice(Math.max(0, currentIndex - 5), currentIndex).reverse();
  if (lastPlayed.length > 0) {
    historyDiv.innerHTML = `<div class="fs-history-label">${escapeHtml(t('player.play.lastPlayed'))}</div>`;
    lastPlayed.forEach((s, i) => {
      const item = document.createElement('div');
      const isOldest       = i === lastPlayed.length - 1 && lastPlayed.length === 5;
      const isSecondOldest = i === lastPlayed.length - 2 && lastPlayed.length === 5;
      item.className = 'fs-history-item' +
        (isOldest       ? ' fs-history-item--oldest' : '') +
        (isSecondOldest ? ' fs-history-item--fourth'  : '');
      item.textContent = s.name;
      historyDiv.appendChild(item);
    });
    historyDiv.style.display = 'flex';
  } else {
    historyDiv.style.display = 'none';
  }
}

function openFullscreen() {
  isFullscreen = true;
  const overlay = document.getElementById('fullscreen-overlay');
  overlay.classList.add('fs-active');
  updateFullscreenUI();
  overlay.requestFullscreen?.().catch(() => {});
}

function closeFullscreen() {
  isFullscreen = false;
  document.getElementById('fullscreen-overlay').classList.remove('fs-active');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

// ── Exported API ───────────────────────────────────────────────

// Show/hide elements that differ between preview mode and full bingo play
export function syncPreviewUI(preview) {
  document.getElementById('ctrl-fullscreen').style.display = preview ? 'none' : '';
  document.getElementById('ctrl-prev').style.display       = preview ? 'none' : '';
  document.getElementById('ctrl-next').style.display       = preview ? 'none' : '';
  document.querySelector('.player-queue').style.display    = preview ? 'none' : '';
  // Spotify link: only in preview, only when Spotify is playing
  const spWrap = document.getElementById('sp-link-wrap');
  if (preview && spotifyIsPlaying && currentSpotifyUri) {
    const trackId = currentSpotifyUri.split(':').pop();
    document.getElementById('sp-link').href = `https://open.spotify.com/track/${trackId}`;
    spWrap.style.display = '';
  } else {
    spWrap.style.display = 'none';
  }
}

export function clearTimers() {
  clearTimeout(segmentTimer);
  clearInterval(progressTimer);
  segmentTimer  = null;
  progressTimer = null;
}

export function startProgressUI() {
  const fill   = document.getElementById('progress-bar-fill');
  const timeEl = document.getElementById('player-time');
  const total  = Math.round(segmentDuration / 1000);
  segmentStart = Date.now() - segmentElapsed;

  const fsFill = document.getElementById('fs-progress-bar-fill');
  const fsTime = document.getElementById('fs-progress-time');

  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    const elapsed = Date.now() - segmentStart;
    const pct     = Math.min(100, elapsed / segmentDuration * 100);
    const elSec   = Math.min(total, Math.round(elapsed / 1000));
    const timeStr = `${fmtTime(elSec)} / ${fmtTime(total)}`;

    fill.style.width    = pct + '%';
    timeEl.textContent  = timeStr;
    fsFill.style.width  = pct + '%';
    fsTime.textContent  = timeStr;

    // Fade volume to 0 over the last 2 seconds of the segment
    const fadeMs = 2000;
    if (elapsed >= segmentDuration - fadeMs) {
      const fadeRatio = Math.min(1, (elapsed - (segmentDuration - fadeMs)) / fadeMs);
      if (ytPlayer && typeof ytPlayer.setVolume === 'function') {
        try { ytPlayer.setVolume(Math.round(100 * (1 - fadeRatio))); } catch (_) {}
      }
      if (spotifyState.player) { try { spotifyState.player.setVolume(1 - fadeRatio); } catch(_) {} }
    }
  }, 200);
}

export function seekToRatio(ratio) {
  if (!playlist[currentIndex]) return;
  const song = playlist[currentIndex];
  const newElapsedMs = ratio * segmentDuration;
  const ytTime = song.startSeconds + ratio * (song.endSeconds - song.startSeconds);
  segmentElapsed = newElapsedMs;
  clearTimers();
  if (usingSpotify()) {
    try { spotifyState.player.setVolume(1); spotifyState.player.seek(Math.round(song.startSeconds * 1000 + newElapsedMs)); } catch(_) {}
  } else if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
    try { ytPlayer.setVolume(100); ytPlayer.seekTo(ytTime, true); } catch (_) {}
  }
  startProgressUI();
  if (!isPaused) {
    const remaining = segmentDuration - newElapsedMs;
    segmentTimer = setTimeout(() => { if (!isPreviewMode) advanceToNext(); }, remaining + 1000);
  }
}

export function syncPauseButtons() {
  const label = isPaused ? t('player.play.resume') : t('player.play.pause');
  document.getElementById('ctrl-pause').textContent    = label;
  document.getElementById('fs-ctrl-pause').textContent = label;
}

export function togglePause() {
  if (isPaused) {
    isPaused = false;
    if (usingSpotify()) { try { spotifyState.player.resume(); } catch(_) {} }
    else ytCommand('playVideo');
    syncPauseButtons();
    const remaining = segmentDuration - segmentElapsed;
    startProgressUI();
    segmentTimer = setTimeout(() => { if (!isPreviewMode) advanceToNext(); }, remaining + 1000);
  } else {
    isPaused       = true;
    segmentElapsed = Date.now() - segmentStart;
    clearTimers();
    if (usingSpotify()) { try { spotifyState.player.pause(); } catch(_) {} }
    else ytCommand('pauseVideo');
    syncPauseButtons();
  }
}

export function updateQueueUI() {
  const list = document.getElementById('queue-list');
  list.innerHTML = '';
  // Only show already-played songs and the current one — hide upcoming to preserve bingo suspense
  playlist.forEach((song, i) => {
    if (i > currentIndex) return;
    const div = document.createElement('div');
    div.className = 'queue-item' +
      (i === currentIndex ? ' q-current' : ' q-played');
    div.innerHTML =
      `<span class="queue-num">${i + 1}</span>` +
      `<span class="queue-icon">♪ </span>` +
      `<span>${escapeHtml(song.name)}</span>`;
    list.appendChild(div);
  });
  const cur = list.querySelector('.q-current');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
  document.getElementById('queue-progress-label').textContent =
    playlist.length ? t('player.play.queuePos', currentIndex + 1, playlist.length) : '';
}

export function advanceToNext() {
  if (isPreviewMode) return;
  clearTimers();
  if (currentIndex < playlist.length - 1) {
    playSong(currentIndex + 1);
  } else {
    document.getElementById('player-song-name').textContent = '✓ Done';
    document.getElementById('progress-bar-fill').style.width = '100%';
    updateQueueUI();
    document.getElementById('modal-finished').classList.add('modal-active');
  }
}

export async function playSong(index) {
  if (index < 0 || index >= playlist.length) return;
  clearTimers();
  isPreviewMode  = false;
  currentIndex   = index;
  isPaused       = false;
  syncPreviewUI(false);
  segmentElapsed = 0;

  const song     = playlist[index];
  const start    = song.startSeconds;
  const end      = song.endSeconds;
  segmentDuration = (end - start) * 1000;

  document.getElementById('player-song-name').textContent = song.name;
  syncPauseButtons();
  document.getElementById('progress-bar-fill').style.width  = '0%';
  document.getElementById('fs-progress-bar-fill').style.width = '0%';
  clearPlayerError();
  // Stop both sources before starting the new song
  ytStop();
  if (spotifyState.player) { try { spotifyState.player.pause(); } catch(_) {} }
  // Reset volume for new song (undoes the fade-out from the previous song)
  if (ytPlayer && typeof ytPlayer.setVolume === 'function') {
    try { ytPlayer.setVolume(100); } catch (_) {}
  }
  if (spotifyState.player) { try { spotifyState.player.setVolume(1); } catch(_) {} }
  updateQueueUI();

  // Update YouTube link
  const ytLinkWrap = document.getElementById('yt-link-wrap');
  const ytLinkEl   = document.getElementById('yt-link');
  if (song.videoId) {
    ytLinkEl.href = `https://www.youtube.com/watch?v=${song.videoId}&t=${Math.floor(start)}`;
    ytLinkWrap.style.display = '';
  } else {
    ytLinkWrap.style.display = 'none';
  }

  // Show player UI and start progress regardless of audio source
  document.getElementById('player-ui').style.display = 'flex';
  updateFullscreenUI();
  startProgressUI();
  segmentTimer = setTimeout(() => advanceToNext(), segmentDuration + 1000);

  // Use Spotify if connected and not overridden for this song, fall back to YouTube
  if (spotifyState.ready && spotifyState.deviceId && !song.ytOverride) {
    const uri = await spotifySearchTrack(song.name);
    if (uri) {
      spotifyIsPlaying = true;
      await spotifyPlayTrack(uri, start * 1000);
      return;
    }
  }
  spotifyIsPlaying = false;
  ytLoad(song.videoId, start);
}

export function startBingo(shuffledSongs) {
  playlist      = shuffledSongs;
  currentIndex  = -1;
  isPreviewMode = false;
  document.getElementById('play-bingo-error').style.display = 'none';
  document.getElementById('btn-play-bingo').style.display   = 'none';
  document.getElementById('btn-stop-bingo').style.display   = 'inline-block';
  updateQueueUI();
  playSong(0);
}

export async function previewSegment(videoId, startSeconds, endSeconds, songName) {
  clearTimers();
  clearTimeout(previewStopTimer);
  isPreviewMode   = true;
  segmentDuration = (endSeconds - startSeconds) * 1000;
  segmentElapsed  = 0;
  isPaused        = false;

  document.getElementById('player-ui').style.display            = 'flex';
  document.getElementById('player-song-name').textContent       = '▶ Preview';
  syncPauseButtons();
  document.getElementById('progress-bar-fill').style.width      = '0%';
  document.getElementById('queue-progress-label').textContent   = '';
  document.getElementById('queue-list').innerHTML                = '';
  if (spotifyState.player) { try { spotifyState.player.setVolume(1); } catch(_) {} }
  if (ytPlayer && typeof ytPlayer.setVolume === 'function') { try { ytPlayer.setVolume(100); } catch(_) {} }

  startProgressUI();
  previewStopTimer = setTimeout(() => {
    if (spotifyState.player) { try { spotifyState.player.pause(); } catch(_) {} }
    ytStop();
    spotifyIsPlaying = false;
    isPreviewMode = false;
    syncPreviewUI(false);
  }, segmentDuration + 1000);

  if (spotifyState.ready && spotifyState.deviceId && songName) {
    const uri = await spotifySearchTrack(songName);
    if (uri) {
      spotifyIsPlaying  = true;
      currentSpotifyUri = uri;
      syncPreviewUI(true);
      await spotifyPlayTrack(uri, startSeconds * 1000);
      return;
    }
  }
  spotifyIsPlaying  = false;
  currentSpotifyUri = null;
  syncPreviewUI(true);
  ytLoad(videoId, startSeconds);
}

export function initPlayer(switchTab) {
  // Controls
  document.getElementById('ctrl-prev').addEventListener('click', () => {
    if (currentIndex > 0) playSong(currentIndex - 1);
  });

  document.getElementById('ctrl-next').addEventListener('click', () => {
    if (!isPreviewMode) advanceToNext();
  });

  document.getElementById('ctrl-pause').addEventListener('click', togglePause);
  document.getElementById('fs-ctrl-pause').addEventListener('click', togglePause);

  document.getElementById('fs-ctrl-prev').addEventListener('click', () => {
    if (currentIndex > 0) playSong(currentIndex - 1);
  });
  document.getElementById('fs-ctrl-next').addEventListener('click', () => {
    if (!isPreviewMode) advanceToNext();
  });

  // Seekable progress bars
  document.querySelector('.progress-bar-wrap').addEventListener('click', (e) => {
    const rect  = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekToRatio(ratio);
  });
  document.querySelector('.fs-progress-bar-wrap').addEventListener('click', (e) => {
    const rect  = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekToRatio(ratio);
  });

  document.getElementById('btn-stop-bingo').addEventListener('click', () => {
    clearTimers();
    ytStop();
    if (spotifyState.player) { try { spotifyState.player.pause(); } catch(_) {} }
    spotifyIsPlaying  = false;
    currentSpotifyUri = null;
    playlist      = [];
    currentIndex  = -1;
    isPaused      = false;
    isPreviewMode = false;
    syncPreviewUI(false);
    document.getElementById('player-ui').style.display           = 'none';
    document.getElementById('btn-stop-bingo').style.display      = 'none';
    document.getElementById('play-bingo-error').style.display    = 'none';
    document.getElementById('yt-link-wrap').style.display        = 'none';
    const playBtn = document.getElementById('btn-play-bingo');
    playBtn.style.display = 'inline-block';
    document.getElementById('queue-list').innerHTML              = '';
    document.getElementById('queue-progress-label').textContent  = '';
  });

  // ── Error link: go to Prepare Bingo tab ───────────────────────
  document.getElementById('error-goto-prepare').addEventListener('click', e => {
    e.preventDefault();
    switchTab('tab-prepare');
  });

  // ── Finished modal ─────────────────────────────────────────────
  document.getElementById('btn-modal-ok').addEventListener('click', () => {
    document.getElementById('modal-finished').classList.remove('modal-active');
  });

  // ── Spotify preview link — pause before opening ─────────────────
  document.getElementById('sp-link').addEventListener('click', (e) => {
    e.preventDefault();
    const href = e.currentTarget.href;
    if (isPreviewMode && !isPaused) togglePause();
    // Disconnect our SDK device so Spotify can freely use its own player in
    // the newly opened tab
    if (spotifyState.player) {
      try { spotifyState.player.disconnect(); } catch(_) {}
      spotifyState.ready = false;
      spotifyState.deviceId = null;
    }
    window.open(href, '_blank', 'noopener');
    // Reconnect automatically when the user comes back to this tab.
    document.addEventListener('visibilitychange', function _spReconnect() {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', _spReconnect);
      if (spotifyState.player) { try { spotifyState.player.connect(); } catch(_) {} }
    });
  });

  // ── Fullscreen ─────────────────────────────────────────────────
  document.getElementById('ctrl-fullscreen').addEventListener('click', openFullscreen);
  document.getElementById('btn-exit-fullscreen').addEventListener('click', closeFullscreen);

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isFullscreen) closeFullscreen();
  });
}
