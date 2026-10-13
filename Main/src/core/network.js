"use strict";

const { spawn } = require("child_process");
const { LIMITS, CURL_BIN, DEFAULT_TOR, runtime } = require("./config");

// Only http(s) targets reach curl. Without this check, a string such as
// "--output C:\\x" typed into a recon command would be parsed as a curl option.
function isHttpUrl(value) {
  return /^https?:\/\/[^\s]+$/i.test(String(value || ""));
}

function buildCurlArgs(url) {
  if (!isHttpUrl(url)) throw new Error(`Refusing non-http(s) target: ${String(url).slice(0, 80)}`);
  const args = [
    "-sL",
    "--max-time",      String(Math.ceil(LIMITS.FETCH_TIMEOUT / 1000)),
    "--max-filesize",  "8000000",
    "-A",              "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0",
    "-H",              "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "-H",              "Accept-Language: en-US,en;q=0.8",
    "--compressed",
  ];
  if (runtime.proxyMode === "tor" || runtime.proxyMode === "proxy") {
    args.push("--proxy", runtime.proxyUrl || DEFAULT_TOR);
  }
  args.push(url);
  return args;
}

function fetchUrlWithHeaders(url, headers = []) {
  return new Promise((resolve, reject) => {
    let args;
    try {
      args = buildCurlArgs(url);
    } catch (error) {
      return reject(error);
    }
    args.splice(args.length - 1, 0, ...headers.flatMap(([n, v]) => ["-H", `${n}: ${v}`]));
    const child  = spawn(CURL_BIN, args, { timeout: LIMITS.FETCH_TIMEOUT + 5000, windowsHide: true });
    const chunks = [];
    const errBuf = [];
    child.stdout.on("data", d => chunks.push(d));
    child.stderr.on("data", d => errBuf.push(d));
    child.on("error", err => reject(new Error(`curl error: ${err.message}`)));
    child.on("close", code => {
      if (code !== 0 && chunks.length === 0) {
        const stderr = Buffer.concat(errBuf).toString("utf8").trim();
        return reject(new Error(stderr || `curl exited with code ${code}`));
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

function fetchUrl(url) {
  return fetchUrlWithHeaders(url, []);
}

async function fetchJson(url, headers = []) {
  return JSON.parse(await fetchUrlWithHeaders(url, headers));
}

module.exports = {
  isHttpUrl,
  buildCurlArgs,
  fetchUrl,
  fetchUrlWithHeaders,
  fetchJson,
};
