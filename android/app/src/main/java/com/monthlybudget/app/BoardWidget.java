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
    abstract RemoteViews views(Context ctx, JSONObject data, Bundle size);

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, views(ctx, data(ctx), mgr.getAppWidgetOptions(id)));
    }

    /** Resizing changes how many rows fit. */
    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle options) {
        mgr.updateAppWidget(id, views(ctx, data(ctx), options));
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
        PlanWidget.class, CategoriesWidget.class, RecentWidget.class, AccountsWidget.class,
    };

    static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        JSONObject data = data(ctx);
        for (Class<? extends BoardWidget> type : ALL) {
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, type));
            if (ids.length == 0) continue;
            try {
                BoardWidget w = type.getDeclaredConstructor().newInstance();
                for (int id : ids) mgr.updateAppWidget(id, w.views(ctx, data, mgr.getAppWidgetOptions(id)));
            } catch (Exception ignored) {
                // A widget that fails to draw keeps its last picture.
            }
        }
    }

    /** How many list rows of this height (dp) fit under the header, from the widget's current size. */
    static int rowsThatFit(Bundle size, int rowDp, int fallback) {
        int h = size == null ? 0 : size.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        if (h <= 0) return fallback;
        return Math.max(1, (h - 56) / rowDp);
    }
}
