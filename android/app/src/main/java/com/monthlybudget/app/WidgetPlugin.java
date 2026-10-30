package com.monthlybudget.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Gives the home screen widget (BudgetWidget) the current month's numbers, formatted by the app. */
@CapacitorPlugin(name = "Widget")
public class WidgetPlugin extends Plugin {
    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences("budget_widget", Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void update(PluginCall call) {
        prefs(getContext()).edit()
            .putString("label", call.getString("label", ""))
            .putString("value", call.getString("value", ""))
            .putString("sub", call.getString("sub", ""))
            .putInt("pct", call.getInt("pct", 0))
            .putBoolean("over", Boolean.TRUE.equals(call.getBoolean("over", false)))
            .apply();
        BudgetWidget.refreshAll(getContext());
        call.resolve();
    }
}
