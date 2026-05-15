"use strict";

const crypto = require("crypto");

const AES_ALGORITHM = "aes-256-gcm";
const SECRET_KEY_BYTES = 32;
const SECRET_SOURCE_BYTES = 64;
const IV_BYTES = 12;

function deriveKey(raw, digest = "sha256") {
  return crypto.createHash(digest).update(raw).digest().subarray(0, SECRET_KEY_BYTES);
}

function normalizeSecret(raw, digest = "sha256") {
  if (!raw) return crypto.randomBytes(SECRET_KEY_BYTES);
  try {
    const decoded = Buffer.from(String(raw).trim(), "base64");
    if (decoded.length === SECRET_KEY_BYTES) return decoded;
    if (decoded.length >= SECRET_KEY_BYTES) return deriveKey(decoded, digest);
  } catch {}
  return deriveKey(Buffer.from(String(raw), "utf8"), digest);
}

function createAESCipherStore({ fs, secretFile, ensureDataDir, digest = "sha256" }) {
  function loadOrCreateSecret() {
    try {
      const existing = fs.readFileSync(secretFile, "utf8");
      return normalizeSecret(existing, digest);
    } catch {}

    const nextSecret = digest === "sha512"
      ? crypto.randomBytes(SECRET_SOURCE_BYTES)
      : crypto.randomBytes(SECRET_KEY_BYTES);
    ensureDataDir();
    fs.writeFileSync(secretFile, nextSecret.toString("base64"), "utf8");
    return normalizeSecret(nextSecret.toString("base64"), digest);
  }

  function encryptText(value) {
    const key = loadOrCreateSecret();
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(AES_ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(String(value || ""), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      mode: AES_ALGORITHM,
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      data: ciphertext.toString("base64"),
    };
  }

  function decryptText(payload) {
    const key = loadOrCreateSecret();
    const iv = Buffer.from(String(payload?.iv || ""), "base64");
    const tag = Buffer.from(String(payload?.tag || ""), "base64");
    const data = Buffer.from(String(payload?.data || ""), "base64");
    const decipher = crypto.createDecipheriv(AES_ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    return plaintext.toString("utf8");
  }

  function isEncryptedPayload(value) {
    return Boolean(
      value &&
      typeof value === "object" &&
      value.mode === AES_ALGORITHM &&
      typeof value.iv === "string" &&
      typeof value.tag === "string" &&
      typeof value.data === "string",
    );
  }

  return {
    encryptText,
    decryptText,
    isEncryptedPayload,
  };
}

function createSHA512AESCipherStore(options) {
  return createAESCipherStore({ ...options, digest: "sha512" });
}

module.exports = {
  AES_ALGORITHM,
  createAESCipherStore,
  createSHA512AESCipherStore,
};
