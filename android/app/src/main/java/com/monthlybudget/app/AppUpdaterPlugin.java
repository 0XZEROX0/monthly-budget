package com.monthlybudget.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Downloads a new APK inside the app and hands it to Android's installer, so updating
 * needs no browser. Android still shows its own "Update this app?" confirmation, and the
 * first time asks to allow installs from this app.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private File apkFile() {
        File dir = new File(getContext().getCacheDir(), "updates");
        dir.mkdirs();
        return new File(dir, "update.apk");
    }

    /** Downloads `url`, reporting "downloadProgress" events, then opens the installer. */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("url is required");
            return;
        }
        new Thread(() -> {
            File apk = apkFile();
            File part = new File(apk.getPath() + ".part");
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setInstanceFollowRedirects(true);
                c.setConnectTimeout(20000);
                c.setReadTimeout(30000);
                if (c.getResponseCode() != 200) throw new Exception("Download failed (" + c.getResponseCode() + ")");
                long total = c.getContentLengthLong();
                try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                    byte[] buf = new byte[64 * 1024];
                    long done = 0;
                    int lastPct = -1;
                    for (int n; (n = in.read(buf)) > 0; ) {
                        out.write(buf, 0, n);
                        done += n;
                        int pct = total > 0 ? (int) (done * 100 / total) : -1;
                        if (pct != lastPct) {
                            lastPct = pct;
                            JSObject p = new JSObject();
                            p.put("downloaded", done);
                            p.put("total", total);
                            notifyListeners("downloadProgress", p);
                        }
                    }
                } finally {
                    c.disconnect();
                }
                if (!part.renameTo(apk)) throw new Exception("Could not save the update");
                call.resolve(install());
            } catch (Exception e) {
                part.delete();
                call.reject(e.getMessage() != null ? e.getMessage() : "Download failed", e);
            }
        }).start();
    }

    /** Opens the installer for the APK already downloaded, e.g. after allowing installs. */
    @PluginMethod
    public void installDownloaded(PluginCall call) {
        if (!apkFile().exists()) {
            call.reject("No update downloaded");
            return;
        }
        call.resolve(install());
    }

    private JSObject install() {
        Context ctx = getContext();
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ctx.getPackageManager().canRequestPackageInstalls()) {
            // Android's switch for "Allow from this source"; the app installs once it's on.
            Intent allow = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
            getActivity().startActivity(allow);
            ret.put("needsPermission", true);
            return ret;
        }
        Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", apkFile());
        Intent i = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getActivity().startActivity(i);
        ret.put("needsPermission", false);
        return ret;
    }
}
