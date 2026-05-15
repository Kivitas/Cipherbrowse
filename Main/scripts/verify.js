const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const entry = path.join(root, "src", "index.js");
const dataDir = path.join(root, ".cipherbrowse");

const oneShotChecks = [
  {
    name: "help",
    args: ["--help"],
    expect: ["Navigation", "Search", "AI Chat"],
  },
  {
    name: "doctor",
    args: ["/doctor"],
    expect: ["Self Diagnostics", "Node", "Network"],
  },
  {
    name: "wiki-search",
    args: ["/s wiki --query world war 2"],
    expect: ["Wikipedia: world war 2", "Results (", "World War II"],
  },
  {
    name: "image-search",
    args: ["/s cats --images"],
    expect: ["Images (", "/open <col,row>"],
  },
  {
    name: "video-search",
    args: ["/s youtube.com --query cake"],
    expect: ["Videos (", "/open <col,row>"],
  },
  {
    name: "github-search",
    args: ["/s github --query react hooks"],
    expect: ["GitHub: react hooks", "Results (", "streamich/react-use"],
  },
  {
    name: "npm-search",
    args: ["/s npm --query react"],
    expect: ["npm: react", "Results (", "react"],
  },
  {
    name: "search-history",
    args: ["/searches"],
    expect: ["Recent Searches", "/searches <n>"],
  },
];

const interactiveChecks = [
  {
    name: "session-image-history",
    steps: [
      { input: "/s cats --images", waitMs: 3500 },
      { input: "/searches", waitMs: 600 },
      { input: "/history", waitMs: 600 },
      { input: "/quit", waitMs: 200 },
    ],
    expect: ["Images (", "Recent Searches"],
  },
  {
    name: "session-wiki-find",
    steps: [
      { input: "/s wiki --query world war 2", waitMs: 2500 },
      { input: "/open 1", waitMs: 2500 },
      { input: "/find Stalin", waitMs: 600 },
      { input: "/quit", waitMs: 200 },
    ],
    expect: ["World War II", 'Find: "Stalin"'],
  },
];

let failed = false;

function runOneShot(check) {
  const result = spawnSync(process.execPath, [entry, ...check.args], {
    cwd: root,
    encoding: "utf8",
    timeout: 90000,
  });

  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const missing = check.expect.filter(fragment => !output.includes(fragment));
  if (result.status !== 0 || missing.length) {
    failed = true;
    console.error(`\n[FAIL] ${check.name}`);
    if (result.status !== 0) console.error(`Exit status: ${result.status}`);
    if (missing.length) console.error(`Missing: ${missing.join(", ")}`);
    console.error(output.slice(0, 2500));
  } else {
    console.log(`[OK] ${check.name}`);
  }
}

async function runInteractive(check) {
  const commandText = `${check.steps.map(step => step.input).join("\n")}\n`;
  const result = spawnSync(process.execPath, [entry], {
    cwd: root,
    input: commandText,
    encoding: "utf8",
    timeout: 120000,
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const missing = check.expect.filter(fragment => !output.includes(fragment));
  if (result.status !== 0 || missing.length) {
    failed = true;
    console.error(`\n[FAIL] ${check.name}`);
    if (result.status !== 0) console.error(`Exit status: ${result.status}`);
    if (missing.length) console.error(`Missing: ${missing.join(", ")}`);
    console.error(output.slice(0, 4000));
  } else {
    console.log(`[OK] ${check.name}`);
  }
}

function verifyEncryptedSearchHistory() {
  const statePath = path.join(dataDir, "state.json");
  const searchPath = path.join(dataDir, "search-history.enc.json");

  try {
    const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : {};
    const encryptedText = fs.existsSync(searchPath) ? fs.readFileSync(searchPath, "utf8") : "";
    const encrypted = encryptedText ? JSON.parse(encryptedText) : null;

    const stateHasSearchHistory = Object.prototype.hasOwnProperty.call(state, "searchHistory");
    const encryptedLooksValid = encrypted?.keyDerivation === "sha512" && encrypted?.data?.mode === "aes-256-gcm";
    const leakedQueryText = /world war 2|cats|react hooks/i.test(encryptedText);

    if (stateHasSearchHistory || !encryptedLooksValid || leakedQueryText) {
      failed = true;
      console.error("\n[FAIL] encrypted-search-history");
      if (stateHasSearchHistory) console.error("state.json still contains searchHistory");
      if (!encryptedLooksValid) console.error("encrypted search-history file is missing or malformed");
      if (leakedQueryText) console.error("encrypted search-history file contains plaintext query text");
      return;
    }
    console.log("[OK] encrypted-search-history");
  } catch (error) {
    failed = true;
    console.error("\n[FAIL] encrypted-search-history");
    console.error(error.message);
  }
}

(async () => {
  for (const check of oneShotChecks) {
    runOneShot(check);
  }

  for (const check of interactiveChecks) {
    await runInteractive(check);
  }

  verifyEncryptedSearchHistory();

  if (failed) process.exit(1);
  console.log("\nverify passed");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
