// ── YouTube IFrame API ─────────────────────────────────────────
(function () {
  const tag = document.createElement('script');
  tag.src   = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
})();

export let ytPlayer   = null;
let ytApiReady = false;

window.onYouTubeIframeAPIReady = function () { ytApiReady = true; };

export function waitForYtApi(timeoutMs) {
  if (ytApiReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const id = setInterval(() => {
      if (ytApiReady) { clearInterval(id); resolve(); }
      else if (Date.now() - start > (timeoutMs || 10000)) {
        clearInterval(id);
        reject(new Error('YouTube API failed to load.'));
      }
    }, 100);
  });
}

export function initYouTubeAPI() {
  // The IIFE above already injects the script tag at module load time.
  // This function is a no-op hook that main.js can call for clarity.
}

export function showPlayerError(msg) {
  const el = document.getElementById('player-error');
  el.textContent   = msg;
  el.style.display = 'block';
}

export function clearPlayerError() {
  const el = document.getElementById('player-error');
  el.style.display = 'none';
  el.textContent   = '';
}

export async function ytLoad(videoId, startSeconds) {
  document.getElementById('player-ui').style.display = 'flex';
  clearPlayerError();

  try {
    await waitForYtApi();
  } catch {
    showPlayerError('Could not load YouTube player. Check your internet connection.');
    return;
  }

  if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
    ytPlayer.setVolume(100);
    ytPlayer.loadVideoById({ videoId, startSeconds });
  } else {
    const container = document.getElementById('yt-player-container');
    container.innerHTML = '<div id="yt-iframe-slot"></div>';

    ytPlayer = new YT.Player('yt-iframe-slot', {
      width:  120,
      height: 68,
      videoId,
      playerVars: {
        autoplay:       1,
        start:          Math.floor(startSeconds),
        controls:       0,
        modestbranding: 1,
        rel:            0,
        playsinline:    1,
        iv_load_policy: 3,
      },
      events: {
        onReady(e) { e.target.playVideo(); },
        onError()  { showPlayerError('Could not load video. Check the YouTube URL or try a different one.'); },
      },
    });
  }
}

export function ytStop() {
  if (ytPlayer) {
    try { ytPlayer.stopVideo(); ytPlayer.destroy(); } catch (_) {}
    ytPlayer = null;
  }
  const c = document.getElementById('yt-player-container');
  if (c) c.innerHTML = '';
}

export function ytCommand(func) {
  if (!ytPlayer) return;
  try {
    if (func === 'pauseVideo') ytPlayer.pauseVideo();
    if (func === 'playVideo')  ytPlayer.playVideo();
  } catch (_) {}
}
