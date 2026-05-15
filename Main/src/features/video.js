"use strict";

const { spawnSync } = require("child_process");

const YTDLP_COOKIE_BROWSERS = ["chrome", "edge", "firefox", "brave", "chromium", "opera", "vivaldi"];

function isLikelyDirectMediaUrl(url) {
  return /\.(mp4|webm|mkv|mov|m4v|avi|flv|m3u8)(\?|#|$)/i.test(String(url || ""));
}

function formatDuration(seconds) {
  const total = Number(seconds || 0);
  if (!Number.isFinite(total) || total <= 0) return "";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ytDlpSearch(ytdlpPath, query, limit = 12) {
  if (!ytdlpPath || !query) return [];
  const args = [
    "--flat-playlist",
    "--dump-json",
    "--no-warnings",
    "--ignore-errors",
    `ytsearch${limit}:${query}`,
  ];
  const result = spawnSync(ytdlpPath, args, {
    encoding: "utf8",
    timeout: 45000,
    windowsHide: true,
  });

  if (result.status !== 0 && !result.stdout) return [];
  const lines = String(result.stdout || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const items = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const url = entry.webpage_url || entry.url;
      if (!/^https?:\/\//i.test(url || "")) continue;
      const title = String(entry.title || url || "").trim();
      if (!title) continue;
      items.push({
        kind: "video",
        title,
        url,
        source: entry.uploader || entry.channel || entry.extractor_key || "video",
        duration: formatDuration(entry.duration),
      });
    } catch {}
  }
  return items;
}

function resolvePlayableUrl(ytdlpPath, url) {
  if (!ytdlpPath || !url) return null;
  const attempts = [
    ["--get-url", "--no-warnings", "--ignore-errors", url],
    ...YTDLP_COOKIE_BROWSERS.map(browser => [
      "--get-url",
      "--no-warnings",
      "--ignore-errors",
      "--cookies-from-browser",
      browser,
      url,
    ]),
  ];

  for (const args of attempts) {
    const result = spawnSync(ytdlpPath, args, {
      encoding: "utf8",
      timeout: 45000,
      windowsHide: true,
    });
    const lines = String(result.stdout || "")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => /^https?:\/\//i.test(line));
    if (lines.length) return lines[0];
  }
  return null;
}

function buildMpvArgs(url, ytdlpPath) {
  const args = [
    "--force-window=immediate",
    "--title=CipherBrowse",
    "--ytdl=yes",
    "--save-position-on-quit=yes",
  ];
  if (ytdlpPath) {
    args.push(`--script-opts=ytdl_hook-ytdl_path=${ytdlpPath}`);
  }
  args.push(url);
  return args;
}

function buildImageMpvArgs(url) {
  return [
    "--force-window=immediate",
    "--title=CipherBrowse Image",
    "--image-display-duration=inf",
    "--keep-open=yes",
    url,
  ];
}

module.exports = {
  YTDLP_COOKIE_BROWSERS,
  isLikelyDirectMediaUrl,
  ytDlpSearch,
  resolvePlayableUrl,
  buildMpvArgs,
  buildImageMpvArgs,
  formatDuration,
};
