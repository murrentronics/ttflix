package tt.ttflix.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Edge-to-edge before setContentView
        setupEdgeToEdge();
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Re-apply immersive when returning from background
        applyImmersive();
        setupWebViewAdBlocking();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyImmersive();
    }

    private void setupEdgeToEdge() {
        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
        }

        // Status bar: black (for notch strip) — content slides under it
        window.setStatusBarColor(Color.BLACK);
        // Nav bar: black
        window.setNavigationBarColor(Color.BLACK);

        // Notch/cutout: extend content into cutout area
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }
    }

    private void applyImmersive() {
        Window window = getWindow();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                // Show status bar (black strip with time/battery) but hide nav bar
                controller.show(WindowInsets.Type.statusBars());
                controller.hide(WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
            // Light icons on dark (black) status bar
            View decorView = window.getDecorView();
            int flags = decorView.getWindowInsetsController() != null ? 0 : 0;
            // Use setAppearanceLightStatusBars(false) — white icons on black bar
            if (window.getInsetsController() != null) {
                window.getInsetsController().setSystemBarsAppearance(
                    0,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                );
            }
        } else {
            // Android 9/10
            int flags =
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
            // Keep status bar visible but transparent — content goes under it
            window.getDecorView().setSystemUiVisibility(flags);
        }
    }

    private void setupWebViewAdBlocking() {
        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return shouldBlock(request.getUrl().toString());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return shouldBlock(url);
            }

            private boolean shouldBlock(String url) {
                if (url == null) return false;
                // Allow our app + key services
                if (url.startsWith("https://localhost") ||
                    url.startsWith("capacitor://") ||
                    url.contains("supabase.co") ||
                    url.contains("themoviedb.org") ||
                    url.contains("tmdb.org") ||
                    url.contains("videasy.net") ||
                    url.contains("videasy.to") ||
                    url.endsWith(".m3u8") ||
                    url.endsWith(".ts") ||
                    url.endsWith(".mp4") ||
                    url.startsWith("data:")) {
                    return false; // allow
                }
                // Block everything else (ads, redirects, trackers)
                return true;
            }
        });

        webView.setOnLongClickListener(v -> true);
        webView.setLongClickable(false);
    }
}
