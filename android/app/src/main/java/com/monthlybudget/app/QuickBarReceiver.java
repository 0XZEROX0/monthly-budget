package com.monthlybudget.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Puts the quick-add bar back after the phone restarts or the app updates, if it is on. */
public class QuickBarReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) QuickBar.show(ctx);
    }
}
