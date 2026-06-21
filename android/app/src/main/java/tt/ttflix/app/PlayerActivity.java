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
import android.webkit.WebResourceResponse;
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
    private String startOverTmdbId = null;
    private boolean startOverEnabled = false;
    private final Handler hideHandler = new Handler(Looper.getMainLooper());

    private static final int HIDE_DELAY_MS = 4000;
    public static final String EXTRA_URL = "player_url";

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

        // Layer 3: exit button
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
            View blackOut = new View(PlayerActivity.this);
            blackOut.setBackgroundColor(Color.BLACK);
            blackOut.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            ));
            rootLayout.addView(blackOut);
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                finish();
                overridePendingTransition(0, 0);
            }, 150);
        });
        exitContainer.addView(exitBtn);

        playerWebView.setOnTouchListener((v, event) -> {
            if (event.getAction() == MotionEvent.ACTION_UP) showExitButton();
            return false;
        });

        rootLayout.addView(playerWebView);
        rootLayout.addView(customViewContainer);
        rootLayout.addView(exitContainer);

        playerWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog,
                                          boolean isUserGesture, android.os.Message resultMsg) {
                // Block all pop-up windows — ads use this to open new tabs
                return false;
            }

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

        playerWebView.setWebViewClient(buildWebViewClient());

        setContentView(rootLayout);

        String url = getIntent().getStringExtra(EXTRA_URL);
        startOverTmdbId = getIntent().getStringExtra("tmdb_id");
        startOverEnabled = getIntent().getBooleanExtra("start_over", false);

        if (startOverEnabled && startOverTmdbId != null) {
            final String targetUrl = url;
            final String id = startOverTmdbId;
            playerWebView.setWebViewClient(new WebViewClient() {
                private boolean wiped = false;
                @Override
                public void onPageFinished(WebView view, String pageUrl) {
                    if (!wiped && pageUrl.equals("about:blank")) {
                        wiped = true;
                        view.evaluateJavascript(
                            "(function(){" +
                            "  try{" +
                            "    [localStorage,sessionStorage].forEach(function(s){" +
                            "      Object.keys(s).forEach(function(k){" +
                            "        if(k.indexOf('" + id + "')>=0)s.removeItem(k);" +
                            "      });" +
                            "    });" +
                            "  }catch(e){}" +
                            "})()",
                            result -> runOnUiThread(() -> {
                                playerWebView.setWebViewClient(buildWebViewClient());
                                playerWebView.loadUrl(targetUrl);
                            }));
                    }
                }
            });
            playerWebView.loadUrl("about:blank");
        } else {
            if (url != null) playerWebView.loadUrl(url);
        }
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

    // ── Ad blocking ─────────────────────────────────────────────────────────

    private static final java.util.Set<String> AD_HOSTS = new java.util.HashSet<>(java.util.Arrays.asList(
        "doubleclick.net", "googlesyndication.com", "adservice.google.com",
        "amazon-adsystem.com", "moatads.com", "outbrain.com", "taboola.com",
        "ads.yahoo.com", "adnxs.com", "adsrvr.org", "advertising.com",
        "casalemedia.com", "pubmatic.com", "rubiconproject.com", "openx.net",
        "criteo.com", "bidswitch.net", "smartadserver.com", "3lift.com",
        "sharethrough.com", "adsymptotic.com", "media.net", "indexexchange.com",
        "lijit.com", "rhythmone.com", "sovrn.com", "triplelift.com",
        "aliexpress.com", "ae01.alicdn.com", "lazada.com", "shopee.com",
        "temu.com", "wish.com", "banggood.com"
    ));

    private boolean isAdHost(String host) {
        if (host == null) return false;
        for (String blocked : AD_HOSTS) {
            if (host.equals(blocked) || host.endsWith("." + blocked)) return true;
        }
        return false;
    }

    private static final WebResourceResponse EMPTY_RESPONSE =
        new WebResourceResponse("text/plain", "utf-8",
            new java.io.ByteArrayInputStream(new byte[0]));

    // ── WebViewClient ────────────────────────────────────────────────────────

    private WebViewClient buildWebViewClient() {
        // Injected on every page load to block ads and pop-ups from JS
        final String AD_BLOCK_SCRIPT =
            "(function(){" +
            "  if(window.__ttflixAdsBlocked) return;" +
            "  window.__ttflixAdsBlocked = true;" +
            "  window.open = function(){ return null; };" +
            "  var _href = Object.getOwnPropertyDescriptor(window.location,'href');" +
            "  if(_href && _href.set){" +
            "    Object.defineProperty(window.location,'href',{" +
            "      set: function(v){" +
            "        if(typeof v==='string' && (" +
            "          v.indexOf('aliexpress')>=0 || v.indexOf('lazada')>=0 ||" +
            "          v.indexOf('shopee')>=0 || v.indexOf('temu')>=0 ||" +
            "          v.indexOf('taboola')>=0 || v.indexOf('outbrain')>=0 ||" +
            "          v.indexOf('doubleclick')>=0)) return;" +
            "        _href.set.call(window.location,v);" +
            "      }," +
            "      get: function(){ return _href.get.call(window.location); }" +
            "    });" +
            "  }" +
            "})()";

        return new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String host = request.getUrl().getHost() != null
                    ? request.getUrl().getHost() : "";
                if (isAdHost(host)) return true;
                // Block top-level navigation away from videasy.net
                if (request.isForMainFrame()) {
                    String urlStr = request.getUrl().toString();
                    if (!urlStr.startsWith("about:") && !urlStr.contains("videasy.net")) {
                        return true;
                    }
                }
                return false;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String host = request.getUrl().getHost() != null
                    ? request.getUrl().getHost() : "";
                if (isAdHost(host)) return EMPTY_RESPONSE;
                return null;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                setupImmersiveMode();
                showExitButton();
                view.evaluateJavascript(AD_BLOCK_SCRIPT, null);
            }
        };
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
