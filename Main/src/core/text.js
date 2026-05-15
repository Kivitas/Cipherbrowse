"use strict";

function decodeNumericEntity(value) {
  const input = String(value || "");
  const isHex = /^x/i.test(input);
  const raw = isHex ? input.slice(1) : input;
  const codePoint = Number.parseInt(raw, isHex ? 16 : 10);
  if (!Number.isFinite(codePoint)) return "";
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return "";
  }
}

function repairMojibake(text) {
  const input = String(text || "");
  const replacements = [
    ["Ã¢â‚¬â„¢", "'"],
    ["Ã¢â‚¬Ëœ", "'"],
    ["Ã¢â‚¬Å“", '"'],
    ["Ã¢â‚¬Â", '"'],
    ["Ã¢â‚¬â€œ", "-"],
    ["Ã¢â‚¬â€", "--"],
    ["Ã¢â‚¬Â¦", "..."],
    ["Ã¢â‚¬Â¢", "*"],
    ["Ã¢â€žÂ¢", "™"],
    ["Ã¢Å“â€œ", "OK"],
    ["Ã¢Å“â€”", "X"],
    ["Ã¢â€ â€™", "->"],
    ["Ã¢â€ Â³", "->"],
    ["Ã¢â€“Â¶", ">"],
    ["Ã‚Â©", "©"],
    ["Ã‚Â®", "®"],
    ["Ã‚Â·", "·"],
    ["Ã‚", ""],
  ];

  return replacements.reduce((next, [from, to]) => next.split(from).join(to), input);
}

function decodeEntities(text) {
  const named = {
    nbsp: " ",
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    ndash: "-",
    mdash: "--",
    hellip: "...",
    copy: "©",
    reg: "®",
    trade: "™",
    middot: "·",
    rsquo: "'",
    lsquo: "'",
    rdquo: '"',
    ldquo: '"',
    times: "x",
  };

  const decoded = String(text || "")
    .replace(/&#(x?[0-9a-f]+);/gi, (_, value) => decodeNumericEntity(value))
    .replace(/&([a-z][a-z0-9]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);

  return repairMojibake(decoded);
}

function cleanVisibleText(text) {
  return decodeEntities(String(text || ""))
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  decodeEntities,
  repairMojibake,
  cleanVisibleText,
};
