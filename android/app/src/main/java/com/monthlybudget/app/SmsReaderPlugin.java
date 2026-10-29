package com.monthlybudget.app;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.provider.Telephony;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;

/**
 * Reads the SMS inbox so the web app can turn bank card messages into transactions.
 * Parsing happens in JavaScript (src/data/smsParser.ts); this side only lists messages,
 * and remembers which senders are banks so SmsReceiver can notify about new ones.
 */
@CapacitorPlugin(
    name = "SmsReader",
    permissions = {
        @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class SmsReaderPlugin extends Plugin {

    static final String PREFS = "sms_reader";
    static final String KEY_SENDERS = "senders";

    /** The running plugin, so SmsReceiver can tell the open app about a new message. */
    private static SmsReaderPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
    }

    static void notifyReceived(String address, String body, long date) {
        SmsReaderPlugin p = instance;
        if (p == null) return;
        JSObject data = new JSObject();
        data.put("address", address);
        data.put("body", body);
        data.put("date", date);
        p.notifyListeners("smsReceived", data);
    }

    /** Messages received after `since` (ms since epoch), newest first. */
    @PluginMethod
    public void list(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("SMS permission not granted", "PERMISSION");
            return;
        }
        long since = call.getLong("since", 0L);
        int limit = call.getInt("limit", 1000);
        JSArray messages = new JSArray();
        String[] columns = { Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE };
        try (
            Cursor c = getContext()
                .getContentResolver()
                .query(
                    Telephony.Sms.Inbox.CONTENT_URI,
                    columns,
                    Telephony.Sms.DATE + " > ?",
                    new String[] { String.valueOf(since) },
                    Telephony.Sms.DATE + " DESC"
                )
        ) {
            while (c != null && c.moveToNext() && messages.length() < limit) {
                JSObject m = new JSObject();
                m.put("id", c.getString(0));
                m.put("address", c.getString(1));
                m.put("body", c.getString(2));
                m.put("date", c.getLong(3));
                messages.put(m);
            }
        } catch (Exception e) {
            call.reject("Could not read SMS: " + e.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("messages", messages);
        call.resolve(ret);
    }

    /** Senders (e.g. "CIB", "NBE") whose new messages should raise a notification. */
    @PluginMethod
    public void setWatchedSenders(PluginCall call) {
        JSArray senders = call.getArray("senders", new JSArray());
        List<String> list = new ArrayList<>();
        try {
            for (Object s : senders.toList()) list.add(String.valueOf(s).trim());
        } catch (JSONException e) {
            call.reject("senders must be a list of strings");
            return;
        }
        prefs(getContext()).edit().putString(KEY_SENDERS, String.join("\n", list)).apply();
        call.resolve();
    }

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
