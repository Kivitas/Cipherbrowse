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
  const patterns = [
    /<div[^>]*class="[^"]*mc_vtvc[^"]*"[^>]*\bmmeta="([^"]+)"[\s\S]*?<a\b[^>]*class="mc_vtvc_link"[^>]*>[\s\S]*?<div[^>]*\bourl="([^"]+)"[\s\S]*?<img[^>]*alt="([^"]*)"[^>]*src="([^"]+)"[\s\S]*?(?:<div class="mc_bc_rc items">([^<]+)<\/div>)?/gi,
    /<a\b[^>]*href="([^"]+)"[^>]*aria-label="([^"]+)"[^>]*>[\s\S]*?(?:<div[^>]*class="mc_bc_rc items">([^<]+)<\/div>)?/gi,
  ];

  for (const re of patterns) {
    let match;
    while ((match = re.exec(html)) !== null && results.length < limit) {
      try {
        let url = "";
        let title = "";
        let thumb = "";
        let duration = "";

        if (re === patterns[0]) {
          const meta = JSON.parse(decodeEntities(match[1]));
          url = meta.murl || decodeEntities(match[2] || "");
          title = normalizeWhitespace(match[3] || meta.t || "Video");
          thumb = decodeEntities(match[4] || meta.turl || "");
          duration = normalizeWhitespace(match[5] || "");
        } else {
          url = decodeEntities(match[1] || "");
          title = normalizeWhitespace(match[2] || "Video");
          duration = normalizeWhitespace(match[3] || "");
        }

        if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
        if (!isLikelyVideoPage(url)) continue;
        seen.add(url);
        results.push({
          kind: "video",
          title: title || url,
          url,
          thumb,
          duration,
          source: safeHost(url),
        });
      } catch {}
    }
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
