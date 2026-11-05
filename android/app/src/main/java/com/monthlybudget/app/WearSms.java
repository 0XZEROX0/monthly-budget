package com.monthlybudget.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.provider.Telephony;
import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.Wearable;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Passes a new bank SMS to the Galaxy Watch as it arrives, so it shows in the watch's queue
 * without opening the phone app. The watch reads it the way the phone app would
 * (wear/.../SmsParser.kt) and saves it as sms-{inbox id}, the same id the phone app uses.
 */
final class WearSms {
    /** Read by the watch's LinkListenerService (wear/.../Sms.kt SMS_NEW_PATH). */
    static final String NEW_PATH = "/budget/sms-new";
    private static final String KEY = "forwarded";
    private static final int KEEP = 30;
    private static final long KEEP_MS = 14L * 24 * 60 * 60 * 1000;

    private WearSms() {}

    /** Runs off the main thread: waits for the message to reach the inbox, then sends it. */
    static void forward(Context context, String address, String body) {
        String id = inboxId(context, address, body);
        if (id == null) return;
        try {
            SharedPreferences prefs = SmsReaderPlugin.prefs(context);
            JSONArray old = new JSONArray(prefs.getString(KEY, "[]"));
            JSONArray kept = new JSONArray();
            long now = System.currentTimeMillis();
            for (int i = Math.max(0, old.length() - (KEEP - 1)); i < old.length(); i++) {
                JSONObject m = old.getJSONObject(i);
                if (now - m.optLong("date") < KEEP_MS && !id.equals(m.optString("id"))) kept.put(m);
            }
            kept.put(new JSONObject().put("id", id).put("address", address).put("body", body).put("date", now));
            prefs.edit().putString(KEY, kept.toString()).apply();

            PutDataMapRequest req = PutDataMapRequest.create(NEW_PATH);
            req.getDataMap().putString("items", kept.toString());
            Tasks.await(Wearable.getDataClient(context).putDataItem(req.asPutDataRequest().setUrgent()), 3, TimeUnit.SECONDS);
        } catch (Exception ignored) {
            // No watch, or the Data Layer isn't there: the phone app still has the message.
        }
    }

    /**
     * The inbox row id of a message just received. The SMS app writes it to the inbox a moment
     * after the broadcast, so look a few times.
     */
    private static String inboxId(Context context, String address, String body) {
        for (int attempt = 0; attempt < 5; attempt++) {
            try (
                Cursor c = context
                    .getContentResolver()
                    .query(
                        Telephony.Sms.Inbox.CONTENT_URI,
                        new String[] { Telephony.Sms._ID, Telephony.Sms.BODY },
                        Telephony.Sms.ADDRESS + " = ? AND " + Telephony.Sms.DATE + " > ?",
                        new String[] { address, String.valueOf(System.currentTimeMillis() - 10 * 60 * 1000) },
                        Telephony.Sms._ID + " DESC"
                    )
            ) {
                while (c != null && c.moveToNext()) {
                    if (body.equals(c.getString(1))) return c.getString(0);
                }
            } catch (Exception e) {
                // No permission to read the inbox.
                return null;
            }
            try {
                Thread.sleep(1000);
            } catch (InterruptedException e) {
                return null;
            }
        }
        return null;
    }
}
