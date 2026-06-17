package tt.ttflix.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class PlayerActivity extends Activity {

    private WebView playerWebView;
    public static final String EXTRA_URL = "player_url";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Full screen, no title bar
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN |
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            WindowManager.LayoutParams.FLAG_FULLSCREEN |
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );

        // Lock landscape
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);

        // Immersive mode
        setupImmersiveMode();

        // Root layout
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        root.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        // Player WebView — fills the whole screen
        playerWebView = new WebView(this);
        FrameLayout.LayoutParams webParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        );
        playerWebView.setLayoutParams(webParams);
        playerWebView.setBackgroundColor(Color.BLACK);

        WebSettings settings = playerWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false); // key: allows autoplay
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(true);
        settings.setSupportMultipleWindows(true); // needed for onCreateWindow to fire
        settings.setAllowContentAccess(true);
        settings.setDatabaseEnabled(true);
        // Allow mixed content so Videasy can load video from any protocol
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        // Match the same UA as the main app so Videasy doesn't block it
        settings.setUserAgentString(
            "Mozilla/5.0 (Linux; Android 13; Pixel 7) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/124.0.0.0 Mobile Safari/537.36"
        );

        // Allow Videasy to open sub-frames (needed for some video sources)
        playerWebView.setWebChromeClient(new WebChromeClient() {
            private WebView mCustomView;
            private CustomViewCallback mCustomViewCallback;

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                // Videasy goes fullscreen — show the custom view over everything
                mCustomView = (view instanceof WebView) ? (WebView) view : null;
                mCustomViewCallback = callback;
                root.addView(view, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                ));
                setupImmersiveMode();
            }

            @Override
            public void onHideCustomView() {
                if (mCustomView != null) {
                    root.removeView(mCustomView);
                    mCustomView = null;
                }
                if (mCustomViewCallback != null) mCustomViewCallback.onCustomViewHidden();
                setupImmersiveMode();
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog,
                                          boolean isUserGesture, android.os.Message resultMsg) {
                // Allow Videasy to create sub-windows for video playback
                WebView newWebView = new WebView(PlayerActivity.this);
                newWebView.getSettings().setJavaScriptEnabled(true);
                newWebView.getSettings().setMediaPlaybackRequiresUserGesture(false);
                newWebView.setWebViewClient(new WebViewClient());
                root.addView(newWebView, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                ));
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(newWebView);
                resultMsg.sendToTarget();
                return true;
            }
        });

        playerWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Allow all navigation within the player — Videasy uses multiple domains
                // for CDN, video sources, and subtitles. Only block obvious ad networks.
                String url = request.getUrl().toString();
                String host = request.getUrl().getHost() != null ? request.getUrl().getHost() : "";
                // Block known ad/tracker domains
                if (host.contains("doubleclick.net") || host.contains("googlesyndication.com")
                        || host.contains("adservice.google") || host.contains("amazon-adsystem.com")
                        || host.contains("moatads.com") || host.contains("outbrain.com")
                        || host.contains("taboola.com")) {
                    return true; // block
                }
                // Allow everything else — Videasy needs its CDN and video sources
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                setupImmersiveMode();
            }
        });

        root.addView(playerWebView);

        // Exit button — drawn natively on top, always visible
        ImageButton exitBtn = new ImageButton(this);
        exitBtn.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
        exitBtn.setBackgroundColor(Color.argb(180, 0, 0, 0));
        exitBtn.setColorFilter(Color.WHITE);
        exitBtn.setContentDescription("Exit");

        int btnSize = dpToPx(48);
        int margin = dpToPx(12);
        FrameLayout.LayoutParams btnParams = new FrameLayout.LayoutParams(btnSize, btnSize);
        btnParams.leftMargin = margin;
        btnParams.topMargin = margin;
        exitBtn.setLayoutParams(btnParams);
        exitBtn.setPadding(dpToPx(10), dpToPx(10), dpToPx(10), dpToPx(10));

        exitBtn.setOnClickListener(v -> finish());
        root.addView(exitBtn);

        setContentView(root);

        // Load the Videasy URL
        String url = getIntent().getStringExtra(EXTRA_URL);
        if (url != null) playerWebView.loadUrl(url);
    }

    @Override
    protected void onResume() {
        super.onResume();
        setupImmersiveMode();
        if (playerWebView != null) playerWebView.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (playerWebView != null) playerWebView.onPause();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (playerWebView != null) {
            playerWebView.stopLoading();
            playerWebView.destroy();
            playerWebView = null;
        }
    }

    @Override
    public void onBackPressed() {
        // Back button = exit player, not navigate within WebView
        finish();
    }

    private void setupImmersiveMode() {
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        View decorView = window.getDecorView();
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decorView);
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN |
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
        }
    }

    private int dpToPx(int dp) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(dp * density);
    }
}
