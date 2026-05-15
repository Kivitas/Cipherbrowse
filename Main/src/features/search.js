const SEARCH_SITE_ALIASES = {
  wikipedia: "wikipedia.org",
  wiki: "wikipedia.org",
  github: "github.com",
  gh: "github.com",
  reddit: "reddit.com",
  youtube: "youtube.com",
  yt: "youtube.com",
  instagram: "instagram.com",
  insta: "instagram.com",
  redgifs: "redgifs.com",
  pornhub: "pornhub.com",
  phub: "pornhub.com",
  xhamster: "xhamster.com",
  xham: "xhamster.com",
  xvideos: "xvideos.com",
  stackoverflow: "stackoverflow.com",
  so: "stackoverflow.com",
  mdn: "developer.mozilla.org",
  npm: "npmjs.com",
  pypi: "pypi.org",
  twitter: "twitter.com",
  x: "x.com",
  hackernews: "news.ycombinator.com",
  hn: "news.ycombinator.com",
  imdb: "imdb.com",
  amazon: "amazon.com",
  arxiv: "arxiv.org",
  medium: "medium.com",
  linkedin: "linkedin.com",
};

const DIRECT_SITE_HANDLERS = [
  { match: /wikipedia\.org$/i, url: q => `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}&ns0=1` },
  { match: /github\.com$/i, url: q => `https://github.com/search?q=${encodeURIComponent(q)}&type=repositories` },
  { match: /reddit\.com$/i, url: q => `https://www.reddit.com/search/?q=${encodeURIComponent(q)}` },
  { match: /youtube\.com$/i, url: q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` },
  { match: /stackoverflow\.com$/i, url: q => `https://stackoverflow.com/search?q=${encodeURIComponent(q)}` },
  { match: /developer\.mozilla\.org$/i, url: q => `https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(q)}` },
  { match: /npmjs\.com$/i, url: q => `https://www.npmjs.com/search?q=${encodeURIComponent(q)}` },
  { match: /pypi\.org$/i, url: q => `https://pypi.org/search/?q=${encodeURIComponent(q)}` },
  { match: /medium\.com$/i, url: q => `https://medium.com/search?q=${encodeURIComponent(q)}` },
  { match: /arxiv\.org$/i, url: q => `https://arxiv.org/search/?query=${encodeURIComponent(q)}&searchtype=all` },
  { match: /imdb\.com$/i, url: q => `https://www.imdb.com/find?q=${encodeURIComponent(q)}` },
  { match: /amazon\.com$/i, url: q => `https://www.amazon.com/s?k=${encodeURIComponent(q)}` },
  { match: /linkedin\.com$/i, url: q => `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(q)}` },
  { match: /news\.ycombinator\.com$/i, url: q => `https://hn.algolia.com/?q=${encodeURIComponent(q)}` },
  { match: /twitter\.com$|x\.com$/i, url: q => `https://twitter.com/search?q=${encodeURIComponent(q)}` },
];

const ENGINE_ONLY_SITE_HOSTS = [
  /youtube\.com$/i,
  /google\.com$/i,
  /instagram\.com$/i,
  /tiktok\.com$/i,
  /twitter\.com$/i,
  /x\.com$/i,
  /linkedin\.com$/i,
];

function stripOuterQuotes(text) {
  const s = String(text || "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}

function normalizeSiteTarget(raw) {
  const cleaned = String(raw || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  if (!cleaned) return null;
  if (SEARCH_SITE_ALIASES[cleaned]) return SEARCH_SITE_ALIASES[cleaned];
  return cleaned.replace(/^wikipedia\.com$/i, "wikipedia.org");
}

function buildDirectSiteUrl(siteHost, question) {
  const q = String(question || "").trim();
  for (const handler of DIRECT_SITE_HANDLERS) {
    if (handler.match.test(siteHost)) return handler.url(q);
  }
  return `https://${siteHost}/search?q=${encodeURIComponent(q)}`;
}

function buildSearchRequest(rawInput) {
  const raw = String(rawInput || "").trim();
  if (!raw) return { query: "", rawInput: "", displayQuery: "", siteHost: null, question: null };
  const match = raw.match(/^(.+?)\s+--query\s+([\s\S]+)$/i);
  if (!match) return { query: raw, rawInput: raw, displayQuery: raw, siteHost: null, question: null };
  const siteHost = normalizeSiteTarget(match[1].trim());
  const question = stripOuterQuotes(match[2].trim());
  return {
    rawInput: raw,
    displayQuery: siteHost ? `${question}  @  ${siteHost}` : question,
    siteHost,
    question,
    query: question,
  };
}

function shouldUseEngineSearchForSite(siteHost) {
  return ENGINE_ONLY_SITE_HOSTS.some(pattern => pattern.test(String(siteHost || "")));
}

function parseSearchFlavor(text) {
  let next = String(text || "").trim();
  let mode = "web";
  next = next.replace(/\s+--videos?\b/ig, () => {
    mode = "video";
    return "";
  });
  next = next.replace(/\s+--images?\b/ig, () => {
    if (mode !== "video") mode = "image";
    return "";
  });
  return { mode, text: next.trim() };
}

module.exports = {
  SEARCH_SITE_ALIASES,
  DIRECT_SITE_HANDLERS,
  normalizeSiteTarget,
  buildDirectSiteUrl,
  buildSearchRequest,
  parseSearchFlavor,
  stripOuterQuotes,
  shouldUseEngineSearchForSite,
};
