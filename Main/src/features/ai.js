const { createAESCipherStore } = require("../core/security");

const LEGACY_AI_SALT = "cipherbrowse-ai-v1";

const AI_PROVIDERS = {
  // Model lists are tried in order. A model the key cannot use (retired or not
  // found) falls through to the next entry; see shouldTryNextAIModel().
  gemini: {
    label: "Google Gemini",
    keyHint: "AIza…",
    models: ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash"],
    // The key travels in a header, not the URL, so it never lands in logs or error text.
    endpoint: (_key, model = "gemini-3.8-flash") => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    buildBody: messages => ({
      contents: messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    }),
    parseReply: data => data?.candidates?.[0]?.content?.parts?.[0]?.text || null,
    authHeader: key => ({ "x-goog-api-key": key }),
  },
  openai: {
    label: "OpenAI ChatGPT",
    keyHint: "sk-…",
    models: ["gpt-6-astra", "gpt-6.1-sol", "gpt-6-luna"],
    endpoint: () => "https://api.openai.com/v1/chat/completions",
    buildBody: (messages, model = "gpt-6-astra") => ({ model, messages, max_completion_tokens: 2048 }),
    parseReply: data => data?.choices?.[0]?.message?.content || null,
    authHeader: key => ({ Authorization: `Bearer ${key}` }),
  },
  claude: {
    label: "Anthropic Claude",
    keyHint: "sk-ant-…",
    models: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
    endpoint: () => "https://api.anthropic.com/v1/messages",
    buildBody: (messages, model = "claude-sonnet-5-5") => ({
      model,
      max_tokens: 2048,
      messages: messages.filter(m => m.role !== "system"),
      system: messages.find(m => m.role === "system")?.content || undefined,
    }),
    parseReply: data => data?.content?.[0]?.text || null,
    authHeader: key => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
  },
  openrouter: {
    label: "OpenRouter",
    keyHint: "sk-or-…",
    // openrouter/auto picks a model per request; the Llama entries are fixed picks.
    models: ["openrouter/auto", "meta-llama/llama-3.3-70b-instruct", "meta-llama/llama-3.1-8b-instruct"],
    endpoint: () => "https://openrouter.ai/api/v1/chat/completions",
    buildBody: (messages, model = "openrouter/auto") => ({ model, messages, max_tokens: 2048 }),
    parseReply: data => data?.choices?.[0]?.message?.content || null,
    authHeader: key => ({ Authorization: `Bearer ${key}`, "HTTP-Referer": "https://github.com/Kivitas/Cipherbrowse", "X-Title": "CipherBrowse" }),
  },
  // Local Ollama needs no key. A key is sent as a Bearer token only when
  // OLLAMA_HOST points at a hosted or proxied server that requires one.
  ollama: {
    label: "Ollama",
    keyHint: "optional",
    keyOptional: true,
    timeoutMs: 120000,
    // Only models the server has pulled will answer. Missing ones fall through.
    models: ["llama3.3", "qwen3", "gemma3"],
    endpoint: () => `${ollamaBaseUrl()}/api/chat`,
    buildBody: (messages, model = "llama3.3") => ({ model, messages, stream: false }),
    parseReply: data => data?.message?.content || null,
    authHeader: key => (key ? { Authorization: `Bearer ${key}` } : {}),
  },
};

// Ollama's default listen address. OLLAMA_HOST may be "host:port" with no scheme.
function ollamaBaseUrl(env = process.env) {
  const raw = String(env.OLLAMA_HOST || "").trim();
  if (!raw) return "http://127.0.0.1:11434";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  // 0.0.0.0 is a listen address, not a destination the client can connect to.
  return withScheme.replace(/\/+$/, "").replace("://0.0.0.0", "://127.0.0.1");
}

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
    openrouter: "openrouter",
    // "meta" and "llama" were the 1.0 names for OpenRouter; kept so old commands still work.
    meta: "openrouter",
    llama: "openrouter",
    ollama: "ollama",
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
    openrouter: /(sk-or-[A-Za-z0-9\-_]{20,})/,
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
  // Bare "tokens" is deliberately not matched: "max_tokens is too large" is a
  // request error, not an exhausted key, and should not be retried on other keys.
  return err?.status === 429 || /rate limit|quota|resource exhausted|too many requests|insufficient_quota|out of tokens|tokens exhausted/i.test(message);
}

