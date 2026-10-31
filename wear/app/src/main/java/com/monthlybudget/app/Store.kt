package com.monthlybudget.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** What the quick add needs from the budget's settings. */
data class WatchSettings(
    val currency: String,
    val expense: List<String>,
    val income: List<String>,
    /** Cash and bank accounts; investments aren't spent from directly. */
    val accounts: List<String>,
    val debtCategory: String?,
    /** Show entry times as "8:30 PM" instead of "20:30", like the phone. */
    val clock12: Boolean = false,
) {
    fun categories(kind: String) = if (kind == "income") income else expense

    companion object {
        // Matches src/data/defaults.ts, for a budget whose settings were never saved.
        val DEFAULT = WatchSettings(
            currency = "EGP",
            expense = listOf(
                "Food", "Gifts", "Health/medical", "Home", "Transportation", "Personal",
                "Bank Fees", "A loan to someone", "Other", "Car", "Instalment",
            ),
            income = listOf("Salary", "Other"),
            accounts = listOf("Cash", "Bank"),
            debtCategory = "Instalment",
        )
    }
}

/** The month at a glance, as the phone's Summary shows it. */
data class Glance(
    val month: String,
    val currency: String,
    /** Planned spending for the month. */
    val planned: Double,
    /** Expenses (and repayments in the debt category) so far. */
    val spent: Double,
    val updatedAt: Long,
) {
    val left get() = planned - spent
    val fractionSpent get() = if (planned > 0) (spent / planned).toFloat().coerceIn(0f, 1f) else 0f
}

/** A category's plan and spending this month. */
data class CategoryRow(val category: String, val planned: Double, val actual: Double)

/** An account's balance at the end of this month; type is cash, bank or investment. */
data class Balance(val name: String, val type: String, val amount: Double, val interest: Double = 0.0, val interestPct: Double = 0.0)

/** An entry for the recent list, worded as the phone's Transactions tab words it. */
data class Txn(
    val date: String,
    val amount: Double,
    val title: String,
    val sub: String,
    val icon: String,
    val sign: String,
    val kind: String = "",
    val category: String = "",
    val account: String = "",
    /** HH:MM when the phone or watch recorded it; older entries have none. */
    val time: String = "",
)

/** A bill in its reminder days and not paid yet; dueBy is its last reminder day. */
data class Bill(
    val id: String,
    val name: String,
    val type: String,
    val amount: Double,
    val debt: String,
    val account: String,
    val category: String,
    val dueBy: String,
)

/** A savings goal over some accounts; perMonth is what's still needed each month when it has a deadline. */
data class Goal(
    val name: String,
    val accounts: List<String>,
    val saved: Double,
    val target: Double,
    val deadline: String?,
    val perMonth: Double?,
)

/** A purchase or income saved again with one tap. */
data class Favorite(val kind: String, val amount: Double, val category: String, val account: String)

/** The rest of the month for the watch's summary: income and expense rows, newest entries. */
data class Detail(
    val incomePlanned: Double,
    val income: Double,
    val rows: List<CategoryRow>,
    val recent: List<Txn>,
    val balances: List<Balance> = emptyList(),
    /** Entries repeated this month, offered as favorites until some are pinned. */
    val suggested: List<Favorite> = emptyList(),
    val due: List<Bill> = emptyList(),
    val goals: List<Goal> = emptyList(),
)

/** One quick-add entry, kept until Firestore has it. */
data class Entry(
    val id: String,
    val kind: String,
    val amount: Double,
    val category: String,
    val account: String,
    val date: String,
    /** Set for a bill paid toward a debt: saved as a repayment. */
    val debt: String = "",
    /** HH:MM, so the phone can order same-day entries. */
    val time: String = java.time.LocalTime.now().toString().take(5),
)

/** Everything the watch keeps on itself. */
object Store {
    private fun prefs(context: Context) = context.getSharedPreferences("budget", Context.MODE_PRIVATE)

    fun link(context: Context): Link? {
        val p = prefs(context)
        val token = p.getString("refreshToken", null) ?: return null
        return Link(
            token,
            p.getString("uid", "")!!,
            p.getString("apiKey", "")!!,
            p.getString("projectId", "")!!,
            p.getBoolean("hidden", false),
        )
    }

