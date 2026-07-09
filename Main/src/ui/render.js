"use strict";

const THEMES = {
  green: { primary: "\x1b[32m", secondary: "\x1b[92m", accent: "\x1b[32;1m" },
  amber: { primary: "\x1b[33m", secondary: "\x1b[93m", accent: "\x1b[33;1m" },
  blue:  { primary: "\x1b[34m", secondary: "\x1b[94m", accent: "\x1b[34;1m" },
  cyan:  { primary: "\x1b[36m", secondary: "\x1b[96m", accent: "\x1b[36;1m" },
  white: { primary: "\x1b[37m", secondary: "\x1b[97m", accent: "\x1b[97;1m" },
};

let currentTheme = "green";

const O1 = "\x1b[38;5;202m";
const O2 = "\x1b[38;5;208m";
const O3 = "\x1b[38;5;214m";
const O4 = "\x1b[38;5;220m";
const LAV = "\x1b[38;5;183m";
const RS  = "\x1b[0m";

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

function setTheme(theme) {
  if (THEMES[theme]) {
    currentTheme = theme;
    return true;
  }
  return false;
}

function getTheme() {
  return currentTheme;
}

function termWidth() { return process.stdout.columns || 100; }

function hr(char = "-") {
  return C.dim + char.repeat(Math.max(40, termWidth())) + C.reset;
}

function cleanVisibleText(text) {
  // We need cleanVisibleText here for formatting, but it is in core/text.js.
  // We'll require it inside the function to avoid circular dependencies if any,
  // or just require it at the top.
  return require("../core/text").cleanVisibleText(text);
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

module.exports = {
  THEMES,
  setTheme,
  O1, O2, O3, O4, LAV, RS,
  C,
  termWidth,
  hr,
  centerPlain,
  centerOffset,
  formatHeaderTimestamp,
  printTitleLine,
  wrap,
  wrapLines,
  printAIChatReply,
  getTheme,
};
