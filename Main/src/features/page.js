"use strict";

const { cleanVisibleText, decodeEntities } = require("../core/text");

function stripHtml(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/tr>/gi, "\n")
      .replace(/<\/td>/gi, "  ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function extractTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? cleanVisibleText(match[1]) : "";
}

function extractMetaDescription(html) {
  const match = String(html || "").match(
    /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"]+)["']/i,
  );
  return match ? cleanVisibleText(match[1]) : "";
}

function normalizeUrl(rawHref, baseUrl) {
  const raw = decodeEntities(String(rawHref || "").trim());
  if (!raw || raw.startsWith("#") || raw.startsWith("javascript:")) return null;
  try {
    return new URL(raw, baseUrl).href;
  } catch {
    return null;
  }
}

function extractLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();
  const re = /<a\b[^>]*\bhref=(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = re.exec(html)) !== null) {
    const href = match[1] || match[2] || "";
    const resolved = normalizeUrl(href, baseUrl);
    if (!resolved || seen.has(resolved)) continue;
    const text = cleanVisibleText(match[3].replace(/<[^>]+>/g, " "));
    if (!text) continue;
    seen.add(resolved);
    links.push({ n: links.length + 1, text, url: resolved });
  }

  return links;
}

function extractImages(html, baseUrl, limit = 24) {
  const images = [];
  const seen = new Set();
  const re = /<img\b[^>]*\bsrc=(?:"([^"]+)"|'([^']+)')[^>]*?(?:\balt=(?:"([^"]*)"|'([^']*)'))?[^>]*>/gi;
  let match;

  while ((match = re.exec(html)) !== null && images.length < limit) {
    const resolved = normalizeUrl(match[1] || match[2] || "", baseUrl);
    if (!resolved || seen.has(resolved) || !/^https?:/i.test(resolved)) continue;
    seen.add(resolved);
    images.push({
      kind: "image",
      title: cleanVisibleText(match[3] || match[4] || "Image"),
      alt: cleanVisibleText(match[3] || match[4] || ""),
      url: resolved,
      pageUrl: baseUrl,
      source: safeHost(baseUrl),
    });
  }

  return images;
}

function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function decodeBingWrappedUrl(url) {
  const input = decodeEntities(String(url || "").trim());
  if (!input) return "";
  try {
    const parsed = new URL(input);
    if (/bing\.com$/i.test(parsed.hostname)) {
      const direct = parsed.searchParams.get("u") || parsed.searchParams.get("url");
      if (direct) {
        const decoded = decodeBingUParameter(direct);
        if (decoded) return decoded;
      }
    }
  } catch {}
  return input;
}

function decodeBingUParameter(value) {
  const raw = decodeEntities(String(value || ""));
  if (!raw) return "";
  try {
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^a1[a-z0-9+/=_-]+$/i.test(raw)) {
      const decoded = Buffer.from(raw.slice(2), "base64").toString("utf8");
      if (/^https?:\/\//i.test(decoded)) return decoded;
    }
  } catch {}
  return raw;
}

function parseBingWebResults(html, limit = 10) {
  const results = [];
  const seen = new Set();
  const blocks = String(html || "").match(/<li class="b_algo"[\s\S]*?<\/li>/gi) || [];

  for (const block of blocks) {
    if (results.length >= limit) break;
    const titleMatch = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i);
    if (!titleMatch) continue;
    const href = decodeBingWrappedUrl(titleMatch[1]);
    if (!/^https?:\/\//i.test(href) || seen.has(href)) continue;
    if (/\/search\?|\/images\/search|\/videos\/search/i.test(href)) continue;

    const title = cleanVisibleText(titleMatch[2].replace(/<[^>]+>/g, " "));
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = snippetMatch ? cleanVisibleText(snippetMatch[1].replace(/<[^>]+>/g, " ")) : "";
    if (!title) continue;

    seen.add(href);
    results.push({
      n: results.length + 1,
      text: title,
      title,
      url: href,
      snippet,
      source: safeHost(href),
    });
  }

  return results;
}

function parseWikipediaApiResults(payload, limit = 10) {
  const out = [];
  if (!Array.isArray(payload) || payload.length < 4) return out;
  const titles = payload[1] || [];
  const descriptions = payload[2] || [];
  const urls = payload[3] || [];

  for (let i = 0; i < Math.min(limit, urls.length); i += 1) {
    if (!urls[i]) continue;
    out.push({
      n: out.length + 1,
      text: cleanVisibleText(titles[i] || urls[i]),
      title: cleanVisibleText(titles[i] || urls[i]),
      url: urls[i],
      snippet: cleanVisibleText(descriptions[i] || ""),
      source: "wikipedia.org",
    });
  }

  return out;
}

module.exports = {
  stripHtml,
  extractTitle,
  extractMetaDescription,
  extractLinks,
  extractImages,
  parseBingWebResults,
  parseWikipediaApiResults,
  decodeBingWrappedUrl,
  safeHost,
};
