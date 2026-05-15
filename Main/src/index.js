#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const crypto = require("crypto");
const { spawnSync, spawn } = require("child_process");
const { URL } = require("url");

const {
  APP_NAME,
  APP_VERSION,
  PATHS,
  SEARCH_URLS,
  BING_MARKET_QUERY,
  LIMITS,
  DEFAULT_TOR,
  CURL_BIN,
  TOOL_BINS,
  runtime,
} = require("./core/config");

const { cleanVisibleText, decodeEntities } = require("./core/text");

const {
  AI_PROVIDERS,
  parseAIProviderAndKey,
  isAIRateLimited,
  createAIKeyStore,
  callAIProvider,
} = require("./features/ai");

const {
  SIMPLE_HELP_ROWS,
  FULL_HELP_SECTIONS,
  ALL_COMMANDS,
} = require("./features/help");

const {
  MEDIA_GRID_COLUMNS,
  parseGridCoordinate,
  resolveGridSelection,
  parseBingImageResults,
  parseBingVideoResults,
} = require("./features/media");

const {
  normalizeSiteTarget,
  buildSearchRequest,
  parseSearchFlavor,
  shouldUseEngineSearchForSite,
} = require("./features/search");

const {
  stripHtml,
  extractTitle,
  extractMetaDescription,
  extractLinks,
  extractImages,
  parseBingWebResults,
  parseWikipediaApiResults,
  decodeBingWrappedUrl,
} = require("./features/page");

const {
  ytDlpSearch,
  buildMpvArgs,
  buildImageMpvArgs,
  resolvePlayableUrl,
  isLikelyDirectMediaUrl,
} = require("./features/video");

const { createSHA512AESCipherStore } = require("./core/security");

// ─── Theme system ─────────────────────────────────────────────────────────────
// All UI chrome uses hacker green.  Orange is reserved for the ASCII banner.
// Lavender is reserved for the copyright line only.
const THEMES = {
  green: { primary: "\x1b[32m", secondary: "\x1b[92m", accent: "\x1b[32;1m" },
  amber: { primary: "\x1b[33m", secondary: "\x1b[93m", accent: "\x1b[33;1m" },
  blue:  { primary: "\x1b[34m", secondary: "\x1b[94m", accent: "\x1b[34;1m" },
  cyan:  { primary: "\x1b[36m", secondary: "\x1b[96m", accent: "\x1b[36;1m" },
  white: { primary: "\x1b[37m", secondary: "\x1b[97m", accent: "\x1b[97;1m" },
};

let currentTheme = "green";

// ─── Banner colour palette (orange shades only) ───────────────────────────────
const O1 = "\x1b[38;5;202m"; // deep burnt-orange  — shadow/edge
const O2 = "\x1b[38;5;208m"; // mid orange         — body fill
const O3 = "\x1b[38;5;214m"; // bright orange      — highlight
const O4 = "\x1b[38;5;220m"; // pale gold           — top shine
// Lavender for the copyright tagline only
const LAV = "\x1b[38;5;183m";
const RS  = "\x1b[0m";

// ─── Global colour shortcuts ──────────────────────────────────────────────────
const C = {
  get p() { return THEMES[currentTheme].primary; },
  get s() { return THEMES[currentTheme].secondary; },
  get a() { return THEMES[currentTheme].accent; },
  dim:    "\x1b[2m",
  bold:   "\x1b[1m",
  reset:  "\x1b[0m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  white:  "\x1b[97m",
};

// ─── Session state ────────────────────────────────────────────────────────────
const session = {
  currentUrl: null,
  currentTitle: null,
  currentText: null,
  currentLinks: [],
  currentImages: [],
  currentMode: "page",
  currentPage: 1,
  currentSearch: null,
  currentMetaDescription: "",
  navStack: [],
  navIndex: -1,
  pageHistory: [],
  searchHistory: [],
  aliases: {},
  dispatchDepth: 0,
};

// ─── Filesystem helpers ───────────────────────────────────────────────────────
function ensureDataDir() {
  if (!fs.existsSync(PATHS.DATA_DIR)) fs.mkdirSync(PATHS.DATA_DIR, { recursive: true });
  if (!fs.existsSync(PATHS.EXPORTS_DIR)) fs.mkdirSync(PATHS.EXPORTS_DIR, { recursive: true });
}

const searchHistoryCipher = createSHA512AESCipherStore({
  fs,
  secretFile: PATHS.SEARCH_HISTORY_SECRET_FILE,
  ensureDataDir,
});

function loadJson(filePath, fallback = []) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 5 * 1024 * 1024) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJson(filePath, value) {
  ensureDataDir();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tempPath, filePath);
}

function loadState()          { return loadJson(PATHS.STATE_PATH, {}); }
function saveState(nextState) { saveJson(PATHS.STATE_PATH, nextState); }

function normalizeSearchHistory(list) {
  return uniqueRecent(
    (Array.isArray(list) ? list : []).map(item => ({
      query:        cleanVisibleText(item?.query || ""),
      url:          item?.url    || "",
      at:           item?.at     || "",
      mode:         item?.mode   || "web",
      kind:         item?.kind   || item?.mode || "web",
      displayQuery: cleanVisibleText(item?.displayQuery || item?.query || ""),
      page:         Number(item?.page || 1),
      siteHost:     item?.siteHost || null,
    })),
    LIMITS.MAX_HISTORY,
    item => `${item.kind}|${item.query}|${item.page}|${item.siteHost || ""}`,
  ).filter(item => isWithinSearchHistoryTtl(item));
}

function loadEncryptedSearchHistory() {
  const payload = loadJson(PATHS.SEARCH_HISTORY_FILE, null);
  if (!payload || !searchHistoryCipher.isEncryptedPayload(payload.data || payload)) return [];
  try {
    const decrypted = searchHistoryCipher.decryptText(payload.data || payload);
    return normalizeSearchHistory(JSON.parse(decrypted));
  } catch (error) {
    logLine(`search history decrypt failed: ${error.message}`);
    return [];
  }
}

function saveEncryptedSearchHistory(list) {
  const entries = normalizeSearchHistory(list);
  saveJson(PATHS.SEARCH_HISTORY_FILE, {
    version: 1,
    encryptedAt: new Date().toISOString(),
    keyDerivation: "sha512",
    ttlMs: LIMITS.SEARCH_HISTORY_TTL_MS,
    data: searchHistoryCipher.encryptText(JSON.stringify(entries)),
  });
}

function logLine(message) {
  try {
    ensureDataDir();
    try {
      const stat = fs.statSync(PATHS.LOG_PATH);
      if (stat.size > 1024 * 1024) {
        const lines = fs.readFileSync(PATHS.LOG_PATH, "utf8").split(/\r?\n/).filter(Boolean);
        fs.writeFileSync(PATHS.LOG_PATH, `${lines.slice(-500).join("\n")}\n`, "utf8");
      }
    } catch {}
    fs.appendFileSync(PATHS.LOG_PATH, `[${new Date().toISOString()}] ${message}\n`, "utf8");
  } catch {}
}

// ─── History helpers ──────────────────────────────────────────────────────────
function uniqueRecent(list, limit, keyFn) {
  const out  = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    if (!item) continue;
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

function isWithinSearchHistoryTtl(item, now = Date.now()) {
  const at = Date.parse(item?.at || "");
  return Number.isFinite(at) && (now - at) <= LIMITS.SEARCH_HISTORY_TTL_MS;
}

function pruneSearchHistory() {
  const now = Date.now();
  session.searchHistory = session.searchHistory
    .filter(item => isWithinSearchHistoryTtl(item, now))
    .slice(0, LIMITS.MAX_HISTORY);
}

function loadPersistedState() {
  const state        = loadState();
  let shouldPersist  = false;

  if (Array.isArray(state.pageHistory)) {
    session.pageHistory = uniqueRecent(
      state.pageHistory.map(item => ({
        url:   item?.url   || "",
        title: cleanVisibleText(item?.title || item?.url || ""),
        at:    item?.at    || "",
      })),
      LIMITS.MAX_HISTORY,
      item => item.url,
    );
  }

  const encryptedSearchHistory = loadEncryptedSearchHistory();
  if (encryptedSearchHistory.length) {
    session.searchHistory = encryptedSearchHistory;
  } else if (Array.isArray(state.searchHistory)) {
    session.searchHistory = normalizeSearchHistory(state.searchHistory);
    if (session.searchHistory.length) saveEncryptedSearchHistory(session.searchHistory);
    delete state.searchHistory;
    shouldPersist = true;
  }

  if (state.theme && THEMES[state.theme]) currentTheme = state.theme;

  const aliases = loadJson(PATHS.ALIASES_PATH, {});
  if (aliases && typeof aliases === "object" && !Array.isArray(aliases)) {
    session.aliases = aliases;
  }

  if (shouldPersist) persistState();
}

function persistState() {
  const nextState = loadState();
  pruneSearchHistory();
  nextState.pageHistory   = session.pageHistory.slice(0, LIMITS.MAX_HISTORY);
  delete nextState.searchHistory;
  nextState.theme         = currentTheme;
  saveEncryptedSearchHistory(session.searchHistory);
  saveState(nextState);
}

function recordPageVisit(url, title) {
  if (!url) return;
  session.pageHistory = session.pageHistory.filter(item => item.url !== url);
  session.pageHistory.unshift({ url, title: cleanVisibleText(title || url), at: new Date().toISOString() });
  if (session.pageHistory.length > LIMITS.MAX_HISTORY) session.pageHistory.length = LIMITS.MAX_HISTORY;
  persistState();
}

function recordSearch(query, url, mode, displayQuery, page, extra = {}) {
  pruneSearchHistory();
  const kind = extra.kind || mode;
  session.searchHistory = session.searchHistory.filter(item => !(
    item.query                    === query &&
    (item.kind || item.mode)      === kind  &&
    Number(item.page   || 1)      === Number(page || 1) &&
    (item.siteHost     || "")     === (extra.siteHost || "")
  ));
  session.searchHistory.unshift({
    query, url, at: new Date().toISOString(), mode, kind, displayQuery, page,
    siteHost: extra.siteHost || null,
  });
  if (session.searchHistory.length > LIMITS.MAX_HISTORY) session.searchHistory.length = LIMITS.MAX_HISTORY;
  persistState();
}

function applyTheme(name) {
  const key = String(name || "").trim().toLowerCase();
  if (!THEMES[key]) return false;
  currentTheme = key;
  persistState();
  return true;
}

// ─── Terminal helpers ─────────────────────────────────────────────────────────
function termWidth() { return process.stdout.columns || 100; }

function hr(char = "-") {
  return C.dim + char.repeat(Math.max(40, termWidth())) + C.reset;
}

function centerPlain(text) {
  const raw     = cleanVisibleText(String(text || "")).replace(/\u00C2\u00A9/g, "\u00A9");
  const padding = Math.max(0, Math.floor((termWidth() - raw.length) / 2));
  return `${" ".repeat(padding)}${raw}`;
}

function centerOffset(visualWidth) {
  return Math.max(0, Math.floor((termWidth() - visualWidth) / 2));
}

function formatHeaderTimestamp(date = new Date()) {
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const day = new Intl.DateTimeFormat("en-GB", { day: "2-digit" }).format(date);
  const month = new Intl.DateTimeFormat("en-GB", { month: "long" }).format(date);
  const year = new Intl.DateTimeFormat("en-GB", { year: "numeric" }).format(date);
  return `${time} : ${day}/${month}/${year}`;
}

function printTitleLine(title, rightText = formatHeaderTimestamp()) {
  const width = termWidth();
  const gap = Math.max(1, width - title.length - rightText.length);
  if (gap <= 1) {
    console.log(`${C.a}${title}${C.reset}`);
    return;
  }
  console.log(`${C.a}${title}${" ".repeat(gap)}${rightText}${C.reset}`);
}

function wrap(text, indent = 0) {
  const width = Math.max(20, termWidth() - indent - 2);
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > width) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  const pad = " ".repeat(indent);
  return lines.map(entry => `${pad}${entry}`).join("\n");
}

function wrapLines(text, width) {
  const limit = Math.max(20, Number(width) || 20);
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > limit) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function printAIChatReply(providerLabel, reply, model = "") {
  const prompt        = "cipherbrowse> ";
  const providerTag   = `<${providerLabel}>`;
  const prefixPlain   = `${prompt}${providerTag} `;
  const continuation  = " ".repeat(prefixPlain.length);
  const lines         = wrapLines(reply, termWidth() - prefixPlain.length - 1);

  console.log("");
  console.log(`${C.p}${prompt}${C.reset}${C.a}${providerTag}${C.reset} ${lines[0] || ""}`);
  lines.slice(1).forEach(line => console.log(`${continuation}${line}`));
  if (model) console.log(`${C.dim}${continuation}[model: ${model}]${C.reset}`);
}

