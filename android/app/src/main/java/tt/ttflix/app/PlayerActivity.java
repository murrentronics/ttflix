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
    private View mCustomView;
    private WebChromeClient.CustomViewCallback mCustomViewCallback;
    private FrameLayout customViewContainer; // dedicated layer for fullscreen video
    private ImageButton exitBtn;
    public static final String EXTRA_URL = "player_url";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN |
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            WindowManager.LayoutParams.FLAG_FULLSCREEN |
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );

        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        setupImmersiveMode();

        // ── Layer 0: root (black background) ──────────────────────────────
        FrameLayout rootLayout = new FrameLayout(this);
        rootLayout.setBackgroundColor(Color.BLACK);
        rootLayout.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        // ── Layer 1: WebView (Videasy player page) ─────────────────────────
        playerWebView = new WebView(this);
        playerWebView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        playerWebView.setBackgroundColor(Color.BLACK);

        WebSettings settings = playerWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false); // allows autoplay
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(true);
        settings.setSupportMultipleWindows(false);
        settings.setAllowContentAccess(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        settings.setUserAgentString(
            "Mozilla/5.0 (Linux; Android 13; Pixel 7) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/124.0.0.0 Mobile Safari/537.36"
        );

        // ── Layer 2: custom view container — for Videasy fullscreen video ──
        // Starts hidden, shown only when onShowCustomView fires
        customViewContainer = new FrameLayout(this);
        customViewContainer.setBackgroundColor(Color.BLACK);
        customViewContainer.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        customViewContainer.setVisibility(View.GONE);

        // ── Layer 3: exit button container — always on top ─────────────────
        FrameLayout exitContainer = new FrameLayout(this);
        exitContainer.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        exitBtn = new ImageButton(this);
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
        exitContainer.addView(exitBtn);

        // Stack layers: WebView → customViewContainer → exitContainer
        rootLayout.addView(playerWebView);
        rootLayout.addView(customViewContainer);
        rootLayout.addView(exitContainer);

        // ── WebChromeClient: handle Videasy fullscreen video ───────────────
        playerWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                mCustomView = view;
                mCustomViewCallback = callback;
                view.setBackgroundColor(Color.BLACK);
                customViewContainer.addView(view, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                ));
                customViewContainer.setVisibility(View.VISIBLE);
                playerWebView.setVisibility(View.GONE);
                setupImmersiveMode();
            }

            @Override
            public void onHideCustomView() {
                customViewContainer.setVisibility(View.GONE);
                customViewContainer.removeAllViews();
                playerWebView.setVisibility(View.VISIBLE);
                if (mCustomViewCallback != null) {
                    mCustomViewCallback.onCustomViewHidden();
                    mCustomViewCallback = null;
                }
                mCustomView = null;
                setupImmersiveMode();
            }
        });

        playerWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String host = request.getUrl().getHost() != null
                    ? request.getUrl().getHost() : "";
                // Block known ad networks only — allow everything else Videasy needs
                if (host.contains("doubleclick.net") || host.contains("googlesyndication.com")
                        || host.contains("adservice.google") || host.contains("amazon-adsystem.com")
                        || host.contains("moatads.com") || host.contains("outbrain.com")
                        || host.contains("taboola.com")) {
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                setupImmersiveMode();
            }
        });

        setContentView(rootLayout);

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
        // If fullscreen video is showing, exit fullscreen first
        if (mCustomView != null && mCustomViewCallback != null) {
            mCustomViewCallback.onCustomViewHidden();
            return;
        }
        finish();
    }

    private void setupImmersiveMode() {
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        View decorView = window.getDecorView();
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, decorView);
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
        }
        decorView.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN |
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    private int dpToPx(int dp) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(dp * density);
    }
}
