package com.monthlybudget.app;

import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;
import org.json.JSONObject;

/** This month's expense categories: spent against budget, with a bar each. Scrolls to show them all. */
public class CategoriesWidget extends BoardWidget {
    @Override
    RemoteViews views(Context ctx, int id, JSONObject data, Bundle size) {
        return WidgetViews.card(ctx, id, "categories", "Categories", data, "monthlybudget://summary", 30, false);
    }
}