function shouldTryNextAIModel(err) {
  // A 404 from a model endpoint means the model is not there for this key or server.
  if (err?.status === 404) return true;
  const message = `${err?.message || ""} ${JSON.stringify(err?.apiData?.error || {})}`.toLowerCase();
  return /not[ _-]found|unsupported|not supported|unknown model|invalid model|model.*deprecated|does not exist|not available|no such model|shut ?down|retired/i.test(message);
}

function createAIKeyStore({ fs, keyFile, secretFile, ensureDataDir }) {
  const cipherStore = createAESCipherStore({ fs, secretFile, ensureDataDir });

  async function loadRaw() {
    let raw;
    try {
      raw = JSON.parse(await fs.promises.readFile(keyFile, "utf8"));
    } catch {
      return {};
    }
    // "meta" was the 1.0 id for OpenRouter. Fold its keys into "openrouter" so
    // nothing stored before the rename is lost. Persisted on the next write.
    if (raw && Object.prototype.hasOwnProperty.call(raw, "meta")) {
      const toList = value => (Array.isArray(value) ? value : value ? [value] : []);
      raw.openrouter = [...toList(raw.openrouter), ...toList(raw.meta)];
      delete raw.meta;
    }
    return raw;
  }

  async function saveRaw(data) {
    if (ensureDataDir) {
      const res = ensureDataDir();
      if (res instanceof Promise) await res;
    }
    await fs.promises.writeFile(keyFile, JSON.stringify(data, null, 2), "utf8");
  }

  async function decodeStoredKey(provider, item) {
    if (!item) return null;
    try {
      if (cipherStore.isEncryptedPayload(item)) {
        return normalizeAIKeyForProvider(provider, await cipherStore.decryptText(item));
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

  async function getKeys(provider) {
    const raw = await loadRaw();
    const stored = raw[provider];
    const array = Array.isArray(stored) ? stored : stored ? [stored] : [];
    const keys = [];
    let changed = false;

    for (const item of array) {
      const decoded = await decodeStoredKey(provider, item);
      if (!decoded) {
        changed = true;
        continue;
      }
      if (!keys.includes(decoded)) keys.push(decoded);
      if (!cipherStore.isEncryptedPayload(item)) changed = true;
    }

    if (changed) {
      raw[provider] = await Promise.all(keys.map(key => cipherStore.encryptText(key)));
      await saveRaw(raw);
    }

    return keys;
  }

  async function addKey(provider, key) {
    const normalized = normalizeAIKeyForProvider(provider, key);
    if (!normalized) return false;
    const raw = await loadRaw();
    const existing = await getKeys(provider);
    if (existing.includes(normalized)) return false;
    raw[provider] = await Promise.all([...existing, normalized].map(value => cipherStore.encryptText(value)));
    await saveRaw(raw);
    return true;
  }

  async function clearKeys(provider) {
    const raw = await loadRaw();
    delete raw[provider];
    await saveRaw(raw);
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
    const timer = setTimeout(() => controller.abort(), provider.timeoutMs || 30000);
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

// Asks a local (or configured) Ollama server which models it has. Never throws:
// a stopped server is a normal state, reported as running: false.
async function checkOllama(fetchImpl = fetch, timeoutMs = 2000) {
  const host = ollamaBaseUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${host}/api/tags`, { signal: controller.signal });
    if (!response.ok) return { running: false, host, models: [] };
    const data = await response.json();
    const models = (data?.models || []).map(item => item.name || item.model).filter(Boolean);
    return { running: true, host, models };
  } catch {
    return { running: false, host, models: [] };
  } finally {
    clearTimeout(timer);
  }
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
  ollamaBaseUrl,
  checkOllama,
};
