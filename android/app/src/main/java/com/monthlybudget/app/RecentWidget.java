package com.monthlybudget.app;

import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/** The latest expenses this month, newest first, with a + button to add one. */
public class RecentWidget extends BoardWidget {
    @Override
    RemoteViews views(Context ctx, JSONObject data, Bundle size) {
        RemoteViews v = WidgetViews.card(ctx, "Latest expenses", data, null, 40, true);
        if (data == null) return v;
        JSONArray items = data.optJSONArray("recent");
        int n = WidgetViews.count(items);
        if (n == 0) {
            WidgetViews.empty(v, "No expenses this month yet");
            return v;
        }
        int fit = Math.min(n, rowsThatFit(size, 44, 3));
        for (int i = 0; i < fit; i++) {
            JSONObject t = items.optJSONObject(i);
            v.addView(R.id.widget_rows, WidgetViews.item(ctx, t.optString("icon"), t.optString("title"), t.optString("sub"), t.optString("amount")));
        }
        return v;
    }
}
