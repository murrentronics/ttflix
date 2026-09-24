package tt.ttflix.app;

import android.Manifest;
import android.app.DownloadManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.util.List;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    static MainActivity instance;

    /** Exposed to JavaScript as window.AndroidOrientation */
    public class OrientationBridge {
        private boolean isTV() {
            return getPackageManager().hasSystemFeature("android.software.leanback");
        }

        @JavascriptInterface
        public void lockLandscape() {
            if (isTV()) return; // TV is always landscape, nothing to lock
            runOnUiThread(() ->
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE));
        }

        @JavascriptInterface
        public void lockPortrait() {
            if (isTV()) return;
            runOnUiThread(() ->
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT));
        }

        @JavascriptInterface
        public void unlock() {
            if (isTV()) return;
            runOnUiThread(() ->
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT));
        }
    }

    /** Exposed to JavaScript as window.AndroidDevice — device capability info */
    public class DeviceBridge {
        @JavascriptInterface
        public boolean isTV() {
            return getPackageManager().hasSystemFeature("android.software.leanback");
        }
    }

    /** Exposed to JavaScript as window.AndroidDial — opens the native phone dialer */
    public class DialBridge {
        @JavascriptInterface
        public void call(String number) {
            // Strip everything except digits and leading +
            String cleaned = number.replaceAll("[^\\d+]", "");
            runOnUiThread(() -> {
                Intent dialIntent = new Intent(Intent.ACTION_DIAL,
                    android.net.Uri.parse("tel:" + cleaned));
                dialIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(dialIntent);
            });
        }
    }

    /** Exposed to JavaScript as window.AndroidPlayer — launches PlayerActivity */
    public class PlayerBridge {
        @JavascriptInterface
        public void open(String url) {
            runOnUiThread(() -> {
                Intent intent = new Intent(MainActivity.this, PlayerActivity.class);
                intent.putExtra(PlayerActivity.EXTRA_URL, url);
                startActivity(intent);
            });
        }

        @JavascriptInterface
        public void openWithFallback(String url, String fallbackUrl) {
            runOnUiThread(() -> {
                Intent intent = new Intent(MainActivity.this, PlayerActivity.class);
                intent.putExtra(PlayerActivity.EXTRA_URL, url);
                intent.putExtra(PlayerActivity.EXTRA_FALLBACK_URL, fallbackUrl);
                startActivity(intent);
            });
        }

        @JavascriptInterface
        public void openWithNext(String url, String nextUrl, int epCount, int seasons, String episodeCounts) {
            openPlayer(url, nextUrl, epCount, seasons, episodeCounts, false, "");
        }

        @JavascriptInterface
        public void openWithNextEx(String url, String nextUrl, int epCount, int seasons,
                                   String episodeCounts, boolean startOver, String tmdbId) {
            openPlayer(url, nextUrl, epCount, seasons, episodeCounts, startOver, tmdbId);
        }

        private void openPlayer(String url, String nextUrl, int epCount, int seasons,
                                String episodeCounts, boolean startOver, String tmdbId) {
            runOnUiThread(() -> {
                Intent intent = new Intent(MainActivity.this, PlayerActivity.class);
                intent.putExtra(PlayerActivity.EXTRA_URL, url);
                intent.putExtra(PlayerActivity.EXTRA_NEXT_URL, nextUrl);
                intent.putExtra(PlayerActivity.EXTRA_EPISODE_COUNT, epCount);
                intent.putExtra(PlayerActivity.EXTRA_TOTAL_SEASONS, seasons);
                intent.putExtra(PlayerActivity.EXTRA_EPISODE_COUNTS, episodeCounts);
                intent.putExtra(PlayerActivity.EXTRA_START_OVER, startOver);
                intent.putExtra(PlayerActivity.EXTRA_TMDB_ID, tmdbId != null ? tmdbId : "");
                startActivity(intent);
            });
        }

        /** Push full per-season episode counts after TMDB finishes loading. */
        @JavascriptInterface
        public void setSeasonCounts(String episodeCounts, int seasons) {
            runOnUiThread(() -> {
                if (PlayerActivity.current != null) {
                    PlayerActivity.current.updateSeasonCounts(episodeCounts, seasons);
                }
            });
        }

        /** Latest playback position captured by PlayerActivity (JSON). */
        @JavascriptInterface
        public String getProgress() {
            return "{\"season\":" + PlayerActivity.lastPlayedSeason
                + ",\"episode\":" + PlayerActivity.lastPlayedEpisode
                + ",\"watched\":" + PlayerActivity.lastWatchedSeconds
                + ",\"duration\":" + PlayerActivity.lastDurationSeconds + "}";
        }
    }

    /**
     * Downloads the APK from ttflix.pages.dev into the device Downloads folder
     * (same file the public download page serves) and opens it when ready.
     */
    public class ApkBridge {
        private static final String PAGES_APK_PREFIX = "https://ttflix.pages.dev/ttflix.apk";
        private volatile long lastDownloadId = -1;
        private volatile String lastFilename = "TTFlix.apk";
        private volatile String failReason = null;
        private volatile long lastBytes = 0;
        private volatile long lastProgressAt = 0;
        private volatile long startedAt = 0;
        private static final long STALL_MS = 45_000;

        private String safeName(String filename) {
            String name = filename == null ? "" : filename.replaceAll("[^A-Za-z0-9._-]", "");
            if (!name.toLowerCase().endsWith(".apk")) name = "TTFlix.apk";
            if (name.length() > 80) name = "TTFlix.apk";
            return name;
        }

        @JavascriptInterface
        public void download(String url, String filename) {
            if (url == null || !url.startsWith(PAGES_APK_PREFIX)) return;
            final String name = safeName(filename);
            lastFilename = name;
            failReason = null;
            lastBytes = 0;
            startedAt = System.currentTimeMillis();
            lastProgressAt = startedAt;
            // Mark pending before the UI-thread enqueue so status() doesn't
            // report an older APK as already finished.
            final long previousId = lastDownloadId;
            lastDownloadId = -2;
            runOnUiThread(() -> {
                try {
                    DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                    if (dm == null) {
                        failReason = "Download manager unavailable";
                        lastDownloadId = -1;
                        return;
                    }
                    if (previousId > 0) {
                        try { dm.remove(previousId); } catch (Exception ignored) {}
                    }
                    File dest = new File(
                        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                        name
                    );
                    if (dest.exists()) {
                        //noinspection ResultOfMethodCallIgnored
                        dest.delete();
                    }
                    DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                    req.setTitle("TTFlix");
                    req.setDescription("Saving to Downloads");
                    req.setMimeType("application/vnd.android.package-archive");
                    req.setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    req.setAllowedOverMetered(true);
                    req.setAllowedOverRoaming(true);
                    req.setAllowedNetworkTypes(
                        DownloadManager.Request.NETWORK_WIFI | DownloadManager.Request.NETWORK_MOBILE);
                    req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                    lastDownloadId = dm.enqueue(req);
                    startedAt = System.currentTimeMillis();
                    lastProgressAt = startedAt;
                    lastBytes = 0;
                } catch (Exception e) {
                    failReason = "Couldn't start the download";
                    lastDownloadId = -1;
                }
            });
        }

        @JavascriptInterface
        public String status() {
            JSONObject o = new JSONObject();
            try {
                o.put("file", lastFilename);
                if (failReason != null && lastDownloadId < 0) {
                    o.put("state", "failed");
                    o.put("progress", 0);
                    o.put("error", failReason);
                    return o.toString();
                }
                if (lastDownloadId == -2) {
                    if (System.currentTimeMillis() - startedAt > 8_000) {
                        failReason = "Couldn't start the download";
                        lastDownloadId = -1;
                        o.put("state", "failed");
                        o.put("progress", 0);
                        o.put("error", failReason);
                        return o.toString();
                    }
                    o.put("state", "running");
                    o.put("progress", 0);
                    return o.toString();
                }
                if (lastDownloadId < 0) {
                    File dest = new File(
                        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                        lastFilename
                    );
                    if (dest.exists() && dest.length() > 1000) {
                        o.put("state", "done");
                        o.put("progress", 100);
                        return o.toString();
                    }
                    o.put("state", "idle");
                    o.put("progress", 0);
                    return o.toString();
                }
                DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                if (dm == null) {
                    o.put("state", "failed");
                    o.put("progress", 0);
                    o.put("error", "Download manager unavailable");
                    return o.toString();
                }
                DownloadManager.Query q = new DownloadManager.Query().setFilterById(lastDownloadId);
                Cursor c = dm.query(q);
                if (c == null || !c.moveToFirst()) {
                    if (c != null) c.close();
                    failReason = "Download stopped";
                    lastDownloadId = -1;
                    o.put("state", "failed");
                    o.put("progress", 0);
                    o.put("error", failReason);
                    return o.toString();
                }
                int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                int reason = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                long soFar = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                long total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                c.close();
                int pct = (total > 0) ? (int) Math.min(99, (soFar * 100) / total) : 0;
                o.put("bytes", soFar);
                long now = System.currentTimeMillis();
                if (soFar > lastBytes) {
                    lastBytes = soFar;
                    lastProgressAt = now;
                }
                boolean stalled = now - Math.max(lastProgressAt, startedAt) > STALL_MS;
                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    o.put("state", "done");
                    o.put("progress", 100);
                } else if (status == DownloadManager.STATUS_FAILED || stalled) {
                    try { dm.remove(lastDownloadId); } catch (Exception ignored) {}
                    lastDownloadId = -1;
                    failReason = stalled ? "Download stalled" : "Download failed";
                    o.put("state", "failed");
                    o.put("progress", pct);
                    o.put("error", failReason);
                } else if (status == DownloadManager.STATUS_PAUSED
                    && reason == DownloadManager.PAUSED_WAITING_FOR_NETWORK) {
                    o.put("state", "running");
                    o.put("progress", pct);
                    o.put("error", "Waiting for connection");
                } else {
                    o.put("state", "running");
                    o.put("progress", pct);
                }
            } catch (Exception e) {
                try {
                    o.put("state", "failed");
                    o.put("progress", 0);
                    o.put("error", e.getMessage() != null ? e.getMessage() : "error");
                } catch (Exception ignored) {}
            }
            return o.toString();
        }

        @JavascriptInterface
        public String open() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    if (!getPackageManager().canRequestPackageInstalls()) {
                        runOnUiThread(() -> {
                            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                            settings.setData(Uri.parse("package:" + getPackageName()));
                            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(settings);
                        });
                        return "need_permission";
                    }
                }
                DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                Uri uri = null;
                if (dm != null && lastDownloadId > 0) {
                    uri = dm.getUriForDownloadedFile(lastDownloadId);
                }
                if (uri == null) {
                    File dest = new File(
                        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                        lastFilename
                    );
                    if (!dest.exists()) return "failed";
                    uri = FileProvider.getUriForFile(
                        MainActivity.this,
                        getPackageName() + ".fileprovider",
                        dest
                    );
                }
                final Uri apkUri = uri;
                runOnUiThread(() -> {
                    Intent install = new Intent(Intent.ACTION_VIEW);
                    install.setDataAndType(apkUri, "application/vnd.android.package-archive");
                    install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    List<ResolveInfo> res = getPackageManager().queryIntentActivities(install, PackageManager.MATCH_DEFAULT_ONLY);
                    for (ResolveInfo ri : res) {
                        grantUriPermission(
                            ri.activityInfo.packageName,
                            apkUri,
                            Intent.FLAG_GRANT_READ_URI_PERMISSION
                        );
                    }
                    startActivity(install);
                });
                return "ok";
            } catch (Exception e) {
                return "failed";
            }
        }
    }

    public class NotifyBridge {
        @JavascriptInterface
        public void start(String url, String anon, String token, String refresh) {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33) {
                    if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
                        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 77);
                    }
                }
                try {
                    PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                    SharedPreferences sp = getSharedPreferences(AdminAlertService.PREFS, MODE_PRIVATE);
                    if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())
                        && !sp.getBoolean("asked_battery", false)) {
                        sp.edit().putBoolean("asked_battery", true).apply();
                        Intent batt = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                        batt.setData(Uri.parse("package:" + getPackageName()));
                        startActivity(batt);
                    }
                } catch (Exception ignored) {}
                AdminAlertService.requestStart(MainActivity.this, url, anon, token, refresh);
            });
        }

        @JavascriptInterface
        public void pollNow() {
            runOnUiThread(() -> AdminAlertService.requestPollNow(MainActivity.this));
        }

        @JavascriptInterface
        public void stop() {
            runOnUiThread(() -> AdminAlertService.requestStop(MainActivity.this));
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != 77) return;
        SharedPreferences sp = getSharedPreferences(AdminAlertService.PREFS, MODE_PRIVATE);
        if (!sp.getBoolean("enabled", false)) return;
        AdminAlertService.requestStart(
            this,
            sp.getString("url", ""),
            sp.getString("anon", ""),
            sp.getString("token", ""),
            sp.getString("refresh", "")
        );
    }

    void pingActiveWatch() {
        runOnUiThread(() -> {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            getBridge().getWebView().evaluateJavascript(
                "window.__ttflixPingWatch && window.__ttflixPingWatch();",
                null
            );
        });
    }

    /** Native Next Episode — persist the new S/E while PlayerActivity is still open. */
    void notifyNextEpisode(int season, int episode) {
        runOnUiThread(() -> {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('androidNextEpisode',{detail:{season:"
                    + season + ",episode:" + episode + "}}));",
                null
            );
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        // Fire androidresume into the WebView so WatchPage can save progress.
        // Pass the last played season/episode so Continue Watching saves the
        // correct episode even if the user nexted through several episodes natively.
        final int season   = PlayerActivity.lastPlayedSeason;
        final int episode  = PlayerActivity.lastPlayedEpisode;
        final int watched  = PlayerActivity.lastWatchedSeconds;
        final int duration = PlayerActivity.lastDurationSeconds;
        runOnUiThread(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                String detail = "{season:" + season
                    + ",episode:" + episode
                    + ",watched:" + watched
                    + ",duration:" + duration + "}";
                getBridge().getWebView().evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('androidresume',{detail:" + detail + "}));", null);
            }
        });
        justResumed = true;
        new android.os.Handler(android.os.Looper.getMainLooper())
            .postDelayed(() -> justResumed = false, 1000);
    }

    private boolean justResumed = false;
    private boolean imeWasOpen = false;
    private boolean keyboardWanted = false;
    private int keyboardGen = 0;

    /**
     * Intercept the hardware Back key (TV remote Back button).
     * Dispatch it into the WebView as a KeyboardEvent so JS modal handlers
     * can catch it and close modals. If JS doesn't consume it (no modal open),
     * move the app to background — never exit.
     * Suppressed for 1s after resuming from PlayerActivity so Back doesn't
     * chain-exit both the player and the app in one gesture.
     */
    @Override
    public void onBackPressed() {
        if (justResumed) {
            // Just returned from PlayerActivity — eat this Back press
            justResumed = false;
            return;
        }
        // First check if WebView can go back
        if (getBridge() != null && getBridge().getWebView() != null) {
            final WebView webView = getBridge().getWebView();
            // Dispatch GoBack keyboard event into the WebView
            webView.evaluateJavascript(
                "(function(){" +
                "  var e = new KeyboardEvent('keydown', {key:'GoBack',bubbles:true,cancelable:true});" +
                "  var consumed = !document.dispatchEvent(e);" +
                "  return consumed ? 'consumed' : 'default';" +
                "})()",
                result -> {
                    if (result != null && result.contains("consumed")) return;
                    // If JS didn't consume it, check WebView history
                    runOnUiThread(() -> {
                        if (webView.canGoBack()) {
                            webView.goBack();
                        } else {
                            moveTaskToBack(true);
                        }
                    });
                }
            );
        } else {
            moveTaskToBack(true);
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;

        // Lock portrait on phones, leave unspecified on TV (TV is always landscape)
        if (!getPackageManager().hasSystemFeature("android.software.leanback")) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT);
        }

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setVerticalScrollBarEnabled(false);
            getBridge().getWebView().setHorizontalScrollBarEnabled(false);

            getBridge().getWebView().getSettings().setJavaScriptEnabled(true);
            getBridge().getWebView().getSettings().setDomStorageEnabled(true);
            getBridge().getWebView().getSettings().setAllowUniversalAccessFromFileURLs(true);
            getBridge().getWebView().getSettings().setAllowFileAccessFromFileURLs(true);
            // Disable long-press context menu (image save, copy link etc.)
            getBridge().getWebView().setLongClickable(false);
            getBridge().getWebView().setOnLongClickListener(v -> true);
            getBridge().getWebView().setFocusable(true);
            getBridge().getWebView().setFocusableInTouchMode(true);

            // Register orientation bridge
            getBridge().getWebView().addJavascriptInterface(new OrientationBridge(), "AndroidOrientation");

            // Register device bridge so JS can call window.AndroidDevice.isTV()
            getBridge().getWebView().addJavascriptInterface(new DeviceBridge(), "AndroidDevice");

            // Register player bridge so JS can call window.AndroidPlayer.open(url)
            getBridge().getWebView().addJavascriptInterface(new PlayerBridge(), "AndroidPlayer");

            String cleanUA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) "
                + "AppleWebKit/537.36 (KHTML, like Gecko) "
                + "Chrome/124.0.0.0 Mobile Safari/537.36";
            getBridge().getWebView().getSettings().setUserAgentString(cleanUA);

            getBridge().getWebView().setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onCreateWindow(WebView view, boolean isDialog,
                                              boolean isUserGesture, android.os.Message resultMsg) {
                    return false;
                }
            });

            // Register dial bridge so JS can call window.AndroidDial.call(number)
            getBridge().getWebView().addJavascriptInterface(new DialBridge(), "AndroidDial");

            getBridge().getWebView().addJavascriptInterface(new ApkBridge(), "AndroidApk");
            getBridge().getWebView().addJavascriptInterface(new NotifyBridge(), "AndroidNotify");
            getBridge().getWebView().addJavascriptInterface(new KeyboardBridge(), "AndroidKeyboard");

            getBridge().getWebView().setWebViewClient(new com.getcapacitor.BridgeWebViewClient(getBridge()) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    String url = request.getUrl().toString();
                    // Handle tel: links — open the native dialer
                    if (url.startsWith("tel:")) {
                        Intent dialIntent = new Intent(Intent.ACTION_DIAL,
                            android.net.Uri.parse(url));
                        dialIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(dialIntent);
                        return true;
                    }
                    if (isBlockedAd(request.getUrl())) return true;
                    // Let Capacitor serve the app origin (https://app.ttflix.tt)
                    // and allowNavigation hosts. Returning true here blanks the WebView.
                    return super.shouldOverrideUrlLoading(view, request);
                }

                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    WebResourceResponse unlocked = EmbedUnlock.rewrite(request);
                    if (unlocked != null) return unlocked;
                    if (request != null && isBlockedAd(request.getUrl())) return emptyAdResponse();
                    return super.shouldInterceptRequest(view, request);
                }
            });
        }
        setupImmersiveMode();
    }

    /** Popunder hosts and the hidden /ad.html frame the sports player injects. */
    private boolean isBlockedAd(Uri uri) {
        if (uri == null) return false;
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
        String path = uri.getPath() == null ? "" : uri.getPath().toLowerCase();
        if (path.equals("/ad.html") || path.endsWith("/ad.html")) return true;
        String[] blocked = {
            "enteringlacquergiant.com",
            "histats.com",
            "onepyrincehyarey.org",
            "popads.net",
            "popcash.net",
            "exoclick.com",
            "propellerads.com",
            "adsterra.com",
            "hilltopads.net"
        };
        for (String b : blocked) {
            if (host.equals(b) || host.endsWith("." + b)) return true;
        }
        return false;
    }

    private WebResourceResponse emptyAdResponse() {
        return new WebResourceResponse(
            "text/html",
            "utf-8",
            new ByteArrayInputStream(new byte[0])
        );
    }

    private void setupImmersiveMode() {
        Window window = getWindow();
        View decorView = window.getDecorView();

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowCompat.setDecorFitsSystemWindows(window, false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
        }

        applyImmersiveFlags(decorView);

        ViewCompat.setOnApplyWindowInsetsListener(decorView, (v, insets) -> {
            boolean ime = insets.isVisible(WindowInsetsCompat.Type.ime());
            if (ime && !imeWasOpen) {
                v.post(this::revealKeyboard);
            } else if (imeWasOpen && !ime && !keyboardWanted) {
                v.post(this::restoreImmersive);
            }
            imeWasOpen = ime;
            return insets;
        });

        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, decorView);
        if (controller != null) {
            controller.setAppearanceLightStatusBars(false);
            controller.setAppearanceLightNavigationBars(false);
            controller.hide(WindowInsetsCompat.Type.navigationBars());
            controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
        }
    }

    /** Drop fullscreen so the soft keyboard draws on top of the app, not behind it. */
    private void revealKeyboard() {
        Window window = getWindow();
        View decorView = window.getDecorView();
        WindowCompat.setDecorFitsSystemWindows(window, true);
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        decorView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, decorView);
        if (controller != null) {
            controller.show(WindowInsetsCompat.Type.navigationBars());
            controller.show(WindowInsetsCompat.Type.ime());
        }
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebView webView = getBridge().getWebView();
        webView.requestFocus();
        InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (imm != null) imm.showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT);
    }

    private void restoreImmersive() {
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        applyImmersiveFlags(window.getDecorView());
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.navigationBars());
        }
    }

    /** Exposed to JavaScript as window.AndroidKeyboard */
    public class KeyboardBridge {
        @JavascriptInterface
        public void open() {
            keyboardWanted = true;
            final int gen = ++keyboardGen;
            runOnUiThread(() -> {
                if (gen != keyboardGen) return;
                revealKeyboard();
            });
        }

        @JavascriptInterface
        public void close() {
            keyboardWanted = false;
            final int gen = ++keyboardGen;
            runOnUiThread(() -> {
                if (gen != keyboardGen || keyboardWanted) return;
                if (getBridge() != null && getBridge().getWebView() != null) {
                    InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                    if (imm != null) {
                        imm.hideSoftInputFromWindow(getBridge().getWebView().getWindowToken(), 0);
                    }
                }
                restoreImmersive();
            });
        }
    }

    private void applyImmersiveFlags(View decorView) {
        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
        decorView.setSystemUiVisibility(flags);
    }

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }
}
