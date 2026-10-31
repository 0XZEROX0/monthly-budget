package com.monthlybudget.app

import android.content.ComponentName
import android.content.Context
import androidx.wear.tiles.TileService
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.time.LocalDate
import java.util.concurrent.TimeUnit
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

    /** Sends waiting entries, then reads the settings, this month's plan and changed entries. Throws when offline. */
    suspend fun refresh(context: Context): Glance? = refreshing.withLock { refreshNow(context) }

    // One at a time, so the app, tile and a sync worker starting together read once.
    private val refreshing = Mutex()

    private suspend fun refreshNow(context: Context): Glance? {
        val link = link(context) ?: return null
        flush(context)
        val db = Firestore(link)
        val settingsDoc = db.get("settings/main")
        val settings = parseSettings(settingsDoc)
        Store.saveSettings(context, settings)
        val month = currentMonth()
        val plan = db.get("plans/$month")
        // Balances need every entry since the opening balances, and Reports the last twelve
        // months; this month's entries are among them.
        val openingMonth = ((settingsDoc?.get("opening") as? Map<*, *>)?.get("month") as? String)?.takeIf { it <= month }
        val reportFrom = shiftMonth(month, -(2 * Report.PERIOD - 1))
        val since = if (openingMonth != null && openingMonth < reportFrom) openingMonth else reportFrom
        // Only entries changed since the last sync are read; the rest are kept on the watch.
        val history = Ledger.sync(context, db, since, month)
        val txns = history.filter { it["month"] == month }
        val glance = summarize(month, settings, plan, txns) + Store.queue(context)
        Store.saveGlance(context, glance)
        val sinceOpening = if (openingMonth != null) history.filter { (it["month"] as? String ?: "") in openingMonth..month } else txns
        val balances = balances(settingsDoc, sinceOpening)
        Store.saveReport(context, buildReport(month, accountTypes(settingsDoc), settings.debtCategory, history))
        Store.saveDetail(
            context,
            detail(settings, plan, txns).copy(
                balances = balances,
                suggested = suggested(txns),
                due = dueBills(settingsDoc, txns, month),
                goals = goals(settingsDoc, balances),
            ),
        )
        return glance
    }

    /**
     * For the tile and complication: the saved figures. The phone's nudge and the hourly sync
     * keep them fresh, so these only read Firestore when that hasn't happened for two hours.
     */
    suspend fun glanceForSurface(context: Context): Glance? {
        val cached = Store.glance(context)
        if (cached != null && cached.month == currentMonth() && System.currentTimeMillis() - cached.updatedAt < 2 * 60 * 60_000) return cached
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
            db.put(
                "transactions",
                e.id,
                buildMap {
                    put("kind", e.kind)
                    put("date", e.date)
                    if (e.time.isNotEmpty()) put("time", e.time)
                    put("month", e.date.substring(0, 7))
                    put("amount", e.amount)
                    put("description", "")
                    put("category", e.category)
                    // Borrowing can come in without going into an account.
                    if (e.account.isNotEmpty()) put("account", e.account)
                    if (e.toAccount.isNotEmpty()) put("toAccount", e.toAccount)
                    if (e.debt.isNotEmpty()) put("debt", e.debt)
                },
            )
            left = left.drop(1)
            Store.saveQueue(context, left)
        }
        true
    }

    // effects() and balancesBefore() in src/data/summary.ts, up to the end of this month.
    /** Every account as name to type (cash, bank or investment). */
    private fun accountTypes(doc: Map<String, Any?>?): List<Pair<String, String>> =
        (doc?.get("accounts") as? List<*>)?.mapNotNull { it as? Map<*, *> }.orEmpty()
            .mapNotNull { a -> (a["name"] as? String)?.let { it to (a["type"] as? String ?: "cash") } }
            .ifEmpty { listOf("Cash" to "cash", "Bank" to "bank", "Thndr" to "investment") }

    private fun balances(doc: Map<String, Any?>?, history: List<Map<String, Any?>>): List<Balance> {
        val accountMaps = (doc?.get("accounts") as? List<*>)?.mapNotNull { it as? Map<*, *> }.orEmpty()
        val accounts = accountTypes(doc)
        val interestPct = accountMaps.associate { (it["name"] as? String) to ((it["interestPct"] as? Double) ?: 0.0) }
        val opening = ((doc?.get("opening") as? Map<*, *>)?.get("accounts") as? Map<*, *>) ?: emptyMap<String, Any?>()
        val total = mutableMapOf<String, Double>()
        for ((k, v) in opening) if (k is String && v is Double) total[k] = v
        for (t in history) for ((k, v) in accountEffects(t, accounts.first().first)) total[k] = (total[k] ?: 0.0) + v
        // Investments show their value with the expected interest, as the phone's Summary does.
        return accounts.map { (name, type) ->
            val end = total[name] ?: 0.0
            val pct = if (type == "investment") interestPct[name] ?: 0.0 else 0.0
            val interest = end * pct / 100
            Balance(name, type, end + interest, interest, pct)
        }
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
            clock12 = doc["clock12"] == true,
            allAccounts = (doc["accounts"] as? List<*>)?.mapNotNull { (it as? Map<*, *>)?.get("name") as? String }?.takeIf { it.isNotEmpty() } ?: d.allAccounts,
            debts = (doc["debts"] as? List<*>)?.mapNotNull { (it as? Map<*, *>)?.get("name") as? String }.orEmpty(),
        )
    }

    // The same sums as summarize() in src/data/summary.ts: planned is every expense row's
    // plan, spent is expenses plus repayments when they count toward the debt category.
    private fun summarize(month: String, s: WatchSettings, plan: Map<String, Any?>?, txns: List<Map<String, Any?>>): Glance {
        val debtRow = s.debtCategory?.takeIf { it in s.expense }
        val actualBy = mutableMapOf<String, Double>()
        for (t in txns) {
            val cat = when (t["kind"]) {
                // "Don't count as an expense" entries leave the account but not the budget.
                "expense" -> if (t["notSpending"] == true) null else t["category"] as? String
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
                "expense" -> if (t["notSpending"] != true) (t["category"] as? String)?.let { actualBy[it] = (actualBy[it] ?: 0.0) + amount }
                "repay" -> debtRow?.let { actualBy[it] = (actualBy[it] ?: 0.0) + amount }
            }
        }
        val plannedExpense = plannedFor("expense")
        val rows = (s.expense + actualBy.keys.filter { it !in s.expense })
            .map { CategoryRow(it, (plannedExpense[it] as? Double) ?: 0.0, actualBy[it] ?: 0.0) }
            .filter { it.planned > 0 || it.actual > 0 }
        val incomePlanned = s.income.sumOf { (plannedFor("income")[it] as? Double) ?: 0.0 }
        // Newest first; the web app has no time of day, so same-day entries keep Firestore's order.
        // Newest first; the web app has no time of day, so same-day entries keep Firestore's order.
        // Newest first by date, then time, as the phone sorts them.
        val recent = txns.sortedByDescending { (it["date"] as? String ?: "") + " " + (it["time"] as? String ?: "") }.take(100).map(::txn)
        return Detail(incomePlanned, income, rows, recent)
    }

    // Bills in their reminder days that aren't paid yet; the phone app (Settings › Bills)
    // marks one paid with the entry id bill-{id}-{month}, or a repayment of its debt counts.
    private fun dueBills(doc: Map<String, Any?>?, txns: List<Map<String, Any?>>, month: String): List<Bill> {
        val today = LocalDate.now()
        val last = today.lengthOfMonth()
        return (doc?.get("bills") as? List<*>).orEmpty().mapNotNull { it as? Map<*, *> }.mapNotNull { b ->
            val id = b["id"] as? String ?: return@mapNotNull null
            val type = b["type"] as? String ?: "card"
            val day = ((b["day"] as? Double)?.toInt() ?: 1).coerceIn(1, 31)
            val window = (b["windowDays"] as? Double)?.toInt() ?: if (type == "instalment") 5 else 1
            val start = minOf(day, last)
            val end = minOf(day + window - 1, last).coerceAtLeast(start)
            if (today.dayOfMonth !in start..end) return@mapNotNull null
            val debt = b["debt"] as? String
            val paid = txns.any {
                it["__id"] == "bill-$id-$month" || (!debt.isNullOrEmpty() && it["kind"] == "repay" && it["debt"] == debt)
            }
            if (paid) return@mapNotNull null
            Bill(
                id,
                b["name"] as? String ?: "Bill",
                type,
                (b["amount"] as? Double) ?: 0.0,
                debt ?: "",
                b["account"] as? String ?: "",
                b["category"] as? String ?: "",
                today.withDayOfMonth(end).toString(),
            )
        }
    }

    private fun goals(doc: Map<String, Any?>?, balances: List<Balance>): List<Goal> {
        val month = LocalDate.now().withDayOfMonth(1)
        return (doc?.get("goals") as? List<*>).orEmpty().mapNotNull { it as? Map<*, *> }.map { g ->
            val accounts = (g["accounts"] as? List<*>).orEmpty().filterIsInstance<String>()
            val saved = balances.filter { it.name in accounts }.sumOf { it.amount }
            val target = (g["target"] as? Double) ?: 0.0
            val deadline = (g["deadline"] as? String)?.takeIf { it.length >= 7 }
            // Months left including this one, as the phone counts them.
            val perMonth = deadline?.let {
                val end = LocalDate.parse(it.take(7) + "-01")
                val months = ((end.year - month.year) * 12 + end.monthValue - month.monthValue + 1).coerceAtLeast(1)
                maxOf(0.0, target - saved) / months
            }
            Goal(g["name"] as? String ?: "Goal", accounts, saved, target, deadline, perMonth)
        }
    }

    /** The expense or income entries made at least twice this month, most repeated first. */
    private fun suggested(txns: List<Map<String, Any?>>): List<Favorite> =
        txns.mapNotNull { t ->
            val kind = t["kind"] as? String
            val category = t["category"] as? String
            val amount = t["amount"] as? Double
            if ((kind == "expense" || kind == "income") && t["notSpending"] != true && !category.isNullOrEmpty() && amount != null) {
                Favorite(kind, amount, category, t["account"] as? String ?: "")
            } else null
        }
            .groupingBy { it }.eachCount()
            .filter { it.value >= 2 }
            .entries.sortedByDescending { it.value }
            .take(4)
            .map { it.key }

    // Mirrors describe() in src/components/TransactionList.tsx.
    private fun txn(t: Map<String, Any?>): Txn {
        fun str(key: String) = t[key] as? String ?: ""
        val note = str("description").trim()
        val category = str("category")
        val account = str("account")
        val debt = str("debt")
        val amount = (t["amount"] as? Double) ?: 0.0
        val date = str("date")
        val kind = str("kind")
        val catSub = (if (t["notSpending"] == true) "Not counted · " else "") + if (note.isNotEmpty()) "$category · " else ""
        val time = str("time")
        return when (kind) {
            "expense" -> Txn(date, amount, note.ifEmpty { category }, catSub + account, categoryIcon(category), "−", kind, category, account, time)
            "income" -> Txn(date, amount, note.ifEmpty { category }, "${catSub}into $account", categoryIcon(category), "+", kind, category, account, time)
            "transfer" -> Txn(date, amount, "$account → ${str("toAccount")}", note.ifEmpty { "Transfer" }, "⇄", "", time = time)
            "repay" -> Txn(date, amount, note.ifEmpty { "Paid $debt" }, "Debt payment · $account", categoryIcon(debt.ifEmpty { "debt" }), "−", time = time)
            "borrow" -> Txn(date, amount, note.ifEmpty { "Borrowed · $debt" }, if (account.isNotEmpty()) "into $account" else "Debt", categoryIcon(debt.ifEmpty { "debt" }), "", time = time)
            else -> Txn(date, kotlin.math.abs(amount), note.ifEmpty { "Balance update" }, debt.ifEmpty { account }, categoryIcon(debt.ifEmpty { account }), if (amount >= 0) "+" else "−", time = time)
        }
    }

    private operator fun Detail.plus(e: Entry): Detail {
        val txn = txn(mapOf("kind" to e.kind, "date" to e.date, "amount" to e.amount, "category" to e.category, "account" to e.account, "toAccount" to e.toAccount, "debt" to e.debt, "time" to e.time))
        val sign = if (e.kind == "income" || e.kind == "borrow") 1 else -1
        val balances = balances.map {
            when (it.name) {
                e.account -> it.copy(amount = it.amount + sign * e.amount)
                e.toAccount -> it.copy(amount = it.amount + e.amount)
                else -> it
            }
        }
        // A bill paid from the watch stops showing as due.
        val base = copy(recent = listOf(txn) + recent, balances = balances, due = due.filter { e.id != "bill-${it.id}-${e.date.take(7)}" })
        return when (e.kind) {
            "income" -> base.copy(income = income + e.amount)
            "expense" -> {
                val has = rows.any { it.category == e.category }
                val rows = (if (has) rows else rows + CategoryRow(e.category, 0.0, 0.0))
                    .map { if (it.category == e.category) it.copy(actual = it.actual + e.amount) else it }
                base.copy(rows = rows)
            }
            else -> base
        }
    }

    /** Adds entries that Firestore doesn't have yet. */
    private operator fun Glance.plus(entries: List<Entry>) =
        copy(spent = spent + entries.filter { it.kind == "expense" && it.date.startsWith(month) }.sumOf { it.amount })
}

