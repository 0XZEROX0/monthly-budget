package com.monthlybudget.app;

import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.wearable.DataClient;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.Wearable;

/**
 * Links the Galaxy Watch app (wear/) to this account. Puts the Firebase sign-in on the
 * Wear OS Data Layer, which only reaches the watch app with this same package and
 * signing key. The watch then reads and writes Firestore itself, so entries made on the
 * watch land even while the phone app is closed.
 */
@CapacitorPlugin(name = "Wear")
public class WearPlugin extends Plugin {
    static final String PATH = "/budget/link";
    /** Changes whenever the budget is edited on the phone; the watch then fetches just the changes. */
    static final String CHANGED_PATH = "/budget/changed";

    @PluginMethod
    public void share(PluginCall call) {
        DataClient client = Wearable.getDataClient(getContext());
        String token = call.getString("refreshToken");
        if (token == null || token.isEmpty()) {
            // Signed out: unlink the watch too.
            client.deleteDataItems(new Uri.Builder().scheme("wear").path(PATH).build())
                .addOnCompleteListener(t -> call.resolve());
            return;
        }
        PutDataMapRequest req = PutDataMapRequest.create(PATH);
        DataMap map = req.getDataMap();
        map.putString("refreshToken", token);
        map.putString("uid", call.getString("uid", ""));
        map.putString("apiKey", call.getString("apiKey", ""));
        map.putString("projectId", call.getString("projectId", ""));
        map.putBoolean("hidden", Boolean.TRUE.equals(call.getBoolean("hidden", false)));
        // Phones without Wear OS services fail here; there's no watch to tell, so that's fine.
        client.putDataItem(req.asPutDataRequest().setUrgent()).addOnCompleteListener(t -> call.resolve());
    }

    @PluginMethod
    public void ping(PluginCall call) {
        PutDataMapRequest req = PutDataMapRequest.create(CHANGED_PATH);
        // A new value each time, since the Data Layer only tells the watch about changes.
        req.getDataMap().putLong("at", System.currentTimeMillis());
        Wearable.getDataClient(getContext())
            .putDataItem(req.asPutDataRequest().setUrgent())
            .addOnCompleteListener(t -> call.resolve());
    }
}