// ─── Nav helpers ──────────────────────────────────────────────────────────────
function navSnapshot() {
  return {
    url:             session.currentUrl,
    title:           session.currentTitle,
    text:            session.currentText,
    links:           session.currentLinks,
    images:          session.currentImages,
    mode:            session.currentMode,
    page:            session.currentPage,
    search:          session.currentSearch,
    metaDescription: session.currentMetaDescription,
  };
}

function navPush(snapshot) {
  session.navStack = session.navStack.slice(0, session.navIndex + 1);
  session.navStack.push(snapshot);
  if (session.navStack.length > 50) session.navStack.shift();
  session.navIndex = session.navStack.length - 1;
}

function navApply(snapshot) {
  session.currentUrl             = snapshot?.url             || null;
  session.currentTitle           = snapshot?.title           || null;
  session.currentText            = snapshot?.text            || null;
  session.currentLinks           = snapshot?.links           || [];
  session.currentImages          = snapshot?.images          || [];
  session.currentMode            = snapshot?.mode            || "page";
  session.currentPage            = Number(snapshot?.page     || 1);
  session.currentSearch          = snapshot?.search          || null;
  session.currentMetaDescription = snapshot?.metaDescription || "";
}

// ─── Network helpers ──────────────────────────────────────────────────────────
function buildCurlArgs(url) {
  const args = [
    "-sL",
    "--max-time",      String(Math.ceil(LIMITS.FETCH_TIMEOUT / 1000)),
    "--max-filesize",  "8000000",
    "-A",              "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0",
    "-H",              "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "-H",              "Accept-Language: en-US,en;q=0.8",
    "--compressed",
  ];
  if (runtime.proxyMode === "tor" || runtime.proxyMode === "proxy") {
    args.push("--proxy", runtime.proxyUrl || DEFAULT_TOR);
  }
  args.push(url);
  return args;
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const child  = spawn(CURL_BIN, buildCurlArgs(url), { timeout: LIMITS.FETCH_TIMEOUT + 5000, windowsHide: true });
    const chunks = [];
    const errBuf = [];
    child.stdout.on("data", d => chunks.push(d));
    child.stderr.on("data", d => errBuf.push(d));
    child.on("error", err => reject(new Error(`curl error: ${err.message}`)));
    child.on("close", code => {
      if (code !== 0 && chunks.length === 0) {
        const stderr = Buffer.concat(errBuf).toString("utf8").trim();
        return reject(new Error(stderr || `curl exited with code ${code}`));
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

function fetchUrlWithHeaders(url, headers = []) {
  return new Promise((resolve, reject) => {
    const args = buildCurlArgs(url);
    args.splice(args.length - 1, 0, ...headers.flatMap(([n, v]) => ["-H", `${n}: ${v}`]));
    const child  = spawn(CURL_BIN, args, { timeout: LIMITS.FETCH_TIMEOUT + 5000, windowsHide: true });
    const chunks = [];
    const errBuf = [];
    child.stdout.on("data", d => chunks.push(d));
    child.stderr.on("data", d => errBuf.push(d));
    child.on("error", err => reject(new Error(`curl error: ${err.message}`)));
    child.on("close", code => {
      if (code !== 0 && chunks.length === 0) {
        const stderr = Buffer.concat(errBuf).toString("utf8").trim();
        return reject(new Error(stderr || `curl exited with code ${code}`));
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

async function fetchJson(url, headers = []) {
  const raw = headers.length ? await fetchUrlWithHeaders(url, headers) : await fetchUrl(url);
  return JSON.parse(raw);
}

// ─── View helpers ─────────────────────────────────────────────────────────────
function printPageHeader(url, title, statusNote = "") {
  console.log(hr("="));
  console.log(`${C.a}${APP_NAME}${C.reset}  ${C.dim}v${APP_VERSION}${C.reset}`);
  if (url)        console.log(`${C.p}URL  ${C.reset}${url}`);
  if (title)      console.log(`${C.p}Title${C.reset}  ${title}`);
  if (statusNote) console.log(`${C.dim}${statusNote}${C.reset}`);
  console.log(hr("="));
}

function printLinks(links, max = 20) {
  if (!links.length) return;
  console.log(`\n${C.a}Links (${links.length})${C.reset}  ${C.dim}/open <n>${C.reset}`);
  links.slice(0, max).forEach(link => {
    console.log(`  ${C.p}[${link.n}]${C.reset} ${link.text}`);
  });
  if (links.length > max) console.log(`${C.dim}  ... and ${links.length - max} more${C.reset}`);
}

function printSearchResults(results) {
  if (!results.length) return;
  console.log(`\n${C.a}Results (${results.length})${C.reset}  ${C.dim}/open <n>${C.reset}`);
  results.forEach((item, index) => {
    console.log(`  ${C.p}[${index + 1}]${C.reset} ${item.title || item.text || item.url}`);
    if (item.source)  console.log(`      ${C.dim}${item.source}${C.reset}`);
    if (item.snippet) console.log(wrap(`      ${item.snippet}`, 0));
  });
}

function printMediaGrid(items, kind) {
  if (!items.length) return;
  const label      = kind === "image" ? "Images" : "Videos";
  const columns    = MEDIA_GRID_COLUMNS;
  const colWidth   = Math.floor((termWidth() - 4) / columns);

  console.log(`\n${C.a}${label} (${items.length})${C.reset}  ${C.dim}/open <col,row>${C.reset}`);

  for (let rowIdx = 0; rowIdx < Math.ceil(items.length / columns); rowIdx += 1) {
    const rowItems = items.slice(rowIdx * columns, rowIdx * columns + columns);
    const titleLine = rowItems.map((item, colIdx) => {
      const pos   = `[${colIdx + 1},${rowIdx + 1}]`;
      const title = cleanVisibleText(item.title || item.alt || item.url).slice(0, Math.max(10, colWidth - 8));
      return `${C.p}${pos}${C.reset} ${title}`.padEnd(colWidth + C.p.length + C.reset.length);
    }).join("");
    console.log(` ${titleLine}`);

    const metaLine = rowItems.map(item => {
      const meta = cleanVisibleText(item.source || item.duration || "").slice(0, Math.max(8, colWidth - 2));
      return `${C.dim}${meta}${C.reset}`.padEnd(colWidth + C.dim.length + C.reset.length);
    }).join("");
    console.log(` ${metaLine}`);
  }
}

function renderCurrentView() {
  if (!session.currentUrl && !session.currentTitle) {
    printBanner();
    cmdHelpSimple();
    return;
  }

  if (session.currentMode === "image-search") {
    printPageHeader(session.currentUrl, session.currentTitle, `Page ${session.currentPage}`);
    if (!session.currentImages.length) console.log(`${C.yellow}No images found.${C.reset}`);
    else printMediaGrid(session.currentImages, "image");
    return;
  }

  if (session.currentMode === "video-search") {
    printPageHeader(session.currentUrl, session.currentTitle, `Page ${session.currentPage}`);
    if (!session.currentImages.length) console.log(`${C.yellow}No videos found.${C.reset}`);
    else printMediaGrid(session.currentImages, "video");
    return;
  }

  if (session.currentMode === "web-search") {
    printPageHeader(session.currentUrl, session.currentTitle, `Page ${session.currentPage}`);
    if (!session.currentLinks.length) console.log(`${C.yellow}No results found.${C.reset}`);
    else printSearchResults(session.currentLinks);
    return;
  }

  printPageHeader(session.currentUrl, session.currentTitle, session.currentMetaDescription);
  if (session.currentText) {
    const lines = session.currentText.split("\n");
    lines.slice(0, 80).forEach(line => { if (line.trim()) console.log(wrap(line, 2)); });
    if (lines.length > 80) console.log(`${C.dim}  ... more text available via /readmode${C.reset}`);
  }
  printLinks(session.currentLinks, 20);
  if (session.currentImages.length) {
    console.log(`\n${C.a}Page Images (${session.currentImages.length})${C.reset}  ${C.dim}/img <n>${C.reset}`);
    session.currentImages.slice(0, 12).forEach((img, index) => {
      console.log(`  ${C.p}[${index + 1}]${C.reset} ${img.title || img.alt || img.url}`);
    });
  }
}

// ─── URL helpers ──────────────────────────────────────────────────────────────
function isImageUrl(url) {
  return /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)(\?|#|$)/i.test(String(url || ""));
}

function normalizeUrlInput(value) {
  const raw = decodeBingWrappedUrl(cleanVisibleText(String(value || "").trim()));
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[a-z0-9-]+\.[a-z]{2,}(\/|$)/i.test(raw)) return `https://${raw}`;
  return raw;
}

// ─── Page loading ─────────────────────────────────────────────────────────────
async function openPage(url, pushNav = true) {
  const targetUrl = /^https?:\/\//i.test(String(url || "")) ? decodeBingWrappedUrl(url) : `https://${url}`;
  if (pushNav && (session.currentUrl || session.currentTitle)) navPush(navSnapshot());
  console.log(`${C.dim}Fetching ${targetUrl} ...${C.reset}`);

  let html;
  try {
    html = await fetchUrl(targetUrl);
  } catch (error) {
    console.log(`${C.red}Error fetching page: ${error.message}${C.reset}`);
    logLine(`openPage error ${targetUrl}: ${error.message}`);
    return;
  }

  const title   = extractTitle(html) || targetUrl;
  const text    = stripHtml(html);
  const links   = extractLinks(html, targetUrl);
  const images  = extractImages(html, targetUrl, 24);

  session.currentUrl             = targetUrl;
  session.currentTitle           = title;
  session.currentText            = text;
  session.currentLinks           = links.map((item, index) => ({ ...item, n: index + 1 }));
  session.currentImages          = images;
  session.currentMode            = "page";
  session.currentMetaDescription = extractMetaDescription(html) || `${links.length} links found`;
  session.currentPage            = 1;
  session.currentSearch          = null;

  renderCurrentView();
  recordPageVisit(targetUrl, title);
  logLine(`openPage ok ${targetUrl}`);
}

// ─── Search helpers ───────────────────────────────────────────────────────────
function buildBingSearchUrl(query, page = 1) {
  const first = ((page - 1) * 10) + 1;
  return `${SEARCH_URLS.BING_SEARCH}${encodeURIComponent(query)}&count=10&first=${first}${BING_MARKET_QUERY}`;
}

function buildBingImageUrl(query, page = 1) {
  const first = ((page - 1) * 28) + 1;
  return `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC3&first=${first}${BING_MARKET_QUERY}`;
}

function buildBingVideoUrl(query, page = 1) {
  const first = ((page - 1) * 28) + 1;
  return `https://www.bing.com/videos/search?q=${encodeURIComponent(query)}&first=${first}${BING_MARKET_QUERY}`;
}

async function renderWebSearchResults(url, results, meta, pushNav = true) {
  if (pushNav && (session.currentUrl || session.currentTitle)) navPush(navSnapshot());
  session.currentUrl             = url;
  session.currentTitle           = meta.title;
  session.currentText            = null;
  session.currentLinks           = results.map((item, index) => ({
    n:       index + 1,
    text:    item.title || item.text || item.url,
    url:     item.url,
    snippet: item.snippet || "",
    source:  item.source  || "",
  }));
  session.currentImages          = [];
  session.currentMode            = "web-search";
  session.currentMetaDescription = meta.subtitle || "";
  session.currentPage            = meta.page;
  session.currentSearch          = meta.searchState;
  renderCurrentView();
}

async function doWebSearch(query, options = {}) {
  const page          = Number(options.page || session.currentPage || 1);
  const effectiveQ    = options.siteHost ? `site:${options.siteHost} ${query}` : query;
  const url           = buildBingSearchUrl(effectiveQ, page);

  if (options.pushNav !== false && (session.currentUrl || session.currentTitle)) navPush(navSnapshot());
  console.log(`${C.dim}Searching web for "${options.displayQuery || query}" ...${C.reset}`);

  let html;
  try { html = await fetchUrl(url); }
  catch (error) { console.log(`${C.red}Search error: ${error.message}${C.reset}`); return; }

  const results = parseBingWebResults(html, 10);
  await renderWebSearchResults(url, results, {
    title:       options.title || `Search: ${options.displayQuery || query}`,
    subtitle:    options.siteHost ? `${options.siteHost} scoped search` : "Bing web results",
    page,
    searchState: { kind: "web", query, displayQuery: options.displayQuery || query, siteHost: options.siteHost || null },
  }, false);

  recordSearch(query, url, "web", options.displayQuery || query, page, { siteHost: options.siteHost || null, kind: "web" });
}

async function doWikipediaSearch(query, options = {}) {
  const apiUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&limit=10&namespace=0&format=json&search=${encodeURIComponent(query)}`;
  console.log(`${C.dim}Searching Wikipedia for "${query}" ...${C.reset}`);

  let payload;
  try { payload = await fetchJson(apiUrl); }
  catch (error) { console.log(`${C.red}Wikipedia search error: ${error.message}${C.reset}`); return; }

  const results = parseWikipediaApiResults(payload, 10);
  await renderWebSearchResults(apiUrl, results, {
    title:       `Wikipedia: ${query}`,
    subtitle:    "Wikipedia API results",
    page:        1,
    searchState: { kind: "wikipedia", query, displayQuery: `${query} @ wikipedia.org`, siteHost: "wikipedia.org" },
  }, options.pushNav !== false);

  recordSearch(query, apiUrl, "web", `${query} @ wikipedia.org`, 1, { siteHost: "wikipedia.org", kind: "wikipedia" });
}

async function doGitHubSearch(query, options = {}) {
  const apiUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=10`;
  console.log(`${C.dim}Searching GitHub repositories for "${query}" ...${C.reset}`);

  let payload;
  try {
    payload = await fetchJson(apiUrl, [
      ["Accept",     "application/vnd.github+json"],
      ["User-Agent", "CipherBrowse"],
    ]);
  } catch (error) { console.log(`${C.red}GitHub search error: ${error.message}${C.reset}`); return; }

  const results = Array.isArray(payload?.items)
    ? payload.items.slice(0, 10).map((item, index) => ({
        n:       index + 1,
        title:   item.full_name,
        text:    item.full_name,
        url:     item.html_url,
        snippet: cleanVisibleText(item.description || ""),
        source:  `GitHub | ${item.stargazers_count || 0} stars`,
      }))
    : [];

  await renderWebSearchResults(apiUrl, results, {
    title:       `GitHub: ${query}`,
    subtitle:    "GitHub repository search",
    page:        1,
    searchState: { kind: "github", query, displayQuery: `${query} @ github.com`, siteHost: "github.com" },
  }, options.pushNav !== false);

  recordSearch(query, apiUrl, "web", `${query} @ github.com`, 1, { siteHost: "github.com", kind: "github" });
}

async function doStackOverflowSearch(query, options = {}) {
  const apiUrl = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&site=stackoverflow&pagesize=10&q=${encodeURIComponent(query)}`;
  console.log(`${C.dim}Searching Stack Overflow for "${query}" ...${C.reset}`);

  let payload;
  try { payload = await fetchJson(apiUrl); }
  catch (error) { console.log(`${C.red}Stack Overflow search error: ${error.message}${C.reset}`); return; }

  const results = Array.isArray(payload?.items)
    ? payload.items.slice(0, 10).map((item, index) => ({
        n:       index + 1,
        title:   cleanVisibleText(item.title || item.link || ""),
        text:    cleanVisibleText(item.title || item.link || ""),
        url:     item.link,
        snippet: `Score ${item.score ?? 0} | ${item.answer_count ?? 0} answers`,
        source:  "stackoverflow.com",
      }))
    : [];

  await renderWebSearchResults(apiUrl, results, {
    title:       `Stack Overflow: ${query}`,
    subtitle:    "Stack Exchange API search",
    page:        1,
    searchState: { kind: "stackoverflow", query, displayQuery: `${query} @ stackoverflow.com`, siteHost: "stackoverflow.com" },
  }, options.pushNav !== false);

  recordSearch(query, apiUrl, "web", `${query} @ stackoverflow.com`, 1, { siteHost: "stackoverflow.com", kind: "stackoverflow" });
}

async function doNpmSearch(query, options = {}) {
  const apiUrl = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=10`;
  console.log(`${C.dim}Searching npm packages for "${query}" ...${C.reset}`);

  let payload;
  try { payload = await fetchJson(apiUrl); }
  catch (error) { console.log(`${C.red}npm search error: ${error.message}${C.reset}`); return; }

  const results = Array.isArray(payload?.objects)
    ? payload.objects.slice(0, 10).map((entry, index) => {
        const pkg = entry.package || {};
        return {
          n:       index + 1,
          title:   pkg.name || pkg.links?.npm || "package",
          text:    pkg.name || pkg.links?.npm || "package",
          url:     pkg.links?.npm || `https://www.npmjs.com/package/${pkg.name}`,
          snippet: cleanVisibleText(pkg.description || ""),
          source:  `npm | ${pkg.version || ""}`.trim(),
        };
      })
    : [];

  await renderWebSearchResults(apiUrl, results, {
    title:       `npm: ${query}`,
    subtitle:    "npm registry search",
    page:        1,
    searchState: { kind: "npm", query, displayQuery: `${query} @ npmjs.com`, siteHost: "npmjs.com" },
  }, options.pushNav !== false);

  recordSearch(query, apiUrl, "web", `${query} @ npmjs.com`, 1, { siteHost: "npmjs.com", kind: "npm" });
}

async function doMdnSearch(query, options = {}) {
  const apiUrl = `https://developer.mozilla.org/api/v1/search?q=${encodeURIComponent(query)}&locale=en-US`;
  console.log(`${C.dim}Searching MDN for "${query}" ...${C.reset}`);

  let payload;
  try { payload = await fetchJson(apiUrl); }
  catch (error) { console.log(`${C.red}MDN search error: ${error.message}${C.reset}`); return; }

  const results = Array.isArray(payload?.documents)
    ? payload.documents.slice(0, 10).map((doc, index) => ({
        n:       index + 1,
        title:   cleanVisibleText(doc.title || doc.mdn_url || ""),
        text:    cleanVisibleText(doc.title || doc.mdn_url || ""),
        url:     `https://developer.mozilla.org${doc.mdn_url}`,
        snippet: cleanVisibleText(doc.summary || ""),
        source:  "developer.mozilla.org",
      }))
    : [];

  await renderWebSearchResults(apiUrl, results, {
    title:       `MDN: ${query}`,
    subtitle:    "MDN API search",
    page:        1,
    searchState: { kind: "mdn", query, displayQuery: `${query} @ developer.mozilla.org`, siteHost: "developer.mozilla.org" },
  }, options.pushNav !== false);

  recordSearch(query, apiUrl, "web", `${query} @ developer.mozilla.org`, 1, { siteHost: "developer.mozilla.org", kind: "mdn" });
}

async function doImageSearch(query, options = {}) {
  const page       = Number(options.page || session.currentPage || 1);
  const effectiveQ = options.siteHost ? `site:${options.siteHost} ${query}` : query;
  const url        = buildBingImageUrl(effectiveQ, page);

  if (options.pushNav !== false && (session.currentUrl || session.currentTitle)) navPush(navSnapshot());
  console.log(`${C.dim}Searching images for "${options.displayQuery || query}" ...${C.reset}`);

  let html;
  try { html = await fetchUrl(url); }
  catch (error) { console.log(`${C.red}Image search error: ${error.message}${C.reset}`); return; }

  const items = parseBingImageResults(html, 12);
  session.currentUrl             = url;
  session.currentTitle           = `Images: ${options.displayQuery || query}`;
  session.currentText            = null;
  session.currentLinks           = [];
  session.currentImages          = items;
  session.currentMode            = "image-search";
  session.currentMetaDescription = options.siteHost ? `${options.siteHost} scoped image search` : "Bing image results";
  session.currentPage            = page;
  session.currentSearch          = { kind: "image", query, displayQuery: options.displayQuery || query, siteHost: options.siteHost || null };

  renderCurrentView();
  recordSearch(query, url, "image", options.displayQuery || `${query} [images]`, page, { siteHost: options.siteHost || null, kind: "image" });
}

async function doVideoSearch(query, options = {}) {
  const page          = Number(options.page || session.currentPage || 1);
  const ytdlp         = findTool("ytdlp");
  const normalizedSite = normalizeSiteTarget(options.siteHost || "");
  let items    = [];
  let url      = "";
  let subtitle = "";

  if (ytdlp && normalizedSite === "youtube.com") {
    console.log(`${C.dim}Searching YouTube via yt-dlp for "${query}" ...${C.reset}`);
    const pageSize = 12;
    const expanded = ytDlpSearch(ytdlp, query, page * pageSize);
    items    = expanded.slice((page - 1) * pageSize, page * pageSize);
    url      = `ytsearch:${query}`;
    subtitle = "yt-dlp YouTube results";
  } else {
    const effectiveQ = normalizedSite ? `site:${normalizedSite} ${query}` : query;
    url      = buildBingVideoUrl(effectiveQ, page);
    subtitle = normalizedSite ? `${normalizedSite} scoped video search` : "Bing video results";
    console.log(`${C.dim}Searching videos for "${options.displayQuery || query}" ...${C.reset}`);
    let html;
    try { html = await fetchUrl(url); }
    catch (error) { console.log(`${C.red}Video search error: ${error.message}${C.reset}`); return; }
    items = parseBingVideoResults(html, 12);
    if (!items.length && normalizedSite === "youtube.com" && ytdlp) {
      const pageSize = 12;
      const expanded = ytDlpSearch(ytdlp, query, page * pageSize);
      items    = expanded.slice((page - 1) * pageSize, page * pageSize);
      url      = `ytsearch:${query}`;
      subtitle = "yt-dlp YouTube results";
    }
  }

  if (options.pushNav !== false && (session.currentUrl || session.currentTitle)) navPush(navSnapshot());
  session.currentUrl             = url;
  session.currentTitle           = `Videos: ${options.displayQuery || query}`;
  session.currentText            = null;
  session.currentLinks           = [];
  session.currentImages          = items;
  session.currentMode            = "video-search";
  session.currentMetaDescription = subtitle;
  session.currentPage            = page;
  session.currentSearch          = { kind: "video", query, displayQuery: options.displayQuery || query, siteHost: normalizedSite || null };

  renderCurrentView();
  recordSearch(query, url, "video", options.displayQuery || `${query} [videos]`, page, { siteHost: normalizedSite || null, kind: "video" });
}

async function doSearch(rawInput) {
  const { mode, text } = parseSearchFlavor(String(rawInput || "").trim());
  const request        = buildSearchRequest(text);
  const baseQuery      = request.siteHost ? request.question : request.query;
  const isVideoSite    = /^(youtube\.com|instagram\.com|redgifs\.com|pornhub\.com|xhamster\.com|xvideos\.com)$/i.test(request.siteHost || "");

  if (!cleanVisibleText(baseQuery)) {
    console.log(`${C.red}Usage: /s <query> or /s <site> --query <text>${C.reset}`);
    return;
  }

  if (mode === "image") { await doImageSearch(baseQuery, { displayQuery: request.displayQuery || baseQuery, siteHost: request.siteHost }); return; }
  if (mode === "video") { await doVideoSearch(baseQuery, { displayQuery: request.displayQuery || baseQuery, siteHost: request.siteHost }); return; }

  if (request.siteHost && shouldUseEngineSearchForSite(request.siteHost) && !isVideoSite) {
    await doWebSearch(request.question, { displayQuery: request.question, siteHost: null });
    return;
  }
  if (isVideoSite)                              { await doVideoSearch(request.question,    { displayQuery: request.displayQuery, siteHost: request.siteHost }); return; }
  if (request.siteHost === "wikipedia.org")     { await doWikipediaSearch(request.question, { pushNav: true }); return; }
  if (request.siteHost === "youtube.com")       { await doVideoSearch(request.question,    { displayQuery: request.displayQuery, siteHost: request.siteHost }); return; }
  if (request.siteHost === "github.com")        { await doGitHubSearch(request.question,   { pushNav: true }); return; }
  if (request.siteHost === "stackoverflow.com") { await doStackOverflowSearch(request.question, { pushNav: true }); return; }
  if (request.siteHost === "npmjs.com")         { await doNpmSearch(request.question,      { pushNav: true }); return; }
  if (request.siteHost === "developer.mozilla.org") { await doMdnSearch(request.question,  { pushNav: true }); return; }

  await doWebSearch(baseQuery, { displayQuery: request.displayQuery || baseQuery, siteHost: request.siteHost });
}

// ─── Media resolution ─────────────────────────────────────────────────────────
function resolveGridItem(arg) {
  const coord = parseGridCoordinate(arg);
  if (!coord) return null;
  const index = resolveGridSelection(MEDIA_GRID_COLUMNS, coord.column, coord.row);
  if (index === null || index < 0) return null;
  return session.currentImages[index] || null;
}

function resolveMediaItem(arg) {
  const coordItem = resolveGridItem(arg);
  if (coordItem) return coordItem;
  const index = Number.parseInt(String(arg || "").trim(), 10);
  if (Number.isInteger(index) && index >= 1) return session.currentImages[index - 1] || null;
  if (/^https?:\/\//i.test(String(arg || ""))) return { url: decodeBingWrappedUrl(arg), title: arg };
  return null;
}

async function rerunSearchState(search, page, pushNav = false) {
  if (!search) return;
  const opts = { displayQuery: search.displayQuery, siteHost: search.siteHost || null, page: Number(page || 1), pushNav };
  switch (search.kind) {
    case "image":        await doImageSearch(search.query, opts);         return;
    case "video":        await doVideoSearch(search.query, opts);         return;
    case "wikipedia":    await doWikipediaSearch(search.query, opts);     return;
    case "github":       await doGitHubSearch(search.query, opts);        return;
    case "stackoverflow":await doStackOverflowSearch(search.query, opts); return;
    case "npm":          await doNpmSearch(search.query, opts);           return;
    case "mdn":          await doMdnSearch(search.query, opts);           return;
    default:             await doWebSearch(search.query, opts);
  }
}

function findTool(name) {
  const bundled = path.join(PATHS.TOOLS_DIR, PATHS.PLATFORM_KEY, TOOL_BINS[name]);
  if (fs.existsSync(bundled)) return bundled;
  try {
    const which  = process.platform === "win32" ? "where" : "which";
    const result = spawnSync(which, [TOOL_BINS[name]], { encoding: "utf8", windowsHide: true });
    const first  = String(result.stdout || "").trim().split(/\r?\n/)[0];
    if (first && fs.existsSync(first)) return first;
  } catch {}
  return null;
}

// ─── Commands ─────────────────────────────────────────────────────────────────
async function cmdOpen(arg) {
  if (!arg) { console.log(`${C.red}Usage: /open <n> or /open <col,row> or /open <url>${C.reset}`); return; }

  if (/^https?:\/\//i.test(arg)) {
    const directUrl = decodeBingWrappedUrl(arg);
    if (isImageUrl(directUrl))           { await cmdImg(directUrl);  return; }
    if (isLikelyDirectMediaUrl(directUrl)){ await cmdPlay(directUrl); return; }
    await openPage(directUrl);
    return;
  }

  const gridItem = resolveGridItem(arg);
  if (gridItem) {
    if (session.currentMode === "image-search") { await cmdImg(arg);  return; }
    if (session.currentMode === "video-search") { await cmdPlay(arg); return; }
  }

  const index = Number.parseInt(String(arg).trim(), 10);
  if (!Number.isInteger(index) || index < 1) { console.log(`${C.red}Invalid link number.${C.reset}`); return; }

  if (session.currentMode === "page" && session.currentImages[index - 1] && !session.currentLinks[index - 1]) {
    await cmdImg(String(index));
    return;
  }

  const link = session.currentLinks.find(item => item.n === index);
  if (!link) { console.log(`${C.red}No link #${index} on this view.${C.reset}`); return; }
  if (isImageUrl(link.url))             { await cmdImg(link.url);  return; }
  if (isLikelyDirectMediaUrl(link.url)) { await cmdPlay(link.url); return; }
  await openPage(link.url);
}

async function cmdBack() {
  if (session.navIndex <= 0) { console.log(`${C.yellow}No previous page.${C.reset}`); return; }
  session.navIndex -= 1;
  navApply(session.navStack[session.navIndex]);
  renderCurrentView();
}

async function cmdForward() {
  if (session.navIndex >= session.navStack.length - 1) { console.log(`${C.yellow}No forward page.${C.reset}`); return; }
  session.navIndex += 1;
  navApply(session.navStack[session.navIndex]);
  renderCurrentView();
}

async function cmdReload() {
  if (session.currentSearch)  { await rerenderCurrentSearch(); return; }
  if (!session.currentUrl)    { console.log(`${C.yellow}Nothing to reload.${C.reset}`); return; }
  await openPage(session.currentUrl, false);
}

async function cmdNext() {
  if (!session.currentSearch) { console.log(`${C.yellow}No search loaded.${C.reset}`); return; }
  session.currentPage += 1;
  await rerenderCurrentSearch();
}

async function cmdPrev() {
  if (!session.currentSearch)    { console.log(`${C.yellow}No search loaded.${C.reset}`); return; }
  if (session.currentPage <= 1)  { console.log(`${C.yellow}Already on page 1.${C.reset}`); return; }
  session.currentPage -= 1;
  await rerenderCurrentSearch();
}

async function rerenderCurrentSearch() {
  const search = session.currentSearch;
  if (!search) return;
  await rerunSearchState(search, session.currentPage, false);
}

async function cmdHistory(arg) {
  const trimmed    = String(arg || "").trim();
  const openMatch  = trimmed.match(/^(?:open\s+)?(\d+)$/i);
  if (openMatch) {
    const index = Number(openMatch[1]);
    const item  = session.pageHistory[index - 1];
    if (!item) { console.log(`${C.red}No history item #${index}.${C.reset}`); return; }
    await openPage(item.url);
    return;
  }
  if (!session.pageHistory.length) { console.log(`${C.yellow}No visited pages yet.${C.reset}`); return; }
  console.log(`\n${C.a}Visited Pages${C.reset}`);
  session.pageHistory.slice(0, 30).forEach((item, index) => {
    console.log(`  ${C.p}[${index + 1}]${C.reset} ${item.title}  ${C.dim}${String(item.at || "").slice(0, 10)}${C.reset}`);
  });
  console.log(`${C.dim}  /history <n> to re-open${C.reset}`);
}

async function cmdSearches(arg) {
  const trimmed   = String(arg || "").trim();
  const openMatch = trimmed.match(/^(?:open\s+)?(\d+)$/i);
  if (openMatch) {
    const index = Number(openMatch[1]);
    const item  = session.searchHistory[index - 1];
    if (!item) { console.log(`${C.red}No search history item #${index}.${C.reset}`); return; }
    session.currentPage = Number(item.page || 1);
    await rerunSearchState({
      kind:         item.kind || item.mode || "web",
      query:        item.query,
      displayQuery: item.displayQuery || item.query,
      siteHost:     item.siteHost || null,
    }, session.currentPage, true);
    return;
  }
  if (!session.searchHistory.length) { console.log(`${C.yellow}No search history yet.${C.reset}`); return; }
  console.log(`\n${C.a}Recent Searches${C.reset}`);
  session.searchHistory.slice(0, 30).forEach((item, index) => {
    console.log(`  ${C.p}[${index + 1}]${C.reset} ${item.displayQuery || item.query}  ${C.dim}${String(item.at || "").slice(0, 10)}${C.reset}`);
  });
  console.log(`${C.dim}  /searches <n> to re-run${C.reset}`);
}

function cmdBookmark() {
  if (!session.currentUrl) { console.log(`${C.yellow}No page loaded.${C.reset}`); return; }
  const bookmarks = loadJson(PATHS.BOOKMARKS_PATH, []);
  if (bookmarks.some(item => item.url === session.currentUrl)) { console.log(`${C.yellow}Already bookmarked.${C.reset}`); return; }
  bookmarks.unshift({ url: session.currentUrl, title: session.currentTitle || session.currentUrl, at: new Date().toISOString() });
  saveJson(PATHS.BOOKMARKS_PATH, bookmarks);
  console.log(`${C.p}Bookmarked:${C.reset} ${session.currentTitle || session.currentUrl}`);
}

async function cmdBookmarks(arg) {
  const bookmarks = loadJson(PATHS.BOOKMARKS_PATH, []);
  const trimmed   = String(arg || "").trim();
  const openMatch = trimmed.match(/^(?:open\s+)?(\d+)$/i);
  if (openMatch) {
    const index = Number(openMatch[1]);
    const item  = bookmarks[index - 1];
    if (!item) { console.log(`${C.red}No bookmark #${index}.${C.reset}`); return; }
    await openPage(item.url);
    return;
  }
  if (!bookmarks.length) { console.log(`${C.yellow}No bookmarks saved.${C.reset}`); return; }
  console.log(`\n${C.a}Bookmarks${C.reset}`);
  bookmarks.forEach((item, index) => console.log(`  ${C.p}[${index + 1}]${C.reset} ${item.title || item.url}`));
  console.log(`${C.dim}  /bookmarks <n> to open${C.reset}`);
}

function cmdBookmarkRemove(arg) {
  const index     = Number.parseInt(String(arg || "").trim(), 10);
  const bookmarks = loadJson(PATHS.BOOKMARKS_PATH, []);
  if (!Number.isInteger(index) || index < 1 || index > bookmarks.length) { console.log(`${C.red}Invalid bookmark number.${C.reset}`); return; }
  const removed = bookmarks.splice(index - 1, 1)[0];
  saveJson(PATHS.BOOKMARKS_PATH, bookmarks);
  console.log(`${C.p}Removed:${C.reset} ${removed.title || removed.url}`);
}

function cmdNote(text) {
  if (!text) { console.log(`${C.red}Usage: /note <text>${C.reset}`); return; }
  const notes = loadJson(PATHS.NOTES_PATH, []);
  notes.unshift({ text, url: session.currentUrl, at: new Date().toISOString() });
  saveJson(PATHS.NOTES_PATH, notes);
  console.log(`${C.p}Note saved.${C.reset}`);
}

function cmdNotes() {
  const notes = loadJson(PATHS.NOTES_PATH, []);
  if (!notes.length) { console.log(`${C.yellow}No notes saved.${C.reset}`); return; }
  console.log(`\n${C.a}Notes${C.reset}`);
  notes.forEach((item, index) => {
    console.log(`  ${C.p}[${index + 1}]${C.reset} ${item.text}  ${C.dim}${String(item.at || "").slice(0, 10)}${C.reset}`);
  });
}

function cmdNoteDelete(arg) {
  const parts = String(arg || "").trim().split(/\s+/).filter(Boolean);
  const from  = Number.parseInt(parts[0], 10);
  const to    = Number.parseInt(parts[1], 10) || from;
  const notes = loadJson(PATHS.NOTES_PATH, []);
  if (!Number.isInteger(from) || from < 1 || from > notes.length || to < from) { console.log(`${C.red}Invalid note range.${C.reset}`); return; }
  const removed = notes.splice(from - 1, to - from + 1);
  saveJson(PATHS.NOTES_PATH, notes);
  console.log(`${C.p}Deleted ${removed.length} note(s).${C.reset}`);
}

function cmdAlert(url) {
  const normalizedUrl = normalizeUrlInput(url);
  if (!normalizedUrl) { console.log(`${C.red}Usage: /alert <url>${C.reset}`); return; }
  const alerts = loadJson(PATHS.ALERTS_PATH, []);
  if (alerts.some(item => item.url === normalizedUrl)) { console.log(`${C.yellow}Already monitoring.${C.reset}`); return; }
  alerts.unshift({ url: normalizedUrl, at: new Date().toISOString() });
  saveJson(PATHS.ALERTS_PATH, alerts);
  console.log(`${C.p}Alert added:${C.reset} ${normalizedUrl}`);
}

function cmdAlerts() {
  const alerts = loadJson(PATHS.ALERTS_PATH, []);
  if (!alerts.length) { console.log(`${C.yellow}No alerts set.${C.reset}`); return; }
  console.log(`\n${C.a}Monitoring Alerts${C.reset}`);
  alerts.forEach((item, index) => console.log(`  ${C.p}[${index + 1}]${C.reset} ${item.url}`));
}

function cmdAlertRemove(arg) {
  const index  = Number.parseInt(String(arg || "").trim(), 10);
  const alerts = loadJson(PATHS.ALERTS_PATH, []);
  if (!Number.isInteger(index) || index < 1 || index > alerts.length) { console.log(`${C.red}Invalid alert number.${C.reset}`); return; }
  const removed = alerts.splice(index - 1, 1)[0];
  saveJson(PATHS.ALERTS_PATH, alerts);
  console.log(`${C.p}Removed alert:${C.reset} ${removed.url}`);
}

function cmdSummarize() {
  if (!session.currentText) { console.log(`${C.yellow}No page loaded.${C.reset}`); return; }
  const words   = session.currentText.split(/\s+/).filter(Boolean).length;
  const lines   = session.currentText.split("\n").filter(Boolean).length;
  const chars   = session.currentText.length;
  const firstParagraph = session.currentText.split(/\n{2,}/).find(b => b.trim().length > 120);
  console.log(`\n${C.a}Page Summary${C.reset}`);
  console.log(`  URL:   ${session.currentUrl}`);
  console.log(`  Title: ${session.currentTitle}`);
  console.log(`  Words: ${words}  Lines: ${lines}  Chars: ${chars}`);
  if (firstParagraph) {
    console.log(`\n${C.p}First substantial paragraph:${C.reset}`);
    console.log(wrap(firstParagraph.slice(0, 600), 2));
  }
}

function cmdStats() {
  if (!session.currentText) { console.log(`${C.yellow}No page loaded.${C.reset}`); return; }
  const words = session.currentText.split(/\s+/).filter(Boolean).length;
  const lines = session.currentText.split("\n").filter(Boolean).length;
  console.log(`\n${C.a}Page Stats${C.reset}`);
  console.log(`  Words:  ${words}`);
  console.log(`  Lines:  ${lines}`);
  console.log(`  Links:  ${session.currentLinks.length}`);
  console.log(`  Images: ${session.currentImages.length}`);
}

function cmdReadMode() {
  if (!session.currentText) { console.log(`${C.yellow}No page loaded.${C.reset}`); return; }
  printPageHeader(session.currentUrl, session.currentTitle, "Read mode");
  session.currentText.split("\n").forEach(line => { if (line.trim()) console.log(wrap(line, 2)); });
  console.log(hr());
}

function escapeRegex(text) { return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function cmdFind(text) {
  if (!text)                { console.log(`${C.red}Usage: /find <text>${C.reset}`); return; }
  if (!session.currentText) { console.log(`${C.yellow}No page loaded.${C.reset}`); return; }
  const pattern   = new RegExp(escapeRegex(text), "i");
  const highlight = new RegExp(escapeRegex(text), "gi");
  const lines     = session.currentText.split("\n").filter(line => pattern.test(line));
  console.log(`\n${C.a}Find: "${text}"${C.reset}  ${C.dim}${lines.length} match(es)${C.reset}`);
  lines.slice(0, 30).forEach(line => {
    console.log(`  ${line.trim().replace(highlight, m => `${C.yellow}${m}${C.reset}`)}`);
  });
  if (lines.length > 30) console.log(`${C.dim}  ... ${lines.length - 30} more matches${C.reset}`);
}

function cmdExport(formatArg) {
  if (!session.currentUrl) { console.log(`${C.yellow}No page loaded.${C.reset}`); return; }
  const requested = (formatArg || "md").toLowerCase();
  const formats   = requested === "all" ? ["md", "html", "json"] : [requested];
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName  = (session.currentTitle || "page").replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  const written   = [];

  for (const format of formats) {
    const filePath = path.join(PATHS.EXPORTS_DIR, `${safeName}_${timestamp}.${format}`);
    let content = "";
    if (format === "md") {
      content = `# ${session.currentTitle}\n\nURL: ${session.currentUrl}\n\n${session.currentText || ""}\n`;
    } else if (format === "html") {
      content = `<!doctype html><html><head><meta charset="utf-8"><title>${session.currentTitle}</title></head><body><h1>${session.currentTitle}</h1><p>${(session.currentText || "").replace(/\n/g, "<br>")}</p></body></html>`;
    } else if (format === "json") {
      content = JSON.stringify({ url: session.currentUrl, title: session.currentTitle, text: session.currentText, links: session.currentLinks, images: session.currentImages }, null, 2);
    } else {
      console.log(`${C.red}Unknown export format: ${format}${C.reset}`);
      continue;
    }
    ensureDataDir();
    fs.writeFileSync(filePath, content, "utf8");
    written.push(filePath);
  }

  if (written.length) {
    console.log(`${C.p}Exported:${C.reset}`);
    written.forEach(fp => console.log(`  ${fp}`));
  }
}

function cmdShare() {
  if (!session.currentUrl) { console.log(`${C.yellow}No page loaded.${C.reset}`); return; }
  console.log(`${C.p}Share:${C.reset} ${session.currentUrl}`);
}

// ─── AI ───────────────────────────────────────────────────────────────────────
const aiKeyStore = createAIKeyStore({
  fs,
  keyFile:    PATHS.AI_KEY_FILE,
  secretFile: PATHS.AI_KEY_SECRET_FILE,
  ensureDataDir,
});

async function cmdAI(rawArgs) {
  const text = String(rawArgs || "").trim();

  if (/^set\s+key\b/i.test(text)) {
    const parsed = parseAIProviderAndKey(text, "set");
    if (!parsed || !parsed.provider || !parsed.key) {
      console.log(`${C.red}Usage: /ai set key --"<provider>" -'<key>'${C.reset}`);
      return;
    }
    const added = aiKeyStore.addKey(parsed.provider, parsed.key);
    if (added) console.log(`${C.p}Added key for ${AI_PROVIDERS[parsed.provider].label}.${C.reset}`);
    else        console.log(`${C.yellow}That key is already stored.${C.reset}`);
    return;
  }

  if (/^delete\s+key\b/i.test(text)) {
    const parsed = parseAIProviderAndKey(text, "delete");
    if (!parsed || !parsed.provider) { console.log(`${C.red}Usage: /ai delete key --"<provider>"${C.reset}`); return; }
    aiKeyStore.clearKeys(parsed.provider);
    console.log(`${C.p}Deleted saved keys for ${AI_PROVIDERS[parsed.provider].label}.${C.reset}`);
    return;
  }

  const queryMatch = text.match(/^--query\s+([\s\S]+)$/i);
  const query      = cleanVisibleText(queryMatch ? queryMatch[1] : text).replace(/^["']|["']$/g, "");
  if (!query) { console.log(`${C.red}Usage: /ai --query "your question"${C.reset}`); return; }

  const context = session.currentText ? session.currentText.slice(0, 3000) : "";
  const prompt  = context
    ? `Current page title: ${session.currentTitle}\nCurrent page url: ${session.currentUrl}\n\nPage content:\n${context}\n\nUser request:\n${query}`
    : query;

  let lastAuthError = null;
  for (const [providerId, provider] of Object.entries(AI_PROVIDERS)) {
    const keys = aiKeyStore.getKeys(providerId);
    if (!keys.length) continue;

    for (const key of keys) {
      try {
        console.log(`${C.dim}Asking ${provider.label} ...${C.reset}`);
        const result = await callAIProvider(providerId, key, prompt);
        printAIChatReply(result.label || provider.label, result.reply, result.model);
        return;
      } catch (error) {
        if (isAIRateLimited(error)) {
          console.log(`${C.yellow}${provider.label} is rate limited. Trying next key ...${C.reset}`);
          lastAuthError = error;
          continue;
        }
        if (/api key|unauthorized|forbidden|invalid/i.test(String(error.message || ""))) {
          console.log(`${C.yellow}${provider.label} rejected a key. Trying next ...${C.reset}`);
          lastAuthError = error;
          continue;
        }
        console.log(`${C.red}${provider.label} error: ${error.message}${C.reset}`);
        lastAuthError = error;
        break;
      }
    }
  }

  if (lastAuthError && /rate limit|quota|tokens|resource exhausted|too many requests/i.test(String(lastAuthError.message || "")))
    console.log(`${C.red}All configured AI keys are rate limited or out of tokens.${C.reset}`);
  else
    console.log(`${C.red}No AI provider answered. Use /ai set key --"<provider>" -'<key>' to add keys.${C.reset}`);
}

function cmdAIKeyShow() {
  console.log(`\n${C.a}AI Key Status${C.reset}`);
  for (const [providerId, provider] of Object.entries(AI_PROVIDERS)) {
    const keys   = aiKeyStore.getKeys(providerId);
    const status = keys.length ? `${keys.length} key(s) stored` : "none";
    console.log(`  ${provider.label.padEnd(24)} ${status}`);
  }
  console.log(`${C.dim}Stored keys are encrypted locally with AES-256-GCM.${C.reset}`);
}

// ─── Playback ─────────────────────────────────────────────────────────────────
async function cmdPlay(arg) {
  const item = resolveMediaItem(arg);
  const url  = item?.url || cleanVisibleText(arg);
  if (!url) { console.log(`${C.red}Usage: /play <n|col,row|url>${C.reset}`); return; }
  const mpv = findTool("mpv");
  if (!mpv) { console.log(`${C.red}mpv not found. Run /doctor or /install-help.${C.reset}`); return; }
  const ytdlp      = findTool("ytdlp");
  const resolvedUrl = isLikelyDirectMediaUrl(url) ? url : (resolvePlayableUrl(ytdlp, url) || url);
  console.log(`${C.dim}Opening in mpv: ${resolvedUrl}${C.reset}`);
  spawn(mpv, buildMpvArgs(resolvedUrl, ytdlp), { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

async function cmdPlayPage() {
  if (!session.currentUrl) { console.log(`${C.yellow}No page loaded.${C.reset}`); return; }
  await cmdPlay(session.currentUrl);
}

async function cmdImg(arg) {
  const item = resolveMediaItem(arg);
  const url  = item?.url || cleanVisibleText(arg);
  if (!url) { console.log(`${C.red}Usage: /img <n|col,row|url>${C.reset}`); return; }
  const mpv = findTool("mpv");
  if (!mpv) { console.log(`${C.red}mpv not found. Run /doctor or /install-help.${C.reset}`); return; }
  console.log(`${C.dim}Opening image in mpv: ${url}${C.reset}`);
  spawn(mpv, buildImageMpvArgs(url), { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

// ─── Recon ────────────────────────────────────────────────────────────────────
function runCommand(bin, args, options = {}) {
  try {
    const result = spawnSync(bin, args, { encoding: "utf8", timeout: 15000, windowsHide: true, shell: false, ...options });
    return String(result.stdout || result.stderr || "").trim();
  } catch (error) {
    return String(error.stdout || error.stderr || error.message || "").trim();
  }
}

function normalizeHostTarget(target) {
  const raw = cleanVisibleText(String(target || "").trim());
  if (!raw) return "";
  try { return new URL(raw).hostname; } catch {}
  const host = raw.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return /^[a-z0-9._:-]+$/i.test(host) ? host : "";
}

function hostFromCurrent(target) {
  if (target) return normalizeHostTarget(target);
  try { return new URL(session.currentUrl).hostname; } catch { return ""; }
}

async function cmdWhois(target) {
  const host = hostFromCurrent(target);
  if (!host) { console.log(`${C.red}Usage: /whois <domain>${C.reset}`); return; }
  console.log(runCommand("whois", [host]) || "No output.");
}

async function cmdPing(target) {
  const host = hostFromCurrent(target);
  if (!host) { console.log(`${C.red}Usage: /ping <host>${C.reset}`); return; }
  const args = process.platform === "win32" ? ["-n", "4", host] : ["-c", "4", host];
  console.log(runCommand("ping", args) || "No output.");
}

async function cmdHeaders(targetUrl) {
  const url = normalizeUrlInput(targetUrl) || session.currentUrl;
  if (!url) { console.log(`${C.red}Usage: /headers <url>${C.reset}`); return; }
  console.log(runCommand(CURL_BIN, ["-sI", "--max-time", "10", url]) || "No output.");
}

async function cmdRobots(targetUrl) {
  const url = normalizeUrlInput(targetUrl) || session.currentUrl;
  if (!url) { console.log(`${C.red}Usage: /robots <url>${C.reset}`); return; }
  let origin = url;
  try { origin = new URL(url).origin; } catch {}
  await openPage(`${origin}/robots.txt`, false);
}

async function cmdSsl(target) {
  const host = hostFromCurrent(target);
  if (!host) { console.log(`${C.red}Usage: /ssl <domain>${C.reset}`); return; }
  const output   = runCommand(CURL_BIN, ["-svI", "--max-time", "10", `https://${host}`], { stdio: ["ignore", "pipe", "pipe"] });
  const filtered = output.split(/\r?\n/).filter(line => /issuer|subject|expire|notAfter|SSL|TLS|certificate/i.test(line));
  console.log(filtered.join("\n") || output.slice(0, 1000));
}

async function cmdMyIp() {
  try {
    const value = await fetchUrl("https://api.ipify.org");
    console.log(`${C.p}Public IP:${C.reset} ${value.trim()}`);
  } catch (error) { console.log(`${C.red}Error: ${error.message}${C.reset}`); }
}

async function cmdIpInfo(target) {
  const value = cleanVisibleText(target);
  if (!value) { console.log(`${C.red}Usage: /ipinfo <ip|host>${C.reset}`); return; }
  try {
    const normalized = normalizeHostTarget(value) || value;
    const data = JSON.parse(await fetchUrl(`https://ipinfo.io/${encodeURIComponent(normalized)}/json`));
    for (const [k, v] of Object.entries(data)) {
      if (typeof v !== "object") console.log(`  ${k}: ${v}`);
    }
  } catch (error) { console.log(`${C.red}Error: ${error.message}${C.reset}`); }
}

async function cmdTrace() {
  const host = hostFromCurrent("");
  if (!host) { console.log(`${C.yellow}Load a page first or pass a host.${C.reset}`); return; }
  const bin = process.platform === "win32" ? "tracert" : "traceroute";
  console.log(runCommand(bin, [host], { timeout: 30000 }) || "No output.");
}

async function cmdScan(targetUrl) {
  const url = normalizeUrlInput(targetUrl) || session.currentUrl;
  if (!url) { console.log(`${C.red}Usage: /scan <url>${C.reset}`); return; }
  await cmdHeaders(url);
  try {
    const origin = new URL(url).origin;
    console.log(`\n${C.a}robots.txt${C.reset}`);
    const robots = await fetchUrl(`${origin}/robots.txt`);
    console.log(robots.slice(0, 1200));
  } catch {}
}

async function cmdExtract(targetUrl) {
  const url = normalizeUrlInput(targetUrl) || session.currentUrl;
  if (!url) { console.log(`${C.red}Usage: /extract <url>${C.reset}`); return; }
  await openPage(url, false);
}

async function cmdCrawl(targetUrl) {
  const url = normalizeUrlInput(targetUrl);
  if (!url) { console.log(`${C.red}Usage: /crawl <url>${C.reset}`); return; }
  try {
    const html     = await fetchUrl(url);
    const links    = extractLinks(html, url);
    const origin   = new URL(url).origin;
    const internal = links.filter(item => item.url.startsWith(origin));
    console.log(`\n${C.a}Internal links (${internal.length})${C.reset}`);
    internal.slice(0, 30).forEach(item => console.log(`  ${item.url}`));
  } catch (error) { console.log(`${C.red}Crawl error: ${error.message}${C.reset}`); }
}

async function cmdRss(targetUrl) {
  const url = normalizeUrlInput(targetUrl) || session.currentUrl;
  if (!url) { console.log(`${C.red}Usage: /rss <url>${C.reset}`); return; }
  try {
    const xml   = await fetchUrl(url);
    const items = [];
    const re    = /<item[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<\/item>/gi;
    let match;
    while ((match = re.exec(xml)) !== null && items.length < 20) {
      items.push({ title: cleanVisibleText(match[1]), url: cleanVisibleText(match[2]) });
    }
    if (!items.length) { console.log(`${C.yellow}No RSS items found.${C.reset}`); return; }
    console.log(`\n${C.a}RSS Feed${C.reset}`);
    items.forEach((item, index) => console.log(`  ${C.p}[${index + 1}]${C.reset} ${item.title}`));
  } catch (error) { console.log(`${C.red}RSS error: ${error.message}${C.reset}`); }
}

async function cmdDiff(arg) {
  const parts = String(arg || "").trim().split(/\s+/).filter(Boolean);
  const urlA  = normalizeUrlInput(parts[0]) || session.currentUrl;
  const urlB  = normalizeUrlInput(parts[1]);
  if (!urlA || !urlB) { console.log(`${C.red}Usage: /diff <url1> <url2>${C.reset}`); return; }
  try {
    const [htmlA, htmlB] = await Promise.all([fetchUrl(urlA), fetchUrl(urlB)]);
    const textA  = stripHtml(htmlA).split("\n").map(l => l.trim()).filter(Boolean);
    const textB  = stripHtml(htmlB).split("\n").map(l => l.trim()).filter(Boolean);
    const setA   = new Set(textA);
    const setB   = new Set(textB);
    const onlyA  = textA.filter(l => !setB.has(l)).slice(0, 20);
    const onlyB  = textB.filter(l => !setA.has(l)).slice(0, 20);
    console.log(`\n${C.a}Only in A (${urlA})${C.reset}`);
    onlyA.forEach(l => console.log(`  - ${l}`));
    console.log(`\n${C.a}Only in B (${urlB})${C.reset}`);
    onlyB.forEach(l => console.log(`  + ${l}`));
  } catch (error) { console.log(`${C.red}Diff error: ${error.message}${C.reset}`); }
}

// ─── Crypto / Utility ─────────────────────────────────────────────────────────
function cmdHash(text) {
  if (!text) { console.log(`${C.red}Usage: /hash <text>${C.reset}`); return; }
  console.log(`MD5:    ${crypto.createHash("md5").update(text).digest("hex")}`);
  console.log(`SHA1:   ${crypto.createHash("sha1").update(text).digest("hex")}`);
  console.log(`SHA256: ${crypto.createHash("sha256").update(text).digest("hex")}`);
}

function cmdEncode(text) {
  if (!text) { console.log(`${C.red}Usage: /encode <text>${C.reset}`); return; }
  console.log(`Base64: ${Buffer.from(text, "utf8").toString("base64")}`);
  console.log(`URL:    ${encodeURIComponent(text)}`);
}

function cmdDecode(text) {
  if (!text) { console.log(`${C.red}Usage: /decode <text>${C.reset}`); return; }
  try { console.log(`Base64: ${Buffer.from(text, "base64").toString("utf8")}`); } catch {}
  try { console.log(`URL:    ${decodeURIComponent(text)}`); } catch {}
}

function cmdRot13(text) {
  if (!text) { console.log(`${C.red}Usage: /rot13 <text>${C.reset}`); return; }
  console.log(text.replace(/[a-zA-Z]/g, c => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  }));
}

function cmdHex(text) {
  if (!text) { console.log(`${C.red}Usage: /hex <text>${C.reset}`); return; }
  console.log(Buffer.from(text, "utf8").toString("hex"));
}

function cmdUnhex(text) {
  if (!text) { console.log(`${C.red}Usage: /unhex <hexstring>${C.reset}`); return; }
  try { console.log(Buffer.from(text.replace(/\s+/g, ""), "hex").toString("utf8")); }
  catch { console.log(`${C.red}Invalid hex string.${C.reset}`); }
}

function cmdPassgen(lenArg) {
  const length = Number.parseInt(String(lenArg || "").trim(), 10) || 20;
  const chars  = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+";
  const bytes  = crypto.randomBytes(length);
  const pw     = Array.from(bytes).map(v => chars[v % chars.length]).join("");
  console.log(`Password (${length}): ${pw}`);
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function cmdProxy(arg) {
  const input = String(arg || "").trim();
  const lower = input.toLowerCase();
  if (!input || lower === "off" || lower === "direct") {
    runtime.proxyMode = "direct"; runtime.proxyUrl = null;
    console.log(`${C.p}Proxy disabled.${C.reset}`); return;
  }
  if (lower === "tor") {
    runtime.proxyMode = "tor"; runtime.proxyUrl = DEFAULT_TOR;
    console.log(`${C.p}Tor proxy enabled:${C.reset} ${DEFAULT_TOR}`); return;
  }
  if (/^https?:\/\//i.test(input)) {
    runtime.proxyMode = "proxy"; runtime.proxyUrl = input;
    console.log(`${C.p}Proxy set:${C.reset} ${input}`); return;
  }
  console.log(`${C.red}Usage: /proxy [url|tor|off]${C.reset}`);
}

function cmdAlias(arg) {
  const input = String(arg || "").trim();
  if (!input) {
    const names = Object.keys(session.aliases);
    if (!names.length) { console.log(`${C.yellow}No aliases set.${C.reset}`); return; }
    console.log(`\n${C.a}Aliases${C.reset}`);
    names.forEach(name => console.log(`  /${name} -> ${session.aliases[name]}`));
    return;
  }
  const match = input.match(/^([a-z0-9_-]+)\s*=\s*([\s\S]+)$/i);
  if (!match) { console.log(`${C.red}Usage: /alias <name>=<command>${C.reset}`); return; }
  session.aliases[match[1]] = match[2].trim();
  saveJson(PATHS.ALIASES_PATH, session.aliases);
  console.log(`${C.p}Alias saved:${C.reset} /${match[1]} -> ${match[2].trim()}`);
}

function cmdTheme(arg) {
  if (!arg) {
    console.log(`${C.p}Current theme:${C.reset} ${currentTheme}`);
    console.log(`Available: ${Object.keys(THEMES).join(", ")}`);
    return;
  }
  if (applyTheme(arg)) console.log(`${C.p}Theme set to:${C.reset} ${currentTheme}`);
  else                 console.log(`${C.red}Unknown theme. Available: ${Object.keys(THEMES).join(", ")}${C.reset}`);
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────
async function cmdDoctor() {
  console.log(`\n${C.a}Self Diagnostics - ${APP_NAME} v${APP_VERSION}${C.reset}`);
  console.log(hr());
  console.log(`  Node      ${process.version}`);
  console.log(`  Data dir  ${PATHS.DATA_DIR}`);
  console.log(`  Proxy     ${runtime.proxyMode}${runtime.proxyUrl ? ` (${runtime.proxyUrl})` : ""}`);

  const curlResult = spawnSync(CURL_BIN, ["--version"], { encoding: "utf8", windowsHide: true });
  console.log(`  Curl      ${curlResult.status === 0 ? curlResult.stdout.split(/\r?\n/)[0] : "not found"}`);
  console.log(`  mpv       ${findTool("mpv")   || "not found"}`);
  console.log(`  yt-dlp    ${findTool("ytdlp") || "not found"}`);

  try {
    ensureDataDir();
    const testPath = path.join(PATHS.DATA_DIR, ".write-test");
    fs.writeFileSync(testPath, "ok");
    fs.unlinkSync(testPath);
    console.log("  Data I/O  writable");
  } catch { console.log("  Data I/O  not writable"); }

  const anyKeys = Object.keys(AI_PROVIDERS).some(id => aiKeyStore.getKeys(id).length > 0);
  console.log(`  AI keys   ${anyKeys ? "configured" : "none"}`);

  process.stdout.write(`  Network   testing ...`);
  try {
    await fetchUrl("https://example.com");
    process.stdout.write(`\r  Network   ok              \n`);
  } catch (error) {
    process.stdout.write(`\r  Network   fail - ${error.message}\n`);
  }
  console.log(hr());
}

function cmdSysinfo() {
  const mem = process.memoryUsage();
  console.log(`\n${C.a}System Info${C.reset}`);
  console.log(`  Platform: ${process.platform} ${process.arch}`);
  console.log(`  Node:     ${process.version}`);
  console.log(`  App:      ${APP_NAME} v${APP_VERSION}`);
  console.log(`  Theme:    ${currentTheme}`);
  console.log(`  Memory:   RSS ${Math.round(mem.rss / 1024 / 1024)}MB  Heap ${Math.round(mem.heapUsed / 1024 / 1024)}MB`);
}

function cmdLog() {
  try {
    const lines = fs.readFileSync(PATHS.LOG_PATH, "utf8").trim().split(/\r?\n/);
    console.log(`\n${C.a}Session Log (last 30 entries)${C.reset}`);
    lines.slice(-30).forEach(line => console.log(`  ${line}`));
  } catch { console.log(`${C.yellow}No log file yet.${C.reset}`); }
}

function cmdMatrix() {
  const chars = "01[]{}<>#%$@";
  const width = termWidth();
  let ticks   = 0;
  const iv = setInterval(() => {
    let line = "";
    for (let i = 0; i < width; i += 1) {
      line += Math.random() > 0.5 ? `${C.p}${chars[Math.floor(Math.random() * chars.length)]}${C.reset}` : " ";
    }
    process.stdout.write(`${line}\n`);
    ticks += 1;
    if (ticks >= 20) clearInterval(iv);
  }, 60);
}

function cmdInstallGlobal() {
  console.log(`${C.a}Install globally${C.reset}`);
  console.log(`  cd "${PATHS.APP_ROOT}"`);
  console.log(`  npm install -g .`);
  console.log(`  Then run "cbrowse" or "cipherbrowse" from any terminal.`);
}

function cmdInstallHelp() {
  console.log(`\n${C.a}Install Help${C.reset}`);
  console.log(`  mpv:    https://mpv.io/installation/`);
  console.log(`  yt-dlp: https://github.com/yt-dlp/yt-dlp#installation`);
  console.log(`  curl:   https://curl.se/download.html`);
  console.log(`  Bundled tools live in tools/${PATHS.PLATFORM_KEY}/ when present.`);
}

function cmdHelpSimple() {
  console.log("");
  printTitleLine(`${APP_NAME} v${APP_VERSION}`);
  console.log(hr());
  const colWidth = Math.floor((termWidth() - 6) / 2);
  SIMPLE_HELP_ROWS.forEach(([cmd, desc]) => {
    const left = `${C.p}${cmd}${C.reset}`.padEnd(colWidth + C.p.length + C.reset.length);
    console.log(`  ${left}  ${desc}`);
  });
  console.log(hr());
}

function cmdHelpFull() {
  console.log(`\n${C.a}${APP_NAME} v${APP_VERSION} - Full Command Reference${C.reset}`);
  console.log(hr());
  FULL_HELP_SECTIONS.forEach(section => {
    console.log(`\n${C.a}${section.title}${C.reset}`);
    section.lines.forEach(line => console.log(`  ${line}`));
  });
  console.log(hr());
}

function cmdHome() {
  session.currentUrl             = null;
  session.currentTitle           = null;
  session.currentText            = null;
  session.currentLinks           = [];
  session.currentImages          = [];
  session.currentMode            = "page";
  session.currentPage            = 1;
  session.currentSearch          = null;
  session.currentMetaDescription = "";
  process.stdout.write("\x1b[2J\x1b[0f");
  printBanner();
  cmdHelpSimple();
}

// ─── ASCII Banner ─────────────────────────────────────────────────────────────
//
// Big pixel-block letters spelling "CIPHERBROWSE" in orange shades.
// Font style: chunky retro block letters, 7 rows tall (like INF-EXPRESS in
// the reference image).  Uses full-block (█), half-block (▀▄) and space chars.
//
// Colour key (banner only):
//   O4 = pale gold      — very top highlights / shine
//   O3 = bright orange  — upper body fill
//   O2 = mid orange     — main body fill
//   O1 = deep orange    — shadow / bottom edge
//   RS = reset
//
// The copyright line uses LAV (lavender) as requested.
// ─────────────────────────────────────────────────────────────────────────────
function _legacyPrintBannerUnused() {
  // Each letter is rendered as a 7-row column, 6 chars wide + 1 space gap.
  // We build the full banner as 7 rows of coloured strings, then print them
  // centred.  Using named letter arrays keeps the source readable.

  // prettier-ignore
  const LETTERS = {
    // Row order: [top-cap, upper, mid-upper, mid, mid-lower, lower, base-shadow]
    C: [
      ` ${O4}▄▀▀▀▄${RS}`,
      `${O3}█${RS}     `,
      `${O3}█${RS}     `,
      `${O3}█${RS}     `,
      `${O2}█${RS}     `,
      `${O2}█${RS}     `,
      ` ${O1}▀▄▄▄▀${RS}`,
    ],
    I: [
      `${O4}▄███▄${RS} `,
      `  ${O3}█${RS}   `,
      `  ${O3}█${RS}   `,
      `  ${O3}█${RS}   `,
      `  ${O2}█${RS}   `,
      `  ${O2}█${RS}   `,
      `${O1}▀███▀${RS} `,
    ],
    P: [
      `${O4}▄███▄${RS} `,
      `${O3}█${RS}   ${O3}█${RS} `,
      `${O3}█${RS}   ${O3}█${RS} `,
      `${O3}█████${RS} `,
      `${O2}█${RS}     `,
      `${O2}█${RS}     `,
      `${O1}█${RS}     `,
    ],
    H: [
      `${O4}█${RS}   ${O4}█${RS} `,
      `${O3}█${RS}   ${O3}█${RS} `,
      `${O3}█${RS}   ${O3}█${RS} `,
      `${O3}█████${RS} `,
      `${O2}█${RS}   ${O2}█${RS} `,
      `${O2}█${RS}   ${O2}█${RS} `,
      `${O1}█${RS}   ${O1}█${RS} `,
    ],
    E: [
      `${O4}█████${RS} `,
      `${O3}█${RS}     `,
      `${O3}█${RS}     `,
      `${O3}████${RS}  `,
      `${O2}█${RS}     `,
      `${O2}█${RS}     `,
      `${O1}█████${RS} `,
    ],
    R: [
      `${O4}▄███▄${RS} `,
      `${O3}█${RS}   ${O3}█${RS} `,
      `${O3}█${RS}   ${O3}█${RS} `,
      `${O3}█████${RS} `,
      `${O2}█${RS}  ${O2}█${RS}  `,
      `${O2}█${RS}   ${O2}█${RS} `,
      `${O1}█${RS}   ${O1}█${RS} `,
    ],
    B: [
      `${O4}████${RS}  `,
      `${O3}█${RS}   ${O3}█${RS} `,
      `${O3}█${RS}   ${O3}█${RS} `,
      `${O3}████${RS}  `,
      `${O2}█${RS}   ${O2}█${RS} `,
      `${O2}█${RS}   ${O2}█${RS} `,
      `${O1}████${RS}  `,
    ],
    O: [
      ` ${O4}▄███▄${RS}`,
      `${O3}█${RS}   ${O3}█${RS} `,
      `${O3}█${RS}   ${O3}█${RS} `,
      `${O3}█${RS}   ${O3}█${RS} `,
      `${O2}█${RS}   ${O2}█${RS} `,
      `${O2}█${RS}   ${O2}█${RS} `,
      ` ${O1}▀███▀${RS}`,
    ],
    W: [
      `${O4}█${RS}   ${O4}█${RS} `,
      `${O3}█${RS}   ${O3}█${RS} `,
      `${O3}█${RS}   ${O3}█${RS} `,
      `${O3}█${RS} ${O3}▄${RS} ${O3}█${RS} `,
      `${O2}█${RS}${O2}▄█▄${RS}${O2}█${RS} `,
      `${O2}█${RS}${O2}█ █${RS}${O2}█${RS} `,
      `${O1}▀${RS} ${O1}▀${RS} ${O1}▀${RS} `,
    ],
    S: [
      ` ${O4}████${RS} `,
      `${O3}█${RS}     `,
      `${O3}█${RS}     `,
      ` ${O3}███${RS}  `,
      `    ${O2}█${RS} `,
      `    ${O2}█${RS} `,
      ` ${O1}████${RS} `,
    ],
    // E is reused for the final E — already defined above
  };

  const WORD = ["C","I","P","H","E","R","B","R","O","W","S","E"];

  // Build 7 rows by concatenating letter columns
  const ROWS = Array.from({ length: 7 }, () => "");
  for (const letter of WORD) {
    const col = LETTERS[letter];
    for (let row = 0; row < 7; row += 1) {
      ROWS[row] += col[row];
    }
  }

  // Calculate visual (plain-text) width of one row for centering.
  // Each letter column is 6 printable chars + 1 space = 7 chars wide.
  const VISUAL_WIDTH = WORD.length * 7;
  const pad = " ".repeat(centerOffset(VISUAL_WIDTH));

  console.log("");
  console.log(hr("═"));
  for (const row of ROWS) {
    console.log(`${pad}${row}`);
  }

  // Copyright tagline — lavender, just below the logo
  console.log(`\n${LAV}${centerPlain(`\u00A9 Kivitas`)}${RS}`);

  // Subtitle in dim green
  console.log(`${C.dim}${centerPlain("Terminal browser · search · media · AI · exports · recon")}${C.reset}`);
  console.log(`${C.dim}${centerPlain("Type /help for commands  |  /doctor for diagnostics  |  /quit to exit")}${C.reset}`);
  console.log(hr("═"));
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────
async function dispatch(rawInput) {
  const input = String(rawInput || "").trim();
  if (!input) return;

  if (session.dispatchDepth > 10) {
    console.log(`${C.red}Command expansion limit reached. Check your aliases.${C.reset}`);
    return;
  }

  // Alias expansion
  const aliasMatch = input.match(/^\/([a-z0-9_-]+)([\s\S]*)$/i);
  if (aliasMatch && session.aliases[aliasMatch[1]]) {
    session.dispatchDepth += 1;
    try { return await dispatch(`${session.aliases[aliasMatch[1]]}${aliasMatch[2] || ""}`); }
    finally { session.dispatchDepth -= 1; }
  }

  // Bare URL
  if (/^https?:\/\//i.test(input) || /^[a-z0-9-]+\.[a-z]{2,}(\/|$)/i.test(input)) {
    await openPage(input);
    return;
  }

  const [command, ...rest] = input.split(/\s+/);
  const args = rest.join(" ").trim();

  switch (command.toLowerCase()) {
    case "/s":
    case "/search":             await doSearch(args);               break;
    case "/open":               await cmdOpen(args);                break;
    case "/back":               await cmdBack();                    break;
    case "/forward":            await cmdForward();                 break;
    case "/reload":
    case "/refresh":            await cmdReload();                  break;
    case "/home":               cmdHome();                          break;
    case "/next":               await cmdNext();                    break;
    case "/prev":
    case "/previous":           await cmdPrev();                    break;
    case "/history":            await cmdHistory(args);             break;
    case "/searches":           await cmdSearches(args);            break;
    case "/bookmark":           cmdBookmark();                      break;
    case "/bookmarks":          await cmdBookmarks(args);           break;
    case "/bookmark-remove":
    case "/bookmark-delete":    cmdBookmarkRemove(args);            break;
    case "/note":               cmdNote(args);                      break;
    case "/notes":              cmdNotes();                         break;
    case "/note-delete":
    case "/note-remove":        cmdNoteDelete(args);                break;
    case "/alert":              cmdAlert(args);                     break;
    case "/alerts":             cmdAlerts();                        break;
    case "/alert-remove":
    case "/alert-delete":       cmdAlertRemove(args);               break;
    case "/summarize":
    case "/summary":            cmdSummarize();                     break;
    case "/stats":              cmdStats();                         break;
    case "/readmode":
    case "/read":               cmdReadMode();                      break;
    case "/find":               cmdFind(args);                      break;
    case "/export":             cmdExport(args || "md");            break;
    case "/share":              cmdShare();                         break;
    case "/ai":                 await cmdAI(args);                  break;
    case "/aikey":
      if (args.toLowerCase() === "show") cmdAIKeyShow();
      else console.log(`${C.red}Usage: /aikey show${C.reset}`);
      break;
    case "/play":               await cmdPlay(args);                break;
    case "/playpage":           await cmdPlayPage();                break;
    case "/img":
    case "/image":              await cmdImg(args);                 break;
    case "/whois":              await cmdWhois(args);               break;
    case "/ping":               await cmdPing(args);                break;
    case "/headers":            await cmdHeaders(args);             break;
    case "/robots":             await cmdRobots(args);              break;
    case "/ssl":                await cmdSsl(args);                 break;
    case "/myip":               await cmdMyIp();                    break;
    case "/ipinfo":             await cmdIpInfo(args);              break;
    case "/trace":              await cmdTrace();                   break;
    case "/scan":               await cmdScan(args);                break;
    case "/extract":            await cmdExtract(args);             break;
    case "/crawl":              await cmdCrawl(args);               break;
    case "/rss":                await cmdRss(args);                 break;
    case "/diff":               await cmdDiff(args);                break;
    case "/hash":               cmdHash(args);                      break;
    case "/encode":             cmdEncode(args);                    break;
    case "/decode":             cmdDecode(args);                    break;
    case "/rot13":              cmdRot13(args);                     break;
    case "/hex":                cmdHex(args);                       break;
    case "/unhex":              cmdUnhex(args);                     break;
    case "/passgen":            cmdPassgen(args);                   break;
    case "/proxy":              cmdProxy(args);                     break;
    case "/theme":              cmdTheme(args);                     break;
    case "/alias":              cmdAlias(args);                     break;
    case "/doctor":             await cmdDoctor();                  break;
    case "/install-help":
    case "/installhelp":        cmdInstallHelp();                   break;
    case "/install-global":
    case "/installglobal":      cmdInstallGlobal();                 break;
    case "/sysinfo":            cmdSysinfo();                       break;
    case "/log":                cmdLog();                           break;
    case "/matrix":             cmdMatrix();                        break;
    case "/help":
    case "/?":                  cmdHelpFull();                      break;
    case "/clear":
    case "/cls":                cmdHome();                          break;
    case "/quit":
    case "/exit":
    case "/q":
      console.log(`${C.dim}Goodbye.${C.reset}`);
      process.exit(0);
      break;
    default:
      console.log(`${C.red}Unknown command: ${command}${C.reset}  ${C.dim}Type /help for reference.${C.reset}`);
  }
}

// ─── Entry points ─────────────────────────────────────────────────────────────
async function runOneShot(args) {
  if (args.includes("--help") || args.includes("-h"))    { cmdHelpFull();                           return true; }
  if (args.includes("--version") || args.includes("-v")) { console.log(`${APP_NAME} v${APP_VERSION}`); return true; }
  const command = args.join(" ").trim();
  if (command) { await dispatch(command); return true; }
  return false;
}

// Clean runtime banner override using a thick orange block style.
function _blockPrintBannerUnused() {
  const bannerLines = [
    " ██████╗██╗██████╗ ██╗  ██╗███████╗██████╗ ██████╗ ██████╗ ██╗    ██╗███████╗███████╗",
    "██╔════╝██║██╔══██╗██║  ██║██╔════╝██╔══██╗██╔══██╗██╔══██╗██║    ██║██╔════╝██╔════╝",
    "██║     ██║██████╔╝███████║█████╗  ██████╔╝██████╔╝██████╔╝██║ █╗ ██║███████╗█████╗  ",
    "██║     ██║██╔═══╝ ██╔══██║██╔══╝  ██╔══██╗██╔══██╗██╔═══╝ ██║███╗██║╚════██║██╔══╝  ",
    "╚██████╗██║██║     ██║  ██║███████╗██║  ██║██████╔╝██║     ╚███╔███╔╝███████║███████╗",
    " ╚═════╝╚═╝╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝      ╚══╝╚══╝ ╚══════╝╚══════╝",
  ];
  const lineColors = [O4, O3, O3, O2, O2, O1];
  const visualWidth = Math.max(...bannerLines.map(line => line.length));
  const pad = " ".repeat(centerOffset(visualWidth));

  console.log("");
  console.log(hr("="));
  bannerLines.forEach((line, index) => {
    const color = lineColors[index] || O2;
    console.log(`${pad}${color}${line}${RS}`);
  });
  console.log(`\n${LAV}${centerPlain("\u00A9 Kivitas")}${RS}`);
  console.log(`${C.dim}${centerPlain("Terminal browser · search · media · AI · exports · recon")}${C.reset}`);
  console.log(`${C.dim}${centerPlain("Type /help for commands  |  /doctor for diagnostics  |  /quit to exit")}${C.reset}`);
  console.log(hr("="));
}

function _previousBannerUnused() {
  const bannerLines = [
    "  ██████╗██╗██████╗ ██╗  ██╗███████╗██████╗ ██████╗ ██████╗ ██╗    ██╗███████╗███████╗",
    " ██╔════╝██║██╔══██╗██║  ██║██╔════╝██╔══██╗██╔══██╗██╔═══██╗██║    ██║██╔════╝██╔════╝",
    " ██║     ██║██████╔╝███████║█████╗  ██████╔╝██████╔╝██║   ██║██║ █╗ ██║███████╗█████╗  ",
    " ██║     ██║██╔═══╝ ██╔══██║██╔══╝  ██╔══██╗██╔══██╗██║   ██║██║███╗██║╚════██║██╔══╝  ",
    " ╚██████╗██║██║     ██║  ██║███████╗██║  ██║██████╔╝╚██████╔╝╚███╔███╔╝███████║███████╗",
    "  ╚═════╝╚═╝╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝  ╚═════╝  ╚══╝╚══╝ ╚══════╝╚══════╝",
  ];
  const lineColors = [O4, O4, O3, O3, O2, O1];
  const shadowColor = "\x1b[38;5;94m";
  const visualWidth = Math.max(...bannerLines.map(line => line.length));
  const pad = " ".repeat(centerOffset(visualWidth));
  console.log("");
  console.log(hr("="));
  if (process.stdout.isTTY) {
    console.log("");
    bannerLines.forEach(line => {
      console.log(`${pad}  ${shadowColor}${line}${RS}`);
    });
    process.stdout.write(`\x1b[${bannerLines.length + 1}A`);
  }
  bannerLines.forEach((line, index) => {
    const color = lineColors[index] || O2;
    console.log(`${pad}${color}${line}${RS}`);
  });
  console.log(`\n${LAV}${centerPlain("\u00A9 Kivitas")}${RS}`);
  console.log(`${C.dim}${centerPlain("Terminal browser · search · media · AI · exports · recon")}${C.reset}`);
  console.log(`${C.dim}${centerPlain("Type /help for commands  |  /doctor for diagnostics  |  /quit to exit")}${C.reset}`);
  console.log(hr("="));
}

function _brokenPixelBannerUnused() {
  const glyphs = {
    C: ["0111110", "1100000", "1100000", "1100000", "1100000", "0111110"],
    I: ["1111111", "0011100", "0011100", "0011100", "0011100", "1111111"],
    P: ["1111110", "1100011", "1111110", "1100000", "1100000", "1100000"],
    H: ["1100011", "1100011", "1111111", "1100011", "1100011", "1100011"],
    E: ["1111111", "1100000", "1111110", "1100000", "1100000", "1111111"],
    R: ["1111110", "1100011", "1111110", "1101100", "1100110", "1100011"],
    B: ["1111110", "1100011", "1111110", "1100011", "1100011", "1111110"],
    O: ["0111110", "1100011", "1100011", "1100011", "1100011", "0111110"],
    W: ["1100011", "1100011", "1101011", "1111111", "1111111", "1100011"],
    S: ["0111111", "1100000", "0111110", "0000011", "0000011", "1111110"],
  };
  const word = "CIPHERBROWSE".split("");
  const shadowDx = 1;
  const shadowDy = 1;
  const gap = 2;
  const cell = "██";
  const shadowCell = "▓▓";
  const fillByRow = [O4, O4, O3, O3, O2, O1];
  const shadowColor = "\x1b[38;5;94m";
  const height = 6 + shadowDy;
  const widths = word.map(letter => glyphs[letter][0].length);
  const totalCols = widths.reduce((sum, width) => sum + width, 0) + (word.length - 1) * gap + shadowDx;
  const canvas = Array.from({ length: height }, () => Array.from({ length: totalCols }, () => null));

  let cursorX = 0;
  word.forEach((letter, index) => {
    const glyph = glyphs[letter];
    for (let y = 0; y < glyph.length; y += 1) {
      for (let x = 0; x < glyph[y].length; x += 1) {
        if (glyph[y][x] !== "1") continue;
        const shadowX = cursorX + x + shadowDx;
        const shadowY = y + shadowDy;
        if (!canvas[shadowY][shadowX]) {
          canvas[shadowY][shadowX] = shadowColor;
        }
      }
    }
    for (let y = 0; y < glyph.length; y += 1) {
      for (let x = 0; x < glyph[y].length; x += 1) {
        if (glyph[y][x] !== "1") continue;
        canvas[y][cursorX + x] = fillByRow[y];
      }
    }
    cursorX += glyph[0].length;
    if (index < word.length - 1) cursorX += gap;
  });

  const visualWidth = totalCols * cell.length;
  const pad = " ".repeat(centerOffset(visualWidth));
  console.log("");
  console.log(hr("="));
  canvas.forEach(row => {
    const rendered = row.map(token => {
      if (!token) return "  ";
      if (token === shadowColor) return `${shadowColor}${shadowCell}${RS}`;
      return `${token}${cell}${RS}`;
    }).join("");
    console.log(`${pad}${rendered}`);
  });
  console.log(`\n${LAV}${centerPlain("\u00A9 Kivitas")}${RS}`);
  console.log(`${C.dim}${centerPlain("Terminal browser - search - media - AI - exports - recon")}${C.reset}`);
  console.log(`${C.dim}${centerPlain("Type /help for commands  |  /doctor for diagnostics  |  /quit to exit")}${C.reset}`);
  console.log(hr("="));
}

function _missingOBannerUnused() {
  const bannerLines = [
    "  ██████╗██╗██████╗ ██╗  ██╗███████╗██████╗ ██████╗ ██████╗ ██╗    ██╗███████╗███████╗",
    " ██╔════╝██║██╔══██╗██║  ██║██╔════╝██╔══██╗██╔══██╗██╔══██╗██║    ██║██╔════╝██╔════╝",
    " ██║     ██║██████╔╝███████║█████╗  ██████╔╝██████╔╝██████╔╝██║ █╗ ██║███████╗█████╗  ",
    " ██║     ██║██╔═══╝ ██╔══██║██╔══╝  ██╔══██╗██╔══██╗██╔══██╗██║███╗██║╚════██║██╔══╝  ",
    " ╚██████╗██║██║     ██║  ██║███████╗██║  ██║██████╔╝██║  ██║╚███╔███╔╝███████║███████╗",
    "  ╚═════╝╚═╝╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝ ╚══╝╚══╝ ╚══════╝╚══════╝",
  ];
  const colors = [O4, O4, O3, O3, O2, O1];
  const shadowColor = "\x1b[38;5;94m";
  const visualWidth = Math.max(...bannerLines.map(line => line.length));
  const pad = " ".repeat(centerOffset(visualWidth));

  console.log("");
  console.log(hr("="));
  if (process.stdout.isTTY) {
    console.log("");
    bannerLines.forEach(line => console.log(`${pad}  ${shadowColor}${line}${RS}`));
    process.stdout.write(`\x1b[${bannerLines.length + 1}A`);
  }
  bannerLines.forEach((line, index) => {
    console.log(`${pad}${colors[index] || O2}${line}${RS}`);
  });
  console.log(`\n${LAV}${centerPlain("\u00A9 Kivitas")}${RS}`);
  console.log(`${C.dim}${centerPlain("Terminal browser - search - media - AI - exports - recon")}${C.reset}`);
  console.log(`${C.dim}${centerPlain("Type /help for commands  |  /doctor for diagnostics  |  /quit to exit")}${C.reset}`);
  console.log(hr("="));
}

function printBanner() {
  const bannerLines = [
    " ██████╗██╗██████╗ ██╗  ██╗███████╗██████╗ ██████╗ ██████╗  ██████╗ ██╗    ██╗███████╗███████╗",
    "██╔════╝██║██╔══██╗██║  ██║██╔════╝██╔══██╗██╔══██╗██╔══██╗██╔═══██╗██║    ██║██╔════╝██╔════╝",
    "██║     ██║██████╔╝███████║█████╗  ██████╔╝██████╔╝██████╔╝██║   ██║██║ █╗ ██║███████╗█████╗  ",
    "██║     ██║██╔═══╝ ██╔══██║██╔══╝  ██╔══██╗██╔══██╗██╔══██╗██║   ██║██║███╗██║╚════██║██╔══╝  ",
    "╚██████╗██║██║     ██║  ██║███████╗██║  ██║██████╔╝██║  ██║╚██████╔╝╚███╔███╔╝███████║███████╗",
    " ╚═════╝╚═╝╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝  ╚══╝╚══╝ ╚══════╝╚══════╝",
  ];
  const colors = [O4, O4, O3, O3, O2, O1];
  const shadowColor = "\x1b[38;5;94m";
  const visualWidth = Math.max(...bannerLines.map(line => line.length));
  const pad = " ".repeat(centerOffset(visualWidth));

  console.log("");
  console.log(hr("="));
  if (process.stdout.isTTY) {
    console.log("");
    bannerLines.forEach(line => console.log(`${pad}  ${shadowColor}${line}${RS}`));
    process.stdout.write(`\x1b[${bannerLines.length + 1}A`);
  }
  bannerLines.forEach((line, index) => {
    console.log(`${pad}${colors[index] || O2}${line}${RS}`);
  });
  console.log(`\n${LAV}${centerPlain("\u00A9 Kivitas")}${RS}`);
  console.log(`${C.dim}${centerPlain("Terminal browser - search - media - AI - exports - recon")}${C.reset}`);
  console.log(`${C.dim}${centerPlain("Type /help for commands  |  /doctor for diagnostics  |  /quit to exit")}${C.reset}`);
  console.log(hr("="));
}

async function startRepl() {
  printBanner();
  cmdHelpSimple();

  const rl = readline.createInterface({
    input:   process.stdin,
    output:  process.stdout,
    terminal: process.stdin.isTTY,
    completer(line) {
      const hits = ALL_COMMANDS.filter(c => c.startsWith(line));
      return [hits.length ? hits : ALL_COMMANDS, line];
    },
  });

  if (!process.stdin.isTTY) {
    let buffer = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => { buffer += chunk; });
    process.stdin.on("end", async () => {
      for (const line of buffer.split(/\r?\n/).map(l => l.trim()).filter(Boolean)) {
        try { await dispatch(line); }
        catch (error) { console.log(`${C.red}Error: ${error.message}${C.reset}`); }
      }
      process.exit(0);
    });
    return;
  }

  rl.on("close", () => { console.log(`\n${C.dim}Goodbye.${C.reset}`); process.exit(0); });

  const ask = () => rl.question(`\n${C.p}cipherbrowse>${C.reset} `, async answer => {
    const trimmed = answer.trim();
    if (trimmed) {
      try { await dispatch(trimmed); }
      catch (error) {
        console.log(`${C.red}Unexpected error: ${error.message}${C.reset}`);
        logLine(`dispatch error: ${error.message}`);
      }
    }
    ask();
  });

  ask();
}

(async () => {
  try { ensureDataDir(); loadPersistedState(); } catch {}
  const cliArgs = process.argv.slice(2);
  if (cliArgs.length > 0) {
    const handled = await runOneShot(cliArgs);
    if (handled) process.exit(0);
  }
  await startRepl();
})();
