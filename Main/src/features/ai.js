const { createAESCipherStore } = require("../core/security");

const LEGACY_AI_SALT = "cipherbrowse-ai-v1";

const AI_PROVIDERS = {
  gemini: {
    label: "Google Gemini",
    keyHint: "AIza…",
    models: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"],
    endpoint: (key, model = "gemini-2.0-flash") => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    buildBody: messages => ({
      contents: messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    }),
    parseReply: data => data?.candidates?.[0]?.content?.parts?.[0]?.text || null,
    authHeader: null,
  },
  openai: {
    label: "OpenAI ChatGPT",
    keyHint: "sk-…",
    models: ["gpt-5", "gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"],
    endpoint: () => "https://api.openai.com/v1/chat/completions",
    buildBody: (messages, model = "gpt-5-mini") => ({ model, messages, max_completion_tokens: 2048 }),
    parseReply: data => data?.choices?.[0]?.message?.content || null,
    authHeader: key => ({ Authorization: `Bearer ${key}` }),
  },
  claude: {
    label: "Anthropic Claude",
    keyHint: "sk-ant-…",
    models: ["claude-sonnet-4-20250514", "claude-3-7-sonnet-20250219", "claude-3-5-haiku-20241022"],
    endpoint: () => "https://api.anthropic.com/v1/messages",
    buildBody: (messages, model = "claude-sonnet-4-20250514") => ({
      model,
      max_tokens: 2048,
      messages: messages.filter(m => m.role !== "system"),
      system: messages.find(m => m.role === "system")?.content || undefined,
    }),
    parseReply: data => data?.content?.[0]?.text || null,
    authHeader: key => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
  },
  meta: {
    label: "Meta Llama (via OpenRouter)",
    keyHint: "sk-or-…",
    models: ["meta-llama/llama-3.3-70b-instruct", "meta-llama/llama-3.1-8b-instruct:free", "openrouter/auto"],
    endpoint: () => "https://openrouter.ai/api/v1/chat/completions",
    buildBody: (messages, model = "meta-llama/llama-3.3-70b-instruct") => ({ model, messages, max_tokens: 2048 }),
    parseReply: data => data?.choices?.[0]?.message?.content || null,
    authHeader: key => ({ Authorization: `Bearer ${key}`, "HTTP-Referer": "https://github.com/cipherbrowse", "X-Title": "CipherBrowse" }),
  },
};

function legacyDeobfuscateKey(value) {
  const source = Buffer.from(value, "base64");
  const salt = Buffer.from(LEGACY_AI_SALT, "utf8");
  return source.map((byte, index) => byte ^ salt[index % salt.length]).toString("utf8");
}

function resolveAIProviderId(raw) {
  const input = String(raw || "").trim().toLowerCase();
  const aliases = {
    gemini: "gemini",
    google: "gemini",
    "google gemini": "gemini",
    openai: "openai",
    chatgpt: "openai",
    claude: "claude",
    anthropic: "claude",
    meta: "meta",
    llama: "meta",
    openrouter: "meta",
  };
  return aliases[input] || (AI_PROVIDERS[input] ? input : null);
}

