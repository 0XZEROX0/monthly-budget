package com.monthlybudget.app

import android.content.Context
import java.io.File
import org.json.JSONArray
import org.json.JSONObject

/**
 * Entries from before this month, kept on the watch so a refresh only reads this month's.
 * Firebase's free plan allows 50,000 reads a day, and reading every month since the opening
 * balances on each refresh (the tile and complication refresh too) used it all up.
 */
object History {
    /** How long past months are trusted before they're read again, in case they were edited on the phone. */
    private const val MAX_AGE = 24 * 60 * 60_000L

    private class Saved(val since: String, val before: String, val fetchedAt: Long, val rows: List<Map<String, Any?>>)

    private fun file(context: Context) = File(context.filesDir, "history.json")

    /** Saved entries from [since] up to (not including) [before], or null when they need reading again. */
    fun load(context: Context, since: String, before: String): List<Map<String, Any?>>? {
        val saved = runCatching { read(context) }.getOrNull() ?: return null
        if (saved.since != since || saved.before != before) return null
        if (System.currentTimeMillis() - saved.fetchedAt > MAX_AGE) return null
        return saved.rows
    }

    fun save(context: Context, since: String, before: String, rows: List<Map<String, Any?>>) {
        val a = JSONArray()
        for (r in rows) a.put(JSONObject(r.filterValues { it != null }))
        val o = JSONObject().put("since", since).put("before", before).put("fetchedAt", System.currentTimeMillis()).put("rows", a)
        runCatching { file(context).writeText(o.toString()) }
    }

    fun clear(context: Context) {
        file(context).delete()
    }

    private fun read(context: Context): Saved? {
        val f = file(context)
        if (!f.exists()) return null
        val o = JSONObject(f.readText())
        val a = o.getJSONArray("rows")
        @Suppress("UNCHECKED_CAST")
        val rows = (0 until a.length()).map { unwrap(a.getJSONObject(it)) as Map<String, Any?> }
        return Saved(o.getString("since"), o.getString("before"), o.getLong("fetchedAt"), rows)
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
