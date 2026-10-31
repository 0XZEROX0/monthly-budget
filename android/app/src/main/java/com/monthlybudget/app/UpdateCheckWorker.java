package com.monthlybudget.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONObject;

/**
 * Every few hours, with the app closed, asks GitHub for the latest build (the same release
 * src/data/appUpdate.ts reads) and posts one notification per new build, with the first
 * lines of its What's new list. Tapping it opens the app, which then shows its update popup.
 * Settings › App can turn it off.
 */
public class UpdateCheckWorker extends Worker {
    private static final String RELEASE_API = "https://api.github.com/repos/0XZEROX0/monthly-budget/releases/tags/android";
    private static final String CHANNEL = "updates";
    private static final String WORK = "update-check";
    /** One small request to GitHub this often; Android may stretch it to save battery. */
    private static final int HOURS = 6;

    public UpdateCheckWorker(@NonNull Context ctx, @NonNull WorkerParameters params) {
        super(ctx, params);
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences("app_updates", Context.MODE_PRIVATE);
    }

    /** Records the running build and makes sure the check is scheduled. */
    static void watch(Context ctx, int build) {
        SharedPreferences p = prefs(ctx);
        p.edit().putInt("build", build).apply();
        Constraints net = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(UpdateCheckWorker.class, HOURS, TimeUnit.HOURS).setConstraints(net).build();
        // Replaces a schedule left by an older build with a different interval; otherwise keeps it.
        boolean current = p.getInt("hours", 0) == HOURS;
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(WORK, current ? ExistingPeriodicWorkPolicy.KEEP : ExistingPeriodicWorkPolicy.UPDATE, req);
        p.edit().putInt("hours", HOURS).apply();
    }

    /** Stops the background check (update notifications turned off). */
    static void stop(Context ctx) {
        WorkManager.getInstance(ctx).cancelUniqueWork(WORK);
        prefs(ctx).edit().remove("hours").apply();
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        SharedPreferences p = prefs(ctx);
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(RELEASE_API).openConnection();
            c.setRequestProperty("Accept", "application/vnd.github+json");
            c.setConnectTimeout(20000);
            c.setReadTimeout(20000);
            if (c.getResponseCode() != 200) return Result.success();
            String body;
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[16 * 1024];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                body = out.toString("UTF-8");
            } finally {
                c.disconnect();
            }
            JSONObject rel = new JSONObject(body);
            // The title reads "Monthly Budget for Android (build N)".
            Matcher m = Pattern.compile("build (\\d+)").matcher(rel.optString("name"));
            if (!m.find()) return Result.success();
            int latest = Integer.parseInt(m.group(1));
            int running = p.getInt("build", 0);
            if (latest <= running || latest <= p.getInt("notified", 0)) return Result.success();
            p.edit().putInt("notified", latest).apply();
            notify(ctx, latest, changes(rel.optString("body"), running));
        } catch (Exception e) {
            return Result.retry();
        }
        return Result.success();
    }

    /** The What's new lines ("- 31|Reports: …") newer than the running build, newest first. */
    private static List<String> changes(String notes, int running) {
        List<String> out = new ArrayList<>();
        Matcher m = Pattern.compile("(?m)^- (\\d+)\\|(.+)$").matcher(notes);
        while (m.find()) if (Integer.parseInt(m.group(1)) > running) out.add(m.group(2).trim());
        return out;
    }

    private static void notify(Context ctx, int build, List<String> changes) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
        if (!nm.areNotificationsEnabled()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "App updates", NotificationManager.IMPORTANCE_DEFAULT);
            ctx.getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(ctx, 3, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder n = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_budget)
            .setContentTitle("Monthly Budget update is out")
            .setContentText(changes.isEmpty() ? "Build " + build + " is ready. Tap to update." : changes.get(0))
            .setContentIntent(tap)
            .setAutoCancel(true);
        if (!changes.isEmpty()) {
            // Expanded: up to four changes, then how many more.
            StringBuilder text = new StringBuilder("Build " + build + " is ready. What's new:");
            for (int i = 0; i < Math.min(4, changes.size()); i++) text.append("\n• ").append(changes.get(i));
            if (changes.size() > 4) text.append("\nand ").append(changes.size() - 4).append(" more");
            n.setStyle(new NotificationCompat.BigTextStyle().bigText(text));
        }
        try {
            nm.notify(300_000, n.build());
        } catch (SecurityException ignored) {
            // Notification permission was revoked between the check and the post.
        }
    }
}
