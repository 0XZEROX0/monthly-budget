package com.monthlybudget.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * The quick-add bar: a notification that stays in the notification shade with buttons for
 * Expense, Income, Transfer and Summary. Each button opens the app at a monthlybudget:// link
 * (handled in src/components/MonthView.tsx). Turned on and off in Settings › Quick add
 * (QuickBarPlugin); the choice belongs to this phone.
 */
final class QuickBar {
    private static final String CHANNEL = "quick_add";
    private static final int ID = 4242;

    private QuickBar() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences("budget_quickbar", Context.MODE_PRIVATE);
    }

    static boolean enabled(Context ctx) {
        return prefs(ctx).getBoolean("on", false);
    }

    static void setEnabled(Context ctx, boolean on) {
        prefs(ctx).edit().putBoolean("on", on).apply();
        if (on) show(ctx);
        else NotificationManagerCompat.from(ctx).cancel(ID);
    }

    static boolean allowed(Context ctx) {
        if (Build.VERSION.SDK_INT >= 33 && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled();
    }

    /** Posts (or refreshes) the bar when it is turned on; safe to call any time. */
    static void show(Context ctx) {
        if (!enabled(ctx) || !allowed(ctx)) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Quick add bar", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Buttons to add an expense, income or transfer, or see your summary");
            ch.setShowBadge(false);
            ch.setSound(null, null);
            ctx.getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }

        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.notification_quick_add);
        v.setOnClickPendingIntent(R.id.quick_expense, link(ctx, "monthlybudget://add/expense", 10));
        v.setOnClickPendingIntent(R.id.quick_income, link(ctx, "monthlybudget://add/income", 11));
        v.setOnClickPendingIntent(R.id.quick_transfer, link(ctx, "monthlybudget://add/transfer", 12));
        v.setOnClickPendingIntent(R.id.quick_summary, link(ctx, "monthlybudget://summary", 13));

        // The same line the home screen widget shows, e.g. "Left to spend EGP 3,250".
        SharedPreferences w = WidgetPlugin.prefs(ctx);
        String value = w.getString("value", "");
        String line = value.isEmpty() ? "Quick add" : w.getString("label", "") + " " + value;

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_budget)
            .setContentTitle(line)
            .setSubText(line)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(v)
            .setCustomBigContentView(v)
            .setContentIntent(link(ctx, "monthlybudget://summary", 14))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .setLocalOnly(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_LOW);
        try {
            NotificationManagerCompat.from(ctx).notify(ID, b.build());
        } catch (SecurityException e) {
            // Notifications were turned off for the app; the bar comes back once they're allowed.
        }
    }

    private static PendingIntent link(Context ctx, String url, int code) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url), ctx, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
