"use strict";

const fs = require("fs");
const path = require("path");
const { PATHS, LIMITS } = require("./config");
const { createSHA512AESCipherStore } = require("./security");
const { cleanVisibleText } = require("./text");

async function ensureDataDir() {
  if (!fs.existsSync(PATHS.DATA_DIR)) await fs.promises.mkdir(PATHS.DATA_DIR, { recursive: true }).catch(()=>{});
  if (!fs.existsSync(PATHS.EXPORTS_DIR)) await fs.promises.mkdir(PATHS.EXPORTS_DIR, { recursive: true }).catch(()=>{});
}

const searchHistoryCipher = createSHA512AESCipherStore({
  fs,
  secretFile: PATHS.SEARCH_HISTORY_SECRET_FILE,
  ensureDataDir,
});

async function loadJson(filePath, fallback = []) {
  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.size > 5 * 1024 * 1024) return fallback;
    return JSON.parse(await fs.promises.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function saveJson(filePath, value) {
  await ensureDataDir();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true }).catch(()=>{});
  const tempPath = `${filePath}.tmp`;
  await fs.promises.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fs.promises.rename(tempPath, filePath);
}

async function loadState()          { return loadJson(PATHS.STATE_PATH, {}); }
async function saveState(nextState) { await saveJson(PATHS.STATE_PATH, nextState); }

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

function isWithinSearchHistoryTtl(item) {
  if (!item?.at) return true;
  return (Date.now() - new Date(item.at).getTime()) < LIMITS.SEARCH_HISTORY_TTL_MS;
}

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

async function loadEncryptedSearchHistory() {
  const payload = await loadJson(PATHS.SEARCH_HISTORY_FILE, null);
  if (!payload || !searchHistoryCipher.isEncryptedPayload(payload.data || payload)) return [];
  try {
    const decrypted = await searchHistoryCipher.decryptText(payload.data || payload);
    return normalizeSearchHistory(JSON.parse(decrypted));
  } catch (error) {
    logLine(`search history decrypt failed: ${error.message}`);
    return [];
  }
}

async function saveEncryptedSearchHistory(list) {
  const entries = normalizeSearchHistory(list);
  await saveJson(PATHS.SEARCH_HISTORY_FILE, {
    version: 1,
    encryptedAt: new Date().toISOString(),
    keyDerivation: "sha512",
    ttlMs: LIMITS.SEARCH_HISTORY_TTL_MS,
    data: await searchHistoryCipher.encryptText(JSON.stringify(entries)),
  });
}

async function logLine(message) {
  try {
    await ensureDataDir();
    try {
      const stat = await fs.promises.stat(PATHS.LOG_PATH);
      if (stat.size > 1024 * 1024) {
        const lines = (await fs.promises.readFile(PATHS.LOG_PATH, "utf8")).split(/\r?\n/).filter(Boolean);
        await fs.promises.writeFile(PATHS.LOG_PATH, `${lines.slice(-500).join("\n")}\n`, "utf8");
      }
    } catch {}
    await fs.promises.appendFile(PATHS.LOG_PATH, `[${new Date().toISOString()}] ${message}\n`, "utf8");
  } catch {}
}

module.exports = {
  ensureDataDir,
  loadJson,
  saveJson,
  loadState,
  saveState,
  uniqueRecent,
  isWithinSearchHistoryTtl,
  normalizeSearchHistory,
  loadEncryptedSearchHistory,
  saveEncryptedSearchHistory,
  logLine,
};
