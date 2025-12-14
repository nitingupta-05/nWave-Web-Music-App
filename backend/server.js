import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 4000;
const YT_KEY = process.env.YOUTUBE_API_KEY;
const JAMENDO_ID = process.env.JAMENDO_CLIENT_ID;

const cache = new Map();
const CACHE_TIME = 10 * 60 * 1000;


// CACHE WRAPPER
// -------------------------------------------------------------
async function fastCache(key, fn) {
  const now = Date.now();
  if (cache.has(key)) {
    const { data, time } = cache.get(key);
    if (now - time < CACHE_TIME) return data;
  }
  const data = await fn();
  cache.set(key, { data, time: now });
  return data;
}


// YOUTUBE SEARCH + DURATION
// -------------------------------------------------------------
async function ytSearch(q) {
  const url =
    `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=15&q=` +
    encodeURIComponent(q) +
    `&type=video&key=` +
    YT_KEY;

  return fastCache("yt_search_" + q, async () => {
    try {
      const r = await fetch(url);
      const data = await r.json();
      return data.items || [];
    } catch {
      return [];
    }
  });
}

async function ytFetchDuration(videoIds) {
  if (!videoIds.length) return {};

  const url =
    `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=` +
    videoIds.join(",") +
    `&key=` +
    YT_KEY;

  return fastCache("yt_durations_" + videoIds.join(","), async () => {
    try {
      const r = await fetch(url);
      const data = await r.json();

      const durations = {};
      (data.items || []).forEach((v) => {
        durations[v.id] = parseISODuration(v.contentDetails.duration);
      });

      return durations;
    } catch {
      return {};
    }
  });
}

function parseISODuration(iso) {
  const re = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const [, h = 0, m = 0, s = 0] = iso.match(re) || [];
  return (+h * 3600) + (+m * 60) + (+s);
}


// JAMENDO
// -------------------------------------------------------------
async function jamSearch(url) {
  return fastCache("jam_" + url, async () => {
    try {
      const r = await fetch(url);
      const data = await r.json();
      return data.results || [];
    } catch {
      return [];
    }
  });
}


// MAPPERS
// -------------------------------------------------------------
function mapYT(item, duration, tag) {
  const id = item.id?.videoId;
  if (!id) return null;

  return {
    id: "yt-" + id,
    title: item.snippet.title.substring(0, 50),
    artist: item.snippet.channelTitle.substring(0, 30),
    duration: duration || 200,
    thumb:
      item.snippet.thumbnails.medium?.url ||
      item.snippet.thumbnails.default?.url,
    videoId: id,
    source: "youtube",
    tags: ["youtube"],
    playlistId: tag,
  };
}

function mapJam(item) {
  return {
    id: "jam-" + item.id,
    title: item.name.substring(0, 50),
    artist: item.artist_name.substring(0, 30),
    duration: item.duration || 200,
    thumb: item.image,
    audioUrl: item.audio,
    source: "jamendo",
    tags: ["jamendo"],
    playlistId: "jamendo",
  };
}


// LEFT DEFAULT
// -------------------------------------------------------------
app.get("/api/left-playlist", async (req, res) => {
  const queries = ["top songs", "popular music", "music video"];

  const result = await fastCache("left_default", async () => {
    const itemsArr = await Promise.all(queries.map((q) => ytSearch(q)));
    const all = itemsArr.flat();

    const ids = all.map((i) => i.id.videoId).filter(Boolean);
    const durations = await ytFetchDuration(ids);

    const tracks = all
      .map((i) => mapYT(i, durations[i.id.videoId], "left"))
      .filter(Boolean)
      .slice(0, 15);

    return {
      tracks,
      playlistName: "YouTube Hits",
      playlistId: "youtube-left",
      count: tracks.length,
    };
  });

  res.json(result);
});


// LEFT TAG
// -------------------------------------------------------------
app.get("/api/left-playlist-tag", async (req, res) => {
  const tag = req.query.tag || "all";

  const keywords = {
    "indie-pop": "indie pop playlist",
    lofi: "lofi beats",
    night: "night drive music",
    romantic: "romantic songs",
    party: "party dance mix",
    all: "popular music",
  };

  const q = keywords[tag] || keywords.all;

  const result = await fastCache("left_tag_" + tag, async () => {
    const items = await ytSearch(q);

    const ids = items.map((i) => i.id.videoId).filter(Boolean);
    const durations = await ytFetchDuration(ids);

    const tracks = items
      .map((i) => mapYT(i, durations[i.id.videoId], tag))
      .filter(Boolean);

    return {
      tracks,
      playlistName: `YouTube – ${tag}`,
      count: tracks.length,
    };
  });

  res.json(result);
});


// SEARCH (YT + JAMENDO)
// -------------------------------------------------------------
app.get("/api/left-search", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json({ tracks: [] });

  const yt = await ytSearch(q + " song");
  const ids = yt.map((i) => i.id.videoId).filter(Boolean);
  const durations = await ytFetchDuration(ids);

  const jam = await jamSearch(
    `https://api.jamendo.com/v3.0/tracks/?client_id=${JAMENDO_ID}&format=json&limit=30&search=${encodeURIComponent(
      q
    )}`
  );

  const tracks = [
    ...yt.map((i) => mapYT(i, durations[i.id.videoId], "search")),
    ...jam.map(mapJam),
  ].slice(0, 20);

  res.json({
    tracks,
    playlistName: `Search – ${q}`,
    count: tracks.length,
  });
});


// RIGHT DEFAULT
// -------------------------------------------------------------
app.get("/api/right-playlist", async (req, res) => {
  const result = await fastCache("right_default", async () => {
    const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${JAMENDO_ID}&format=json&limit=40&order=popularity_total`;

    const items = await jamSearch(url);
    const tracks = items.map(mapJam).slice(0, 25);

    return {
      tracks,
      playlistName: "Jamendo Top Hits",
      playlistId: "jamendo-right",
      count: tracks.length,
    };
  });

  res.json(result);
});


// RIGHT TAG
// -------------------------------------------------------------
app.get("/api/right-playlist-tag", async (req, res) => {
  const tag = req.query.tag || "all";

  const url =
    tag === "all"
      ? `https://api.jamendo.com/v3.0/tracks/?client_id=${JAMENDO_ID}&format=json&limit=40&order=popularity_total`
      : `https://api.jamendo.com/v3.0/tracks/?client_id=${JAMENDO_ID}&format=json&limit=40&tags=${encodeURIComponent(
          tag
        )}&order=popularity_total`;

  const result = await fastCache("right_tag_" + tag, async () => {
    const items = await jamSearch(url);
    const tracks = items.map(mapJam).slice(0, 25);

    return {
      tracks,
      playlistName: `Jamendo – ${tag}`,
      count: tracks.length,
    };
  });

  res.json(result);
});

// -------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 FAST nWave API → http://localhost:${PORT}`);
  console.log("📊 YOUR YT KEY:", YT_KEY.substring(0, 20) + "...");
});
