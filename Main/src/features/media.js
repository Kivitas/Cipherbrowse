const { decodeEntities } = require("../core/text");

const MEDIA_GRID_COLUMNS = 3;

function normalizeWhitespace(text) {
  return decodeEntities(String(text || ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseGridCoordinate(input) {
  const match = String(input || "").trim().match(/^(\d+)\s*,\s*(\d+)$/);
  if (!match) return null;
  return {
    column: Number(match[1]),
    row: Number(match[2]),
  };
}

function resolveGridSelection(columns, column, row) {
  if (!Number.isInteger(columns) || columns <= 0) return null;
  if (!Number.isInteger(column) || !Number.isInteger(row) || column < 1 || row < 1) return null;
  return ((row - 1) * columns) + (column - 1);
}

function parseBingImageResults(html, limit = 12) {
  const results = [];
  const seen = new Set();
  const patterns = [
    /<a\b[^>]*class="iusc"[^>]*\bm="([^"]+)"[^>]*>/gi,
    /<a\b[^>]*class='iusc'[^>]*\bm='([^']+)'[^>]*>/gi,
  ];

  for (const re of patterns) {
    let match;
    while ((match = re.exec(html)) !== null && results.length < limit) {
      try {
        const meta = JSON.parse(decodeEntities(match[1]));
        const imageUrl = meta.murl || meta.imgurl || "";
        const pageUrl = meta.purl || meta.surl || "";
        const thumbUrl = meta.turl || imageUrl;
        const title = normalizeWhitespace(meta.t || meta.desc || meta.title || pageUrl || "Image");
        if (!/^https?:\/\//i.test(imageUrl) || seen.has(imageUrl)) continue;
        seen.add(imageUrl);
        results.push({
          kind: "image",
          title,
          url: imageUrl,
          thumb: thumbUrl,
          pageUrl,
          source: pageUrl ? safeHost(pageUrl) : safeHost(imageUrl),
        });
      } catch {}
    }
  }

  if (!results.length) {
    const fallback = /"murl":"(https?:\\\/\\\/[^"]+)".{0,800}?"purl":"(https?:\\\/\\\/[^"]+)".{0,400}?"t":"([^"]*)"/gi;
    let match;
    while ((match = fallback.exec(html)) !== null && results.length < limit) {
      const imageUrl = decodeEscapedUrl(match[1]);
      const pageUrl = decodeEscapedUrl(match[2]);
      if (!/^https?:\/\//i.test(imageUrl) || seen.has(imageUrl)) continue;
      seen.add(imageUrl);
      results.push({
        kind: "image",
        title: normalizeWhitespace(match[3] || pageUrl || imageUrl),
        url: imageUrl,
        thumb: imageUrl,
        pageUrl,
        source: pageUrl ? safeHost(pageUrl) : safeHost(imageUrl),
      });
    }
  }

  return results;
}

function parseBingVideoResults(html, limit = 12) {
  const results = [];
  const seen = new Set();
  // Each video card is a div whose mmeta attribute holds JSON with the real page
  // URL (murl), title (t) and thumbnail (turl). Bing has changed the classes and
  // attribute order around the card and its link, so only mmeta is required.
  const cardRe = /<div\b[^>]*\bclass="[^"]*\bmc_vtvc\b[^"]*"[^>]*\bmmeta="([^"]+)"/gi;
  let match;
  while ((match = cardRe.exec(html)) !== null && results.length < limit) {
    let meta;
    try {
      meta = JSON.parse(decodeEntities(match[1]));
    } catch {
      continue;
    }
    const url = String(meta.murl || meta.pgurl || "");
    if (!/^https?:\/\//i.test(url) || seen.has(url) || !isLikelyVideoPage(url)) continue;

    // Only the text of this card: stop where the next card's mmeta begins.
    const nextCard = html.indexOf("mmeta=", match.index + match[0].length);
    const cardEnd  = nextCard === -1 ? match.index + 6000 : Math.min(nextCard, match.index + 6000);
    const card     = html.slice(match.index, cardEnd);
    // The link's aria-label reads "<description> from <host> · Duration: 15 seconds · ...".
    const label    = card.match(/aria-label="([^"]*)"/i)?.[1] || "";
    const title    = normalizeWhitespace(label.split(" · ")[0] || meta.t || url);
    const duration = normalizeWhitespace(label.match(/Duration:\s*([^·]+)/i)?.[1] || "");

    seen.add(url);
    results.push({
      kind: "video",
      title: title || url,
      url,
      thumb: decodeEntities(String(meta.turl || "")),
      duration,
      source: safeHost(url),
    });
  }

  if (!results.length) {
    const fallback = /"contentUrl":"(https?:\\\/\\\/[^"]+)"(?:.{0,400}?"name":"([^"]+)")?/gi;
    let match;
    while ((match = fallback.exec(html)) !== null && results.length < limit) {
      const url = decodeEscapedUrl(match[1]);
      if (!/^https?:\/\//i.test(url) || seen.has(url) || !isLikelyVideoPage(url)) continue;
      seen.add(url);
      results.push({
        kind: "video",
        title: normalizeWhitespace(match[2] || url),
        url,
        thumb: "",
        duration: "",
        source: safeHost(url),
      });
    }
  }

  return results;
}

function decodeEscapedUrl(value) {
  return decodeEntities(String(value || "").replace(/\\u0026/g, "&").replace(/\\\//g, "/"));
}

function isLikelyVideoPage(url) {
  return /youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|twitch\.tv|tiktok\.com|redgifs\.com|pornhub\.com|xhamster\.com|xvideos\.com|instagram\.com|\.m3u8(\?|#|$)|\.mp4(\?|#|$)|\/video/i.test(String(url || ""));
}

function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

module.exports = {
  MEDIA_GRID_COLUMNS,
  parseGridCoordinate,
  resolveGridSelection,
  parseBingImageResults,
  parseBingVideoResults,
};
