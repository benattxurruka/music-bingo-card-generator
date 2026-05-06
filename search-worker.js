/**
 * Cloudflare Worker — YouTube search proxy for Music Bingo
 *
 * Deploy at https://dash.cloudflare.com/ → Workers & Pages → Create Worker
 * Paste this file, click Deploy, then copy your *.workers.dev URL into
 * index.html (search for SEARCH_WORKER_URL).
 *
 * Free tier: 100,000 requests / day — more than enough for bingo nights.
 *
 * Uses YouTube's own internal search API (the same one the YouTube website
 * uses), so it's reliable and needs no API key or third-party instances.
 */

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

// YouTube's public web-client context (same values the youtube.com JS sends)
const YT_CONTEXT = {
  client: {
    clientName: 'WEB',
    clientVersion: '2.20240101.00.00',
    hl: 'en',
    gl: 'US',
  },
};

async function youtubeSearch(query) {
  const res = await fetch(
    'https://www.youtube.com/youtubei/v1/search',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, context: YT_CONTEXT }),
    }
  );
  if (!res.ok) return null;

  const data = await res.json();

  // Walk the response tree to find the first videoRenderer
  const sections =
    data?.contents
      ?.twoColumnSearchResultsRenderer
      ?.primaryContents
      ?.sectionListRenderer
      ?.contents ?? [];

  for (const section of sections) {
    const items = section?.itemSectionRenderer?.contents ?? [];
    for (const item of items) {
      const videoId = item?.videoRenderer?.videoId;
      if (videoId) return videoId;
    }
  }

  return null;
}

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
      });
    }

    const q = new URL(request.url).searchParams.get('q');
    if (!q) {
      return new Response(JSON.stringify({ error: 'Missing q parameter' }), {
        status: 400,
        headers: CORS,
      });
    }

    try {
      const videoId = await youtubeSearch(q);
      if (videoId) {
        return new Response(JSON.stringify({ videoId }), { headers: CORS });
      }
      return new Response(JSON.stringify({ videoId: null }), {
        status: 404,
        headers: CORS,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: CORS,
      });
    }
  },
};
