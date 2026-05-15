const os = require("os");
const path = require("path");

const APP_NAME = "CIPHERBROWSE";
const APP_VERSION = (() => {
  try {
    return require("../../package.json").version;
  } catch {
    return "1.0.0";
  }
})();

const APP_ROOT = process.pkg ? path.dirname(process.execPath) : path.resolve(__dirname, "..", "..");
const DATA_DIR = process.pkg ? path.join(os.homedir(), ".cipherbrowse") : path.join(APP_ROOT, ".cipherbrowse");
const TOOLS_DIR = path.join(APP_ROOT, "tools");
const TOOLS_CACHE = path.join(DATA_DIR, "runtime-tools");
const PLATFORM_KEY = `${process.platform}-${process.arch}`;

const PATHS = {
  APP_ROOT,
  DATA_DIR,
  TOOLS_DIR,
  TOOLS_CACHE,
  PLATFORM_KEY,
  STATE_PATH: path.join(DATA_DIR, "state.json"),
  LOG_PATH: path.join(DATA_DIR, "session.log"),
  NOTES_PATH: path.join(DATA_DIR, "notes.json"),
  ALERTS_PATH: path.join(DATA_DIR, "alerts.json"),
  ALIASES_PATH: path.join(DATA_DIR, "aliases.json"),
  BOOKMARKS_PATH: path.join(DATA_DIR, "bookmarks.json"),
  EXPORTS_DIR: path.join(DATA_DIR, "exports"),
  AI_KEY_FILE: path.join(DATA_DIR, "aikeys.json"),
  AI_KEY_SECRET_FILE: path.join(DATA_DIR, "aikeys.secret"),
  SEARCH_HISTORY_FILE: path.join(DATA_DIR, "search-history.enc.json"),
  SEARCH_HISTORY_SECRET_FILE: path.join(DATA_DIR, "search-history.secret"),
};

const SEARCH_URLS = {
  DDG_SEARCH: "https://html.duckduckgo.com/html/?q=",
  GOOGLE_SEARCH: "https://www.google.com/search?gbv=1&num=20&q=",
  BING_SEARCH: "https://www.bing.com/search?q=",
  DDG_IMAGE: "https://duckduckgo.com/?iax=images&ia=images&q=",
};

const BING_MARKET_QUERY = "&setlang=en-US&cc=US&mkt=en-US&adlt=off";

const SEARCH_ENGINE_ORDER = ["google", "ddg", "bing"];

const LIMITS = {
  MAX_HISTORY: 500,
  SEARCH_HISTORY_TTL_MS: 24 * 60 * 60 * 1000,
  FETCH_TIMEOUT: 15000,
  MAX_IMAGES: 4,
  DEFAULT_PASSGEN_LEN: 20,
};

const DEFAULT_TOR = "http://127.0.0.1:8118";
const CURL_BIN = process.platform === "win32" ? "curl.exe" : "curl";
const TOOL_BINS = {
  mpv: process.platform === "win32" ? "mpv.exe" : "mpv",
  ytdlp: process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
};

const runtime = { proxyUrl: null, proxyMode: "direct" };

module.exports = {
  APP_NAME,
  APP_VERSION,
  PATHS,
  SEARCH_URLS,
  BING_MARKET_QUERY,
  SEARCH_ENGINE_ORDER,
  LIMITS,
  DEFAULT_TOR,
  CURL_BIN,
  TOOL_BINS,
  runtime,
};
