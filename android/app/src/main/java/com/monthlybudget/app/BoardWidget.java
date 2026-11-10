package com.monthlybudget.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;
import org.json.JSONObject;

/**
 * Base for the widgets that read the app's WidgetData (src/native/widgetData.ts), stored
 * by WidgetPlugin as JSON. Each subclass lays out one part of it; the app refreshes them
 * all whenever it shows this month's numbers.
 */
public abstract class BoardWidget extends AppWidgetProvider {

    /** The widget's layout, filled from the app's data (null until the app has run once). */
    abstract RemoteViews views(Context ctx, int id, JSONObject data, Bundle size);

    /** Whether this widget's numbers belong to one month (the plan, spending) rather than standing (balances, goals). */
    boolean monthly() {
        return true;
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        // Also runs every hour or so (updatePeriodMillis), so days and months turn over with the app closed.
        for (int id : ids) mgr.updateAppWidget(id, views(ctx, id, monthly() ? monthData(ctx) : data(ctx), mgr.getAppWidgetOptions(id)));
        mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }

    /** The app's data, or null when it is for an earlier month than now (WidgetPlugin.stale). */
    static JSONObject monthData(Context ctx) {
        return WidgetPlugin.stale(ctx) ? null : data(ctx);
    }

    static JSONObject data(Context ctx) {
        String raw = WidgetPlugin.prefs(ctx).getString("data", "");
        if (raw.isEmpty()) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private static final Class<? extends BoardWidget>[] ALL = new Class[] {
        PlanWidget.class, CategoriesWidget.class, RecentWidget.class, AccountsWidget.class, GoalsWidget.class,
    };

    static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        JSONObject all = data(ctx);
        JSONObject data = monthData(ctx);
        for (Class<? extends BoardWidget> type : ALL) {
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, type));
            if (ids.length == 0) continue;
            try {
                BoardWidget w = type.getDeclaredConstructor().newInstance();
                for (int id : ids) mgr.updateAppWidget(id, w.views(ctx, id, w.monthly() ? data : all, mgr.getAppWidgetOptions(id)));
                // The scrolling lists reload their rows (WidgetListService).
                mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
            } catch (Exception ignored) {
                // A widget that fails to draw keeps its last picture.
            }
        }
    }
}
