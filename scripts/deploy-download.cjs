/**
 * Assemble the Cloudflare Pages download site (page + APK + version.json)
 * and deploy it. In-app UpdateChecker already reads
 * https://ttflix.pages.dev/version.json
 *
 * Usage:
 *   node scripts/deploy-download.cjs
 *   node scripts/deploy-download.cjs --apk path\to\app-release.apk
 *   node scripts/deploy-download.cjs --no-deploy
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "download-page");
const PAGES_HOST = "https://ttflix.pages.dev";
const PROJECT = "ttflix";
// Cloudflare account kellymarshall2026 (Workers & Pages → ttflix).
// Do not deploy from a different wrangler login — that creates ttflix-download / ttflix-82k.

const args = process.argv.slice(2);
const noDeploy = args.includes("--no-deploy");
const apkFlag = args.indexOf("--apk");
const apkArg = apkFlag >= 0 ? args[apkFlag + 1] : null;

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function findApk() {
  if (apkArg) {
    const abs = path.resolve(apkArg);
    if (!fs.existsSync(abs)) fail(`APK not found: ${abs}`);
    return abs;
  }
  const dirs = [
    path.join(ROOT, "android", "app", "build", "outputs", "apk", "release"),
    path.join(ROOT, "android", "app", "build", "outputs", "apk", "debug"),
  ];
  const preferred = ["ttflix.apk", "app-release.apk", "app-debug.apk"];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of preferred) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return p;
    }
    const found = fs.readdirSync(dir).filter((f) => f.endsWith(".apk"));
    if (found.length) return path.join(dir, found[0]);
  }
  fail(
    "No APK found. Build one first (Android Studio or gradlew assembleRelease),\n" +
      "or pass --apk path\\to\\your.apk"
  );
}

const version = JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8"));
const apkSrc = findApk();
const apkUrl = `${PAGES_HOST}/ttflix.apk?v=${version.versionCode}`;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "functions"), { recursive: true });

fs.copyFileSync(apkSrc, path.join(OUT, "ttflix.apk"));

const template = fs.readFileSync(path.join(ROOT, "download-page-template.html"), "utf8");
fs.writeFileSync(
  path.join(OUT, "index.html"),
  template
    .replaceAll("VVERSION_PLACEHOLDER", version.versionName)
    .replaceAll("APKURL_PLACEHOLDER", apkUrl)
);

fs.writeFileSync(
  path.join(OUT, "version.json"),
  JSON.stringify(
    {
      versionName: version.versionName,
      versionCode: version.versionCode,
      releaseNotes: version.releaseNotes || "Bug fixes and improvements",
      apkUrl,
    },
    null,
    2
  ) + "\n"
);

fs.writeFileSync(
  path.join(OUT, "_headers"),
  `/ttflix.apk
  Content-Type: application/vnd.android.package-archive
  Content-Disposition: attachment; filename="TTFlix-v${version.versionName}.apk"
  Cache-Control: public, max-age=60, must-revalidate

/version.json
  Content-Type: application/json
  Cache-Control: no-store, no-cache, must-revalidate
`
);

fs.writeFileSync(
  path.join(OUT, "functions", "_middleware.js"),
  `export async function onRequest(context) {
  const country = context.request.headers.get("CF-IPCountry") || "";
  if (country !== "TT" && country !== "XX" && country !== "") {
    return new Response(
      \`<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>Not Available</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;height:100dvh;overflow:hidden;background:#141414;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;text-align:center}.logo{font-size:2.2rem;font-weight:900;margin-bottom:12px}.logo span{color:#e50914}p{color:#888;font-size:.9rem}</style>
      </head><body>
      <div>
        <div class="logo"><span>TT</span>FLIX</div>
        <p>TTFlix is only available in Trinidad &amp; Tobago.</p>
      </div>
      </body></html>\`,
      { status: 403, headers: { "Content-Type": "text/html;charset=utf-8" } }
    );
  }
  return context.next();
}
`
);

const apkMb = (fs.statSync(apkSrc).size / (1024 * 1024)).toFixed(1);
console.log(`✓  Packaged TTFlix v${version.versionName} (build ${version.versionCode})`);
console.log(`   APK: ${apkSrc} (${apkMb} MB)`);
console.log(`   URL: ${apkUrl}`);

if (noDeploy) {
  console.log("   Skipped deploy (--no-deploy). Output is in download-page/");
  process.exit(0);
}

const wrangler = spawnSync(
  "npx",
  ["wrangler", "pages", "deploy", OUT, "--project-name", PROJECT, "--commit-dirty=true"],
  { cwd: ROOT, stdio: "inherit", shell: true }
);

if (wrangler.status !== 0) {
  fail(
    "Cloudflare Pages deploy failed.\n" +
      "Log in with `npx wrangler login` or set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID."
  );
}

console.log(`\n✓  Live at ${PAGES_HOST}`);
console.log("   Download button + in-app updater both use this APK.");

