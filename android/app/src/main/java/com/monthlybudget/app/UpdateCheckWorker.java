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
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Twice a day, with the app closed, asks GitHub for the latest build (the same release
 * src/data/appUpdate.ts reads) and posts one notification per new build. Tapping it
 * opens the app, which then shows its update popup.
 */
public class UpdateCheckWorker extends Worker {
    private static final String RELEASE_API = "https://api.github.com/repos/0XZEROX0/monthly-budget/releases/tags/android";
    private static final String CHANNEL = "updates";
    private static final String WORK = "update-check";

    public UpdateCheckWorker(@NonNull Context ctx, @NonNull WorkerParameters params) {
        super(ctx, params);
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences("app_updates", Context.MODE_PRIVATE);
    }

    /** Records the running build and makes sure the check is scheduled. */
    static void watch(Context ctx, int build) {
        prefs(ctx).edit().putInt("build", build).apply();
        Constraints net = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(UpdateCheckWorker.class, 12, TimeUnit.HOURS).setConstraints(net).build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, req);
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
            // The title reads "Monthly Budget for Android (build N)".
            Matcher m = Pattern.compile("\"name\"\\s*:\\s*\"[^\"]*build (\\d+)").matcher(body);
            if (!m.find()) return Result.success();
            int latest = Integer.parseInt(m.group(1));
            if (latest <= p.getInt("build", 0) || latest <= p.getInt("notified", 0)) return Result.success();
            p.edit().putInt("notified", latest).apply();
            notify(ctx, latest);
        } catch (Exception e) {
            return Result.retry();
        }
        return Result.success();
    }

    private static void notify(Context ctx, int build) {
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
            .setContentText("Build " + build + " is ready. Tap to update.")
            .setContentIntent(tap)
            .setAutoCancel(true);
        try {
            nm.notify(300_000, n.build());
        } catch (SecurityException ignored) {
            // Notification permission was revoked between the check and the post.
        }
    }
}
