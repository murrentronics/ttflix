package tt.ttflix.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

public class AdminAlertBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())
            && !"android.intent.action.QUICKBOOT_POWERON".equals(intent.getAction())) {
            return;
        }
        SharedPreferences p = context.getSharedPreferences(AdminAlertService.PREFS, Context.MODE_PRIVATE);
        if (!p.getBoolean("enabled", false)) return;
        String url = p.getString("url", "");
        String anon = p.getString("anon", "");
        String token = p.getString("token", "");
        String refresh = p.getString("refresh", "");
        if (url.isEmpty() || token.isEmpty()) return;
        AdminAlertService.requestStart(context, url, anon, token, refresh);
    }
}