    fun saveLink(context: Context, link: Link?) {
        val p = prefs(context)
        val sameUser = link != null && p.getString("uid", null) == link.uid
        p.edit().apply {
            // Another account (or none): drop the old one's figures and unsent entries.
            if (!sameUser) {
                remove("glance")
                remove("detail")
                remove("report")
                remove("settings")
                remove("queue")
                Ledger.clear(context)
            }
            if (link == null) {
                listOf("refreshToken", "uid", "apiKey", "projectId", "hidden").forEach(::remove)
            } else {
                putString("refreshToken", link.refreshToken)
                putString("uid", link.uid)
                putString("apiKey", link.apiKey)
                putString("projectId", link.projectId)
                putBoolean("hidden", link.hidden)
            }
        }.apply()
        Auth.forget()
    }

    /**
     * Privacy mode: amounts show as •••• or percentages. Follows the phone's eye button
     * when it changes there, and the watch's own eye button sets it here.
     */
    fun hidden(context: Context): Boolean = prefs(context).getBoolean("hidden", false)

    fun setHidden(context: Context, hidden: Boolean) {
        prefs(context).edit().putBoolean("hidden", hidden).apply()
    }

    fun glance(context: Context): Glance? {
        val o = prefs(context).getString("glance", null)?.let(::JSONObject) ?: return null
        return Glance(o.getString("month"), o.getString("currency"), o.getDouble("planned"), o.getDouble("spent"), o.getLong("updatedAt"))
    }

    fun saveGlance(context: Context, g: Glance) {
        val o = JSONObject()
            .put("month", g.month)
            .put("currency", g.currency)
            .put("planned", g.planned)
            .put("spent", g.spent)
            .put("updatedAt", g.updatedAt)
        prefs(context).edit().putString("glance", o.toString()).apply()
    }

    fun detail(context: Context): Detail? {
        val o = prefs(context).getString("detail", null)?.let(::JSONObject) ?: return null
        val rows = o.getJSONArray("rows").let { a ->
            (0 until a.length()).map { a.getJSONObject(it) }.map { CategoryRow(it.getString("category"), it.getDouble("planned"), it.getDouble("actual")) }
        }
        val recent = o.getJSONArray("recent").let { a ->
            (0 until a.length()).map { a.getJSONObject(it) }
                .map {
                    Txn(
                        it.optString("date"),
                        it.optDouble("amount"),
                        it.optString("title"),
                        it.optString("sub"),
                        it.optString("icon", "•"),
                        it.optString("sign"),
                        it.optString("kind"),
                        it.optString("category"),
                        it.optString("account"),
                        it.optString("time"),
                    )
                }
        }
        val balances = o.optJSONArray("balances")?.let { a ->
            (0 until a.length()).map { a.getJSONObject(it) }.map { Balance(it.getString("name"), it.getString("type"), it.getDouble("amount"), it.optDouble("interest", 0.0), it.optDouble("interestPct", 0.0)) }
        } ?: emptyList()
        val suggested = o.optJSONArray("suggested")?.let(::favoritesFrom) ?: emptyList()
        val due = o.optJSONArray("due")?.let { a ->
            (0 until a.length()).map { a.getJSONObject(it) }.map {
                Bill(
                    it.getString("id"), it.getString("name"), it.getString("type"), it.getDouble("amount"),
                    it.getString("debt"), it.getString("account"), it.getString("category"), it.getString("dueBy"),
                )
            }
        } ?: emptyList()
        val goals = o.optJSONArray("goals")?.let { a ->
            (0 until a.length()).map { a.getJSONObject(it) }.map {
                val accounts = it.getJSONArray("accounts").let { x -> (0 until x.length()).map(x::getString) }
                Goal(
                    it.getString("name"), accounts, it.getDouble("saved"), it.getDouble("target"),
                    if (it.isNull("deadline")) null else it.getString("deadline"),
                    if (it.isNull("perMonth")) null else it.getDouble("perMonth"),
                )
            }
        } ?: emptyList()
        return Detail(o.getDouble("incomePlanned"), o.getDouble("income"), rows, recent, balances, suggested, due, goals)
    }

