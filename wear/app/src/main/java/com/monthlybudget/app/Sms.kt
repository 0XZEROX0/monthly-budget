package com.monthlybudget.app

import android.content.Context
import android.net.Uri
import com.google.android.gms.wearable.DataMap
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.tasks.await
import org.json.JSONArray
import org.json.JSONObject

/** Bank messages waiting to be added; the phone app (MonthView) puts its pending list here. */
const val SMS_PATH = "/budget/sms"

/**
 * New bank messages, put by the phone as they arrive (SmsReceiver.java), even with the phone
 * app closed. The watch reads them itself, the way the phone app would.
 */
const val SMS_NEW_PATH = "/budget/sms-new"

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
    /** What the fee is worked out from (smsFee in Fees.kt): the fee the SMS states, else 0. */
    val fee: Double = 0.0,
    val transfer: Boolean = false,
    /** An InstaPay (instant) transfer. */
    val instant: Boolean = false,
    val wallet: String = "",
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
                it.optDouble("fee", 0.0).takeIf { f -> !f.isNaN() } ?: 0.0, it.optBoolean("transfer"), it.optBoolean("instant"), it.optString("wallet"),
            )
        }
    }

    /** The phone app's list, and the newest inbox message it had looked at when it sent it. */
    fun save(context: Context, map: DataMap?) {
        prefs(context).edit().putString("sms", map?.getString("items")).putLong("smsSeen", map?.getLong("seen", 0L) ?: 0L).apply()
    }

    /** New messages the phone passed on as they arrived, as a JSON array of {id, address, body, date}. */
    fun saveNew(context: Context, json: String?) {
        prefs(context).edit().putString("smsNew", json).apply()
    }

    /** What the watch needs from settings/main to fill in a message like the phone: accounts, cards and shops. */
    fun saveRules(context: Context, settingsDoc: Map<String, Any?>?) {
        val accounts = (settingsDoc?.get("accounts") as? List<*>)?.mapNotNull { it as? Map<*, *> }.orEmpty()
        val sms = settingsDoc?.get("sms") as? Map<*, *>
        fun strings(v: Any?) = JSONObject().also { o -> (v as? Map<*, *>)?.forEach { (k, x) -> if (k is String && x is String) o.put(k, x) } }
        val o = JSONObject()
            .put("currency", settingsDoc?.get("currency") as? String ?: "EGP")
            .put("accounts", JSONArray().also { a -> for (x in accounts) a.put(JSONObject().put("name", x["name"] as? String ?: "").put("type", x["type"] as? String ?: "cash")) })
            .put("cards", strings(sms?.get("cards")))
            .put("merchants", strings(sms?.get("merchants")))
            .put("defaultTarget", sms?.get("defaultTarget") as? String ?: JSONObject.NULL)
        prefs(context).edit().putString("smsRules", o.toString()).apply()
    }

    private fun handled(context: Context): Set<String> = prefs(context).getStringSet("smsHandled", null) ?: emptySet()

    private fun skipped(context: Context): List<String> =
        prefs(context).getString("smsSkipped", null)?.let { s -> JSONArray(s).let { a -> (0 until a.length()).map(a::getString) } } ?: emptyList()

    /**
     * Waiting messages, newest first: the phone app's list, plus messages that arrived after the
     * phone app last looked, minus those added or skipped here.
     */
    fun pending(context: Context): List<SmsItem> {
        val p = prefs(context)
        val done = handled(context) + skipped(context)
        val fromPhone = p.getString("sms", null)?.let { runCatching { parse(it) }.getOrNull() }.orEmpty()
        val known = fromPhone.map { it.smsId }.toSet()
        val seen = p.getLong("smsSeen", 0L)
        val fresh = runCatching { newOnes(context, seen, known + done) }.getOrDefault(emptyList())
        return (fromPhone + fresh).filter { it.smsId !in done }.sortedWith(compareByDescending<SmsItem> { it.date }.thenByDescending { it.smsId.toLongOrNull() ?: 0L })
    }

    /** Messages the phone passed on that its app hasn't seen yet, read here as the phone would read them. */
    private fun newOnes(context: Context, seen: Long, skip: Set<String>): List<SmsItem> {
        val json = prefs(context).getString("smsNew", null) ?: return emptyList()
        val a = JSONArray(json)
        val raw = (0 until a.length()).map { a.getJSONObject(it) }
            .map { RawSms(it.getString("id"), it.optString("address"), it.optString("body"), it.optLong("date")) }
            .filter { (it.id.toLongOrNull() ?: 0L) > seen && it.id !in skip }
        if (raw.isEmpty()) return emptyList()
        val parsed = raw.mapNotNull { SmsParser.parse(it) }
        if (parsed.isEmpty()) return emptyList()
        // Not ones already in the budget: added from this message, or entered another way.
        val entries = Ledger.rows(context).mapNotNull { r ->
            val id = r["__id"] as? String ?: return@mapNotNull null
            SmsParser.Txn4(id, r["kind"] as? String ?: "", (r["amount"] as? Double) ?: 0.0, r["date"] as? String ?: "")
        } + Store.queue(context).map { SmsParser.Txn4(it.id, it.kind, it.amount, it.date) }
        val ids = entries.map { it.id }.toSet()
        val notAdded = parsed.filter { "sms-${it.smsId}" !in ids }
        val recorded = SmsParser.alreadyRecorded(notAdded, entries.filter { !it.id.startsWith("sms-") })
        val rules = prefs(context).getString("smsRules", null)?.let { runCatching { JSONObject(it) }.getOrNull() } ?: JSONObject()
        return notAdded.filter { it.smsId !in recorded }.map { item(it, rules) }
    }

    // draftFor, targetFor and describe in src/data/bankSms.ts.
    private fun item(p: ParsedSms, rules: JSONObject): SmsItem {
        val accounts = rules.optJSONArray("accounts")?.let { a -> (0 until a.length()).map { a.getJSONObject(it) } }.orEmpty()
            .map { it.optString("name") to it.optString("type") }
        val bank = accounts.firstOrNull { it.second == "bank" }?.first
        fun defaultTarget() = rules.optString("defaultTarget").takeIf { it.isNotEmpty() && !rules.isNull("defaultTarget") }
            ?: "account:${bank ?: accounts.firstOrNull()?.first ?: "Bank"}"
        val target = rules.optJSONObject("cards")?.optString(p.card)?.takeIf { it.isNotEmpty() }
            ?: if (!Regex("^\\d{4}$").matches(p.card)) {
                val wallets = accounts.filter { it.second == "wallet" }
                val first = p.card.split(" ")[0].lowercase()
                (wallets.firstOrNull { it.first.lowercase().contains(first) } ?: wallets.firstOrNull())?.let { "account:${it.first}" } ?: defaultTarget()
            } else defaultTarget()
        val type = target.substringBefore(":")
        val name = target.substringAfter(":")
        val title = p.merchant.ifEmpty { if (p.transfer) (if (p.direction == "credit") "Transfer in" else "Transfer out") else p.sender }
        val category = rules.optJSONObject("merchants")?.optString(title.lowercase()).orEmpty()
        val foreign = if (p.currency != rules.optString("currency", "EGP")) " (${p.currency} ${plain(p.amount)})" else ""
        val (kind, account, debt) = when {
            // A credit card is a debt: spending grows it, money coming back pays it down.
            type == "debt" && p.direction == "spend" -> Triple("borrow", "", name)
            type == "debt" -> Triple("repay", bank ?: "", name)
            else -> Triple(if (p.direction == "spend") "expense" else "income", name, "")
        }
        val sub = "${dayLabel(p.date)} · ${p.wallet ?: "${p.sender} ••${p.card}"}"
        return SmsItem(p.smsId, title, sub, p.body, kind, p.amount, account, debt, category, title + foreign, p.date, p.fee, p.transfer, p.instant, p.wallet ?: "")
    }

    /** 150 or 150.5, the way JavaScript writes a number. */
    private fun plain(n: Double) = if (n % 1.0 == 0.0) n.toLong().toString() else n.toString()

    /** "Thu, Nov 5", like dayLabel in src/data/month.ts. */
    private fun dayLabel(date: String): String =
        runCatching { LocalDate.parse(date).format(DateTimeFormatter.ofPattern("EEE, MMM d", Locale.getDefault())) }.getOrDefault(date)

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

    /** Reads both lists straight from the Data Layer, for when the listener hasn't run yet. */
    suspend fun pull(context: Context) {
        val client = Wearable.getDataClient(context)
        for (path in listOf(SMS_PATH, SMS_NEW_PATH)) {
            val uri = Uri.Builder().scheme("wear").path(path).build()
            val items = runCatching { client.getDataItems(uri).await() }.getOrNull() ?: continue
            try {
                val map = items.firstNotNullOfOrNull { DataMapItem.fromDataItem(it).dataMap } ?: continue
                if (path == SMS_PATH) save(context, map) else saveNew(context, map.getString("items"))
            } finally {
                items.release()
            }
        }
    }
}
