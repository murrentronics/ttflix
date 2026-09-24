package tt.ttflix.app;

import android.net.Uri;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * The embed page's first script builds a full-screen sandboxed iframe and that
 * frame replaces the video with the red sandbox message. Drop that script.
 */
public final class EmbedUnlock {
    private EmbedUnlock() {}

    public static boolean isEmbedDocument(Uri uri) {
        if (uri == null) return false;
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
        boolean embedHost = host.equals("embed.st") || host.endsWith(".embed.st")
            || host.equals("embed.streamapi.cc") || host.endsWith(".streamapi.cc");
        if (!embedHost) return false;
        String path = uri.getPath() == null ? "" : uri.getPath();
        return path.startsWith("/embed/") || path.startsWith("/sport/");
    }

    public static WebResourceResponse rewrite(WebResourceRequest request) {
        if (request == null || !isEmbedDocument(request.getUrl())) return null;
        String html = fetchClean(request.getUrl().toString());
        if (html == null) return null;
        return new WebResourceResponse(
            "text/html",
            "utf-8",
            new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8))
        );
    }

    public static String fetchClean(String pageUrl) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(pageUrl).openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(20000);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestProperty("Accept", "text/html");
            conn.setRequestProperty("User-Agent",
                "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 "
                    + "(KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36");
            String cookie = CookieManager.getInstance().getCookie(pageUrl);
            if (cookie != null) conn.setRequestProperty("Cookie", cookie);

            int code = conn.getResponseCode();
            if (code >= 400) return null;
            keepCookies(conn, pageUrl);

            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            InputStream in = conn.getInputStream();
            byte[] tmp = new byte[8192];
            int n;
            while ((n = in.read(tmp)) >= 0) buf.write(tmp, 0, n);
            in.close();
            return stripAds(new String(buf.toByteArray(), StandardCharsets.UTF_8));
        } catch (Exception ignored) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static void keepCookies(HttpURLConnection conn, String url) {
        Map<String, List<String>> headers = conn.getHeaderFields();
        if (headers == null) return;
        for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
            if (entry.getKey() == null || !entry.getKey().equalsIgnoreCase("Set-Cookie")) continue;
            for (String value : entry.getValue()) {
                CookieManager.getInstance().setCookie(url, value);
            }
        }
    }

    /** Drop inline ad scripts. Keep the external player files. */
    static String stripAds(String html) {
        String lower = html.toLowerCase();
        StringBuilder out = new StringBuilder();
        int from = 0;
        while (from < html.length()) {
            int open = lower.indexOf("<script", from);
            if (open < 0) {
                out.append(html.substring(from));
                break;
            }
            int openEnd = lower.indexOf(">", open);
            int close = openEnd < 0 ? -1 : lower.indexOf("</script>", openEnd);
            if (openEnd < 0 || close < 0) {
                out.append(html.substring(from));
                break;
            }
            String tag = lower.substring(open, openEnd);
            String body = html.substring(openEnd + 1, close).trim();
            boolean externalPlayer = tag.contains("src=") && body.isEmpty();
            out.append(html.substring(from, open));
            if (externalPlayer) out.append(html.substring(open, close + "</script>".length()));
            from = close + "</script>".length();
        }
        return out.toString();
    }
}
