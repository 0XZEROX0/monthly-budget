package com.monthlybudget.app

import android.content.Context
import java.io.File
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

/**
 * Every entry, kept on the watch, so a sync only asks Firestore for what changed since the
 * last one. Firebase's free plan counts each document a query returns as a read (50,000 a
 * day); a sync where nothing changed costs about three reads instead of the whole history.
 *
 * The phone and the watch stamp each write with the server's `updatedAt`, and a delete on
 * the phone leaves a `deleted` marker, so changes and deletes both show up.
 */
object Ledger {
    /** Asks again from a little before the last read, as the stamp can land just before the write commits. */
    private const val OVERLAP_SECONDS = 30L
    /** Once a day this month is read in full anyway, to repair anything a change query missed. */
    private const val MONTH_CHECK_MS = 20 * 60 * 60_000L

    private val lock = Any()

    private fun file(context: Context) = File(context.filesDir, "ledger.json")

    /**
     * Brings the saved entries up to date and returns them (deleted ones left out), from
     * [since] (YYYY-MM) on. The first sync, or one that needs older months, reads them all.
     */
    suspend fun sync(context: Context, db: Firestore, since: String, month: String): List<Map<String, Any?>> {
        val saved = runCatching { read(context) }.getOrNull()
        val rows = LinkedHashMap<String, Map<String, Any?>>()
        val readTime: String?
        var monthAt = saved?.monthAt ?: 0L
        var monthOf = saved?.month ?: ""
        if (saved == null || saved.lastSeen == null || saved.since > since) {
            val all = db.query("transactions", "month", since, "GREATER_THAN_OR_EQUAL")
            all.rows.forEach { rows[it["__id"] as String] = it }
            readTime = all.readTime
            monthAt = System.currentTimeMillis()
            monthOf = month
        } else {
            rows.putAll(saved.rows)
            val from = Instant.parse(saved.lastSeen).minusSeconds(OVERLAP_SECONDS)
            val changed = db.query("transactions", "updatedAt", from, "GREATER_THAN")
            changed.rows.forEach { rows[it["__id"] as String] = it }
            readTime = changed.readTime ?: saved.lastSeen
            // Also catches entries from older phone code or watch builds that didn't stamp updatedAt.
            if (monthOf != month || System.currentTimeMillis() - monthAt > MONTH_CHECK_MS) {
                db.where("transactions", "month", month).forEach { rows[it["__id"] as String] = it }
                monthAt = System.currentTimeMillis()
                monthOf = month
            }
        }
        rows.values.removeAll { it["deleted"] == true }
        val start = if (saved == null || saved.since > since) since else saved.since
        synchronized(lock) { write(context, Saved(start, readTime, monthAt, monthOf, rows)) }
        return rows.values.filter { (it["month"] as? String ?: "") >= since }
    }

    fun clear(context: Context) {
        synchronized(lock) { file(context).delete() }
        // The file before this change.
        File(context.filesDir, "history.json").delete()
    }

    private class Saved(val since: String, val lastSeen: String?, val monthAt: Long, val month: String, val rows: Map<String, Map<String, Any?>>)

    private fun write(context: Context, s: Saved) {
        val a = JSONArray()
        for (r in s.rows.values) a.put(JSONObject(r.filterValues { it != null }))
        val o = JSONObject().put("since", s.since).put("lastSeen", s.lastSeen ?: JSONObject.NULL)
            .put("monthAt", s.monthAt).put("month", s.month).put("rows", a)
        runCatching {
            // Written whole then renamed, so a watch that dies mid-write keeps the old copy.
            val tmp = File(context.filesDir, "ledger.json.tmp")
            tmp.writeText(o.toString())
            tmp.renameTo(file(context))
        }
    }

    private fun read(context: Context): Saved? {
        val f = file(context)
        if (!f.exists()) return null
        val o = JSONObject(f.readText())
        val a = o.getJSONArray("rows")
        val rows = LinkedHashMap<String, Map<String, Any?>>()
        for (i in 0 until a.length()) {
            @Suppress("UNCHECKED_CAST")
            val r = unwrap(a.getJSONObject(i)) as Map<String, Any?>
            (r["__id"] as? String)?.let { rows[it] = r }
        }
        return Saved(
            o.getString("since"),
            if (o.isNull("lastSeen")) null else o.getString("lastSeen"),
            o.optLong("monthAt"),
            o.optString("month"),
            rows,
        )
    }

    // Numbers come back as Double, the way Firestore.decode gives them.
    private fun unwrap(v: Any?): Any? = when (v) {
        is JSONObject -> v.keys().asSequence().associateWith { unwrap(v.get(it)) }
        is JSONArray -> (0 until v.length()).map { unwrap(v.get(it)) }
        is Number -> v.toDouble()
        JSONObject.NULL -> null
        else -> v
    }
}
