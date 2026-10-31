package com.monthlybudget.app

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/** The phone app's sign-in no longer works (signed out, or the account changed). */
class SignedOutException : IOException("Signed out")

/** Firebase's free daily read and write allowance is used up until midnight Pacific time. */
class QuotaException : IOException("Daily limit reached") {
    /** When it resets, in the watch's time zone, e.g. "10:00". */
    val resetsAt: String
        get() = java.time.LocalDate.now(java.time.ZoneId.of("America/Los_Angeles")).plusDays(1)
            .atStartOfDay(java.time.ZoneId.of("America/Los_Angeles"))
            .withZoneSameInstant(java.time.ZoneId.systemDefault())
            .toLocalTime().toString()
}

private class HttpException(val code: Int, body: String) : IOException("HTTP $code: $body")

private suspend fun http(url: String, method: String, body: String?, contentType: String, token: String?): String =
    withContext(Dispatchers.IO) {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = 15_000
            conn.readTimeout = 15_000
            token?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", contentType)
                conn.outputStream.use { it.write(body.toByteArray()) }
            }
            val code = conn.responseCode
            val text = (if (code < 400) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            if (code == 429) throw QuotaException()
            if (code >= 400) throw HttpException(code, text)
            text
        } finally {
            conn.disconnect()
        }
    }

/** Swaps the phone app's Firebase refresh token for a short-lived ID token. */
object Auth {
    @Volatile private var idToken: String? = null
    @Volatile private var expiresAt = 0L

    fun forget() {
        idToken = null
        expiresAt = 0
    }

    suspend fun token(link: Link): String {
        idToken?.let { if (System.currentTimeMillis() < expiresAt) return it }
        val body = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(link.refreshToken, "UTF-8")
        val res = try {
            http("https://securetoken.googleapis.com/v1/token?key=${link.apiKey}", "POST", body, "application/x-www-form-urlencoded", null)
        } catch (e: HttpException) {
            // 400 is an expired or revoked refresh token; anything else is worth retrying.
            throw if (e.code == 400) SignedOutException() else e
        }
        val o = JSONObject(res)
        val token = o.getString("id_token")
        idToken = token
        // Renew a minute early.
        expiresAt = System.currentTimeMillis() + (o.optString("expires_in", "3600").toLong() - 60) * 1000
        return token
    }
}

/**
 * Firestore's REST API, as the signed-in user, so firestore.rules apply exactly as on the
 * phone. Documents come back as plain maps, lists, strings, doubles and booleans.
 */
class Firestore(private val link: Link) {
    private val root = "https://firestore.googleapis.com/v1/projects/${link.projectId}/databases/(default)/documents/users/${link.uid}"

    private suspend fun call(path: String, method: String = "GET", body: JSONObject? = null): String =
        try {
            http(root + path, method, body?.toString(), "application/json", Auth.token(link))
        } catch (e: HttpException) {
            if (e.code != 401) throw e
            // The ID token expired early; get a new one once.
            Auth.forget()
            http(root + path, method, body?.toString(), "application/json", Auth.token(link))
        }

    /** A document under users/{uid}, e.g. "settings/main"; null when it doesn't exist. */
    suspend fun get(path: String): Map<String, Any?>? =
        try {
            fields(JSONObject(call("/$path")).optJSONObject("fields"))
        } catch (e: HttpException) {
            if (e.code == 404) null else throw e
        }

    /** Rows from a query, and the server time it read at (everything committed before it is included). */
    class Rows(val rows: List<Map<String, Any?>>, val readTime: String?)

    /**
     * Documents in a collection under users/{uid} whose `field` compares to `value`, e.g. op
     * GREATER_THAN_OR_EQUAL. A java.time.Instant value compares as a timestamp.
     */
    suspend fun where(collection: String, field: String, value: Any, op: String = "EQUAL"): List<Map<String, Any?>> =
        query(collection, field, value, op).rows

    suspend fun query(collection: String, field: String, value: Any, op: String = "EQUAL"): Rows {
        val v = if (value is Instant) JSONObject().put("timestampValue", value.toString()) else encode(value)
        val query = JSONObject().put(
            "structuredQuery",
            JSONObject()
                .put("from", JSONArray().put(JSONObject().put("collectionId", collection)))
                .put(
                    "where",
                    JSONObject().put(
                        "fieldFilter",
                        JSONObject()
                            .put("field", JSONObject().put("fieldPath", field))
                            .put("op", op)
                            .put("value", v),
                    ),
                ),
        )
        val res = JSONArray(call(":runQuery", "POST", query))
        val items = (0 until res.length()).map { res.getJSONObject(it) }
        // "__id" carries the document id, e.g. to spot a bill marked paid as bill-{id}-{month}.
        val rows = items.mapNotNull { it.optJSONObject("document") }
            .map { fields(it.optJSONObject("fields")) + ("__id" to it.optString("name").substringAfterLast('/')) }
        return Rows(rows, items.firstNotNullOfOrNull { it.optString("readTime").ifEmpty { null } })
    }

    /**
     * Writes collection/id, stamping updatedAt with the server's clock so the phone fetches it
     * as a change. Writing the same entry again (a retry) just rewrites it, so it's never added twice.
     */
    suspend fun put(collection: String, id: String, data: Map<String, Any>) {
        val fields = JSONObject()
        for ((k, v) in data) fields.put(k, encode(v))
        val name = "projects/${link.projectId}/databases/(default)/documents/users/${link.uid}/$collection/$id"
        val write = JSONObject()
            .put("update", JSONObject().put("name", name).put("fields", fields))
            .put("updateTransforms", JSONArray().put(JSONObject().put("fieldPath", "updatedAt").put("setToServerValue", "REQUEST_TIME")))
        commit(JSONObject().put("writes", JSONArray().put(write)))
    }

    private suspend fun commit(body: JSONObject) {
        val url = "https://firestore.googleapis.com/v1/projects/${link.projectId}/databases/(default)/documents:commit"
        try {
            http(url, "POST", body.toString(), "application/json", Auth.token(link))
        } catch (e: HttpException) {
            if (e.code != 401) throw e
            Auth.forget()
            http(url, "POST", body.toString(), "application/json", Auth.token(link))
        }
    }

    private fun fields(o: JSONObject?): Map<String, Any?> =
        if (o == null) emptyMap() else o.keys().asSequence().associateWith { decode(o.getJSONObject(it)) }

    private fun decode(v: JSONObject): Any? = when {
        v.has("stringValue") -> v.getString("stringValue")
        v.has("integerValue") -> v.getString("integerValue").toDouble()
        v.has("doubleValue") -> v.getDouble("doubleValue")
        v.has("booleanValue") -> v.getBoolean("booleanValue")
        v.has("timestampValue") -> v.getString("timestampValue")
        v.has("mapValue") -> fields(v.getJSONObject("mapValue").optJSONObject("fields"))
        v.has("arrayValue") -> v.getJSONObject("arrayValue").optJSONArray("values")
            ?.let { a -> (0 until a.length()).map { decode(a.getJSONObject(it)) } } ?: emptyList<Any?>()
        else -> null
    }

    // Whole numbers go in as integers, the way the web app's Firestore SDK stores them.
    private fun encode(v: Any): JSONObject = when (v) {
        is String -> JSONObject().put("stringValue", v)
        is Double -> if (v % 1.0 == 0.0) JSONObject().put("integerValue", v.toLong().toString()) else JSONObject().put("doubleValue", v)
        is Number -> JSONObject().put("integerValue", v.toLong().toString())
        is Boolean -> JSONObject().put("booleanValue", v)
        else -> throw IllegalArgumentException("Can't store $v")
    }
}
