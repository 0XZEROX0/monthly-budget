package com.monthlybudget.app;

import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.wearable.DataClient;
import com.google.android.gms.wearable.DataItem;
import com.google.android.gms.wearable.DataMapItem;
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
    /** Bank SMS waiting to be added, as JSON, so they can be added or skipped on the watch. */
    static final String SMS_PATH = "/budget/sms";
    /** Put by the watch: SMS ids skipped there. */
    static final String SMS_SKIPPED_PATH = "/budget/sms-skipped";

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

    @PluginMethod
    public void shareSms(PluginCall call) {
        PutDataMapRequest req = PutDataMapRequest.create(SMS_PATH);
        req.getDataMap().putString("items", call.getString("items", "[]"));
        Wearable.getDataClient(getContext())
            .putDataItem(req.asPutDataRequest().setUrgent())
            .addOnCompleteListener(t -> call.resolve());
    }

    @PluginMethod
    public void smsSkipped(PluginCall call) {
        Uri uri = new Uri.Builder().scheme("wear").path(SMS_SKIPPED_PATH).build();
        Wearable.getDataClient(getContext()).getDataItems(uri).addOnCompleteListener(t -> {
            JSArray ids = new JSArray();
            if (t.isSuccessful() && t.getResult() != null) {
                for (DataItem item : t.getResult()) {
                    java.util.ArrayList<String> list = DataMapItem.fromDataItem(item).getDataMap().getStringArrayList("ids");
                    if (list != null) for (String id : list) ids.put(id);
                }
                t.getResult().release();
            }
            JSObject res = new JSObject();
            res.put("ids", ids);
            call.resolve(res);
        });
    }
}
