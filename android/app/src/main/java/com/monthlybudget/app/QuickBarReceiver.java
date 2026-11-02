package com.monthlybudget.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Puts the quick-add bar back, if it is on: after the phone restarts or the app updates,
 * and right away when it is swiped away or cleared (its delete intent). Turning it off in
 * Settings cancels it without firing that intent, so it stays gone then.
 */
public class QuickBarReceiver extends BroadcastReceiver {
    static final String REPOST = "com.monthlybudget.app.QUICK_BAR_REPOST";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a) || REPOST.equals(a)) QuickBar.show(ctx);
    }
}
