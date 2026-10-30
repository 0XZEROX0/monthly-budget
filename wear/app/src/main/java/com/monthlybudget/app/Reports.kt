package com.monthlybudget.app

import android.content.Context
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

/** One month in the Reports page's chart. */
data class MonthBar(val month: String, val income: Double, val spent: Double, val saved: Double)

/** Spending in a category over the period; change is against the months before, in percent. */
data class ReportCategory(val category: String, val total: Double, val perMonth: Double, val change: Double?)

/** The phone's Reports page for the last six months (src/components/ReportsView.tsx). */
data class Report(val months: List<MonthBar>, val categories: List<ReportCategory>) {
    val income get() = months.sumOf { it.income }
    val spent get() = months.sumOf { it.spent }
    val saved get() = months.sumOf { it.saved }
    /** Saved as a share of income, in percent. */
    val rate get() = if (income > 0) (income - spent) / income * 100 else null

    companion object {
        const val PERIOD = 6
    }
}

private val shortMonth = DateTimeFormatter.ofPattern("MMM", Locale.US)

fun monthShort(month: String): String = runCatching { YearMonth.parse(month).format(shortMonth) }.getOrDefault(month)

fun shiftMonth(month: String, by: Int): String = YearMonth.parse(month).plusMonths(by.toLong()).toString()

/** How an entry moves account balances: effects() in src/data/summary.ts, accounts only. */
fun accountEffects(t: Map<String, Any?>, firstAccount: String): Map<String, Double> {
    val amount = (t["amount"] as? Double) ?: 0.0
    val account = t["account"] as? String
    val acc = account ?: firstAccount
    val out = mutableMapOf<String, Double>()
    fun add(name: String?, v: Double) {
        if (!name.isNullOrEmpty()) out[name] = (out[name] ?: 0.0) + v
    }
    when (t["kind"]) {
        "expense", "repay" -> add(acc, -amount)
        "income" -> add(acc, amount)
        "transfer" -> {
            add(acc, -amount)
            add(t["toAccount"] as? String, amount)
        }
        "borrow" -> add(account, amount)
        "adjust" -> if ((t["debt"] as? String).isNullOrEmpty()) add(acc, amount)
    }
    return out
}

/**
 * The Reports page's sums. `accounts` are name to type; `history` must reach back
 * twelve months, to compare the six shown with the six before.
 */
fun buildReport(month: String, accounts: List<Pair<String, String>>, debtCategory: String?, history: List<Map<String, Any?>>): Report {
    val from = shiftMonth(month, -(Report.PERIOD - 1))
    val prevFrom = shiftMonth(from, -Report.PERIOD)
    val first = accounts.firstOrNull()?.first ?: "Cash"
    fun isLiquid(name: String) = accounts.firstOrNull { it.first == name }?.second != "investment"
    fun amount(t: Map<String, Any?>) = (t["amount"] as? Double) ?: 0.0

    val months = (0 until Report.PERIOD).map { i ->
        val m = shiftMonth(from, i)
        val list = history.filter { it["month"] == m }
        var saved = 0.0
        for (t in list) {
            for ((k, v) in accountEffects(t, first)) if (isLiquid(k)) saved += v
            val to = t["toAccount"] as? String
            if (t["kind"] == "transfer" && !to.isNullOrEmpty() && isLiquid(t["account"] as? String ?: "") != isLiquid(to)) {
                saved += if (isLiquid(to)) -amount(t) else amount(t)
            }
        }
        MonthBar(
            m,
            list.filter { it["kind"] == "income" }.sumOf(::amount),
            list.filter { it["kind"] == "expense" || it["kind"] == "repay" }.sumOf(::amount),
            saved,
        )
    }

    fun byCategory(list: List<Map<String, Any?>>): Map<String, Double> {
        val out = mutableMapOf<String, Double>()
        for (t in list) {
            val cat = when (t["kind"]) {
                "expense" -> (t["category"] as? String).takeUnless { it.isNullOrEmpty() } ?: "Other"
                "repay" -> debtCategory.takeUnless { it.isNullOrEmpty() } ?: "Debt payments"
                else -> null
            } ?: continue
            out[cat] = (out[cat] ?: 0.0) + amount(t)
        }
        return out
    }
    val month = { t: Map<String, Any?> -> t["month"] as? String ?: "" }
    val now = byCategory(history.filter { month(it) in from..month })
    val before = history.filter { month(it) >= prevFrom && month(it) < from }
    val prev = byCategory(before)
    val categories = now.entries
        .map { (c, total) ->
            val p = prev[c]
            ReportCategory(c, total, total / Report.PERIOD, if (before.isNotEmpty() && p != null && p != 0.0) (total - p) / p * 100 else null)
        }
        .sortedByDescending { it.total }
    return Report(months, categories)
}

fun reportToJson(r: Report): String {
    val months = JSONArray()
    for (m in r.months) months.put(JSONObject().put("month", m.month).put("income", m.income).put("spent", m.spent).put("saved", m.saved))
    val cats = JSONArray()
    for (c in r.categories) {
        cats.put(JSONObject().put("category", c.category).put("total", c.total).put("perMonth", c.perMonth).put("change", c.change ?: JSONObject.NULL))
    }
    return JSONObject().put("months", months).put("categories", cats).toString()
}

fun reportFromJson(s: String): Report {
    val o = JSONObject(s)
    val months = o.getJSONArray("months").let { a ->
        (0 until a.length()).map { a.getJSONObject(it) }.map { MonthBar(it.getString("month"), it.getDouble("income"), it.getDouble("spent"), it.getDouble("saved")) }
    }
    val cats = o.getJSONArray("categories").let { a ->
        (0 until a.length()).map { a.getJSONObject(it) }.map {
            ReportCategory(it.getString("category"), it.getDouble("total"), it.getDouble("perMonth"), if (it.isNull("change")) null else it.getDouble("change"))
        }
    }
    return Report(months, cats)
}

fun Store.report(context: Context): Report? =
    context.getSharedPreferences("budget", Context.MODE_PRIVATE).getString("report", null)?.let { runCatching { reportFromJson(it) }.getOrNull() }

fun Store.saveReport(context: Context, r: Report) {
    context.getSharedPreferences("budget", Context.MODE_PRIVATE).edit().putString("report", reportToJson(r)).apply()
}
