#!/usr/bin/env node
/**
 * Bumps version.json, android/app/build.gradle, and patches the
 * CURRENT_VERSION_CODE constant inside UpdateChecker.tsx so the
 * in-app update check always reflects the current installed build.
 *
 * Usage: node scripts/bump-version.js [releaseNotes]
 * The CI workflow also runs this automatically on every push to main.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const versionPath  = path.join(root, "version.json");
const gradlePath   = path.join(root, "android", "app", "build.gradle");
const checkerPath  = path.join(root, "src", "components", "UpdateChecker.tsx");

// ── Bump version.json ─────────────────────────────────────────────────────────
const v = JSON.parse(fs.readFileSync(versionPath, "utf8"));
v.versionCode += 1;
const parts = v.versionName.split(".");
parts[1] = String(parseInt(parts[1]) + 1);
v.versionName = parts.join(".");
if (process.argv[2]) v.releaseNotes = process.argv[2];
fs.writeFileSync(versionPath, JSON.stringify(v, null, 2) + "\n");

// ── Patch build.gradle ────────────────────────────────────────────────────────
let gradle = fs.readFileSync(gradlePath, "utf8");
gradle = gradle.replace(/versionCode \d+/, `versionCode ${v.versionCode}`);
gradle = gradle.replace(/versionName "[^"]*"/, `versionName "${v.versionName}"`);
fs.writeFileSync(gradlePath, gradle);

// ── Patch UpdateChecker.tsx CURRENT_VERSION_NAME and CURRENT_VERSION_CODE ────────
let checker = fs.readFileSync(checkerPath, "utf8");
checker = checker
  .replace(/const CURRENT_VERSION_NAME = "[^"]+"/, `const CURRENT_VERSION_NAME = "${v.versionName}"`)
  .replace(/const CURRENT_VERSION_CODE = \d+/, `const CURRENT_VERSION_CODE = ${v.versionCode}`);
fs.writeFileSync(checkerPath, checker);

console.log(`✓ Bumped to v${v.versionName} (build ${v.versionCode})`);
