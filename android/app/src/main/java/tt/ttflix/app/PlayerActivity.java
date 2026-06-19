package tt.ttflix.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.MotionEvent;
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
    private FrameLayout rootLayout;
    private FrameLayout customViewContainer;
    private FrameLayout exitContainer;
    private ImageButton exitBtn;
    private String fallbackUrl = null;
    private boolean usingFallback = false;
    private final Handler hideHandler = new Handler(Looper.getMainLooper());
    private static final int HIDE_DELAY_MS = 3500;
    public static final String EXTRA_URL = "player_url";
    public static final String EXTRA_FALLBACK_URL = "player_fallback_url";

    // Single shared hide delay used for both the X button and the touch-intercept
    // overlay. Keeping them on the same timer means they always hide together.
    private final Runnable hideExitRunnable = () -> {
        if (exitContainer != null) {
            exitContainer.animate().alpha(0f).setDuration(300).start();
            exitContainer.postDelayed(() -> exitContainer.setVisibility(View.GONE), 300);
        }
    };

    private void showExitButton() {
        hideHandler.removeCallbacks(hideExitRunnable);
        if (exitContainer != null) {
            exitContainer.setVisibility(View.VISIBLE);
            exitContainer.animate().alpha(1f).setDuration(200).start();
            // Restart the countdown every time this is called — including after
            // the user taps a player control button — so the X always hides at
            // the same time as Videasy's own controls.
            hideHandler.postDelayed(hideExitRunnable, HIDE_DELAY_MS);
        }
    }

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
        // On TV, orientation is always landscape — no need to force it
        if (getPackageManager().hasSystemFeature("android.software.leanback")) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
        setupImmersiveMode();

        // Layer 0: root
        rootLayout = new FrameLayout(this);
        rootLayout.setBackgroundColor(Color.BLACK);
        rootLayout.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        // Layer 1: WebView
        playerWebView = new WebView(this);
        playerWebView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        playerWebView.setBackgroundColor(Color.BLACK);

        WebSettings settings = playerWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
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

        // Layer 2: custom view container for Videasy fullscreen
        customViewContainer = new FrameLayout(this);
        customViewContainer.setBackgroundColor(Color.BLACK);
        customViewContainer.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        customViewContainer.setVisibility(View.GONE);

        // Layer 3: exit button — starts hidden, shows on tap, auto-hides
        exitContainer = new FrameLayout(this);
        exitContainer.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        exitContainer.setAlpha(0f);
        exitContainer.setVisibility(View.GONE);

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
        exitBtn.setOnClickListener(v -> {
            // Show black overlay immediately to hide the rotation/transition glitch
            View blackOut = new View(PlayerActivity.this);
            blackOut.setBackgroundColor(Color.BLACK);
            blackOut.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            ));
            rootLayout.addView(blackOut);
            // Small delay so black screen renders before activity finishes
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                finish();
                // Override transition — no slide animation, just black
                overridePendingTransition(0, 0);
            }, 150);
        });
        exitContainer.addView(exitBtn);

        // Use the WebView's own touch listener to catch every tap — including taps
        // on Videasy's player control buttons (skip 10s, play/pause, etc.).
        // We restart the X-button hide timer on ACTION_UP so that after any tap,
        // both the X and Videasy's controls count down and hide together.
        // Returning false passes the event through to the WebView so all buttons
        // still work normally.
        playerWebView.setOnTouchListener((v, event) -> {
            if (event.getAction() == MotionEvent.ACTION_UP) {
                showExitButton();
            }
            return false;
        });

        rootLayout.addView(playerWebView);
        rootLayout.addView(customViewContainer);
        rootLayout.addView(exitContainer);

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
                showExitButton();
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
                showExitButton();
                // Detect Videasy "not found" by evaluating page content
                if (!usingFallback && fallbackUrl != null) {
                    view.evaluateJavascript(
                        "(function(){ return document.title + '|' + document.body.innerText; })()",
                        result -> {
                            if (result != null) {
                                String lower = result.toLowerCase();
                                if (lower.contains("couldn") || lower.contains("not found")
                                        || lower.contains("cannot find")) {
                                    usingFallback = true;
                                    runOnUiThread(() -> playerWebView.loadUrl(fallbackUrl));
                                }
                            }
                        }
                    );
                }
            }
        });

        setContentView(rootLayout);

        String url = getIntent().getStringExtra(EXTRA_URL);
        fallbackUrl = getIntent().getStringExtra(EXTRA_FALLBACK_URL);
        if (url != null) playerWebView.loadUrl(url);
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (event.getAction() == MotionEvent.ACTION_UP) showExitButton();
        return super.onTouchEvent(event);
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
        hideHandler.removeCallbacks(hideExitRunnable);
        if (playerWebView != null) playerWebView.onPause();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        hideHandler.removeCallbacks(hideExitRunnable);
        if (playerWebView != null) {
            playerWebView.stopLoading();
            playerWebView.destroy();
            playerWebView = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (mCustomView != null && mCustomViewCallback != null) {
            mCustomViewCallback.onCustomViewHidden();
            return;
        }
        // Black out before finishing to hide rotation glitch
        if (rootLayout != null) {
            View blackOut = new View(this);
            blackOut.setBackgroundColor(Color.BLACK);
            blackOut.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            ));
            rootLayout.addView(blackOut);
        }
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            finish();
            overridePendingTransition(0, 0);
        }, 150);
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
