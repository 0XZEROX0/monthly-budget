package com.monthlybudget.app;

import android.os.Bundle;
import android.view.View;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmsReaderPlugin.class);
        registerPlugin(GoogleSignInPlugin.class);
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(WearPlugin.class);
        registerPlugin(AppLockPlugin.class);
        registerPlugin(WidgetPlugin.class);
        registerPlugin(QuickBarPlugin.class);
        super.onCreate(savedInstanceState);
        // Android 12+ stretches the whole WebView on overscroll, fixed tab bar and + button
        // included. Turn that off; the page draws its own pull effect on the background.
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
    }

    @Override
    public void onResume() {
        super.onResume();
        // The quick-add bar normally comes straight back when cleared; this also covers the
        // rare case it didn't (e.g. notifications were off for a while).
        QuickBar.show(this);
    }
}
