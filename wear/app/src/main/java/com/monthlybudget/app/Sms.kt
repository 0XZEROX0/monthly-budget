package com.monthlybudget.app

import android.content.Context
import android.net.Uri
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.tasks.await
import org.json.JSONArray

/** Bank messages waiting to be added; the phone app (MonthView) puts its pending list here. */
const val SMS_PATH = "/budget/sms"

/** Messages skipped on the watch, which the phone app reads and skips too. */
const val SMS_SKIPPED_PATH = "/budget/sms-skipped"

/**
 * A bank SMS the phone read, filled in the way the phone's add form would be (draftFor in
 * src/data/bankSms.ts). Saved with the id sms-{smsId}, so the phone stops offering it.
 */
data class SmsItem(
    val smsId: String,
    val title: String,
    /** Date and card, e.g. "Today · CIB ••1234". */
    val sub: String,
    val body: String,
    val kind: String,
    val amount: Double,
    val account: String,
    val debt: String,
    val category: String,
    val description: String,
    val date: String,
) {
    val id get() = "sms-$smsId"
    val incoming get() = kind == "income" || kind == "borrow"

    fun entry() = Entry(id, kind, amount, category, account, date, debt = debt, description = description)
}

object Sms {
    private fun prefs(context: Context) = context.getSharedPreferences("budget", Context.MODE_PRIVATE)

    fun parse(json: String): List<SmsItem> {
        val a = JSONArray(json)
        return (0 until a.length()).map { a.getJSONObject(it) }.map {
            SmsItem(
                it.getString("smsId"), it.optString("title"), it.optString("sub"), it.optString("body"),
                it.getString("kind"), it.getDouble("amount"), it.optString("account"), it.optString("debt"),
                it.optString("category"), it.optString("description"), it.getString("date"),
            )
        }
    }

    fun save(context: Context, json: String?) {
        prefs(context).edit().putString("sms", json).apply()
    }

    private fun handled(context: Context): Set<String> = prefs(context).getStringSet("smsHandled", null) ?: emptySet()

    private fun skipped(context: Context): List<String> =
        prefs(context).getString("smsSkipped", null)?.let { s -> JSONArray(s).let { a -> (0 until a.length()).map(a::getString) } } ?: emptyList()

    /** Waiting messages, minus those added or skipped here since the phone last sent the list. */
    fun pending(context: Context): List<SmsItem> {
        val json = prefs(context).getString("sms", null) ?: return emptyList()
        val done = handled(context) + skipped(context)
        return runCatching { parse(json) }.getOrDefault(emptyList()).filter { it.smsId !in done }
    }

    /** Added from the watch: hidden here until the phone's next list leaves it out. */
    fun markAdded(context: Context, smsId: String) {
        prefs(context).edit().putStringSet("smsHandled", handled(context) + smsId).apply()
    }

    /** Skipped on the watch; the phone skips it too the next time it opens. */
    suspend fun skip(context: Context, smsId: String) {
        val ids = (skipped(context) + smsId).distinct().takeLast(200)
        prefs(context).edit().putString("smsSkipped", JSONArray(ids).toString()).apply()
        val req = PutDataMapRequest.create(SMS_SKIPPED_PATH)
        req.dataMap.putStringArrayList("ids", ArrayList(ids))
        runCatching { Wearable.getDataClient(context).putDataItem(req.asPutDataRequest().setUrgent()).await() }
    }

    /** Reads the list straight from the Data Layer, for when the listener hasn't run yet. */
    suspend fun pull(context: Context) {
        val uri = Uri.Builder().scheme("wear").path(SMS_PATH).build()
        val items = runCatching { Wearable.getDataClient(context).getDataItems(uri).await() }.getOrNull() ?: return
        try {
            items.firstNotNullOfOrNull { DataMapItem.fromDataItem(it).dataMap.getString("items") }?.let { save(context, it) }
        } finally {
            items.release()
        }
    }
}

