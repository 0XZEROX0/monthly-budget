package com.monthlybudget.app;

import android.content.Context;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONObject;

/** The month's plan against what happened: income, spending (with bars), left to spend and saved. */
public class PlanWidget extends BoardWidget {
    @Override
    RemoteViews views(Context ctx, int id, JSONObject data, Bundle size) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_plan);
        v.setOnClickPendingIntent(R.id.widget_root, WidgetViews.open(ctx, "monthlybudget://summary", 20));
        v.setOnClickPendingIntent(R.id.widget_add, WidgetViews.open(ctx, "monthlybudget://add/expense", 21));
        JSONObject p = data == null ? null : data.optJSONObject("plan");
        if (p == null) {
            v.setTextViewText(R.id.widget_month, "Open the app to load your plan");
            return v;
        }
        v.setTextViewText(R.id.widget_month, data.optString("month"));
        v.setTextViewText(R.id.plan_income, ofPlan(p.optString("income"), p.optString("incomePlanned")));
        v.setProgressBar(R.id.plan_income_bar, 100, p.optInt("incomePct"), false);

        boolean over = p.optBoolean("over");
        v.setTextViewText(R.id.plan_spent, ofPlan(p.optString("spent"), p.optString("spentPlanned")));
        v.setTextColor(R.id.plan_spent, ctx.getColor(over ? R.color.widget_over : R.color.widget_text));
        v.setViewVisibility(R.id.plan_spent_bar, over ? View.GONE : View.VISIBLE);
        v.setViewVisibility(R.id.plan_spent_bar_over, over ? View.VISIBLE : View.GONE);
        v.setProgressBar(over ? R.id.plan_spent_bar_over : R.id.plan_spent_bar, 100, p.optInt("spentPct"), false);

        v.setTextViewText(R.id.plan_left_label, p.optString("leftLabel"));
        v.setTextViewText(R.id.plan_left, p.optString("left").isEmpty() ? "—" : p.optString("left"));
        v.setTextColor(R.id.plan_left, ctx.getColor(over ? R.color.widget_over : R.color.widget_text));
        String pct = p.optString("savedPct");
        v.setTextViewText(R.id.plan_saved_label, pct.isEmpty() ? "Saved" : "Saved · " + pct);
        v.setTextViewText(R.id.plan_saved, p.optString("saved"));
        return v;
    }

    private static String ofPlan(String actual, String planned) {
        return planned.isEmpty() ? actual : actual + " of " + planned;
    }
}
