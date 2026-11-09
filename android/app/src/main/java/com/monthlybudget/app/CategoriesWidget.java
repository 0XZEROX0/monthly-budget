package com.monthlybudget.app;

import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/** This month's expense categories: spent against budget, with a bar each. Taller shows more. */
public class CategoriesWidget extends BoardWidget {
    @Override
    RemoteViews views(Context ctx, JSONObject data, Bundle size) {
        RemoteViews v = WidgetViews.card(ctx, "Categories", data, "monthlybudget://summary", 30, false);
        if (data == null) return v;
        JSONArray cats = data.optJSONArray("categories");
        int n = WidgetViews.count(cats);
        if (n == 0) {
            WidgetViews.empty(v, "No spending or budget this month yet");
            return v;
        }
        int fit = Math.min(n, rowsThatFit(size, 40, 4));
        for (int i = 0; i < fit; i++) v.addView(R.id.widget_rows, WidgetViews.category(ctx, cats.optJSONObject(i)));
        if (n > fit) WidgetViews.footer(v, "+" + (n - fit) + " more · make the widget taller to see them");
        return v;
    }
}
