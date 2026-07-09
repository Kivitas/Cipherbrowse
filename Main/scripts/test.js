const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { createAESCipherStore } = require("../src/core/security");
const { resolveAIProviderId } = require("../src/features/ai");

test("AES Cipher Store - Async Encrypt and Decrypt", async (t) => {
  const tempDir = path.join(__dirname, "temp_test_dir");
  const secretFile = path.join(tempDir, "test.secret");
  
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  const store = createAESCipherStore({
    fs,
    secretFile,
    ensureDataDir: async () => {},
  });

  const originalText = "Hello CipherBrowse!";
  
  // Test encryption
  const encrypted = await store.encryptText(originalText);
  assert.ok(store.isEncryptedPayload(encrypted), "Payload should be marked as encrypted");
  assert.strictEqual(encrypted.mode, "aes-256-gcm");

  // Test decryption
  const decrypted = await store.decryptText(encrypted);
  assert.strictEqual(decrypted, originalText, "Decrypted text should match original");

  // Cleanup
  if (fs.existsSync(secretFile)) fs.unlinkSync(secretFile);
  if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
});

test("AI Provider Resolution", (t) => {
  assert.strictEqual(resolveAIProviderId("chatgpt"), "openai");
  assert.strictEqual(resolveAIProviderId("google gemini"), "gemini");
  assert.strictEqual(resolveAIProviderId("anthropic"), "claude");
  assert.strictEqual(resolveAIProviderId("unknown"), null);
});
