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
        Store.saveDetail(context, detail(settings, plan, txns))
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
        Store.glance(context)?.let {
            if (it.month != entry.date.substring(0, 7)) return@let
            Store.saveGlance(context, it + listOf(entry))
            Store.detail(context)?.let { d -> Store.saveDetail(context, d + entry) }
        }
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

    private fun detail(s: WatchSettings, plan: Map<String, Any?>?, txns: List<Map<String, Any?>>): Detail {
        val planned = plan?.get("planned") as? Map<*, *>
        fun plannedFor(kind: String) = (planned?.get(kind) as? Map<*, *>) ?: emptyMap<String, Any?>()
        val debtRow = s.debtCategory?.takeIf { it in s.expense }
        val actualBy = mutableMapOf<String, Double>()
        var income = 0.0
        for (t in txns) {
            val amount = (t["amount"] as? Double) ?: 0.0
            when (t["kind"]) {
                "income" -> income += amount
                "expense" -> (t["category"] as? String)?.let { actualBy[it] = (actualBy[it] ?: 0.0) + amount }
                "repay" -> debtRow?.let { actualBy[it] = (actualBy[it] ?: 0.0) + amount }
            }
        }
        val plannedExpense = plannedFor("expense")
        val rows = (s.expense + actualBy.keys.filter { it !in s.expense })
            .map { CategoryRow(it, (plannedExpense[it] as? Double) ?: 0.0, actualBy[it] ?: 0.0) }
            .filter { it.planned > 0 || it.actual > 0 }
            // Most spent first, as the watch only has room for a few.
            .sortedByDescending { it.actual }
        val incomePlanned = s.income.sumOf { (plannedFor("income")[it] as? Double) ?: 0.0 }
        // Newest first; the web app has no time of day, so same-day entries keep Firestore's order.
        // Newest first; the web app has no time of day, so same-day entries keep Firestore's order.
        val recent = txns.sortedByDescending { it["date"] as? String ?: "" }.take(15).map(::txn)
        return Detail(incomePlanned, income, rows, recent)
    }

    // Mirrors describe() in src/components/TransactionList.tsx.
    private fun txn(t: Map<String, Any?>): Txn {
        fun str(key: String) = t[key] as? String ?: ""
        val note = str("description").trim()
        val category = str("category")
        val account = str("account")
        val debt = str("debt")
        val amount = (t["amount"] as? Double) ?: 0.0
        val date = str("date")
        val catSub = if (note.isNotEmpty()) "$category · " else ""
        return when (str("kind")) {
            "expense" -> Txn(date, amount, note.ifEmpty { category }, catSub + account, categoryIcon(category), "−")
            "income" -> Txn(date, amount, note.ifEmpty { category }, "${catSub}into $account", categoryIcon(category), "+")
            "transfer" -> Txn(date, amount, "$account → ${str("toAccount")}", note.ifEmpty { "Transfer" }, "⇄", "")
            "repay" -> Txn(date, amount, note.ifEmpty { "Paid $debt" }, "Debt payment · $account", categoryIcon(debt.ifEmpty { "debt" }), "−")
            "borrow" -> Txn(date, amount, note.ifEmpty { "Borrowed · $debt" }, if (account.isNotEmpty()) "into $account" else "Debt", categoryIcon(debt.ifEmpty { "debt" }), "")
            else -> Txn(date, kotlin.math.abs(amount), note.ifEmpty { "Balance update" }, debt.ifEmpty { account }, categoryIcon(debt.ifEmpty { account }), if (amount >= 0) "+" else "−")
        }
    }

    private operator fun Detail.plus(e: Entry): Detail {
        val txn = txn(mapOf("kind" to e.kind, "date" to e.date, "amount" to e.amount, "category" to e.category, "account" to e.account))
        if (e.kind == "income") return copy(income = income + e.amount, recent = listOf(txn) + recent)
        val has = rows.any { it.category == e.category }
        val rows = (if (has) rows else rows + CategoryRow(e.category, 0.0, 0.0))
            .map { if (it.category == e.category) it.copy(actual = it.actual + e.amount) else it }
            .sortedByDescending { it.actual }
        return copy(rows = rows, recent = listOf(txn) + recent)
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
