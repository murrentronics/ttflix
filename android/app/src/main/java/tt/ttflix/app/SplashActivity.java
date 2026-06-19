package tt.ttflix.app;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.animation.AccelerateInterpolator;
import android.view.animation.DecelerateInterpolator;
import android.widget.LinearLayout;
import android.widget.RelativeLayout;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.splashscreen.SplashScreen;

public class SplashActivity extends AppCompatActivity {

    private static final int SPLASH_HOLD_MS = 2000; // how long title shows before exploding

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Suppress the Android 12+ system splash screen immediately so only
        // our custom SplashActivity animation shows — no round icon flash.
        SplashScreen.installSplashScreen(this);

        super.onCreate(savedInstanceState);

        // Full screen — extend under status bar and navigation bar
        setupEdgeToEdge();

        setContentView(R.layout.activity_splash);

        // Make the root view extend behind the notch/status bar
        RelativeLayout root = findViewById(R.id.splash_root);
        root.setFitsSystemWindows(false);

        // Animate title in, hold, then explode into MainActivity
        View titleLayout = findViewById(R.id.title_layout);
        View tagline = findViewById(R.id.tagline);

        // Fade in title
        AnimatorSet fadeIn = new AnimatorSet();
        fadeIn.playTogether(
            ObjectAnimator.ofFloat(titleLayout, "alpha", 0f, 1f).setDuration(600),
            ObjectAnimator.ofFloat(tagline, "alpha", 0f, 0.7f).setDuration(800)
        );
        fadeIn.setInterpolator(new DecelerateInterpolator());

        // Pulse the title slightly
        ObjectAnimator pulse = ObjectAnimator.ofFloat(titleLayout, "scaleX", 1f, 1.04f, 1f);
        pulse.setDuration(800);
        pulse.setRepeatCount(1);
        ObjectAnimator pulseY = ObjectAnimator.ofFloat(titleLayout, "scaleY", 1f, 1.04f, 1f);
        pulseY.setDuration(800);
        pulseY.setRepeatCount(1);

        fadeIn.start();

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            // Explosion: whole layout blasts outward
            View container = root;
            AnimatorSet explode = new AnimatorSet();
            explode.playTogether(
                ObjectAnimator.ofFloat(container, "scaleX", 1f, 6f).setDuration(450),
                ObjectAnimator.ofFloat(container, "scaleY", 1f, 6f).setDuration(450),
                ObjectAnimator.ofFloat(container, "alpha", 1f, 0f).setDuration(350)
            );
            explode.setInterpolator(new AccelerateInterpolator(1.5f));
            explode.addListener(new AnimatorListenerAdapter() {
                @Override
                public void onAnimationEnd(Animator animation) {
                    launchMain();
                }
            });
            explode.start();
        }, SPLASH_HOLD_MS);
    }

    private void launchMain() {
        Intent intent = new Intent(this, MainActivity.class);
        startActivity(intent);
        // Apply the explosion transition
        overridePendingTransition(R.anim.main_enter, 0);
        finish();
    }

    private void setupEdgeToEdge() {
        Window window = getWindow();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Android 11+ — full edge-to-edge with notch
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                // Hide both status bar and nav bar — immersive
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
            // Transparent bars
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);
        } else {
            // Android 9/10 — cutout/notch support + transparent bars
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);
            window.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_FULLSCREEN |
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            );
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                WindowManager.LayoutParams lp = window.getAttributes();
                lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                window.setAttributes(lp);
            }
        }
    }
}