function normalizeAIKeyForProvider(provider, rawKey) {
  let key = String(rawKey || "").trim();
  key = key.replace(/^--?key\s*/i, "").replace(/^key\s*/i, "").trim();
  key = key.replace(/^['"`]+|['"`]+$/g, "").trim();
  const patterns = {
    gemini: /(AIza[0-9A-Za-z\-_]{20,})/,
    openai: /(sk-[A-Za-z0-9\-_]{20,})/,
    claude: /(sk-ant-[A-Za-z0-9\-_]{20,})/,
    meta: /(sk-or-[A-Za-z0-9\-_]{20,})/,
  };
  return patterns[provider]?.exec(key)?.[1] || key;
}

function parseAIProviderAndKey(raw, mode = "set") {
  const text = String(raw || "").trim();
  if (mode === "set") {
    const match = text.match(/^set\s+key\s+--\s*(?:"([^"]+)"|'([^']+)'|(\S+))\s+(?:--?key\s*|-+\s*|)\s*(?:"([^"]+)"|'([^']+)'|([\s\S]+))$/i);
    if (!match) return null;
    const provider = resolveAIProviderId(match[1] || match[2] || match[3] || "");
    const key = normalizeAIKeyForProvider(provider, match[4] || match[5] || match[6] || "");
    return { provider, key };
  }
  const match = text.match(/^delete\s+key\s+--\s*(?:"([^"]+)"|'([^']+)'|(\S+))$/i);
  if (!match) return null;
  return { provider: resolveAIProviderId(match[1] || match[2] || match[3] || "") };
}

function isAIRateLimited(err) {
  const message = `${err?.message || ""} ${JSON.stringify(err?.apiData?.error || {})}`.toLowerCase();
  return err?.status === 429 || /rate limit|quota|resource exhausted|too many requests|insufficient_quota|tokens/i.test(message);
}

function shouldTryNextAIModel(err) {
  const message = `${err?.message || ""} ${JSON.stringify(err?.apiData?.error || {})}`.toLowerCase();
  return /not found|unsupported|not supported|unknown model|invalid model|model.*deprecated|does not exist|not available|no such model/i.test(message);
}

function createAIKeyStore({ fs, keyFile, secretFile, ensureDataDir }) {
  const cipherStore = createAESCipherStore({ fs, secretFile, ensureDataDir });

  function loadRaw() {
    try {
      return JSON.parse(fs.readFileSync(keyFile, "utf8"));
    } catch {
      return {};
    }
  }

  function saveRaw(data) {
    ensureDataDir();
    fs.writeFileSync(keyFile, JSON.stringify(data, null, 2), "utf8");
  }

  function decodeStoredKey(provider, item) {
    if (!item) return null;
    try {
      if (cipherStore.isEncryptedPayload(item)) {
        return normalizeAIKeyForProvider(provider, cipherStore.decryptText(item));
      }
      if (typeof item === "string") {
        try {
          return normalizeAIKeyForProvider(provider, legacyDeobfuscateKey(item));
        } catch {
          return normalizeAIKeyForProvider(provider, item);
        }
      }
    } catch {}
    return null;
  }

  function getKeys(provider) {
    const raw = loadRaw();
    const stored = raw[provider];
    const array = Array.isArray(stored) ? stored : stored ? [stored] : [];
    const keys = [];
    let changed = false;

    for (const item of array) {
      const decoded = decodeStoredKey(provider, item);
      if (!decoded) {
        changed = true;
        continue;
      }
      if (!keys.includes(decoded)) keys.push(decoded);
      if (!cipherStore.isEncryptedPayload(item)) changed = true;
    }

    if (changed) {
      raw[provider] = keys.map(key => cipherStore.encryptText(key));
      saveRaw(raw);
    }

    return keys;
  }

  function addKey(provider, key) {
    const normalized = normalizeAIKeyForProvider(provider, key);
    if (!normalized) return false;
    const raw = loadRaw();
    const existing = getKeys(provider);
    if (existing.includes(normalized)) return false;
    raw[provider] = [...existing, normalized].map(value => cipherStore.encryptText(value));
    saveRaw(raw);
    return true;
  }

  function clearKeys(provider) {
    const raw = loadRaw();
    delete raw[provider];
    saveRaw(raw);
  }

  return { loadRaw, saveRaw, getKeys, addKey, clearKeys };
}

async function callAIProvider(providerId, apiKey, prompt, fetchImpl = fetch) {
  const provider = AI_PROVIDERS[providerId];
  const messages = [{ role: "user", content: prompt }];
  const models = provider.models?.length ? provider.models : [null];
  let lastError = null;

  for (const model of models) {
    const headers = { "content-type": "application/json", ...(provider.authHeader ? provider.authHeader(apiKey) : {}) };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetchImpl(provider.endpoint(apiKey, model), {
        method: "POST",
        headers,
        body: JSON.stringify(provider.buildBody(messages, model)),
        signal: controller.signal,
      });
      let data = {};
      try {
        data = await response.json();
      } catch {}
      if (!response.ok || data?.error) {
        const message = data?.error?.message || data?.message || `HTTP ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        error.apiData = data;
        throw error;
      }
      const reply = provider.parseReply(data);
      if (!reply) {
        const error = new Error("Empty response from API");
        error.status = response.status;
        error.apiData = data;
        throw error;
      }
      return { providerId, label: provider.label, model, reply };
    } catch (error) {
      lastError = error;
      if (!shouldTryNextAIModel(error)) throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error("No provider model succeeded.");
}

module.exports = {
  AI_PROVIDERS,
  resolveAIProviderId,
  normalizeAIKeyForProvider,
  parseAIProviderAndKey,
  isAIRateLimited,
  shouldTryNextAIModel,
  createAIKeyStore,
  callAIProvider,
};
