/**
 * bump-version.cjs
 *
 * Auto-increments the app version every time you run `npm run cap:sync`.
 *
 * What it updates:
 *   1. android/app/build.gradle   — versionCode (integer) and versionName (string)
 *   2. .env                       — VITE_APP_VERSION (read by CI and update checker)
 *   3. src/components/UpdateChecker.tsx — CURRENT_VERSION constant
 *
 * Strategy: bump the PATCH number (1.1.0 → 1.1.1 → 1.1.2 …)
 * and increment versionCode by 1 each time.
 *
 * To do a MINOR or MAJOR bump, edit .env manually once:
 *   VITE_APP_VERSION="2.0.0"
 * The next cap:sync will then produce 2.0.1, 2.0.2, etc.
 */

const fs   = require("fs");
const path = require("path");

const ROOT         = path.resolve(__dirname, "..");
const ENV_FILE     = path.join(ROOT, ".env");
const GRADLE_FILE  = path.join(ROOT, "android", "app", "build.gradle");
const CHECKER_FILE = path.join(ROOT, "src", "components", "UpdateChecker.tsx");

// ── 1. Read current version from .env ────────────────────────────────────────
const envContent  = fs.readFileSync(ENV_FILE, "utf8");
const versionMatch = envContent.match(/^VITE_APP_VERSION="([^"]+)"/m);

if (!versionMatch) {
  console.error("✗  VITE_APP_VERSION not found in .env");
  process.exit(1);
}

const currentVersion = versionMatch[1];
const parts = currentVersion.split(".").map(Number);
if (parts.length === 2) parts.push(0); // ensure 3 parts

// Bump patch
parts[2] = (parts[2] ?? 0) + 1;
const newVersion = parts.join(".");

// ── 2. Read current versionCode from build.gradle ────────────────────────────
const gradleContent   = fs.readFileSync(GRADLE_FILE, "utf8");
const codeMatch       = gradleContent.match(/versionCode\s+(\d+)/);
const currentCode     = codeMatch ? parseInt(codeMatch[1]) : 1;
const newCode         = currentCode + 1;

// ── 3. Write updated .env ────────────────────────────────────────────────────
const newEnv = envContent.replace(
  /^VITE_APP_VERSION="[^"]+"/m,
  `VITE_APP_VERSION="${newVersion}"`
);
fs.writeFileSync(ENV_FILE, newEnv);

// ── 4. Write updated build.gradle ────────────────────────────────────────────
const newGradle = gradleContent
  .replace(/versionCode\s+\d+/, `versionCode ${newCode}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${newVersion}"`);
fs.writeFileSync(GRADLE_FILE, newGradle);

// ── 5. Patch CURRENT_VERSION in UpdateChecker.tsx ────────────────────────────
const checkerContent = fs.readFileSync(CHECKER_FILE, "utf8");
const newChecker = checkerContent.replace(
  /const CURRENT_VERSION = "[^"]+"/,
  `const CURRENT_VERSION = "${newVersion}"`
);
fs.writeFileSync(CHECKER_FILE, newChecker);

console.log(`✓  Version bumped: ${currentVersion} → ${newVersion}  (versionCode ${currentCode} → ${newCode})`);
