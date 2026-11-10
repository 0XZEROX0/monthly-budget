package com.monthlybudget.app;

import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;
import org.json.JSONObject;

/** Savings goals: saved against target with a bar, and what it takes to reach each one. Scrolls. */
public class GoalsWidget extends BoardWidget {
    @Override
    RemoteViews views(Context ctx, int id, JSONObject data, Bundle size) {
        return WidgetViews.card(ctx, id, "goals", "Savings goals", data, "monthlybudget://summary", 60, false);
    }
}
