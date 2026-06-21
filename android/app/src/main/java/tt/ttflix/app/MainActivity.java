package tt.ttflix.app;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.io.File;

public class MainActivity extends BridgeActivity {

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
    }

    /**
     * Exposed to JavaScript as window.AndroidDownloader
     * Uses the system DownloadManager so the APK downloads in the background
     * with a native progress notification, then auto-prompts to install.
     */
    public class DownloadBridge {
        @JavascriptInterface
        public void downloadApk(String url, String fileName) {
            try {
                // Delete any previous download with the same name
                File dest = new File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                    fileName);
                if (dest.exists()) dest.delete();

                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setTitle("TTFlix Update");
                request.setDescription("Downloading update…");
                request.setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(
                    Environment.DIRECTORY_DOWNLOADS, fileName);
                request.setMimeType("application/vnd.android.package-archive");
                request.addRequestHeader("User-Agent",
                    "Mozilla/5.0 (Linux; Android 13; Pixel 7) "
                    + "AppleWebKit/537.36 (KHTML, like Gecko) "
                    + "Chrome/124.0.0.0 Mobile Safari/537.36");

                DownloadManager dm = (DownloadManager)
                    getSystemService(Context.DOWNLOAD_SERVICE);
                long downloadId = dm.enqueue(request);

                // Register a one-shot receiver to fire the install intent when done
                BroadcastReceiver receiver = new BroadcastReceiver() {
                    @Override
                    public void onReceive(Context ctx, Intent intent) {
                        long id = intent.getLongExtra(
                            DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                        if (id != downloadId) return;

                        try { ctx.unregisterReceiver(this); } catch (Exception ignored) {}

                        // Check the download actually succeeded
                        DownloadManager.Query q = new DownloadManager.Query();
                        q.setFilterById(downloadId);
                        try (Cursor c = dm.query(q)) {
                            if (c != null && c.moveToFirst()) {
                                int statusCol = c.getColumnIndex(
                                    DownloadManager.COLUMN_STATUS);
                                int status = statusCol >= 0
                                    ? c.getInt(statusCol)
                                    : DownloadManager.STATUS_FAILED;
                                if (status != DownloadManager.STATUS_SUCCESSFUL) {
                                    // Notify JS that download failed
                                    runOnUiThread(() -> notifyDownloadResult(false));
                                    return;
                                }
                            }
                        }

                        // Trigger install
                        runOnUiThread(() -> {
                            try {
                                File apk = new File(
                                    Environment.getExternalStoragePublicDirectory(
                                        Environment.DIRECTORY_DOWNLOADS), fileName);
                                Uri apkUri = FileProvider.getUriForFile(
                                    MainActivity.this,
                                    getPackageName() + ".fileprovider",
                                    apk);
                                Intent install = new Intent(Intent.ACTION_VIEW);
                                install.setDataAndType(apkUri,
                                    "application/vnd.android.package-archive");
                                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                                    | Intent.FLAG_ACTIVITY_NEW_TASK);
                                startActivity(install);
                                notifyDownloadResult(true);
                            } catch (Exception e) {
                                notifyDownloadResult(false);
                            }
                        });
                    }
                };

                IntentFilter filter = new IntentFilter(
                    DownloadManager.ACTION_DOWNLOAD_COMPLETE);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
                } else {
                    registerReceiver(receiver, filter);
                }

                // Tell JS the download has been queued successfully
                runOnUiThread(() -> notifyDownloadQueued());

            } catch (Exception e) {
                runOnUiThread(() -> notifyDownloadResult(false));
            }
        }
    }

    private void notifyDownloadQueued() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('apkDownloadQueued'));", null);
        }
    }

    private void notifyDownloadResult(boolean success) {
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('apkDownloadDone',"
                + "{detail:{success:" + success + "}}));", null);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // Fire androidresume into the WebView so WatchPage can save progress
        // when PlayerActivity closes and we return here
        runOnUiThread(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('androidresume'));", null);
            }
        });
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Lock portrait on phones, leave unspecified on TV (TV is always landscape)
        if (!getPackageManager().hasSystemFeature("android.software.leanback")) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT);
        }

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().clearCache(true);

            getBridge().getWebView().setVerticalScrollBarEnabled(false);
            getBridge().getWebView().setHorizontalScrollBarEnabled(false);

            getBridge().getWebView().getSettings().setJavaScriptEnabled(true);
            getBridge().getWebView().getSettings().setDomStorageEnabled(true);
            getBridge().getWebView().getSettings().setAllowUniversalAccessFromFileURLs(true);
            getBridge().getWebView().getSettings().setAllowFileAccessFromFileURLs(true);

            // Register orientation bridge
            getBridge().getWebView().addJavascriptInterface(new OrientationBridge(), "AndroidOrientation");

            // Register player bridge so JS can call window.AndroidPlayer.open(url)
            getBridge().getWebView().addJavascriptInterface(new PlayerBridge(), "AndroidPlayer");

            // Register download bridge so JS can call window.AndroidDownloader.downloadApk(url, name)
            getBridge().getWebView().addJavascriptInterface(new DownloadBridge(), "AndroidDownloader");

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

            getBridge().getWebView().setWebViewClient(new com.getcapacitor.BridgeWebViewClient(getBridge()) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    String url = request.getUrl().toString();
                    if (url.startsWith("capacitor://") || url.startsWith("http://localhost")) {
                        return false;
                    }
                    if (url.contains("videasy.net")) {
                        return false;
                    }
                    return true;
                }
            });
        }
        setupImmersiveMode();
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

        decorView.setOnSystemUiVisibilityChangeListener(visibility -> {
            if ((visibility & View.SYSTEM_UI_FLAG_FULLSCREEN) == 0) {
                decorView.postDelayed(() -> applyImmersiveFlags(decorView), 300);
            }
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

    private void applyImmersiveFlags(View decorView) {
        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
        decorView.setSystemUiVisibility(flags);
    }
}
