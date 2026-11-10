package com.monthlybudget.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Gives the home screen widgets (BudgetWidget, BoardWidget) the current month's numbers, formatted by the app. */
@CapacitorPlugin(name = "Widget")
public class WidgetPlugin extends Plugin {
    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences("budget_widget", Context.MODE_PRIVATE);
    }

    /**
     * True when the saved numbers are for an earlier month than the phone's: a new month began
     * and the app hasn't been opened in it yet, so "left to spend" and the rest are last month's.
     */
    static boolean stale(Context ctx) {
        String month = prefs(ctx).getString("month", "");
        return !month.isEmpty() && !month.equals(new java.text.SimpleDateFormat("yyyy-MM", java.util.Locale.US).format(new java.util.Date()));
    }

    static final String STALE_NOTE = "A new month has started. Open the app to refresh.";

    @PluginMethod
    public void update(PluginCall call) {
        prefs(getContext()).edit()
            .putString("label", call.getString("label", ""))
            .putString("value", call.getString("value", ""))
            .putString("sub", call.getString("sub", ""))
            .putInt("pct", call.getInt("pct", 0))
            .putBoolean("over", Boolean.TRUE.equals(call.getBoolean("over", false)))
            .putString("data", call.getString("data", ""))
            .putString("month", call.getString("month", ""))
            .apply();
        BudgetWidget.refreshAll(getContext());
        BoardWidget.refreshAll(getContext());
        // The quick-add bar shows the same "left to spend" line.
        QuickBar.show(getContext());
        call.resolve();
    }
}
