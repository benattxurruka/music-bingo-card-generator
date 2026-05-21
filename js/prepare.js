import { t } from './translations.js';
import { parseSongs, escapeHtml, extractVideoId, parseTimeInput, fmtMmSs, reformatTimeInput, shuffle } from './utils.js';
import { spotifyState, spotifyLogin } from './spotify.js';
import { startBingo, previewSegment } from './player.js';

// ── Persisted prepare data ─────────────────────────────────────
let prepareData = {};
let loadedConfig = null;

// ── Video search (for auto-fill URLs) ─────────────────────────
// Calls a Cloudflare Worker that proxies Piped/Invidious server-side,
// bypassing browser CORS restrictions. Deploy search-worker.js at
// https://dash.cloudflare.com and paste your *.workers.dev URL below.
const SEARCH_WORKER_URL  = 'https://music-bingo-searcher.betxurruka.workers.dev';

async function fetchPipedSearch(query) {
  if (!SEARCH_WORKER_URL) return null;
  try {
    const res = await fetch(
      `${SEARCH_WORKER_URL}?q=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const { videoId } = await res.json();
    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
  } catch (_) {
    return null;
  }
}

// ── Prepare table ──────────────────────────────────────────────
export function renderPrepareTable(switchTab) {
  const songs = parseSongs(document.getElementById('songs-input').value);
  const tbody = document.getElementById('prepare-tbody');
  tbody.innerHTML = '';

  if (songs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="prepare-empty">${t('player.prepare.noSongs')}</td></tr>`;
    return;
  }

  songs.forEach(song => {
    const saved      = prepareData[song] || {};
    const startDisp  = saved.startSeconds !== undefined ? fmtMmSs(saved.startSeconds) : '';
    const endDisp    = saved.endSeconds   !== undefined ? fmtMmSs(saved.endSeconds)   : '';
    const isOverride = !!(saved.ytOverride);
    const tr         = document.createElement('tr');
    tr.innerHTML = `
      <td class="song-name-cell" title="${escapeHtml(song)}">${escapeHtml(song)}</td>
      <td class="col-url">
        <input type="text" class="url-input${isOverride ? ' yt-override-on' : ''}"
          placeholder="https://youtube.com/watch?v=..."
          value="${escapeHtml(saved.url || '')}">
      </td>
      <td class="col-seconds">
        <input type="text" class="start-input" placeholder="0:00"
          value="${escapeHtml(startDisp)}">
      </td>
      <td class="col-seconds">
        <input type="text" class="end-input" placeholder="1:00"
          value="${escapeHtml(endDisp)}">
      </td>
      <td class="col-yt-override">
        <input type="checkbox" class="yt-override-cb" title="${escapeHtml(t('player.prepare.ytOverrideCol'))}"${isOverride ? ' checked' : ''}>
      </td>
      <td class="col-preview">
        <button class="btn-preview-song" title="Preview">▶</button>
      </td>`;

    const urlInput    = tr.querySelector('.url-input');
    const startInput  = tr.querySelector('.start-input');
    const endInput    = tr.querySelector('.end-input');
    const overrideCb  = tr.querySelector('.yt-override-cb');
    const previewBtn  = tr.querySelector('.btn-preview-song');

    function saveRow() {
      const vid = extractVideoId(urlInput.value.trim());
      if (urlInput.value.trim()) {
        urlInput.classList.toggle('url-valid',   !!vid);
        urlInput.classList.toggle('url-invalid', !vid);
      } else {
        urlInput.classList.remove('url-valid', 'url-invalid');
      }
      prepareData[song] = {
        url:          urlInput.value.trim(),
        startSeconds: parseTimeInput(startInput.value),
        endSeconds:   parseTimeInput(endInput.value),
        ytOverride:   overrideCb.checked,
      };
    }

    overrideCb.addEventListener('change', () => {
      urlInput.classList.toggle('yt-override-on', overrideCb.checked);
      saveRow();
    });

    urlInput.addEventListener('input', saveRow);
    startInput.addEventListener('input', saveRow);
    endInput.addEventListener('input', saveRow);

    // On blur, reformat the time inputs to mm:ss
    startInput.addEventListener('blur', () => { reformatTimeInput(startInput); saveRow(); });
    endInput.addEventListener('blur',   () => { reformatTimeInput(endInput);   saveRow(); });

    if (saved.url) saveRow(); // validate pre-filled value

    previewBtn.addEventListener('click', () => {
      saveRow();
      const d     = prepareData[song] || {};
      const start = d.startSeconds !== undefined ? d.startSeconds : 0;
      const end   = d.endSeconds   !== undefined ? d.endSeconds   : start + 60;
      const useSpotify = spotifyState.ready && spotifyState.deviceId && !overrideCb.checked;
      if (!useSpotify) {
        const vid = extractVideoId(urlInput.value.trim());
        if (!vid) { alert('Please enter a valid YouTube URL first.'); return; }
        previewSegment(vid, start, end, null);
      } else {
        previewSegment(null, start, end, song);
      }
      switchTab('tab-player');
    });

    tbody.appendChild(tr);
  });
}

export function initPrepare(switchTab) {
  // ── Export config ──────────────────────────────────────────────
  document.getElementById('btn-export-config').addEventListener('click', () => {
    const songs = parseSongs(document.getElementById('songs-input').value);
    if (songs.length === 0) { alert(t('player.prepare.noSongs')); return; }

    const config = {
      version:          1,
      exportedAt:       new Date().toISOString(),
      spotifyConnected: spotifyState.ready,
      songs: songs.map(song => {
        const d     = prepareData[song] || {};
        const start = d.startSeconds !== undefined ? d.startSeconds : 0;
        const end   = d.endSeconds   !== undefined ? d.endSeconds   : start + 60;
        return {
          name:         song,
          videoId:      extractVideoId(d.url || '') || '',
          startSeconds: start,
          endSeconds:   end,
          ytOverride:   !!d.ytOverride,
        };
      }),
    };

    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'bingo-config.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // ── Auto-fill URLs via Piped search ───────────────────────────
  document.getElementById('btn-autofill-urls').addEventListener('click', async () => {
    const btn      = document.getElementById('btn-autofill-urls');
    const statusEl = document.getElementById('autofill-status');

    // Collect table rows that have no URL yet
    const todo = [...document.querySelectorAll('#prepare-tbody tr')].reduce((acc, tr) => {
      const urlInput = tr.querySelector('.url-input');
      const nameCell = tr.querySelector('.song-name-cell');
      if (urlInput && !urlInput.value.trim() && nameCell) {
        acc.push({ urlInput, song: nameCell.title || nameCell.textContent.trim() });
      }
      return acc;
    }, []);

    if (!todo.length) {
      statusEl.style.color = '#888';
      statusEl.textContent = t('player.prepare.autofillNone');
      return;
    }

    btn.disabled = true;
    statusEl.style.color = '#888';
    statusEl.textContent = t('player.prepare.autofillProgress', 0, todo.length);
    let filled = 0;

    for (let i = 0; i < todo.length; i++) {
      statusEl.textContent = t('player.prepare.autofillProgress', i + 1, todo.length);
      // Yield to the browser so the status text paints before the fetch blocks
      await new Promise(r => setTimeout(r, 0));
      const { urlInput, song } = todo[i];
      const url = await fetchPipedSearch(song);
      if (url) {
        urlInput.value = url;
        urlInput.dispatchEvent(new Event('input')); // triggers saveRow
        filled++;
      }
      // Small pause between requests so we don't hammer a single instance
      if (i < todo.length - 1) await new Promise(r => setTimeout(r, 300));
    }

    btn.disabled = false;
    if (filled === 0) {
      statusEl.style.color = '#dc2626';
      statusEl.textContent = t('player.prepare.autofillDone', filled, todo.length);
    } else {
      statusEl.style.color = '#16a34a';
      statusEl.textContent = t('player.prepare.autofillDone', filled, todo.length);
    }
  });

  // ── Play directly from Prepare (no export needed) ─────────────
  document.getElementById('btn-play-from-prepare').addEventListener('click', () => {
    const songs = parseSongs(document.getElementById('songs-input').value);
    if (songs.length === 0) { alert(t('player.prepare.noSongs')); return; }

    const valid = songs
      .map(song => {
        const d     = prepareData[song] || {};
        const start = d.startSeconds !== undefined ? d.startSeconds : 0;
        const end   = d.endSeconds   !== undefined ? d.endSeconds   : start + 60;
        return { name: song, videoId: extractVideoId(d.url || '') || '', startSeconds: start, endSeconds: end, ytOverride: !!d.ytOverride };
      })
      .filter(s => s.videoId || (spotifyState.ready && !s.ytOverride));

    if (valid.length === 0) {
      alert('No songs have YouTube URLs yet. Fill in the URLs in the table above first.');
      return;
    }

    loadedConfig = null;
    switchTab('tab-player');
    startBingo(shuffle(valid));
  });

  // ── Play Bingo button (from Player tab) ────────────────────────
  document.getElementById('btn-play-bingo').addEventListener('click', () => {
    const errorDiv = document.getElementById('play-bingo-error');
    const songs = parseSongs(document.getElementById('songs-input').value);
    const valid = songs
      .map(song => {
        const d     = prepareData[song] || {};
        const start = d.startSeconds !== undefined ? d.startSeconds : 0;
        const end   = d.endSeconds   !== undefined ? d.endSeconds   : start + 60;
        return { name: song, videoId: extractVideoId(d.url || '') || '', startSeconds: start, endSeconds: end, ytOverride: !!d.ytOverride };
      })
      .filter(s => s.videoId || (spotifyState.ready && !s.ytOverride));

    if (valid.length === 0) {
      errorDiv.style.display = 'block';
      return;
    }
    errorDiv.style.display = 'none';
    startBingo(shuffle(valid));
  });

  // ── Load config ────────────────────────────────────────────────
  document.getElementById('inp-load-config').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const cfg = JSON.parse(ev.target.result);
        if (!cfg.songs || !Array.isArray(cfg.songs)) throw new Error();
        loadedConfig = cfg;

        // Sync the song list textarea with the config's song names so that
        // renderPrepareTable (which reads from the textarea) can show them.
        const songsInput = document.getElementById('songs-input');
        const songCounter = document.getElementById('song-counter');
        songsInput.value = cfg.songs.map(s => s.name).join('\n');
        songCounter.textContent = t('songs.counter', cfg.songs.length);

        // Populate prepareData with URL, timing and override flag from the config
        cfg.songs.forEach(s => {
          prepareData[s.name] = {
            url:          s.videoId ? `https://www.youtube.com/watch?v=${s.videoId}` : '',
            startSeconds: s.startSeconds || 0,
            endSeconds:   s.endSeconds  !== undefined ? s.endSeconds : (s.startSeconds || 0) + 60,
            ytOverride:   !!s.ytOverride,
          };
        });
        renderPrepareTable(switchTab);

        const info = document.getElementById('config-loaded-info');
        info.textContent = t('player.play.loaded', cfg.songs.length);
        info.style.display = 'inline';

        // Warn if config was exported with Spotify but it's not connected now
        if (cfg.spotifyConnected && !spotifyState.ready) {
          const connect = confirm(t('player.prepare.spotifyWasUsed'));
          if (connect) spotifyLogin();
        }
      } catch {
        alert('Could not read config file. Make sure it was exported from this app.');
      }
    };
    reader.readAsText(file);
  });
}
