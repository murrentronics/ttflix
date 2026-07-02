package tt.ttflix.app;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

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
    public class PlayerBridge {        @JavascriptInterface
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
            runOnUiThread(() -> {
                Intent intent = new Intent(MainActivity.this, PlayerActivity.class);
                intent.putExtra(PlayerActivity.EXTRA_URL, url);
                intent.putExtra(PlayerActivity.EXTRA_NEXT_URL, nextUrl);
                intent.putExtra(PlayerActivity.EXTRA_EPISODE_COUNT, epCount);
                intent.putExtra(PlayerActivity.EXTRA_TOTAL_SEASONS, seasons);
                intent.putExtra(PlayerActivity.EXTRA_EPISODE_COUNTS, episodeCounts);
                startActivity(intent);
            });
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // Fire androidresume into the WebView so WatchPage can save progress.
        // Pass the last played season/episode so Continue Watching saves the
        // correct episode even if the user nexted through several episodes natively.
        final int season  = PlayerActivity.lastPlayedSeason;
        final int episode = PlayerActivity.lastPlayedEpisode;
        runOnUiThread(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                String detail = (season > 0 && episode > 0)
                    ? "{season:" + season + ",episode:" + episode + "}"
                    : "{}";
                getBridge().getWebView().evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('androidresume',{detail:" + detail + "}));", null);
            }
        });
        justResumed = true;
        new android.os.Handler(android.os.Looper.getMainLooper())
            .postDelayed(() -> justResumed = false, 1000);
    }

    private boolean justResumed = false;

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
            // Disable long-press context menu (image save, copy link etc.)
            getBridge().getWebView().setLongClickable(false);
            getBridge().getWebView().setOnLongClickListener(v -> true);

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
                    // Handle tel: links — open the native dialer
                    if (url.startsWith("tel:")) {
                        Intent dialIntent = new Intent(Intent.ACTION_DIAL,
                            android.net.Uri.parse(url));
                        dialIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(dialIntent);
                        return true;
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
