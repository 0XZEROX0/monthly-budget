package com.monthlybudget.app;

import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;
import org.json.JSONObject;

/** Each account's balance (Cash, Bank, Thndr...), with cash + bank and debts underneath. Scrolls. */
public class AccountsWidget extends BoardWidget {
    /** Balances and goals carry over from month to month. */
    @Override
    boolean monthly() {
        return false;
    }

    @Override
    RemoteViews views(Context ctx, int id, JSONObject data, Bundle size) {
        RemoteViews v = WidgetViews.card(ctx, id, "accounts", L.t(ctx, "Accounts", "الحسابات"), data, "monthlybudget://summary", 50, false);
        if (data == null) return v;
        String debts = data.optString("debts");
        WidgetViews.footer(v, L.t(ctx, "Cash + bank ", "كاش + بنك ") + data.optString("liquidity") + (debts.isEmpty() ? "" : L.t(ctx, " · Debts ", " · الديون ") + debts));
        return v;
    }
}
