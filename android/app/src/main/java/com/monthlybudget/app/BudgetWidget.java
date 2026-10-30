package com.monthlybudget.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Home screen widget: what's left to spend this month, and a + button that opens the
 * add form. The numbers are the ones the app last showed (WidgetPlugin).
 */
public class BudgetWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, views(ctx));
    }

    static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, BudgetWidget.class));
        for (int id : ids) mgr.updateAppWidget(id, views(ctx));
    }

    private static RemoteViews views(Context ctx) {
        SharedPreferences p = WidgetPlugin.prefs(ctx);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_budget);
        String value = p.getString("value", "");
        boolean over = p.getBoolean("over", false);
        v.setTextViewText(R.id.widget_label, value.isEmpty() ? "Monthly Budget" : p.getString("label", ""));
        v.setTextViewText(R.id.widget_value, value.isEmpty() ? "Open the app" : value);
        v.setTextViewText(R.id.widget_sub, p.getString("sub", ""));
        v.setTextColor(R.id.widget_value, ctx.getColor(over ? R.color.widget_over : R.color.widget_text));
        v.setProgressBar(R.id.widget_progress, 100, p.getInt("pct", 0), false);
        v.setViewVisibility(R.id.widget_progress, value.isEmpty() ? View.GONE : View.VISIBLE);

        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(ctx, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        // Handled in src/components/MonthView.tsx, which opens the add form.
        Intent add = new Intent(Intent.ACTION_VIEW, Uri.parse("monthlybudget://add"), ctx, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(R.id.widget_add, PendingIntent.getActivity(ctx, 2, add, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        return v;
    }
}
