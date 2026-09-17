package tt.ttflix.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

/**
 * Polls pending agent billing requests and fires a heads-up notification
 * that can wake the admin phone with the screen off.
 */
public class AdminAlertService extends Service {
    public static final String PREFS = "ttflix_admin_alerts";
    private static final String CH_WATCH = "ttflix_admin_watch";
    private static final String CH_ALERT = "ttflix_admin_alerts";
    private static final int WATCH_ID = 7101;
    private static final int ALERT_ID = 7102;
    private static final long POLL_MS = 8_000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private PowerManager.WakeLock wakeLock;
    private boolean running;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            new Thread(() -> {
                try { pollOnce(); } catch (Exception ignored) {}
                if (running) handler.postDelayed(tick, POLL_MS);
            }, "ttflix-admin-poll").start();
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannels();
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ttflix:admin-poll");
            wakeLock.setReferenceCounted(false);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
            SharedPreferences.Editor e = p.edit();
            if (intent.hasExtra("url")) e.putString("url", intent.getStringExtra("url"));
            if (intent.hasExtra("anon")) e.putString("anon", intent.getStringExtra("anon"));
            if (intent.hasExtra("token")) e.putString("token", intent.getStringExtra("token"));
            if (intent.hasExtra("refresh")) e.putString("refresh", intent.getStringExtra("refresh"));
            e.putBoolean("enabled", true);
            e.apply();
        }
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(WATCH_ID, watchNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(WATCH_ID, watchNotification());
        }
        if (intent != null && intent.getBooleanExtra("pollNow", false) && running) {
            new Thread(() -> {
                try { pollOnce(); } catch (Exception ignored) {}
            }, "ttflix-admin-poll-now").start();
        } else if (!running) {
            running = true;
            handler.removeCallbacks(tick);
            handler.post(tick);
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        handler.removeCallbacks(tick);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    private void pollOnce() throws Exception {
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        String url = p.getString("url", "");
        String anon = p.getString("anon", "");
        String token = p.getString("token", "");
        if (url.isEmpty() || anon.isEmpty() || token.isEmpty()) return;

        if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire(15_000);

        String endpoint = url.replaceAll("/$", "")
            + "/rest/v1/agent_billing_requests?status=eq.pending_admin"
            + "&select=id,plan,amount,request_type,created_at&order=created_at.desc";
        HttpURLConnection conn = openGet(endpoint, anon, token);
        int code = conn.getResponseCode();
        if (code == 401) {
            String refreshed = refreshToken(url, anon, p.getString("refresh", ""));
            if (refreshed != null) {
                p.edit().putString("token", refreshed).apply();
                conn.disconnect();
                conn = openGet(endpoint, anon, refreshed);
                code = conn.getResponseCode();
            }
        }
        if (code < 200 || code >= 300) {
            conn.disconnect();
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
            return;
        }
        String body = readAll(conn);
        conn.disconnect();
        JSONArray rows = new JSONArray(body);
        Set<String> ids = new HashSet<>();
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.getJSONObject(i);
            ids.add(row.getString("id"));
        }
        Set<String> prev = new HashSet<>(p.getStringSet("seen_ids", new HashSet<>()));
        boolean primed = p.getBoolean("primed", false);
        if (!primed) {
            p.edit().putStringSet("seen_ids", ids).putBoolean("primed", true).apply();
        } else {
            Set<String> fresh = new HashSet<>(ids);
            fresh.removeAll(prev);
            p.edit().putStringSet("seen_ids", ids).apply();
            if (!fresh.isEmpty()) {
                fireAlert(fresh, rows);
            }
        }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    }

    private String refreshToken(String url, String anon, String refresh) {
        if (refresh == null || refresh.isEmpty()) return null;
        try {
            URL u = new URL(url.replaceAll("/$", "") + "/auth/v1/token?grant_type=refresh_token");
            HttpURLConnection conn = (HttpURLConnection) u.openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("apikey", anon);
            conn.setRequestProperty("Content-Type", "application/json");
            byte[] payload = ("{\"refresh_token\":\"" + refresh.replace("\"", "") + "\"}").getBytes(StandardCharsets.UTF_8);
            conn.getOutputStream().write(payload);
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) return null;
            JSONObject o = new JSONObject(readAll(conn));
            String access = o.optString("access_token", "");
            String nextRefresh = o.optString("refresh_token", refresh);
            getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putString("refresh", nextRefresh)
                .apply();
            return access.isEmpty() ? null : access;
        } catch (Exception e) {
            return null;
        }
    }

    private void fireAlert(Set<String> fresh, JSONArray rows) {
        int subs = 0;
        int pays = 0;
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row == null || !fresh.contains(row.optString("id"))) continue;
            String kind = row.optString("request_type", "");
            if ("renewal".equals(kind) || "plan_change".equals(kind)) pays++;
            else subs++;
        }
        String title;
        String body;
        if (subs > 0 && pays == 0) {
            title = subs == 1 ? "New subscription pending" : subs + " new subscriptions pending";
            body = "An agent submitted a customer for activation.";
        } else if (pays > 0 && subs == 0) {
            title = pays == 1 ? "Payment request pending" : pays + " payment requests pending";
            body = "An agent submitted a monthly payment for approval.";
        } else {
            title = "New agent requests";
            body = subs + " subscription(s) and " + pays + " payment(s) waiting for approval.";
        }
        showHeadsUp(title, body);
    }

    public static void showHeadsUp(Context ctx, String title, String body) {
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra("openAdmin", true);
        PendingIntent pi = PendingIntent.getActivity(
            ctx, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0)
        );
        Notification n = new NotificationCompat.Builder(ctx, CH_ALERT)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(Notification.DEFAULT_ALL)
            .setAutoCancel(true)
            .setOnlyAlertOnce(false)
            .setContentIntent(pi)
            .setFullScreenIntent(pi, true)
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
            .setVibrate(new long[]{0, 700, 250, 700, 250, 700})
            .setLights(0xFFE50914, 800, 400)
            .build();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(ALERT_ID);
            nm.notify(ALERT_ID, n);
        }
        try {
            PowerManager pm = (PowerManager) ctx.getSystemService(POWER_SERVICE);
            if (pm != null) {
                @SuppressWarnings("deprecation")
                PowerManager.WakeLock screen = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                    "ttflix:admin-wake"
                );
                screen.acquire(4000);
            }
        } catch (Exception ignored) {}
    }

    private void showHeadsUp(String title, String body) {
        showHeadsUp(this, title, body);
    }

    private Notification watchNotification() {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(
            this, 1, open,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0)
        );
        return new NotificationCompat.Builder(this, CH_WATCH)
            .setSmallIcon(android.R.drawable.ic_popup_sync)
            .setContentTitle("TTFlix admin alerts")
            .setContentText("Watching for agent requests")
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build();
    }

    private void ensureChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel watch = new NotificationChannel(CH_WATCH, "Admin watcher", NotificationManager.IMPORTANCE_MIN);
        watch.setShowBadge(false);
        nm.createNotificationChannel(watch);

        NotificationChannel alert = new NotificationChannel(CH_ALERT, "Agent requests", NotificationManager.IMPORTANCE_HIGH);
        alert.enableVibration(true);
        alert.enableLights(true);
        alert.setBypassDnd(true);
        alert.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        AudioAttributes aa = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        alert.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), aa);
        alert.setVibrationPattern(new long[]{0, 700, 250, 700, 250, 700});
        nm.createNotificationChannel(alert);
    }

    private static HttpURLConnection openGet(String endpoint, String anon, String token) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(endpoint).openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("apikey", anon);
        conn.setRequestProperty("Authorization", "Bearer " + token);
        conn.setRequestProperty("Accept", "application/json");
        conn.setConnectTimeout(12000);
        conn.setReadTimeout(12000);
        return conn;
    }

    private static String readAll(HttpURLConnection conn) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = br.readLine()) != null) sb.append(line);
        br.close();
        return sb.toString();
    }

    public static void requestStart(Context ctx, String url, String anon, String token, String refresh) {
        Intent i = new Intent(ctx, AdminAlertService.class);
        i.putExtra("url", url);
        i.putExtra("anon", anon);
        i.putExtra("token", token);
        i.putExtra("refresh", refresh);
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
        else ctx.startService(i);
    }

    public static void requestPollNow(Context ctx) {
        Intent i = new Intent(ctx, AdminAlertService.class);
        i.putExtra("pollNow", true);
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
        else ctx.startService(i);
    }

    public static void requestStop(Context ctx) {
        ctx.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("enabled", false).apply();
        ctx.stopService(new Intent(ctx, AdminAlertService.class));
    }
}
