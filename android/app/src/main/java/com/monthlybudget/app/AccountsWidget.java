package com.monthlybudget.app;

import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/** Each account's balance (Cash, Bank, Thndr...), with cash + bank and debts underneath. */
public class AccountsWidget extends BoardWidget {
    @Override
    RemoteViews views(Context ctx, JSONObject data, Bundle size) {
        RemoteViews v = WidgetViews.card(ctx, "Accounts", data, "monthlybudget://summary", 50, false);
        if (data == null) return v;
        JSONArray accounts = data.optJSONArray("accounts");
        int n = WidgetViews.count(accounts);
        if (n == 0) {
            WidgetViews.empty(v, "No accounts yet");
            return v;
        }
        int fit = Math.min(n, rowsThatFit(size, 36, 3));
        for (int i = 0; i < fit; i++) {
            JSONObject a = accounts.optJSONObject(i);
            v.addView(R.id.widget_rows, WidgetViews.item(ctx, a.optString("icon"), a.optString("name"), null, a.optString("value")));
        }
        String debts = data.optString("debts");
        WidgetViews.footer(v, "Cash + bank " + data.optString("liquidity") + (debts.isEmpty() ? "" : " · Debts " + debts));
        return v;
    }
}
