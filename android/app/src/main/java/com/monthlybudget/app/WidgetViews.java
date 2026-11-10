package com.monthlybudget.app;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/** Shared pieces for the list widgets: the card with a header, its scrolling list, and the rows. */
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

    /**
     * The list card: title, month, an optional + button, and a list of `kind` rows
     * ("categories", "recent" or "accounts" in the app's WidgetData) that scrolls.
     */
    static RemoteViews card(Context ctx, int widgetId, String kind, String title, JSONObject data, String tapLink, int code, boolean addButton) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_list);
        v.setTextViewText(R.id.widget_title, title);
        v.setTextViewText(R.id.widget_month, data == null ? "" : data.optString("month"));
        v.setViewVisibility(R.id.widget_footer, View.GONE);
        v.setViewVisibility(R.id.widget_add, addButton ? View.VISIBLE : View.GONE);
        if (addButton) v.setOnClickPendingIntent(R.id.widget_add, open(ctx, "monthlybudget://add/expense", code + 1));
        PendingIntent tap = open(ctx, tapLink, code);
        v.setOnClickPendingIntent(R.id.widget_root, tap);

        // Each widget gets its own adapter intent (the data URI keeps them apart).
        Intent adapter = new Intent(ctx, WidgetListService.class)
            .putExtra("kind", kind)
            .setData(Uri.parse("monthlybudget-widget://" + kind + "/" + widgetId));
        v.setRemoteAdapter(R.id.widget_list, adapter);
        // Tapping a row opens the app like tapping the card does (rows fill in an empty intent).
        v.setPendingIntentTemplate(R.id.widget_list, PendingIntent.getActivity(ctx, code + 2,
            tapIntent(ctx, tapLink), PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        v.setEmptyView(R.id.widget_list, R.id.widget_empty);
        v.setTextViewText(R.id.widget_empty, data != null ? emptyNote(kind) : WidgetPlugin.stale(ctx) ? WidgetPlugin.STALE_NOTE : "Open the app to load your numbers");
        return v;
    }

    private static Intent tapIntent(Context ctx, String link) {
        Intent i = link == null
            ? new Intent(ctx, MainActivity.class)
            : new Intent(Intent.ACTION_VIEW, Uri.parse(link), ctx, MainActivity.class);
        return i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    }

    private static String emptyNote(String kind) {
        switch (kind) {
            case "categories": return "No spending or budget this month yet";
            case "recent": return "No expenses this month yet";
            case "goals": return "No savings goals yet. Add one in Settings.";
            default: return "No accounts yet";
        }
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

    /** A savings goal: name, saved / target, a green bar, and how it is going. */
    static RemoteViews goal(Context ctx, JSONObject g) {
        RemoteViews r = new RemoteViews(ctx.getPackageName(), R.layout.widget_row_goal);
        r.setTextViewText(R.id.row_icon, g.optString("icon"));
        r.setTextViewText(R.id.row_title, g.optString("name"));
        r.setTextViewText(R.id.row_amount, g.optString("saved") + " / " + g.optString("target"));
        r.setProgressBar(R.id.row_bar, 100, g.optInt("pct"), false);
        r.setTextViewText(R.id.row_sub, g.optString("sub"));
        r.setTextColor(R.id.row_sub, ctx.getColor(g.optBoolean("late") ? R.color.widget_over : R.color.widget_muted));
        return r;
    }

    /**
     * An expense's second line, "Food · Today, 8:30 PM". The day is worded here from the entry's
     * date, so it reads Yesterday once midnight passes, without the app being opened.
     */
    static String recentSub(JSONObject o) {
        String date = o.optString("date");
        if (date.isEmpty()) return o.optString("sub");
        String day;
        try {
            // SimpleDateFormat rather than java.time, which the oldest phones this app supports lack.
            java.text.SimpleDateFormat iso = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US);
            java.util.Date d = iso.parse(date);
            java.util.Calendar c = java.util.Calendar.getInstance();
            String today = iso.format(c.getTime());
            c.add(java.util.Calendar.DAY_OF_MONTH, -1);
            String yesterday = iso.format(c.getTime());
            day = date.equals(today) ? "Today"
                : date.equals(yesterday) ? "Yesterday"
                : new java.text.SimpleDateFormat("EEE d MMM", java.util.Locale.getDefault()).format(d);
        } catch (Exception e) {
            return o.optString("sub");
        }
        String time = o.optString("time");
        String when = time.isEmpty() ? day : day + ", " + time;
        String where = o.optString("where");
        return where.isEmpty() ? when : where + " · " + when;
    }

    /** The row for entry `i` of a list kind, or null when it is missing. */
    static RemoteViews row(Context ctx, String kind, JSONArray list, int i) {
        JSONObject o = list == null ? null : list.optJSONObject(i);
        if (o == null) return null;
        RemoteViews r;
        switch (kind) {
            case "categories": r = category(ctx, o); break;
            case "goals": r = goal(ctx, o); break;
            case "recent": r = item(ctx, o.optString("icon"), o.optString("title"), recentSub(o), o.optString("amount")); break;
            default: r = item(ctx, o.optString("icon"), o.optString("name"), null, o.optString("value"));
        }
        // Rows open the app through the list's PendingIntent template.
        r.setOnClickFillInIntent(R.id.row_root, new Intent());
        return r;
    }
}
