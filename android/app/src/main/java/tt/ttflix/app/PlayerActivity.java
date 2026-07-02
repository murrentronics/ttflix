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
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
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
    private String fallbackUrl = null;
    private boolean usingFallback = false;
    private boolean playerSignalReceived = false;
    private String startOverTmdbId = null;
    private boolean startOverEnabled = false;
    private boolean startOverDone = false;
    private final Handler hideHandler = new Handler(Looper.getMainLooper());
    private final Handler fallbackHandler = new Handler(Looper.getMainLooper());
    // How long to wait for the primary source to start playing before switching to fallback
    private static final int FALLBACK_TIMEOUT_MS = 20_000;

    private final Runnable fallbackRunnable = () -> {
        if (!playerSignalReceived && !usingFallback && fallbackUrl != null && playerWebView != null) {
            usingFallback = true;
            playerWebView.loadUrl(fallbackUrl);
        }
    };
    private static final int HIDE_DELAY_MS = 4000;
    public static final String EXTRA_URL = "player_url";
    public static final String EXTRA_FALLBACK_URL = "player_fallback_url";
    public static final String EXTRA_NEXT_URL = "player_next_url";
    private String nextUrl = null;
    private android.widget.Button nextBtn = null;

    // Single shared hide delay for the X button.
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

        // JS bridge — lets the page signal that video is actually playing
        playerWebView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void onPlayerReady() {
                // Called from the postMessage relay script when video starts
                runOnUiThread(() -> {
                    playerSignalReceived = true;
                    fallbackHandler.removeCallbacks(fallbackRunnable);
                });
            }
        }, "TTFlixNative");

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

        // Next Episode button — bottom-right, same show/hide as exit button
        nextBtn = new android.widget.Button(this);
        nextBtn.setText("Next Episode ▶");
        nextBtn.setTextColor(Color.WHITE);
        nextBtn.setTextSize(14f);
        nextBtn.setTypeface(null, android.graphics.Typeface.BOLD);
        nextBtn.setBackgroundColor(Color.argb(200, 192, 0, 26)); // TTFlix red
        nextBtn.setPadding(dpToPx(16), dpToPx(10), dpToPx(16), dpToPx(10));
        int nextBtnHeight = dpToPx(48);
        FrameLayout.LayoutParams nextParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, nextBtnHeight,
            android.view.Gravity.BOTTOM | android.view.Gravity.END
        );
        nextParams.bottomMargin = dpToPx(20);
        nextParams.rightMargin  = dpToPx(16);
        nextBtn.setLayoutParams(nextParams);
        nextBtn.setVisibility(View.GONE); // hidden until we know there's a next episode
        nextBtn.setOnClickListener(v -> {
            if (nextUrl != null) {
                // Reload the WebView with the next episode URL
                playerSignalReceived = false;
                usingFallback = false;
                startFallbackTimer();
                playerWebView.loadUrl(nextUrl);
                nextUrl = null;
                nextBtn.setVisibility(View.GONE);
            }
        });
        exitContainer.addView(nextBtn);

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
            public boolean onCreateWindow(WebView view, boolean isDialog,
                                          boolean isUserGesture, android.os.Message resultMsg) {
                // Block all pop-up windows — ads use this to spawn new tabs
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

        playerWebView.setWebViewClient(buildRealWebViewClient());

        setContentView(rootLayout);

        String url = getIntent().getStringExtra(EXTRA_URL);
        fallbackUrl = getIntent().getStringExtra(EXTRA_FALLBACK_URL);
        nextUrl = getIntent().getStringExtra(EXTRA_NEXT_URL);
        if (nextUrl != null && nextBtn != null) {
            nextBtn.setVisibility(View.VISIBLE);
        }
        startOverTmdbId = getIntent().getStringExtra("tmdb_id");
        startOverEnabled = getIntent().getBooleanExtra("start_over", false);

        if (startOverEnabled && startOverTmdbId != null) {
            // Load about:blank first — this gives us a clean same-origin context
            // where we can wipe localStorage/sessionStorage for this title
            // BEFORE Videasy ever loads and reads its resume data.
            final String targetUrl = url;
            final String id = startOverTmdbId;
            playerWebView.setWebViewClient(new WebViewClient() {
                private boolean wiped = false;
                @Override
                public void onPageFinished(WebView view, String pageUrl) {
                    if (!wiped && pageUrl.equals("about:blank")) {
                        wiped = true;
                        // Wipe all storage keys containing this tmdbId
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
                            result -> {
                                // Storage wiped — now load the real player URL
                                runOnUiThread(() -> {
                                    // Restore the real WebViewClient then load
                                    playerWebView.setWebViewClient(buildRealWebViewClient());
                                    startFallbackTimer();
                                    playerWebView.loadUrl(targetUrl);
                                });
                            });
                    }
                }
            });
            playerWebView.loadUrl("about:blank");
        } else {
            playerWebView.setWebViewClient(buildRealWebViewClient());
            startFallbackTimer();
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
        fallbackHandler.removeCallbacks(fallbackRunnable);
        if (playerWebView != null) {
            playerWebView.stopLoading();
            playerWebView.destroy();
            playerWebView = null;
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (playerWebView == null) return super.dispatchKeyEvent(event);

        int keyCode = event.getKeyCode();
        int action  = event.getAction();

        // Show exit button on any remote interaction
        if (action == KeyEvent.ACTION_UP) showExitButton();

        // Back button — exit player
        if (keyCode == KeyEvent.KEYCODE_BACK ||
            keyCode == KeyEvent.KEYCODE_ESCAPE) {
            if (action == KeyEvent.ACTION_UP) onBackPressed();
            return true;
        }

        // Map D-pad and media keys to JavaScript KeyboardEvents so Videasy
        // can respond to them (seek, play/pause, volume).
        String jsKey = null;
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_LEFT:              jsKey = "ArrowLeft";  break;
            case KeyEvent.KEYCODE_DPAD_RIGHT:             jsKey = "ArrowRight"; break;
            case KeyEvent.KEYCODE_DPAD_UP:                jsKey = "ArrowUp";    break;
            case KeyEvent.KEYCODE_DPAD_DOWN:              jsKey = "ArrowDown";  break;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:           jsKey = "Enter";      break;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE:            jsKey = " ";          break; // Space = play/pause
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
            case KeyEvent.KEYCODE_MEDIA_SKIP_FORWARD:     jsKey = "ArrowRight"; break;
            case KeyEvent.KEYCODE_MEDIA_REWIND:
            case KeyEvent.KEYCODE_MEDIA_SKIP_BACKWARD:    jsKey = "ArrowLeft";  break;
        }

        if (jsKey != null) {
            final String eventType = (action == KeyEvent.ACTION_DOWN) ? "keydown" : "keyup";
            final String key = jsKey;
            playerWebView.evaluateJavascript(
                "(function(){" +
                "  var el = document.activeElement || document.body;" +
                "  var e = new KeyboardEvent('" + eventType + "', {" +
                "    key: '" + key + "'," +
                "    code: '" + key + "'," +
                "    bubbles: true," +
                "    cancelable: true" +
                "  });" +
                "  el.dispatchEvent(e);" +
                "  document.dispatchEvent(e);" +
                "  window.dispatchEvent(e);" +
                "})()",
                null
            );
            return true;
        }

        return super.dispatchKeyEvent(event);
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

    private void startFallbackTimer() {
        if (fallbackUrl == null) return;
        fallbackHandler.removeCallbacks(fallbackRunnable);
        playerSignalReceived = false;
        fallbackHandler.postDelayed(fallbackRunnable, FALLBACK_TIMEOUT_MS);
    }

    // ── Ad blocking ──────────────────────────────────────────────────────────

    private static final java.util.Set<String> AD_HOSTS = new java.util.HashSet<>(java.util.Arrays.asList(
        "doubleclick.net", "googlesyndication.com", "adservice.google.com",
        "amazon-adsystem.com", "moatads.com", "outbrain.com", "taboola.com",
        "ads.yahoo.com", "adnxs.com", "adsrvr.org", "advertising.com",
        "casalemedia.com", "pubmatic.com", "rubiconproject.com", "openx.net",
        "criteo.com", "bidswitch.net", "smartadserver.com", "3lift.com",
        "sharethrough.com", "media.net", "indexexchange.com",
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

    private WebViewClient buildRealWebViewClient() {
        return new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String host = request.getUrl().getHost() != null
                    ? request.getUrl().getHost() : "";
                if (isAdHost(host)) return true;
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

                // Inject a postMessage listener that bridges player events to the
                // native JS interface so we can cancel the fallback timer once
                // video is actually playing.
                view.evaluateJavascript(
                    "(function(){" +
                    "  if(window.__ttflixBridged) return;" +
                    "  window.__ttflixBridged = true;" +
                    "  window.addEventListener('message', function(e){" +
                    "    try{" +
                    "      var d = typeof e.data==='string' ? JSON.parse(e.data) : e.data;" +
                    "      var t = d && (d.type || d.event);" +
                    "      if(t==='ready' || t==='play' || d && d.timestamp!==undefined){" +
                    "        if(window.TTFlixNative && window.TTFlixNative.onPlayerReady)" +
                    "          window.TTFlixNative.onPlayerReady();" +
                    "      }" +
                    "    }catch(ex){}" +
                    "  });" +
                    "})()",
                    null
                );

                // Block window.open pop-ups from ad scripts
                view.evaluateJavascript(
                    "(function(){" +
                    "  if(window.__ttflixAdsBlocked) return;" +
                    "  window.__ttflixAdsBlocked = true;" +
                    "  window.open = function(){ return null; };" +
                    "})()",
                    null
                );

                // Detect Videasy "not found" by evaluating page content
                if (!usingFallback && fallbackUrl != null) {                    view.evaluateJavascript(
                        "(function(){ return document.title + '|' + document.body.innerText; })()",
                        result -> {
                            if (result != null) {
                                String lower = result.toLowerCase();
                                if (lower.contains("couldn") || lower.contains("not found")
                                        || lower.contains("cannot find")) {
                                    playerSignalReceived = true; // stop fallback timer
                                    fallbackHandler.removeCallbacks(fallbackRunnable);
                                    usingFallback = true;
                                    runOnUiThread(() -> playerWebView.loadUrl(fallbackUrl));
                                }
                            }
                        }
                    );
                }
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
