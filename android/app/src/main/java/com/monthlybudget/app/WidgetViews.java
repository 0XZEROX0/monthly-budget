package com.monthlybudget.app;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/** Shared pieces for the list widgets: the card with a header, and its rows. */
final class WidgetViews {
    private WidgetViews() {}

    /** Opens the app at a monthlybudget:// link (handled in src/components/MonthView.tsx), or just opens it. */
    static PendingIntent open(Context ctx, String link, int code) {
        Intent i = link == null
            ? new Intent(ctx, MainActivity.class)
            : new Intent(Intent.ACTION_VIEW, Uri.parse(link), ctx, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** The list card: title, month, an optional + button, and an empty note until there are rows. */
    static RemoteViews card(Context ctx, String title, JSONObject data, String tapLink, int code, boolean addButton) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_list);
        v.setTextViewText(R.id.widget_title, title);
        v.setTextViewText(R.id.widget_month, data == null ? "" : data.optString("month"));
        v.removeAllViews(R.id.widget_rows);
        v.setViewVisibility(R.id.widget_footer, View.GONE);
        v.setViewVisibility(R.id.widget_add, addButton ? View.VISIBLE : View.GONE);
        if (addButton) v.setOnClickPendingIntent(R.id.widget_add, open(ctx, "monthlybudget://add/expense", code + 1));
        v.setOnClickPendingIntent(R.id.widget_root, open(ctx, tapLink, code));
        empty(v, data == null ? "Open the app to load your numbers" : null);
        return v;
    }

    static void empty(RemoteViews v, String note) {
        v.setViewVisibility(R.id.widget_empty, note == null ? View.GONE : View.VISIBLE);
        if (note != null) v.setTextViewText(R.id.widget_empty, note);
    }

    static void footer(RemoteViews v, String text) {
        if (text == null || text.isEmpty()) return;
        v.setViewVisibility(R.id.widget_footer, View.VISIBLE);
        v.setTextViewText(R.id.widget_footer, text);
    }

    /** One line: icon, title and small line under it, amount on the right. */
    static RemoteViews item(Context ctx, String icon, String title, String sub, String amount) {
        RemoteViews r = new RemoteViews(ctx.getPackageName(), R.layout.widget_row_item);
        r.setTextViewText(R.id.row_icon, icon);
        r.setTextViewText(R.id.row_title, title);
        r.setTextViewText(R.id.row_sub, sub);
        r.setViewVisibility(R.id.row_sub, sub == null || sub.isEmpty() ? View.GONE : View.VISIBLE);
        r.setTextViewText(R.id.row_amount, amount);
        return r;
    }

    /** A category: icon, name, "spent / budget", and a bar that turns red when over. */
    static RemoteViews category(Context ctx, JSONObject c) {
        RemoteViews r = new RemoteViews(ctx.getPackageName(), R.layout.widget_row_category);
        boolean over = c.optBoolean("over");
        r.setTextViewText(R.id.row_icon, c.optString("icon"));
        r.setTextViewText(R.id.row_title, c.optString("name"));
        r.setTextViewText(R.id.row_amount, c.optString("spent") + " / " + c.optString("budget"));
        r.setTextColor(R.id.row_amount, ctx.getColor(over ? R.color.widget_over : R.color.widget_muted));
        r.setViewVisibility(R.id.row_bar, over ? View.GONE : View.VISIBLE);
        r.setViewVisibility(R.id.row_bar_over, over ? View.VISIBLE : View.GONE);
        r.setProgressBar(over ? R.id.row_bar_over : R.id.row_bar, 100, c.optInt("pct"), false);
        return r;
    }

    static int count(JSONArray a) {
        return a == null ? 0 : a.length();
    }
}
