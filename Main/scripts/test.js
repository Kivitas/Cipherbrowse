"use strict";

// Unit tests for pure modules. Nothing here touches the network or the real
// .cipherbrowse/ data folder; temp directories are created per test and removed.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createAESCipherStore } = require("../src/core/security");
const { decodeEntities, cleanVisibleText, escapeHtml } = require("../src/core/text");
const { isHttpUrl, buildCurlArgs } = require("../src/core/network");
const { normalizeSearchHistory } = require("../src/core/storage");
const {
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
} = require("../src/features/ai");
const {
  stripHtml,
  fingerprintPage,
  extractLinks,
  parseBingWebResults,
  parseWikipediaApiResults,
} = require("../src/features/page");
const { parseGridCoordinate, resolveGridSelection, parseBingVideoResults } = require("../src/features/media");
const { buildSearchRequest, parseSearchFlavor, normalizeSiteTarget } = require("../src/features/search");
const { formatDuration, isLikelyDirectMediaUrl } = require("../src/features/video");
const {
  buildWaybackUrl,
  formatWaybackTimestamp,
  parseWaybackAvailable,
  formatDnsValue,
} = require("../src/features/recon");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cipherbrowse-test-"));
}

// ─── Crypto ───────────────────────────────────────────────────────────────────

test("AES Cipher Store - Async Encrypt and Decrypt", async () => {
  const dir = makeTempDir();
  try {
    const store = createAESCipherStore({
      fs,
      secretFile: path.join(dir, "test.secret"),
      ensureDataDir: async () => {},
    });

    const originalText = "Hello CipherBrowse!";
    const encrypted = await store.encryptText(originalText);
    assert.ok(store.isEncryptedPayload(encrypted), "Payload should be marked as encrypted");
    assert.equal(encrypted.mode, "aes-256-gcm");
    assert.equal(await store.decryptText(encrypted), originalText);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AES Cipher Store - tampered ciphertext is rejected", async () => {
  const dir = makeTempDir();
  try {
    const store = createAESCipherStore({ fs, secretFile: path.join(dir, "s.secret"), ensureDataDir: () => {} });
    const payload = await store.encryptText("secret value");
    const flipped = Buffer.from(payload.data, "base64");
    flipped[0] ^= 0xff;
    await assert.rejects(store.decryptText({ ...payload, data: flipped.toString("base64") }));
    assert.equal(store.isEncryptedPayload({ mode: "plain" }), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── AI provider helpers ──────────────────────────────────────────────────────

test("AI Provider Resolution", () => {
  assert.equal(resolveAIProviderId("chatgpt"), "openai");
  assert.equal(resolveAIProviderId("google gemini"), "gemini");
  assert.equal(resolveAIProviderId("anthropic"), "claude");
  assert.equal(resolveAIProviderId("unknown"), null);
});

test("AI key command parsing", () => {
  const setResult = parseAIProviderAndKey("set key --\"openai\" -'sk-abcdefghijklmnopqrstuvwxyz'", "set");
  assert.equal(setResult.provider, "openai");
  assert.equal(setResult.key, "sk-abcdefghijklmnopqrstuvwxyz");

  const deleteResult = parseAIProviderAndKey("delete key --\"gemini\"", "delete");
  assert.equal(deleteResult.provider, "gemini");
});

test("AI key normalization strips prefixes and quotes", () => {
  const key = "AIzaSyDexampleKey1234567890abcdefgh";
  assert.equal(normalizeAIKeyForProvider("gemini", `key "${key}"`), key);
  assert.equal(normalizeAIKeyForProvider("gemini", `'${key}'`), key);
});

test("AI error classification", () => {
  assert.equal(isAIRateLimited({ status: 429, message: "slow down" }), true);
  assert.equal(isAIRateLimited({ message: "insufficient_quota for this key" }), true);
  // A request-size validation error must not burn through every saved key.
  assert.equal(isAIRateLimited({ message: "max_tokens is too large" }), false);

  assert.equal(shouldTryNextAIModel({ message: "models/gemini-3.8-flash is not found for API version v1beta" }), true);
  assert.equal(shouldTryNextAIModel({ message: "model: old-model", apiData: { error: { type: "not_found_error" } } }), true);
  assert.equal(shouldTryNextAIModel({ message: "invalid api key" }), false);
});

test("AI key store saves, de-duplicates and clears keys", async () => {
  const dir = makeTempDir();
  try {
    const store = createAIKeyStore({
      fs,
      keyFile: path.join(dir, "aikeys.json"),
      secretFile: path.join(dir, "aikeys.secret"),
      ensureDataDir: () => {},
    });
    const key = "sk-test-abcdefghijklmnopqrstuvwxyz";

    assert.equal(await store.addKey("openai", key), true);
    assert.equal(await store.addKey("openai", key), false, "duplicate key should not be stored twice");
    assert.deepEqual(await store.getKeys("openai"), [key]);

    await store.clearKeys("openai");
    assert.deepEqual(await store.getKeys("openai"), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function mockFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const next = responses.shift();
    return {
      ok: next.status < 400,
      status: next.status,
      json: async () => next.body,
    };
  };
  return { fetchImpl, calls };
}

test("Gemini sends the key in a header, never in the URL", async () => {
  const key = "AIzaSyDexampleKey1234567890abcdefgh";
  const { fetchImpl, calls } = mockFetch([
    { status: 200, body: { candidates: [{ content: { parts: [{ text: "hello" }] } }] } },
  ]);
  const result = await callAIProvider("gemini", key, "hi", fetchImpl);
  assert.equal(result.reply, "hello");
  assert.ok(!calls[0].url.includes(key), "API key must not appear in the request URL");
  assert.equal(calls[0].options.headers["x-goog-api-key"], key);
});

test("Gemini falls through to the next model when one is not found", async () => {
  const { fetchImpl, calls } = mockFetch([
    { status: 404, body: { error: { message: "models/gemini-3.8-flash is not found for API version v1beta" } } },
    { status: 200, body: { candidates: [{ content: { parts: [{ text: "fallback ok" }] } }] } },
  ]);
  const result = await callAIProvider("gemini", "AIzaSyDexampleKey1234567890abcdefgh", "hi", fetchImpl);
  assert.equal(result.reply, "fallback ok");
  assert.equal(result.model, "gemini-3.6-flash");
  assert.equal(calls.length, 2);
});

test("Claude request separates the system message and sends the version header", async () => {
  const { fetchImpl, calls } = mockFetch([
    { status: 200, body: { content: [{ type: "text", text: "claude reply" }] } },
  ]);
  const result = await callAIProvider("claude", "sk-ant-exampleKey1234567890abcdef", "question", fetchImpl);
  assert.equal(result.reply, "claude reply");
  assert.equal(calls[0].options.headers["anthropic-version"], "2023-06-01");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "claude-sonnet-5-5");
  assert.deepEqual(body.messages, [{ role: "user", content: "question" }]);
});

test("Auth errors are reported, not retried on other models", async () => {
  const { fetchImpl, calls } = mockFetch([
    { status: 401, body: { error: { message: "API key not valid. Please pass a valid API key." } } },
  ]);
  await assert.rejects(
    callAIProvider("gemini", "AIzaSyDexampleKey1234567890abcdefgh", "hi", fetchImpl),
    error => error.status === 401,
  );
  assert.equal(calls.length, 1);
});

test("Every provider has at least one model configured", () => {
  const { AI_PROVIDERS } = require("../src/features/ai");
  for (const [id, provider] of Object.entries(AI_PROVIDERS)) {
    assert.ok(provider.models.length > 0, `${id} has no models`);
  }
});

// Runs fn with OLLAMA_HOST set (or unset when value is undefined), then restores it.
function withOllamaHost(value, fn) {
  const saved = process.env.OLLAMA_HOST;
  if (value === undefined) delete process.env.OLLAMA_HOST;
  else process.env.OLLAMA_HOST = value;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env.OLLAMA_HOST;
    else process.env.OLLAMA_HOST = saved;
  }
}

test("the five supported providers, with the current ids", () => {
  assert.deepEqual(Object.keys(AI_PROVIDERS), ["gemini", "openai", "claude", "openrouter", "ollama"]);
  assert.equal(resolveAIProviderId("anthropic"), "claude");
  assert.equal(resolveAIProviderId("openrouter"), "openrouter");
  assert.equal(resolveAIProviderId("meta"), "openrouter", "1.0 name must still resolve");
  assert.equal(resolveAIProviderId("llama"), "openrouter", "1.0 name must still resolve");
  assert.equal(resolveAIProviderId("ollama"), "ollama");
  assert.equal(normalizeAIKeyForProvider("openrouter", "sk-or-v1-abcdefghijklmnopqrstuvwxyz"), "sk-or-v1-abcdefghijklmnopqrstuvwxyz");
});

test("OLLAMA_HOST resolves to a base URL", () => {
  withOllamaHost(undefined, () => assert.equal(ollamaBaseUrl(), "http://127.0.0.1:11434"));
  assert.equal(ollamaBaseUrl({ OLLAMA_HOST: "0.0.0.0:11434" }), "http://127.0.0.1:11434");
  assert.equal(ollamaBaseUrl({ OLLAMA_HOST: "gpu-box:9000" }), "http://gpu-box:9000");
  assert.equal(ollamaBaseUrl({ OLLAMA_HOST: "https://ollama.example.com/" }), "https://ollama.example.com");
});

test("Ollama without a key calls the local server and never sends auth", async () => {
  await withOllamaHost(undefined, async () => {
    const { fetchImpl, calls } = mockFetch([
      { status: 200, body: { message: { role: "assistant", content: "local answer" }, done: true } },
    ]);
    const result = await callAIProvider("ollama", null, "question", fetchImpl);
    assert.equal(result.reply, "local answer");
    assert.equal(calls[0].url, "http://127.0.0.1:11434/api/chat");
    assert.equal(JSON.parse(calls[0].options.body).stream, false);
    assert.equal(calls[0].options.headers.Authorization, undefined);
  });
});

test("Ollama with a key sends a Bearer token to OLLAMA_HOST", async () => {
  await withOllamaHost("ollama.example.com:8443", async () => {
    const { fetchImpl, calls } = mockFetch([
      { status: 200, body: { message: { content: "hosted answer" } } },
    ]);
    await callAIProvider("ollama", "olk-testkey", "question", fetchImpl);
    assert.equal(calls[0].url, "http://ollama.example.com:8443/api/chat");
    assert.equal(calls[0].options.headers.Authorization, "Bearer olk-testkey");
  });
});

test("an unreachable Ollama server fails without an HTTP status", async () => {
  await withOllamaHost(undefined, async () => {
    const unreachable = async () => { throw new TypeError("fetch failed"); };
    await assert.rejects(
      callAIProvider("ollama", null, "question", unreachable),
      error => error.status === undefined,
    );
  });
});

test("checkOllama reads installed models and reports a stopped server", async () => {
  const running = await checkOllama(async () => ({
    ok: true,
    json: async () => ({ models: [{ name: "llama3.3:latest" }, { model: "qwen3:8b" }] }),
  }));
  assert.equal(running.running, true);
  assert.deepEqual(running.models, ["llama3.3:latest", "qwen3:8b"]);

  const stopped = await checkOllama(async () => { throw new TypeError("fetch failed"); });
  assert.equal(stopped.running, false);
  assert.deepEqual(stopped.models, []);
});

test("OpenRouter sends the key and falls through a 404 to the next model", async () => {
  const { fetchImpl, calls } = mockFetch([
    { status: 404, body: { error: { message: "No endpoints found for this model" } } },
    { status: 200, body: { choices: [{ message: { content: "router answer" } }] } },
  ]);
  const result = await callAIProvider("openrouter", "sk-or-v1-abcdefghijklmnopqrstuvwxyz", "hi", fetchImpl);
  assert.equal(result.reply, "router answer");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.Authorization, "Bearer sk-or-v1-abcdefghijklmnopqrstuvwxyz");
  assert.equal(result.model, "meta-llama/llama-3.3-70b-instruct");
});

test("shouldTryNextAIModel treats any 404 as a missing model", () => {
  assert.equal(shouldTryNextAIModel({ status: 404, message: "no route" }), true);
});

test("keys stored under the 1.0 'meta' id move to 'openrouter'", async () => {
  const dir = makeTempDir();
  try {
    const keyFile = path.join(dir, "aikeys.json");
    const store = createAIKeyStore({ fs, keyFile, secretFile: path.join(dir, "aikeys.secret"), ensureDataDir: () => {} });
    const key = "sk-or-v1-abcdefghijklmnopqrstuvwxyz";
    assert.equal(await store.addKey("openrouter", key), true);

    // Simulate a file written by 1.0, where the same entries sat under "meta".
    const raw = JSON.parse(fs.readFileSync(keyFile, "utf8"));
    raw.meta = raw.openrouter;
    delete raw.openrouter;
    fs.writeFileSync(keyFile, JSON.stringify(raw), "utf8");

    assert.deepEqual(await store.getKeys("openrouter"), [key]);
    assert.equal(await store.addKey("openrouter", "sk-or-v1-zyxwvutsrqponmlkjihgfedcba"), true);
    const saved = JSON.parse(fs.readFileSync(keyFile, "utf8"));
    assert.equal(saved.meta, undefined, "legacy id should be removed on the next write");
    assert.equal(saved.openrouter.length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Network guard ────────────────────────────────────────────────────────────

test("only http(s) targets reach curl", () => {
  assert.equal(isHttpUrl("https://example.com/a?b=1"), true);
  assert.equal(isHttpUrl("http://example.com"), true);
  assert.equal(isHttpUrl("--output C:\\evil"), false);
  assert.equal(isHttpUrl("example.com"), false);
  assert.throws(() => buildCurlArgs("--output C:\\evil"), /non-http/);

  const args = buildCurlArgs("https://example.com/x");
  assert.equal(args[args.length - 1], "https://example.com/x", "URL must be the last curl argument");
});

// ─── Text ─────────────────────────────────────────────────────────────────────

test("text helpers decode entities and escape HTML", () => {
  assert.equal(decodeEntities("Tom &amp; Jerry &#65;"), "Tom & Jerry A");
  assert.equal(cleanVisibleText("  a \u00a0 b\n c  "), "a b c");
  assert.equal(escapeHtml(`<script>"x"&'y'`), "&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;");
});

// ─── Page parsing ─────────────────────────────────────────────────────────────

test("stripHtml drops scripts and styles", () => {
  const text = stripHtml("<style>p{}</style><p>Hello</p><script>track()</script><p>World</p>");
  assert.ok(text.includes("Hello") && text.includes("World"));
  assert.ok(!text.includes("track()"));
  assert.ok(!text.includes("p{}"));
});

test("fingerprintPage ignores markup but detects text changes", () => {
  const a = fingerprintPage("<div class='x'><p>Price: 10</p></div>");
  const b = fingerprintPage("<section><b>Price: 10</b></section><script>var t=1;</script>");
  const c = fingerprintPage("<p>Price: 12</p>");
  assert.equal(a, b, "same visible text should give the same fingerprint");
  assert.notEqual(a, c, "changed visible text should give a different fingerprint");
  assert.equal(a.length, 64, "SHA-256 hex digest");
});

test("extractLinks resolves relative hrefs and numbers them", () => {
  const links = extractLinks('<a href="/about">About us</a><a href="/about">dup</a>', "https://example.com/home");
  assert.deepEqual(links, [{ n: 1, text: "About us", url: "https://example.com/about" }]);
});

test("parseBingWebResults reads organic results", () => {
  const html = '<li class="b_algo"><h2><a href="https://example.com/a">Example A</a></h2><p>Snippet A</p></li>';
  const [first] = parseBingWebResults(html, 10);
  assert.equal(first.title, "Example A");
  assert.equal(first.url, "https://example.com/a");
  assert.equal(first.snippet, "Snippet A");
  assert.equal(first.source, "example.com");
});

test("parseWikipediaApiResults maps opensearch tuples", () => {
  const payload = ["cake", ["Cake", "Cake pop"], ["A dessert", "A treat"], ["https://en.wikipedia.org/wiki/Cake", "https://en.wikipedia.org/wiki/Cake_pop"]];
  const results = parseWikipediaApiResults(payload, 10);
  assert.equal(results.length, 2);
  assert.equal(results[1].url, "https://en.wikipedia.org/wiki/Cake_pop");
});

// ─── Grid, search and video helpers ───────────────────────────────────────────

test("grid coordinates map to zero-based indexes", () => {
  assert.deepEqual(parseGridCoordinate("2, 3"), { column: 2, row: 3 });
  assert.equal(parseGridCoordinate("x,y"), null);
  assert.equal(resolveGridSelection(3, 2, 2), 4);
  assert.equal(resolveGridSelection(3, 0, 1), null);
});

test("search flavor flags and site targets", () => {
  assert.deepEqual(parseSearchFlavor("cats --images"), { mode: "image", text: "cats" });
  assert.equal(parseSearchFlavor("x --images --videos").mode, "video");
  assert.deepEqual(buildSearchRequest("wiki --query world war 2").question, "world war 2");
  assert.equal(buildSearchRequest("wiki --query world war 2").siteHost, "wikipedia.org");
  assert.equal(normalizeSiteTarget("gh"), "github.com");
  assert.equal(normalizeSiteTarget("https://www.Example.com/path"), "example.com");
});

test("Bing video cards are read from mmeta, not from exact link markup", () => {
  // Bing puts aria-label before href and adds classes to the link. Earlier
  // parser patterns required the old order and matched nothing.
  const html =
    '<div id="mc_vtvc_video_1" class="mc_vtvc b_canvas" mmeta="{&quot;murl&quot;:&quot;https://www.youtube.com/watch?v=abc&quot;,&quot;turl&quot;:&quot;https://ts.example/t.jpg&quot;,&quot;t&quot;:&quot;Cake Basics&quot;}">' +
    '<a aria-label="Cake Basics · Duration: 3:12 · 1K views" class="mc_vtvc_link mc_vtvc_el" href="https://www.bing.com/ck/a?x">x</a></div>' +
    '<div class="mc_vtvc" mmeta="{&quot;murl&quot;:&quot;https://vimeo.com/123/video&quot;}">' +
    '<a aria-label="Second · Duration: 1:00" href="https://www.bing.com/ck/a?y">y</a></div>';
  const items = parseBingVideoResults(html, 12);
  assert.equal(items.length, 2);
  assert.equal(items[0].url, "https://www.youtube.com/watch?v=abc");
  assert.equal(items[0].title, "Cake Basics");
  assert.equal(items[0].duration, "3:12");
  assert.equal(items[0].thumb, "https://ts.example/t.jpg");
  assert.equal(items[1].url, "https://vimeo.com/123/video");
  assert.equal(items[1].duration, "1:00", "duration must come from this card, not the next one");
});

test("video helpers format durations and detect direct media", () => {
  assert.equal(formatDuration(3725), "1:02:05");
  assert.equal(formatDuration(75), "1:15");
  assert.equal(formatDuration(0), "");
  assert.equal(isLikelyDirectMediaUrl("https://x.example/a.mp4?x=1"), true);
  assert.equal(isLikelyDirectMediaUrl("https://x.example/watch?v=1"), false);
});

// ─── Recon helpers ────────────────────────────────────────────────────────────

test("wayback helpers build the lookup and read the closest snapshot", () => {
  assert.equal(
    buildWaybackUrl("https://a.example/c?d=1"),
    "https://archive.org/wayback/available?url=https%3A%2F%2Fa.example%2Fc%3Fd%3D1",
  );
  assert.equal(formatWaybackTimestamp("20261012233910"), "2026-10-12 23:39:10 UTC");
  assert.equal(formatWaybackTimestamp("bad"), "");

  const snapshot = parseWaybackAvailable({
    archived_snapshots: {
      closest: { status: "200", available: true, url: "http://web.archive.org/web/20261012233910/https://www.wikipedia.org/", timestamp: "20261012233910" },
    },
  });
  assert.equal(snapshot.when, "2026-10-12 23:39:10 UTC");
  assert.equal(parseWaybackAvailable({ archived_snapshots: {} }), null);
  assert.equal(parseWaybackAvailable({ archived_snapshots: { closest: { available: false } } }), null);
});

test("dns values are formatted per record type", () => {
  assert.equal(formatDnsValue("MX", { priority: 10, exchange: "mx.example.com" }), "10 mx.example.com");
  assert.equal(formatDnsValue("MX", { priority: 0, exchange: "" }), "0 (null MX: accepts no mail)");
  assert.equal(formatDnsValue("TXT", ["v=spf1 ", "-all"]), "v=spf1 -all");
  assert.equal(formatDnsValue("A", "93.184.216.34"), "93.184.216.34");
});

// ─── Storage ──────────────────────────────────────────────────────────────────

test("search history drops entries older than 24 hours and duplicates", () => {
  const fresh = new Date().toISOString();
  const stale = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const kept = normalizeSearchHistory([
    { query: "cake", kind: "web", at: fresh },
    { query: "cake", kind: "web", at: fresh },
    { query: "old", kind: "web", at: stale },
  ]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].query, "cake");
});