    fun saveDetail(context: Context, d: Detail) {
        val rows = JSONArray()
        for (r in d.rows) rows.put(JSONObject().put("category", r.category).put("planned", r.planned).put("actual", r.actual))
        val recent = JSONArray()
        for (t in d.recent) {
            recent.put(
                JSONObject()
                    .put("date", t.date)
                    .put("amount", t.amount)
                    .put("title", t.title)
                    .put("sub", t.sub)
                    .put("icon", t.icon)
                    .put("sign", t.sign)
                    .put("kind", t.kind)
                    .put("category", t.category)
                    .put("account", t.account)
                    .put("time", t.time),
            )
        }
        val balances = JSONArray()
        for (b in d.balances) balances.put(
                JSONObject().put("name", b.name).put("type", b.type).put("amount", b.amount)
                    .put("interest", b.interest).put("interestPct", b.interestPct),
            )
        val o = JSONObject()
            .put("incomePlanned", d.incomePlanned)
            .put("income", d.income)
            .put("rows", rows)
            .put("recent", recent)
            .put("balances", balances)
            .put("suggested", favoritesJson(d.suggested))
            .put(
                "due",
                JSONArray().also { a ->
                    for (b in d.due) {
                        a.put(
                            JSONObject().put("id", b.id).put("name", b.name).put("type", b.type).put("amount", b.amount)
                                .put("debt", b.debt).put("account", b.account).put("category", b.category).put("dueBy", b.dueBy),
                        )
                    }
                },
            )
            .put(
                "goals",
                JSONArray().also { a ->
                    for (g in d.goals) {
                        a.put(
                            JSONObject().put("name", g.name).put("accounts", JSONArray(g.accounts)).put("saved", g.saved)
                                .put("target", g.target).put("deadline", g.deadline ?: JSONObject.NULL)
                                .put("perMonth", g.perMonth ?: JSONObject.NULL),
                        )
                    }
                },
            )
        prefs(context).edit().putString("detail", o.toString()).apply()
    }

    fun settings(context: Context): WatchSettings {
        val o = prefs(context).getString("settings", null)?.let(::JSONObject) ?: return WatchSettings.DEFAULT
        fun list(key: String) = o.getJSONArray(key).let { a -> (0 until a.length()).map { a.getString(it) } }
        return WatchSettings(
            o.getString("currency"),
            list("expense"),
            list("income"),
            list("accounts"),
            if (o.isNull("debtCategory")) null else o.getString("debtCategory"),
            o.optBoolean("clock12"),
        )
    }

    fun saveSettings(context: Context, s: WatchSettings) {
        val o = JSONObject()
            .put("currency", s.currency)
            .put("expense", JSONArray(s.expense))
            .put("income", JSONArray(s.income))
            .put("accounts", JSONArray(s.accounts))
            .put("debtCategory", s.debtCategory ?: JSONObject.NULL)
            .put("clock12", s.clock12)
        prefs(context).edit().putString("settings", o.toString()).apply()
    }

    fun queue(context: Context): List<Entry> {
        val a = prefs(context).getString("queue", null)?.let(::JSONArray) ?: return emptyList()
        return (0 until a.length()).map {
            val o = a.getJSONObject(it)
            Entry(o.getString("id"), o.getString("kind"), o.getDouble("amount"), o.getString("category"), o.getString("account"), o.getString("date"), o.optString("debt"), o.optString("time"))
        }
    }

    fun saveQueue(context: Context, entries: List<Entry>) {
        val a = JSONArray()
        for (e in entries) {
            a.put(
                JSONObject()
                    .put("id", e.id)
                    .put("kind", e.kind)
                    .put("amount", e.amount)
                    .put("category", e.category)
                    .put("account", e.account)
                    .put("date", e.date)
                    .put("debt", e.debt)
                    .put("time", e.time),
            )
        }
        prefs(context).edit().putString("queue", a.toString()).apply()
    }

    private fun favoritesFrom(a: JSONArray) = (0 until a.length()).map { a.getJSONObject(it) }
        .map { Favorite(it.getString("kind"), it.getDouble("amount"), it.getString("category"), it.getString("account")) }

    private fun favoritesJson(list: List<Favorite>) = JSONArray().also { a ->
        for (f in list) a.put(JSONObject().put("kind", f.kind).put("amount", f.amount).put("category", f.category).put("account", f.account))
    }

    /** Pinned on the watch (long-press a recent entry); kept on this watch only. */
    fun favorites(context: Context): List<Favorite> = prefs(context).getString("favorites", null)?.let { favoritesFrom(JSONArray(it)) } ?: emptyList()

    fun saveFavorites(context: Context, list: List<Favorite>) {
        prefs(context).edit().putString("favorites", favoritesJson(list).toString()).apply()
    }

    /** The newest watch build already announced, so each update notifies once. */
    fun notifiedBuild(context: Context): Int = prefs(context).getInt("notifiedBuild", 0)

    fun saveNotifiedBuild(context: Context, build: Int) {
        prefs(context).edit().putInt("notifiedBuild", build).apply()
    }

    /** The account last picked for this kind, so the next entry starts there. */
    fun lastAccount(context: Context, kind: String): String? = prefs(context).getString("account:$kind", null)

    fun rememberAccount(context: Context, kind: String, account: String) {
        prefs(context).edit().putString("account:$kind", account).apply()
    }
}