/** Redraws the tile and complication. */
object Surfaces {
    fun update(context: Context) {
        TileService.getUpdater(context).requestUpdate(BudgetTileService::class.java)
        updateComplication(context)
    }

    fun updateComplication(context: Context) {
        ComplicationDataSourceUpdateRequester
            .create(context, ComponentName(context, LeftToSpendComplicationService::class.java))
            .requestUpdateAll()
    }
}

/**
 * Syncs with Firestore: sends entries made offline once the watch (or its phone) is back
 * online, and fetches what changed. Runs every hour, and straight away when the phone app
 * says something changed (LinkListenerService), so the watch is current without opening it.
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result =
        try {
            Budget.refresh(applicationContext)
            Surfaces.update(applicationContext)
            Result.success()
        } catch (e: SignedOutException) {
            Result.failure()
        } catch (e: QuotaException) {
            // Retrying won't help until the daily limit resets; the hourly sync tries again.
            Result.failure()
        } catch (e: Exception) {
            Result.retry()
        }

    companion object {
        private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        /** Once, as soon as there's a connection. */
        fun schedule(context: Context) {
            val request = OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(online).build()
            WorkManager.getInstance(context).enqueueUniqueWork("sync", ExistingWorkPolicy.KEEP, request)
        }

        /** After the phone's nudge: runs after any sync already going, so its changes aren't missed. */
        fun scheduleSoon(context: Context) {
            val request = OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(online).build()
            WorkManager.getInstance(context).enqueueUniqueWork("pull", ExistingWorkPolicy.APPEND_OR_REPLACE, request)
        }

        /** Every hour while the watch has a connection; a sync where nothing changed costs about three reads. */
        fun scheduleHourly(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(1, TimeUnit.HOURS).setConstraints(online).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("hourly-sync", ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}
