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
        super.onCreate(savedInstanceState);
        // Android 12+ stretches the whole WebView on overscroll, fixed tab bar and + button
        // included. Turn that off; the page draws its own pull effect on the background.
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
    }
}
