"use strict";

const dns = require("dns");

const WAYBACK_AVAILABLE_API = "https://archive.org/wayback/available?url=";
const DNS_RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "NS", "TXT"];

function buildWaybackUrl(target) {
  return `${WAYBACK_AVAILABLE_API}${encodeURIComponent(String(target || ""))}`;
}

// Wayback timestamps are YYYYMMDDhhmmss (UTC).
function formatWaybackTimestamp(timestamp) {
  const match = String(timestamp || "").match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!match) return "";
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day} ${hour}:${minute}:${second} UTC`;
}

// Returns the closest archived snapshot, or null when the API has none.
function parseWaybackAvailable(payload) {
  const closest = payload?.archived_snapshots?.closest;
  if (!closest || closest.available !== true) return null;
  if (!/^https?:\/\//i.test(String(closest.url || ""))) return null;
  return {
    url:       closest.url,
    timestamp: String(closest.timestamp || ""),
    when:      formatWaybackTimestamp(closest.timestamp),
    status:    String(closest.status || ""),
  };
}

function formatDnsValue(type, value) {
  if (type === "MX") {
    // A null MX (RFC 7505) has an empty or "." exchange and means "accepts no mail".
    if (!value.exchange || value.exchange === ".") return `${value.priority} (null MX: accepts no mail)`;
    return `${value.priority} ${value.exchange}`;
  }
  if (type === "TXT") return (Array.isArray(value) ? value : [value]).join("");
  return String(value);
}

// Looks up each common record type with Node's resolver, so no external
// dig/nslookup binary is needed. Record types a host does not have are skipped.
async function resolveDnsRecords(host) {
  const records = [];
  let notFound  = false;
  let lastError = null;

  for (const type of DNS_RECORD_TYPES) {
    try {
      const values = await dns.promises.resolve(host, type);
      for (const value of values) records.push({ type, value: formatDnsValue(type, value) });
    } catch (error) {
      lastError = error;
      if (error.code === "ENOTFOUND") notFound = true;
    }
  }

  if (!records.length && lastError && lastError.code !== "ENODATA") {
    return { records, notFound, error: lastError.message };
  }
  return { records, notFound, error: null };
}

module.exports = {
  DNS_RECORD_TYPES,
  buildWaybackUrl,
  formatWaybackTimestamp,
  parseWaybackAvailable,
  formatDnsValue,
  resolveDnsRecords,
};
