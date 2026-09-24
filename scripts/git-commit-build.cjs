/**
 * Commit the release after cap:sync finishes.
 * Skips when there is nothing new. Does not push.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const version = JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8"));

function git(args) {
  return spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

const add = git(["add", "-A"]);
if (add.status !== 0) {
  process.stderr.write(add.stderr || "git add failed\n");
  process.exit(add.status ?? 1);
}

const status = git(["status", "--porcelain"]);
if (status.status !== 0) {
  process.stderr.write(status.stderr || "git status failed\n");
  process.exit(status.status ?? 1);
}
if (!status.stdout.trim()) {
  console.log("Nothing new to commit");
  process.exit(0);
}

const message = `Release v${version.versionName}`;
const commit = git(["commit", "-m", message]);
if (commit.stdout) process.stdout.write(commit.stdout);
if (commit.stderr) process.stderr.write(commit.stderr);
if (commit.status !== 0) process.exit(commit.status ?? 1);
console.log(`✓  Committed ${message}`);
