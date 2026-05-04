// Serverless function: proxies Piped API calls server-side to avoid browser CORS issues.
// GET /api/audio?videoId=<11-char YouTube video ID>
// Returns: { url, mimeType, bitrate } for the best audio stream found.

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.in.projectsegfau.lt',
  'https://pipedapi.mha.fi',
];

function sortStreams(streams) {
  return (streams || []).sort((a, b) => {
    // Prefer audio/mp4 (AAC) for broader compatibility; fall back to audio/webm (Opus)
    const aM4a = (a.mimeType || '').includes('mp4') ? 1 : 0;
    const bM4a = (b.mimeType || '').includes('mp4') ? 1 : 0;
    if (aM4a !== bM4a) return bM4a - aM4a;
    return (b.bitrate || 0) - (a.bitrate || 0);
  });
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { videoId } = req.query;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid or missing videoId' });
  }

  for (const base of PIPED_INSTANCES) {
    try {
      const response = await fetchWithTimeout(`${base}/streams/${videoId}`, 8000);
      if (!response.ok) continue;

      const data = await response.json();
      const streams = sortStreams(data.audioStreams);

      if (streams.length > 0) {
        return res.status(200).json({
          url: streams[0].url,
          mimeType: streams[0].mimeType,
          bitrate: streams[0].bitrate,
        });
      }
    } catch {
      continue;
    }
  }

  return res.status(503).json({ error: 'All Piped instances unreachable.' });
}
