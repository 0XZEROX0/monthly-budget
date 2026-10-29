package com.monthlybudget.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.provider.Telephony;
import android.telephony.SmsMessage;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Runs when an SMS arrives, even with the app closed. A message from one of the bank
 * senders picked in Settings raises a notification that opens the app's review list.
 */
public class SmsReceiver extends BroadcastReceiver {

    private static final String CHANNEL = "bank_sms";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (parts == null || parts.length == 0) return;
        // A long message arrives in several parts from the same sender.
        StringBuilder body = new StringBuilder();
        for (SmsMessage p : parts) body.append(p.getMessageBody());
        String address = parts[0].getOriginatingAddress();
        long date = parts[0].getTimestampMillis();

        SmsReaderPlugin.notifyReceived(address, body.toString(), date);
        if (isWatched(context, address)) notify(context, address, body.toString());
    }

    /** Senders are compared like src/data/egyptBanks.ts senderKey: lowercase, letters and digits only. */
    private static boolean isWatched(Context context, String address) {
        if (address == null) return false;
        String key = address.toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9]", "");
        String saved = SmsReaderPlugin.prefs(context).getString(SmsReaderPlugin.KEY_SENDERS, "");
        for (String s : saved.split("\n")) {
            if (!s.isEmpty() && key.equals(s)) return true;
        }
        return false;
    }

    private static void notify(Context context, String address, String body) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(context);
        if (!nm.areNotificationsEnabled()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Bank messages", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Card payments to add to your budget");
            context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
        Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder n = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_budget)
            .setContentTitle("New payment from " + address)
            .setContentText("Tap to add it to your budget")
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(tap)
            .setAutoCancel(true);
        try {
            nm.notify((int) (System.currentTimeMillis() % Integer.MAX_VALUE), n.build());
        } catch (SecurityException ignored) {
            // Notification permission was revoked between the check and the post.
        }
    }
}
