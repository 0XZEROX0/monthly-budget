package com.monthlybudget.app

import android.content.ComponentName
import android.content.Context
import androidx.wear.tiles.TileService
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.time.LocalDate
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull

fun currentMonth(): String = LocalDate.now().toString().substring(0, 7)

/** Reads the month and adds entries, straight to Firestore, keeping unsent entries on the watch. */
object Budget {
    private val sending = Mutex()

    /** The saved link, or the one the phone has put on the Data Layer. */
    suspend fun link(context: Context): Link? =
        Store.link(context) ?: runCatching { pullLink(context) }.getOrNull()?.also { Store.saveLink(context, it) }

    /** Sends waiting entries, then reads this month's plan and entries. Throws when offline. */
    suspend fun refresh(context: Context): Glance? {
        val link = link(context) ?: return null
        flush(context)
        val db = Firestore(link)
        val settings = parseSettings(db.get("settings/main"))
        Store.saveSettings(context, settings)
        val month = currentMonth()
        val plan = db.get("plans/$month")
        val txns = db.where("transactions", "month", month)
        val glance = summarize(month, settings, plan, txns) + Store.queue(context)
        Store.saveGlance(context, glance)
        return glance
    }

    /** For the tile and complication: the saved figures, refreshed when they're older than 10 minutes. */
    suspend fun glanceForSurface(context: Context): Glance? {
        val cached = Store.glance(context)
        if (cached != null && cached.month == currentMonth() && System.currentTimeMillis() - cached.updatedAt < 10 * 60_000) return cached
        return withTimeoutOrNull(10_000) { runCatching { refresh(context) }.getOrNull() } ?: cached
    }

    /** Saves the entry on the watch and sends it. Returns false when it's waiting for a connection. */
    suspend fun add(context: Context, entry: Entry): Boolean {
        sending.withLock { Store.saveQueue(context, Store.queue(context) + entry) }
        // Show it in the figures straight away.
        Store.glance(context)?.let { if (it.month == entry.date.substring(0, 7)) Store.saveGlance(context, it + listOf(entry)) }
        val sent = runCatching { flush(context) }.getOrDefault(false)
        if (!sent) SyncWorker.schedule(context)
        Surfaces.update(context)
        return sent
    }

    /** Sends waiting entries in order. True when none are left. */
    suspend fun flush(context: Context): Boolean = sending.withLock {
        val link = link(context) ?: return@withLock false
        val db = Firestore(link)
        var left = Store.queue(context)
        while (left.isNotEmpty()) {
            val e = left.first()
            db.create(
                "transactions",
                e.id,
                mapOf(
                    "kind" to e.kind,
                    "date" to e.date,
                    "month" to e.date.substring(0, 7),
                    "amount" to e.amount,
                    "description" to "",
                    "category" to e.category,
                    "account" to e.account,
                ),
            )
            left = left.drop(1)
            Store.saveQueue(context, left)
        }
        true
    }

    private fun parseSettings(doc: Map<String, Any?>?): WatchSettings {
        val d = WatchSettings.DEFAULT
        if (doc == null) return d
        val cats = doc["categories"] as? Map<*, *>
        fun strings(v: Any?) = (v as? List<*>)?.filterIsInstance<String>()
        val accounts = (doc["accounts"] as? List<*>)
            ?.mapNotNull { it as? Map<*, *> }
            ?.filter { it["type"] != "investment" }
            ?.mapNotNull { it["name"] as? String }
        return WatchSettings(
            currency = doc["currency"] as? String ?: d.currency,
            expense = strings(cats?.get("expense")) ?: d.expense,
            income = strings(cats?.get("income")) ?: d.income,
            accounts = accounts?.takeIf { it.isNotEmpty() } ?: d.accounts,
            // Like withDefaults in the web app: missing means the default.
            debtCategory = if (doc.containsKey("debtCategory")) doc["debtCategory"] as? String else d.debtCategory,
        )
    }

    // The same sums as summarize() in src/data/summary.ts: planned is every expense row's
    // plan, spent is expenses plus repayments when they count toward the debt category.
    private fun summarize(month: String, s: WatchSettings, plan: Map<String, Any?>?, txns: List<Map<String, Any?>>): Glance {
        val debtRow = s.debtCategory?.takeIf { it in s.expense }
        val actualBy = mutableMapOf<String, Double>()
        for (t in txns) {
            val cat = when (t["kind"]) {
                "expense" -> t["category"] as? String
                "repay" -> debtRow
                else -> null
            } ?: continue
            actualBy[cat] = (actualBy[cat] ?: 0.0) + ((t["amount"] as? Double) ?: 0.0)
        }
        val plannedBy = ((plan?.get("planned") as? Map<*, *>)?.get("expense") as? Map<*, *>) ?: emptyMap<String, Any?>()
        val rows = s.expense + actualBy.keys.filter { it !in s.expense }
        val planned = rows.sumOf { (plannedBy[it] as? Double) ?: 0.0 }
        return Glance(month, s.currency, planned, actualBy.values.sum(), System.currentTimeMillis())
    }

    /** Adds entries that Firestore doesn't have yet. */
    private operator fun Glance.plus(entries: List<Entry>) =
        copy(spent = spent + entries.filter { it.kind == "expense" && it.date.startsWith(month) }.sumOf { it.amount })
}

/** Redraws the tile and complication. */
object Surfaces {
    fun update(context: Context) {
        TileService.getUpdater(context).requestUpdate(BudgetTileService::class.java)
        ComplicationDataSourceUpdateRequester
            .create(context, ComponentName(context, LeftToSpendComplicationService::class.java))
            .requestUpdateAll()
    }
}

/** Sends entries made offline once the watch (or its phone) is back online. */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result =
        try {
            Budget.refresh(applicationContext)
            Surfaces.update(applicationContext)
            Result.success()
        } catch (e: SignedOutException) {
            Result.failure()
        } catch (e: Exception) {
            Result.retry()
        }

    companion object {
        fun schedule(context: Context) {
            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork("sync", ExistingWorkPolicy.KEEP, request)
        }
    }
}
