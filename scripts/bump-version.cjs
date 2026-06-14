/**
 * bump-version.cjs
 *
 * Auto-increments the app version every time you run `npm run cap:sync`.
 *
 * Updates:
 *   1. version.json              — versionName + versionCode (committed, read by CI)
 *   2. android/app/build.gradle  — versionCode + versionName
 *   3. src/components/UpdateChecker.tsx — CURRENT_VERSION constant
 */

const fs   = require("fs");
const path = require("path");

const ROOT          = path.resolve(__dirname, "..");
const VERSION_FILE  = path.join(ROOT, "version.json");
const GRADLE_FILE   = path.join(ROOT, "android", "app", "build.gradle");
const CHECKER_FILE  = path.join(ROOT, "src", "components", "UpdateChecker.tsx");

// ── 1. Read + bump version.json ───────────────────────────────────────────────
const v = JSON.parse(fs.readFileSync(VERSION_FILE, "utf8"));

const parts = v.versionName.split(".").map(Number);
if (parts.length === 2) parts.push(0); // ensure 3 parts
parts[2] = (parts[2] ?? 0) + 1;       // bump patch
v.versionName = parts.join(".");
v.versionCode = (v.versionCode ?? 1) + 1;

fs.writeFileSync(VERSION_FILE, JSON.stringify(v, null, 2) + "\n");

// ── 2. Patch build.gradle ─────────────────────────────────────────────────────
let gradle = fs.readFileSync(GRADLE_FILE, "utf8");
gradle = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${v.versionCode}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${v.versionName}"`);
fs.writeFileSync(GRADLE_FILE, gradle);

// ── 3. Patch CURRENT_VERSION in UpdateChecker.tsx ────────────────────────────
let checker = fs.readFileSync(CHECKER_FILE, "utf8");
checker = checker.replace(
  /const CURRENT_VERSION = "[^"]+"/,
  `const CURRENT_VERSION = "${v.versionName}"`
);
fs.writeFileSync(CHECKER_FILE, checker);

console.log(`✓  Bumped to v${v.versionName} (build ${v.versionCode})`);
