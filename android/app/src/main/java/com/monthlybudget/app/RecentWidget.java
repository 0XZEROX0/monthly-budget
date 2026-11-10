package com.monthlybudget.app;

import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;
import org.json.JSONObject;

/** The latest expenses this month, newest first (scrolls), with a + button to add one. */
public class RecentWidget extends BoardWidget {
    @Override
    RemoteViews views(Context ctx, int id, JSONObject data, Bundle size) {
        return WidgetViews.card(ctx, id, "recent", L.t(ctx, "Latest expenses", "آخر المصروفات"), data, null, 40, true);
    }
}
