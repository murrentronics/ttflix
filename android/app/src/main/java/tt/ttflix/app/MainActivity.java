package tt.ttflix.app;

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
import android.webkit.WebViewClient;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Exposed to JavaScript as window.AndroidOrientation */
    public class OrientationBridge {
        @JavascriptInterface
        public void lockLandscape() {
            runOnUiThread(() ->
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE));
        }

        @JavascriptInterface
        public void lockPortrait() {
            runOnUiThread(() ->
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT));
        }

        @JavascriptInterface
        public void unlock() {
            runOnUiThread(() ->
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT));
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().clearCache(true);

            // Disable the native Android scrollbar drawn by WebView
            getBridge().getWebView().setVerticalScrollBarEnabled(false);
            getBridge().getWebView().setHorizontalScrollBarEnabled(false);

            // Allow cross-origin postMessages from Videasy iframe to reach the app
            getBridge().getWebView().getSettings().setJavaScriptEnabled(true);
            getBridge().getWebView().getSettings().setDomStorageEnabled(true);
            getBridge().getWebView().getSettings().setAllowUniversalAccessFromFileURLs(true);
            getBridge().getWebView().getSettings().setAllowFileAccessFromFileURLs(true);

            // Register orientation bridge so JS can call window.AndroidOrientation.lockLandscape() etc.
            getBridge().getWebView().addJavascriptInterface(new OrientationBridge(), "AndroidOrientation");

            // Override UA globally — removes the "wv" WebView marker so stream
            // sites don't detect and block Capacitor's WebView
            String cleanUA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) "
                + "AppleWebKit/537.36 (KHTML, like Gecko) "
                + "Chrome/124.0.0.0 Mobile Safari/537.36";
            getBridge().getWebView().getSettings().setUserAgentString(cleanUA);

            // Block all new window / popup / ad redirect attempts from iframes
            getBridge().getWebView().setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onCreateWindow(WebView view, boolean isDialog,
                                              boolean isUserGesture, android.os.Message resultMsg) {
                    // Return false = deny all popup/new-tab requests from the player iframe
                    return false;
                }
            });

            // Block navigation away from the app origin
            // Allow embed.st and streamed.pk so live sports iframes can load
            getBridge().getWebView().setWebViewClient(new com.getcapacitor.BridgeWebViewClient(getBridge()) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    String url = request.getUrl().toString();
                    // Always allow internal app URLs
                    if (url.startsWith("capacitor://") || url.startsWith("http://localhost")) {
                        return false;
                    }
                    // Allow live sports stream domains
                    if (url.contains("videasy.net")) {
                        return false;
                    }                    // Block everything else (ad redirects, external links)
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

        // Re-apply immersive flags whenever system UI becomes visible (status bar swipe)
        // This hides it again quickly so the WebView doesn't think it lost focus
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
