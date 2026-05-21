import { t } from './translations.js';

const SPOTIFY_CLIENT_ID  = '__SPOTIFY_CLIENT_ID__'; // injected at deploy time from GitHub secret SPOTIFY_CLIENT_ID

export const spotifyState = {
  token:    null,
  expiry:   0,
  player:   null,
  deviceId: null,
  ready:    false,
};

const spotifyCache = new Map(); // query → trackUri

function _spRandStr(len) {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return [...a].map(b => chars[b % 62]).join('');
}

async function _spChallenge(v) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

function _spRedirectUri() {
  return window.location.origin + window.location.pathname;
}

export async function spotifyLogin() {
  if (!SPOTIFY_CLIENT_ID) { alert('Set SPOTIFY_CLIENT_ID in index.html first.'); return; }
  if (!confirm(t('player.spotify.loginWarning'))) return;
  const v = _spRandStr(64);
  sessionStorage.setItem('sp_v', v);
  const p = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: _spRedirectUri(),
    scope: 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state',
    code_challenge_method: 'S256',
    code_challenge: await _spChallenge(v),
  });
  location.href = 'https://accounts.spotify.com/authorize?' + p;
}

async function _spExchangeCode(code) {
  const v = sessionStorage.getItem('sp_v');
  sessionStorage.removeItem('sp_v');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: SPOTIFY_CLIENT_ID, grant_type: 'authorization_code', code, redirect_uri: _spRedirectUri(), code_verifier: v }),
  });
  return res.ok ? res.json() : null;
}

async function _spRefresh() {
  const r = localStorage.getItem('sp_r');
  if (!r) return false;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: SPOTIFY_CLIENT_ID, grant_type: 'refresh_token', refresh_token: r }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  _spSaveTokens(data);
  return true;
}

function _spSaveTokens(data) {
  spotifyState.token  = data.access_token;
  spotifyState.expiry = Date.now() + (data.expires_in - 60) * 1000;
  localStorage.setItem('sp_t', data.access_token);
  localStorage.setItem('sp_e', String(spotifyState.expiry));
  if (data.refresh_token) localStorage.setItem('sp_r', data.refresh_token);
}

async function _spEnsureToken() {
  if (spotifyState.token && Date.now() < spotifyState.expiry) return true;
  return _spRefresh();
}

export function spotifyLogout() {
  spotifyState.token = null; spotifyState.expiry = 0;
  ['sp_t','sp_e','sp_r','sp_u'].forEach(k => localStorage.removeItem(k));
  if (spotifyState.player) { try { spotifyState.player.disconnect(); } catch(_){} spotifyState.player = null; }
  spotifyState.deviceId = null; spotifyState.ready = false;
  spotifyCache.clear();
  _spUpdateUI(false);
}

function _spUpdateUI(connected) {
  const u = connected ? (localStorage.getItem('sp_u') || '') : '';
  [
    ['spotify-disconnected',         'spotify-connected',         'spotify-user-name'],
    ['spotify-disconnected-prepare', 'spotify-connected-prepare', 'spotify-user-name-prepare'],
  ].forEach(([discId, connId, nameId]) => {
    const disc = document.getElementById(discId);
    const conn = document.getElementById(connId);
    if (disc) disc.style.display = connected ? 'none' : '';
    if (conn) conn.style.display = connected ? ''     : 'none';
    if (connected && u) { const el = document.getElementById(nameId); if (el) el.textContent = u; }
  });
  // Show override column and dim URL inputs when Spotify is active
  document.querySelector('.prepare-table-wrap')?.classList.toggle('spotify-active', connected);
}

function _spLoadSDK() {
  if (document.getElementById('sp-sdk')) return;
  window.onSpotifyWebPlaybackSDKReady = _spInitPlayer;
  const s = document.createElement('script');
  s.id = 'sp-sdk';
  s.src = 'https://sdk.scdn.co/spotify-player.js';
  document.head.appendChild(s);
}

function _spInitPlayer() {
  spotifyState.player = new Spotify.Player({
    name: 'Music Bingo',
    getOAuthToken: async cb => { await _spEnsureToken(); cb(spotifyState.token); },
    volume: 1,
  });
  spotifyState.player.addListener('ready', ({ device_id }) => { spotifyState.deviceId = device_id; spotifyState.ready = true; });
  spotifyState.player.addListener('not_ready', () => { spotifyState.ready = false; });
  spotifyState.player.addListener('authentication_error', () => spotifyLogout());
  spotifyState.player.addListener('account_error', () => {
    alert('Spotify Premium is required for in-browser playback.');
    spotifyLogout();
  });
  spotifyState.player.connect();
}

export async function spotifySearchTrack(query) {
  if (spotifyCache.has(query)) return spotifyCache.get(query);
  if (!await _spEnsureToken()) return null;
  try {
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
      { headers: { Authorization: `Bearer ${spotifyState.token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const uri = data.tracks?.items?.[0]?.uri ?? null;
    spotifyCache.set(query, uri);
    return uri;
  } catch(_) { return null; }
}

export async function spotifyPlayTrack(trackUri, positionMs) {
  if (!await _spEnsureToken()) return false;
  const res = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${spotifyState.deviceId}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${spotifyState.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [trackUri], position_ms: Math.round(positionMs) }),
    }
  );
  return res.ok || res.status === 204;
}

// Handle OAuth callback and restore persisted session
export async function initSpotify() {
  if (!SPOTIFY_CLIENT_ID) return;
  const params = new URLSearchParams(location.search);
  const code   = params.get('code');
  if (code) {
    history.replaceState({}, '', location.pathname);
    const data = await _spExchangeCode(code);
    if (data?.access_token) {
      _spSaveTokens(data);
      const uRes = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${data.access_token}` } });
      if (uRes.ok) { const u = await uRes.json(); localStorage.setItem('sp_u', u.display_name || u.id); }
      _spLoadSDK();
      _spUpdateUI(true);
    }
  } else if (localStorage.getItem('sp_t')) {
    spotifyState.token  = localStorage.getItem('sp_t');
    spotifyState.expiry = Number(localStorage.getItem('sp_e') || '0');
    if (await _spEnsureToken()) { _spLoadSDK(); _spUpdateUI(true); }
    else spotifyLogout();
  }

  document.getElementById('btn-spotify-login')?.addEventListener('click', spotifyLogin);
  document.getElementById('btn-spotify-logout').addEventListener('click', spotifyLogout);
  document.getElementById('btn-spotify-login-prepare').addEventListener('click', spotifyLogin);
  document.getElementById('btn-spotify-logout-prepare').addEventListener('click', spotifyLogout);
}
