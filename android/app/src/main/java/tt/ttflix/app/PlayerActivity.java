package tt.ttflix.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
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
import android.widget.TextView;
import android.graphics.Typeface;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.util.TypedValue;
import android.view.Gravity;
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
    private TextView exitLogo;
    private String fallbackUrl = null;
    private boolean usingFallback = false;
    private boolean playerSignalReceived = false;
    private String startOverTmdbId = null;
    private boolean startOverEnabled = false;
    private boolean startOverDone = false;
    private final Handler hideHandler = new Handler(Looper.getMainLooper());
    private final Handler fallbackHandler = new Handler(Looper.getMainLooper());
    // How long to wait for the primary source to start playing before switching to fallback
    private static final int FALLBACK_TIMEOUT_MS = 12_000;

    private final Runnable fallbackRunnable = () -> {
        if (!playerSignalReceived && !usingFallback && fallbackUrl != null && playerWebView != null) {
            usingFallback = true;
            loadPlayerUrl(fallbackUrl);
        }
    };
    private static final int HIDE_DELAY_MS = 4000;
    public static final String EXTRA_URL = "player_url";
    public static final String EXTRA_FALLBACK_URL = "player_fallback_url";
    public static final String EXTRA_NEXT_URL = "player_next_url";
    public static final String EXTRA_EPISODE_COUNT = "player_episode_count";
    public static final String EXTRA_TOTAL_SEASONS = "player_total_seasons";
    public static final String EXTRA_EPISODE_COUNTS = "player_episode_counts";
    public static final String EXTRA_START_OVER = "player_start_over";
    public static final String EXTRA_TMDB_ID = "player_tmdb_id";
    // Static: survives activity finish so MainActivity can read it on resume
    public static int lastPlayedSeason  = 0;
    public static int lastPlayedEpisode = 0;
    public static int lastWatchedSeconds = 0;
    public static int lastDurationSeconds = 0;
    public static PlayerActivity current = null;
    private String nextUrl = null;
    private String urlPrefix = null; // https://player.videasy.net/tv/12345/
    private String urlQuery = "";    // ?color=... without progress
    private boolean endedHandled = false;
    private String currentPlayerUrl = null;
    private android.widget.Button nextBtn = null;
    private android.widget.Button prevBtn = null;
    private boolean shouldAutoplay = false;
    private int episodeCount = 0;
    private int totalSeasons = 0;
    private int currentSeason  = 1;
    private int currentEpisode = 1;
    private long lastBackAt = 0;
    private static final int BACK_EXIT_MS = 2000;
    private int[] seasonEpisodeCounts = null; // index 0 = season 1 episode count
    private boolean leaving = false;

    private boolean isTV() {
        return getPackageManager().hasSystemFeature("android.software.leanback");
    }

    // Single shared hide delay for the chrome. X stays hittable at low alpha.
    private final Runnable hideExitRunnable = () -> {
        if (leaving || exitContainer == null) return;
        exitContainer.animate().cancel();
        exitContainer.animate().alpha(0.01f).setDuration(280).start();
        if (exitBtn != null) exitBtn.setAlpha(0.01f);
        if (prevBtn != null && prevBtn.getVisibility() == View.VISIBLE) prevBtn.setAlpha(0.01f);
        if (nextBtn != null && nextBtn.getVisibility() == View.VISIBLE) nextBtn.setAlpha(0.01f);
    };

    private void showExitButton() {
        if (leaving) return;
        hideHandler.removeCallbacks(hideExitRunnable);
        if (exitContainer != null) {
            exitContainer.setVisibility(View.VISIBLE);
            exitContainer.animate().cancel();
            exitContainer.animate().alpha(1f).setDuration(160).start();
            if (exitBtn != null) exitBtn.setAlpha(1f);
            if (prevBtn != null && prevBtn.getVisibility() == View.VISIBLE) prevBtn.setAlpha(1f);
            if (nextBtn != null && nextBtn.getVisibility() == View.VISIBLE) nextBtn.setAlpha(1f);
            hideHandler.postDelayed(hideExitRunnable, HIDE_DELAY_MS);
        }
    }

    private boolean isChromeFocused() {
        View focused = getCurrentFocus();
        return focused == exitBtn || focused == prevBtn || focused == nextBtn;
    }

    private boolean isDpadNav(int keyCode) {
        return keyCode == KeyEvent.KEYCODE_DPAD_LEFT
            || keyCode == KeyEvent.KEYCODE_DPAD_RIGHT
            || keyCode == KeyEvent.KEYCODE_DPAD_UP
            || keyCode == KeyEvent.KEYCODE_DPAD_DOWN
            || keyCode == KeyEvent.KEYCODE_DPAD_CENTER
            || keyCode == KeyEvent.KEYCODE_ENTER
            || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER;
    }

    private void focusExitButton() {
        showExitButton();
        if (exitBtn != null) exitBtn.requestFocus();
    }

    private void styleExitButton(boolean focused) {
        if (exitBtn == null) return;
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.WHITE);
        bg.setCornerRadius(dpToPx(6));
        if (focused) bg.setStroke(dpToPx(3), Color.parseColor("#E50914"));
        exitBtn.setBackground(bg);
        exitBtn.setColorFilter(Color.BLACK);
        exitBtn.setScaleX(focused ? 1.12f : 1f);
        exitBtn.setScaleY(focused ? 1.12f : 1f);
    }

    private void wireChromeFocus() {
        if (exitBtn == null) return;
        boolean prevOn = prevBtn != null && prevBtn.getVisibility() == View.VISIBLE;
        boolean nextOn = nextBtn != null && nextBtn.getVisibility() == View.VISIBLE;
        if (prevOn) {
            exitBtn.setNextFocusRightId(prevBtn.getId());
            exitBtn.setNextFocusDownId(prevBtn.getId());
            prevBtn.setNextFocusLeftId(exitBtn.getId());
            prevBtn.setNextFocusUpId(exitBtn.getId());
            if (nextOn) {
                prevBtn.setNextFocusRightId(nextBtn.getId());
                nextBtn.setNextFocusLeftId(prevBtn.getId());
                nextBtn.setNextFocusUpId(exitBtn.getId());
            } else {
                prevBtn.setNextFocusRightId(View.NO_ID);
            }
        } else if (nextOn) {
            exitBtn.setNextFocusRightId(nextBtn.getId());
            exitBtn.setNextFocusDownId(nextBtn.getId());
            nextBtn.setNextFocusLeftId(exitBtn.getId());
            nextBtn.setNextFocusUpId(exitBtn.getId());
        } else {
            exitBtn.setNextFocusRightId(View.NO_ID);
            exitBtn.setNextFocusDownId(View.NO_ID);
        }
    }

    private void leavePlayer() {
        if (leaving) return;
        leaving = true;
        hideHandler.removeCallbacks(hideExitRunnable);
        fallbackHandler.removeCallbacks(fallbackRunnable);
        if (exitContainer != null) exitContainer.setVisibility(View.GONE);
        if (playerWebView != null) {
            try { playerWebView.onPause(); } catch (Exception ignored) {}
            playerWebView.animate().alpha(0f).setDuration(160).start();
        }
        if (exitLogo == null) {
            finish();
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
            return;
        }
        exitLogo.setVisibility(View.VISIBLE);
        exitLogo.setScaleX(0.92f);
        exitLogo.setScaleY(0.92f);
        exitLogo.setAlpha(0f);
        exitLogo.animate()
            .alpha(1f)
            .scaleX(1f)
            .scaleY(1f)
            .setDuration(140)
            .withEndAction(() -> exitLogo.animate()
                .scaleX(7.5f)
                .scaleY(7.5f)
                .alpha(0f)
                .setDuration(420)
                .setInterpolator(new android.view.animation.AccelerateInterpolator(1.8f))
                .withEndAction(() -> {
                    finish();
                    overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
                })
                .start())
            .start();
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        current = this;
        lastWatchedSeconds = 0;
        lastDurationSeconds = 0;
        endedHandled = false;

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
        // Use hardware-accelerated rendering for smooth video playback
        playerWebView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null);
        // Cache mode: use cache where valid, load from network only when stale
        settings.setCacheMode(android.webkit.WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        settings.setUserAgentString(
            "Mozilla/5.0 (Linux; Android 13; Pixel 7) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/124.0.0.0 Mobile Safari/537.36"
        );

        // JS bridge — player wrapper posts progress / episode / ended here
        playerWebView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void onPlayerReady() {
                runOnUiThread(() -> {
                    playerSignalReceived = true;
                    fallbackHandler.removeCallbacks(fallbackRunnable);
                });
            }

            @JavascriptInterface
            public void onProgress(int timestamp, int duration) {
                if (timestamp < 0) return;
                if (duration > 0) lastDurationSeconds = duration;
                // Videasy posts 0 as the embed boots. Never clobber a real resume
                // point (or in-progress time) with that startup tick.
                if (timestamp < 3 && lastWatchedSeconds > 8) return;
                lastWatchedSeconds = timestamp;
                runOnUiThread(() -> {
                    playerSignalReceived = true;
                    fallbackHandler.removeCallbacks(fallbackRunnable);
                });
            }

            @JavascriptInterface
            public void onEpisodeChange(int season, int episode) {
                if (season < 1 || episode < 1) return;
                runOnUiThread(() -> applyEpisode(season, episode, false));
            }

            @JavascriptInterface
            public void onEnded() {
                runOnUiThread(() -> autoAdvanceIfNeeded());
            }

            /** Called by React WatchPage to push the next episode URL after an episode change */
            @JavascriptInterface
            public void setNextUrl(String url) {
                runOnUiThread(() -> {
                    if (url != null && !url.isEmpty()) {
                        nextUrl = url;
                        if (nextBtn != null) nextBtn.setVisibility(View.VISIBLE);
                    } else {
                        nextUrl = null;
                        if (nextBtn != null) nextBtn.setVisibility(View.GONE);
                    }
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

        // Layer 3: top chrome — X (always hittable) + Next Episode. Not a
        // full-screen overlay so video taps still reach the WebView.
        exitContainer = new FrameLayout(this);
        FrameLayout.LayoutParams chromeParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dpToPx(72)
        );
        chromeParams.gravity = android.view.Gravity.TOP;
        exitContainer.setLayoutParams(chromeParams);
        exitContainer.setClickable(false);
        exitContainer.setFocusable(false);
        exitContainer.setAlpha(1f);
        exitContainer.setVisibility(View.VISIBLE);

        exitBtn = new ImageButton(this);
        exitBtn.setId(android.R.id.button1);
        exitBtn.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
        exitBtn.setContentDescription("Exit");
        exitBtn.setFocusable(true);
        exitBtn.setFocusableInTouchMode(true);
        exitBtn.setClickable(true);
        int btnSize = dpToPx(40);
        int margin = dpToPx(16);
        FrameLayout.LayoutParams btnParams = new FrameLayout.LayoutParams(btnSize, btnSize);
        btnParams.leftMargin = margin;
        btnParams.topMargin = margin;
        exitBtn.setLayoutParams(btnParams);
        exitBtn.setPadding(dpToPx(8), dpToPx(8), dpToPx(8), dpToPx(8));
        styleExitButton(false);
        exitBtn.setOnFocusChangeListener((v, hasFocus) -> styleExitButton(hasFocus));
        exitBtn.setOnClickListener(v -> leavePlayer());
        exitBtn.setOnTouchListener((v, event) -> {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                v.setPressed(true);
                return true;
            }
            if (event.getAction() == MotionEvent.ACTION_UP) {
                v.setPressed(false);
                v.performClick();
                return true;
            }
            if (event.getAction() == MotionEvent.ACTION_CANCEL) {
                v.setPressed(false);
                return true;
            }
            return false;
        });
        exitContainer.addView(exitBtn);

        android.widget.LinearLayout epRow = new android.widget.LinearLayout(this);
        epRow.setOrientation(android.widget.LinearLayout.HORIZONTAL);
        FrameLayout.LayoutParams epRowParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            android.view.Gravity.TOP | android.view.Gravity.END
        );
        epRowParams.topMargin = dpToPx(12);
        epRowParams.rightMargin = dpToPx(16);
        epRow.setLayoutParams(epRowParams);

        prevBtn = makeEpisodeChromeButton("prev ep.1");
        prevBtn.setId(View.generateViewId());
        prevBtn.setOnClickListener(v -> goToPrevEpisode());
        prevBtn.setVisibility(View.GONE);
        android.widget.LinearLayout.LayoutParams prevParams = new android.widget.LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, dpToPx(48)
        );
        prevParams.rightMargin = dpToPx(8);
        prevBtn.setLayoutParams(prevParams);
        epRow.addView(prevBtn);

        nextBtn = makeEpisodeChromeButton("next ep.2");
        nextBtn.setId(View.generateViewId());
        nextBtn.setOnClickListener(v -> goToNextEpisode());
        nextBtn.setVisibility(View.GONE);
        nextBtn.setLayoutParams(new android.widget.LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, dpToPx(48)
        ));
        epRow.addView(nextBtn);
        exitContainer.addView(epRow);

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

        exitLogo = new TextView(this);
        SpannableString ttf = new SpannableString("TTF");
        ttf.setSpan(new ForegroundColorSpan(Color.parseColor("#E50914")), 0, 2, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        ttf.setSpan(new ForegroundColorSpan(Color.WHITE), 2, 3, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        exitLogo.setText(ttf);
        exitLogo.setTextSize(TypedValue.COMPLEX_UNIT_SP, 84);
        exitLogo.setTypeface(Typeface.create("sans-serif-black", Typeface.BOLD));
        exitLogo.setLetterSpacing(0.04f);
        exitLogo.setGravity(Gravity.CENTER);
        exitLogo.setAlpha(0f);
        exitLogo.setVisibility(View.GONE);
        exitLogo.setClickable(false);
        exitLogo.setFocusable(false);
        rootLayout.addView(exitLogo, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        playerWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog,
                                          boolean isUserGesture, android.os.Message resultMsg) {
                // Movie player: refuse popups. Sports embeds call window.open
                // once as a sandbox probe and treat a null result as "sandboxed".
                if (!isDirectPlayerUrl(currentPlayerUrl)) return false;
                WebView probe = new WebView(PlayerActivity.this);
                probe.getSettings().setJavaScriptEnabled(false);
                probe.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                        return true;
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(probe);
                resultMsg.sendToTarget();
                probe.postDelayed(() -> {
                    try { probe.destroy(); } catch (Exception ignored) {}
                }, 800);
                return true;
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
        episodeCount = getIntent().getIntExtra(EXTRA_EPISODE_COUNT, 0);
        totalSeasons = getIntent().getIntExtra(EXTRA_TOTAL_SEASONS, 0);
        // Parse "12,10,8" → int[] {12, 10, 8}
        String countsStr = getIntent().getStringExtra(EXTRA_EPISODE_COUNTS);
        if (countsStr != null && !countsStr.isEmpty()) {
            try {
                String[] parts = countsStr.split(",");
                seasonEpisodeCounts = new int[parts.length];
                for (int i = 0; i < parts.length; i++) {
                    seasonEpisodeCounts[i] = Integer.parseInt(parts[i].trim());
                }
            } catch (Exception e) { seasonEpisodeCounts = null; }
        }

        startOverTmdbId = getIntent().getStringExtra(EXTRA_TMDB_ID);
        startOverEnabled = getIntent().getBooleanExtra(EXTRA_START_OVER, false);
        if (startOverTmdbId == null || startOverTmdbId.isEmpty()) {
            startOverTmdbId = tmdbIdFromUrl(url);
        }

        // Parse starting season/episode from the URL so we can track progress
        String startUrl = getIntent().getStringExtra(EXTRA_URL);
        parsePlayerUrl(startUrl);
        lastPlayedSeason  = currentSeason;
        lastPlayedEpisode = currentEpisode;
        if (startOverEnabled) {
            lastWatchedSeconds = 0;
        } else {
            int resumeAt = progressFromUrl(url);
            if (resumeAt > lastWatchedSeconds) lastWatchedSeconds = resumeAt;
        }
        applyEpisode(currentSeason, currentEpisode, false);

        playerWebView.setWebViewClient(buildRealWebViewClient());
        startFallbackTimer();
        if (url != null) loadPlayerUrl(forceStartOverProgress(url));
        wireChromeFocus();
        if (isTV() && exitBtn != null) {
            exitBtn.post(this::focusExitButton);
        }
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (event.getAction() == MotionEvent.ACTION_UP) showExitButton();
        return super.onTouchEvent(event);
    }

    private final Handler watchPingHandler = new Handler(Looper.getMainLooper());
    private final Runnable watchPingRunnable = new Runnable() {
        @Override
        public void run() {
            if (MainActivity.instance != null) MainActivity.instance.pingActiveWatch();
            watchPingHandler.postDelayed(this, 5000);
        }
    };

    @Override
    protected void onResume() {
        super.onResume();
        setupImmersiveMode();
        if (playerWebView != null) playerWebView.onResume();
        watchPingHandler.removeCallbacks(watchPingRunnable);
        watchPingHandler.post(watchPingRunnable);
    }

    @Override
    protected void onPause() {
        super.onPause();
        hideHandler.removeCallbacks(hideExitRunnable);
        watchPingHandler.removeCallbacks(watchPingRunnable);
        if (playerWebView != null) playerWebView.onPause();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        hideHandler.removeCallbacks(hideExitRunnable);
        fallbackHandler.removeCallbacks(fallbackRunnable);
        watchPingHandler.removeCallbacks(watchPingRunnable);
        if (current == this) current = null;
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
        boolean chromeFocused = isChromeFocused();

        // Show exit button on any remote interaction (do not steal focus)
        if (action == KeyEvent.ACTION_UP) showExitButton();

        // Back button — exit player
        if (keyCode == KeyEvent.KEYCODE_BACK ||
            keyCode == KeyEvent.KEYCODE_ESCAPE) {
            if (action == KeyEvent.ACTION_UP) onBackPressed();
            return true;
        }

        // D-pad Up from the player lands on the X. While chrome has focus,
        // let Android move between X / prev / next instead of eating the keys.
        if (isDpadNav(keyCode)) {
            if (keyCode == KeyEvent.KEYCODE_DPAD_UP && !chromeFocused && action == KeyEvent.ACTION_DOWN) {
                focusExitButton();
                return true;
            }
            if (chromeFocused) {
                return super.dispatchKeyEvent(event);
            }
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
                "  var iframe = document.getElementById('p');" +
                "  var win = (iframe && iframe.contentWindow) ? iframe.contentWindow : window;" +
                "  var doc = win.document || document;" +
                "  var el = doc.activeElement || doc.body || document.body;" +
                "  var e = new KeyboardEvent('" + eventType + "', {" +
                "    key: '" + key + "'," +
                "    code: '" + key + "'," +
                "    bubbles: true," +
                "    cancelable: true" +
                "  });" +
                "  try { el.dispatchEvent(e); } catch (ex) {}" +
                "  try { doc.dispatchEvent(e); } catch (ex) {}" +
                "  try { win.dispatchEvent(e); } catch (ex) {}" +
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
        long now = android.os.SystemClock.elapsedRealtime();
        if (now - lastBackAt > BACK_EXIT_MS) {
            lastBackAt = now;
            showExitButton();
            return;
        }
        // Second Back within 2s — leave the player
        leavePlayer();
    }

    /**
     * Next episode URL, Netflix-style: E+1, or next season E1, skipping empty seasons.
     * Matches player.videasy.net and player.videasy.to. Strips leftover progress params.
     */
    private String computeNextEpisodeUrl(String url) {
        EpisodePos next = nextEpisodePos(currentSeason, currentEpisode);
        if (next == null) return null;
        return episodeUrl(next.season, next.episode);
    }

    private static class EpisodePos {
        final int season;
        final int episode;
        EpisodePos(int season, int episode) {
            this.season = season;
            this.episode = episode;
        }
    }

    private int countForSeason(int season) {
        if (seasonEpisodeCounts != null && season >= 1 && season - 1 < seasonEpisodeCounts.length) {
            return seasonEpisodeCounts[season - 1];
        }
        if (season == currentSeason && episodeCount > 0) return episodeCount;
        return -1; // unknown
    }

    private EpisodePos nextEpisodePos(int season, int episode) {
        if (urlPrefix == null) return null; // movies have no next episode
        int seasons = totalSeasons > 0 ? totalSeasons
            : (seasonEpisodeCounts != null ? seasonEpisodeCounts.length : season);
        int curCount = countForSeason(season);
        if (curCount < 0) {
            return new EpisodePos(season, episode + 1);
        }
        if (curCount > 0 && episode < curCount) {
            return new EpisodePos(season, episode + 1);
        }
        for (int nextSeason = season + 1; nextSeason <= seasons; nextSeason++) {
            int n = countForSeason(nextSeason);
            if (n == 0) continue;
            return new EpisodePos(nextSeason, 1);
        }
        return null;
    }

    private EpisodePos prevEpisodePos(int season, int episode) {
        if (urlPrefix == null) return null;
        if (episode > 1) return new EpisodePos(season, episode - 1);
        for (int prevSeason = season - 1; prevSeason >= 1; prevSeason--) {
            int n = countForSeason(prevSeason);
            if (n == 0) continue;
            if (n > 0) return new EpisodePos(prevSeason, n);
            return new EpisodePos(prevSeason, 1);
        }
        return null;
    }

    private void parsePlayerUrl(String url) {
        if (url == null) return;
        currentPlayerUrl = url;
        try {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile(
                "(https://player\\.videasy\\.(?:net|to)/tv/\\d+/)(\\d+)/(\\d+)(.*)"
            ).matcher(url);
            if (m.find()) {
                urlPrefix = m.group(1);
                currentSeason  = Integer.parseInt(m.group(2));
                currentEpisode = Integer.parseInt(m.group(3));
                urlQuery = stripProgress(m.group(4));
            }
        } catch (Exception e) { /* ignore */ }
    }

    private String stripProgress(String query) {
        if (query == null || query.isEmpty()) return "";
        String q = query.replaceAll("([?&])progress=\\d+", "$1")
            .replace("&&", "&")
            .replace("?&", "?");
        if (q.endsWith("?") || q.endsWith("&")) q = q.substring(0, q.length() - 1);
        return q;
    }

    private static int progressFromUrl(String url) {
        if (url == null) return 0;
        try {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("[?&]progress=(\\d+)").matcher(url);
            if (m.find()) return Integer.parseInt(m.group(1));
        } catch (Exception ignored) {}
        return 0;
    }

    private String episodeUrl(int season, int episode) {
        String url;
        if (urlPrefix != null) url = urlPrefix + season + "/" + episode + urlQuery;
        else if (currentPlayerUrl == null) return null;
        else url = currentPlayerUrl.replaceAll(
            "/tv/(\\d+)/\\d+/\\d+",
            "/tv/$1/" + season + "/" + episode
        );
        return startOverEnabled ? forceStartOverProgress(url) : url;
    }

    private String forceStartOverProgress(String url) {
        if (url == null) return null;
        if (!startOverEnabled) return url;
        String stripped = url.replaceAll("([?&])progress=\\d+", "$1")
            .replace("&&", "&")
            .replace("?&", "?");
        if (stripped.endsWith("?") || stripped.endsWith("&")) {
            stripped = stripped.substring(0, stripped.length() - 1);
        }
        return stripped + (stripped.contains("?") ? "&" : "?") + "progress=0";
    }

    private String tmdbIdFromUrl(String url) {
        if (url == null) return null;
        try {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile(
                "/(?:tv|movie)/(\\d+)").matcher(url);
            if (m.find()) return m.group(1);
        } catch (Exception ignored) {}
        return null;
    }

    private void goToNextEpisode() {
        EpisodePos next = nextEpisodePos(currentSeason, currentEpisode);
        if (next == null) {
            nextUrl = null;
            if (nextBtn != null) nextBtn.setVisibility(View.GONE);
            return;
        }
        String url = episodeUrl(next.season, next.episode);
        if (url == null) return;
        applyEpisode(next.season, next.episode, true);
        shouldAutoplay = true;
        playerSignalReceived = false;
        usingFallback = false;
        if (MainActivity.instance != null) {
            MainActivity.instance.notifyNextEpisode(next.season, next.episode);
        }
        startFallbackTimer();
        loadPlayerUrl(url);
    }

    private void goToPrevEpisode() {
        EpisodePos prev = prevEpisodePos(currentSeason, currentEpisode);
        if (prev == null) {
            if (prevBtn != null) prevBtn.setVisibility(View.GONE);
            return;
        }
        String url = episodeUrl(prev.season, prev.episode);
        if (url == null) return;
        applyEpisode(prev.season, prev.episode, true);
        shouldAutoplay = true;
        playerSignalReceived = false;
        usingFallback = false;
        if (MainActivity.instance != null) {
            MainActivity.instance.notifyNextEpisode(prev.season, prev.episode);
        }
        startFallbackTimer();
        loadPlayerUrl(url);
    }

    private void autoAdvanceIfNeeded() {
        if (endedHandled) return;
        if (nextEpisodePos(currentSeason, currentEpisode) == null) return;
        endedHandled = true;
        goToNextEpisode();
    }

    private void applyEpisode(int season, int episode, boolean resetProgress) {
        currentSeason = season;
        currentEpisode = episode;
        lastPlayedSeason = season;
        lastPlayedEpisode = episode;
        if (resetProgress) {
            lastWatchedSeconds = 0;
            lastDurationSeconds = 0;
            endedHandled = true; // ignore stale ended events while the next embed loads
        }
        EpisodePos following = nextEpisodePos(season, episode);
        if (following != null) {
            nextUrl = episodeUrl(following.season, following.episode);
            if (nextBtn != null) {
                nextBtn.setText("next ep." + following.episode);
                nextBtn.setVisibility(View.VISIBLE);
            }
        } else {
            nextUrl = null;
            if (nextBtn != null) nextBtn.setVisibility(View.GONE);
        }
        EpisodePos previous = prevEpisodePos(season, episode);
        if (previous != null) {
            if (prevBtn != null) {
                prevBtn.setText("prev ep." + previous.episode);
                prevBtn.setVisibility(View.VISIBLE);
            }
        } else if (prevBtn != null) {
            prevBtn.setVisibility(View.GONE);
        }
        wireChromeFocus();
    }

    void updateSeasonCounts(String countsStr, int seasons) {
        if (seasons > 0) totalSeasons = seasons;
        if (countsStr != null && !countsStr.isEmpty()) {
            try {
                String[] parts = countsStr.split(",");
                seasonEpisodeCounts = new int[parts.length];
                for (int i = 0; i < parts.length; i++) {
                    seasonEpisodeCounts[i] = Integer.parseInt(parts[i].trim());
                }
                if (currentSeason >= 1 && currentSeason - 1 < seasonEpisodeCounts.length) {
                    episodeCount = seasonEpisodeCounts[currentSeason - 1];
                }
            } catch (Exception e) { /* keep previous */ }
        }
        applyEpisode(currentSeason, currentEpisode, false);
    }

    /** Sports embeds refuse any iframe, sandboxed or not. Load them as the page itself. */
    private boolean isDirectPlayerUrl(String url) {
        try {
            String host = android.net.Uri.parse(url).getHost();
            if (host == null) return false;
            host = host.toLowerCase();
            return host.equals("embed.st") || host.endsWith(".embed.st")
                || host.equals("embed.streamapi.cc") || host.endsWith(".streamapi.cc");
        } catch (Exception ignored) {
            return false;
        }
    }

    private void loadPlayerUrl(String url) {
        if (playerWebView == null || url == null) return;
        currentPlayerUrl = url;
        parsePlayerUrl(url);
        if (isDirectPlayerUrl(url)) {
            WebSettings direct = playerWebView.getSettings();
            direct.setSupportMultipleWindows(true);
            direct.setJavaScriptCanOpenWindowsAutomatically(true);
            final String page = url;
            new Thread(() -> {
                final String html = EmbedUnlock.fetchClean(page);
                runOnUiThread(() -> {
                    if (playerWebView == null) return;
                    if (html == null) playerWebView.loadUrl(page);
                    else playerWebView.loadDataWithBaseURL(page, html, "text/html", "UTF-8", null);
                });
            }).start();
            return;
        }
        String html = wrapPlayerHtml(forceStartOverProgress(url));
        String base = playerBaseUrl(url);
        playerWebView.loadDataWithBaseURL(base, html, "text/html", "UTF-8", null);
    }

    private String playerBaseUrl(String url) {
        try {
            android.net.Uri u = android.net.Uri.parse(url);
            String host = u.getHost();
            if (host != null && (host.endsWith("videasy.net") || host.endsWith("videasy.to"))) {
                return u.getScheme() + "://" + host + "/";
            }
        } catch (Exception ignored) {}
        return "https://player.videasy.net/";
    }

    private static String escapeHtml(String s) {
        return s.replace("&", "&amp;")
            .replace("\"", "&quot;")
            .replace("'", "&#39;")
            .replace("<", "&lt;");
    }

    /**
     * Videasy now blanks the page unless it is inside an iframe. Load it as an
     * embed and forward postMessage progress up to TTFlixNative.
     * During Start Over, wipe this title's saved timestamps BEFORE the embed
     * loads, force progress=0 on the URL, and pin currentTime at 0 if Videasy
     * tries to seek back to an old position.
     */
    private String wrapPlayerHtml(String url) {
        String src = escapeHtml(url);
        String id = startOverTmdbId != null ? startOverTmdbId.replaceAll("[^0-9]", "") : "";
        boolean wipe = startOverEnabled && !id.isEmpty();
        StringBuilder html = new StringBuilder();
        html.append("<!DOCTYPE html><html><head>");
        html.append("<meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1'>");
        html.append("<style>html,body{margin:0;padding:0;background:#000;width:100%;height:100%;overflow:hidden}");
        html.append("iframe{border:0;position:fixed;inset:0;width:100%;height:100%}</style>");
        html.append("</head><body>");
        html.append("<iframe id='p' allow='autoplay; fullscreen; picture-in-picture; encrypted-media' allowfullscreen></iframe>");
        html.append("<script>(function(){");
        html.append("function wipeStore(store){try{Object.keys(store).forEach(function(k){");
        html.append("var val='';try{val=String(store.getItem(k)||'')}catch(e){}");
        if (wipe) {
            html.append("if(k.indexOf('").append(id).append("')>=0||val.indexOf('").append(id).append("')>=0)store.removeItem(k);");
        }
        html.append("})}catch(e){}}");
        html.append("function wipeAll(){wipeStore(localStorage);wipeStore(sessionStorage);");
        html.append("try{var w=document.getElementById('p').contentWindow;");
        html.append("if(w){wipeStore(w.localStorage);wipeStore(w.sessionStorage)}}catch(e){}}");
        if (wipe) html.append("wipeAll();");
        html.append("document.getElementById('p').src=\"").append(src).append("\";");
        html.append("window.open=function(){return null};");
        int resumeAt = startOverEnabled ? 0 : progressFromUrl(url);
        html.append("var resumeAt=").append(resumeAt).append(";");
        html.append("if(resumeAt>2){var __seekUntil=Date.now()+12000;");
        html.append("setInterval(function(){if(Date.now()>__seekUntil)return;");
        html.append("try{var iframe=document.getElementById('p');");
        html.append("if(iframe&&iframe.contentWindow)iframe.contentWindow.postMessage(");
        html.append("{type:'seek',event:'seek',timestamp:resumeAt,progress:resumeAt,currentTime:resumeAt},'*');");
        html.append("}catch(e){}},500);}");
        html.append("function scrub(doc){if(!doc)return;");
        html.append("var els=doc.querySelectorAll('iframe,div,a,ins,aside');");
        html.append("for(var i=0;i<els.length;i++){var el=els[i];if(el.id==='p')continue;");
        html.append("var blob=((el.id||'')+' '+(el.className||'')+' '+(el.src||'')+' '+(el.href||'')).toLowerCase();");
        html.append("if(/doubleclick|googlesyndication|adservice|adnxs|popads|popcash|exoclick|propeller|adsterra|taboola|outbrain|ima3|imasdk|prebid|adsystem|popunder/.test(blob)){try{el.remove()}catch(e){}}");
        html.append("}}");
        html.append("setInterval(function(){scrub(document)},700);");
        if (wipe) {
            html.append("var __forceUntil=Date.now()+8000;");
            html.append("setInterval(function(){wipeAll();if(Date.now()>__forceUntil)return;");
            html.append("try{var v=document.getElementById('p').contentDocument.querySelector('video');");
            html.append("if(v&&v.currentTime>20){v.currentTime=0;try{v.play()}catch(e){}}}catch(e){}");
            html.append("},400);");
        }
        html.append("function ready(){try{TTFlixNative.onPlayerReady()}catch(e){}}");
        html.append("function progress(t,d){try{TTFlixNative.onProgress(Math.floor(t||0),Math.floor(d||0))}catch(e){}}");
        html.append("function episode(s,e){try{TTFlixNative.onEpisodeChange(s|0,e|0)}catch(e){}}");
        html.append("function ended(){try{TTFlixNative.onEnded()}catch(e){}}");
        html.append("function handle(d){");
        html.append("if(!d||typeof d!=='object')return;");
        html.append("var t=d.type||d.event;");
        html.append("if(t==='ready'||t==='play')ready();");
        html.append("if(t==='ended'||t==='complete')ended();");
        html.append("if(t==='episodeChange'&&d.season&&d.episode)episode(d.season,d.episode);");
        html.append("var ts=d.timestamp!=null?d.timestamp:d.currentTime;");
        html.append("var dur=d.duration;");
        html.append("if(ts!=null&&dur!=null){progress(ts,dur);ready()}");
        html.append("}");
        html.append("window.addEventListener('message',function(e){");
        html.append("try{var d=typeof e.data==='string'?JSON.parse(e.data):e.data;handle(d)}catch(ex){}");
        html.append("});");
        html.append("setInterval(function(){try{");
        html.append("var doc=document.getElementById('p').contentDocument;if(!doc)return;");
        html.append("var v=doc.querySelector('video');");
        html.append("if(v&&v.duration&&isFinite(v.duration)&&v.duration>0){");
        html.append("progress(v.currentTime,v.duration);ready();if(v.ended)ended()}");
        html.append("}catch(e){}},1000);");
        html.append("})();</script></body></html>");
        return html.toString();
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
        "googleadservices.com", "googletagservices.com", "googletagmanager.com",
        "imasdk.googleapis.com", "2mdn.net", "adtrafficquality.google",
        "amazon-adsystem.com", "moatads.com", "outbrain.com", "taboola.com",
        "ads.yahoo.com", "adnxs.com", "adsrvr.org", "advertising.com",
        "casalemedia.com", "pubmatic.com", "rubiconproject.com", "openx.net",
        "criteo.com", "bidswitch.net", "smartadserver.com", "3lift.com",
        "sharethrough.com", "media.net", "indexexchange.com",
        "lijit.com", "rhythmone.com", "sovrn.com", "triplelift.com",
        "aliexpress.com", "ae01.alicdn.com", "lazada.com", "shopee.com",
        "temu.com", "wish.com", "banggood.com",
        "popads.net", "popcash.net", "exoclick.com", "propellerads.com",
        "adsterra.com", "hilltopads.net", "onclickads.net", "ad-maven.com",
        "mgid.com", "revcontent.com", "spotxchange.com", "spotx.tv",
        "teads.tv", "tremorhub.com", "innovid.com", "serving-sys.com",
        "adsafeprotected.com", "appnexus.com", "adform.net", "bidr.io",
        "vidazoo.com", "exosrv.com", "realsrv.com", "tsyndicate.com",
        "enteringlacquergiant.com", "histats.com", "onepyrincehyarey.org"
    ));

    private boolean isAdHost(String host) {
        if (host == null) return false;
        String h = host.toLowerCase();
        for (String blocked : AD_HOSTS) {
            if (h.equals(blocked) || h.endsWith("." + blocked)) return true;
        }
        return false;
    }

    private boolean isPlayerHost(String host) {
        if (host == null) return false;
        String h = host.toLowerCase();
        return h.equals("videasy.net") || h.endsWith(".videasy.net")
            || h.equals("videasy.to") || h.endsWith(".videasy.to")
            || h.equals("embed.st") || h.endsWith(".embed.st")
            || h.equals("embed.streamapi.cc") || h.endsWith(".streamapi.cc");
    }

    private boolean isAdRequest(WebResourceRequest request) {
        android.net.Uri u = request.getUrl();
        if (isAdHost(u.getHost())) return true;
        String path = u.getPath() != null ? u.getPath().toLowerCase() : "";
        if (path.equals("/ad.html") || path.endsWith("/ad.html")) return true;
        String hay = ((u.getHost() != null ? u.getHost() : "") + path
            + (u.getQuery() != null ? u.getQuery() : "")).toLowerCase();
        return hay.contains("googlesyndication")
            || hay.contains("doubleclick")
            || hay.contains("/ads/")
            || hay.contains("ima3.js")
            || hay.contains("imasdk")
            || hay.contains("/vast/")
            || hay.contains("vast.xml")
            || hay.contains("prebid");
    }

    private static final WebResourceResponse EMPTY_RESPONSE =
        new WebResourceResponse("text/plain", "utf-8",
            new java.io.ByteArrayInputStream(new byte[0]));

    private WebViewClient buildRealWebViewClient() {
        return new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                android.net.Uri u = request.getUrl();
                String host = u.getHost() != null ? u.getHost() : "";
                String url = u.toString();
                if (isAdRequest(request)) return true;
                if (request.isForMainFrame()) {
                    if (url.startsWith("about:") || url.startsWith("data:")) return false;
                    if (isPlayerHost(host)) return false;
                    return true;
                }
                return false;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse unlocked = EmbedUnlock.rewrite(request);
                if (unlocked != null) return unlocked;
                if (isAdRequest(request)) return EMPTY_RESPONSE;
                return null;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                setupImmersiveMode();
                showExitButton();
                fallbackHandler.postDelayed(() -> endedHandled = false, 2500);

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

                // Movie pages only. Sports embeds treat a dead window.open as a sandbox.
                if (!isDirectPlayerUrl(url)) view.evaluateJavascript(
                    "(function(){" +
                    "  if(window.__ttflixAdsBlocked) return;" +
                    "  window.__ttflixAdsBlocked = true;" +
                    "  window.open = function(){ return null; };" +
                    "  window.alert = function(){};" +
                    "  document.addEventListener('click', function(e){" +
                    "    var t = e.target;" +
                    "    if (t && t.closest && t.closest('iframe#p')) return;" +
                    "    var a = t && t.closest ? t.closest('a') : null;" +
                    "    if (a && a.href && a.href.indexOf('videasy') < 0) { e.preventDefault(); e.stopPropagation(); }" +
                    "  }, true);" +
                    "})()",
                    null
                );

                // After Next Episode tap — click the play button to autoplay
                if (shouldAutoplay) {
                    shouldAutoplay = false;
                    // Delay slightly to let Videasy's player UI render before we click
                    new Handler(Looper.getMainLooper()).postDelayed(() -> {
                        if (playerWebView != null) {
                            playerWebView.evaluateJavascript(
                                "(function(){" +
                                "  function playIn(doc){" +
                                "    if(!doc) return false;" +
                                "    var videos = doc.querySelectorAll('video');" +
                                "    for(var i=0;i<videos.length;i++){" +
                                "      try{ videos[i].play(); return true; }catch(e){}" +
                                "    }" +
                                "    var selectors = ['button[aria-label*=\"play\" i]','.play-button','[class*=\"play\"]'];" +
                                "    for(var s=0;s<selectors.length;s++){" +
                                "      var el = doc.querySelector(selectors[s]);" +
                                "      if(el && el.tagName!=='VIDEO' && el.tagName!=='IFRAME'){ el.click(); return true; }" +
                                "    }" +
                                "    return false;" +
                                "  }" +
                                "  if(playIn(document)) return;" +
                                "  var iframe = document.getElementById('p');" +
                                "  try{ if(iframe && playIn(iframe.contentDocument)) return; }catch(e){}" +
                                "  var e = new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true});" +
                                "  document.dispatchEvent(e);" +
                                "})()",
                                null
                            );
                        }
                    }, 1500);
                }

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
                                    runOnUiThread(() -> loadPlayerUrl(fallbackUrl));
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

    private android.widget.Button makeEpisodeChromeButton(String label) {
        android.widget.Button btn = new android.widget.Button(this);
        btn.setText(label);
        btn.setTextColor(Color.WHITE);
        btn.setTextSize(13f);
        btn.setTypeface(null, android.graphics.Typeface.BOLD);
        btn.setBackgroundColor(Color.argb(200, 192, 0, 26));
        btn.setPadding(dpToPx(14), dpToPx(10), dpToPx(14), dpToPx(10));
        btn.setFocusable(true);
        btn.setFocusableInTouchMode(isTV());
        btn.setAllCaps(false);
        return btn;
    }

    private int dpToPx(int dp) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(dp * density);
    }
}
