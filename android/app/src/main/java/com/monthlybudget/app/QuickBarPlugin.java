package com.monthlybudget.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Settings › Quick add: turns the notification bar (QuickBar) on or off on this phone. */
@CapacitorPlugin(name = "QuickBar")
public class QuickBarPlugin extends Plugin {
    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(state());
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        QuickBar.setEnabled(getContext(), Boolean.TRUE.equals(call.getBoolean("on", false)));
        call.resolve(state());
    }

    private JSObject state() {
        JSObject r = new JSObject();
        r.put("on", QuickBar.enabled(getContext()));
        r.put("allowed", QuickBar.allowed(getContext()));
        return r;
    }
}
