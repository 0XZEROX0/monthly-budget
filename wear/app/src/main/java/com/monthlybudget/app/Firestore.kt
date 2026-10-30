package com.monthlybudget.app

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/** The phone app's sign-in no longer works (signed out, or the account changed). */
class SignedOutException : IOException("Signed out")

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

    /** Documents in a collection under users/{uid} whose `field` compares to `value`, e.g. op GREATER_THAN_OR_EQUAL. */
    suspend fun where(collection: String, field: String, value: String, op: String = "EQUAL"): List<Map<String, Any?>> {
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
                            .put("value", JSONObject().put("stringValue", value)),
                    ),
                ),
        )
        val rows = JSONArray(call(":runQuery", "POST", query))
        // "__id" carries the document id, e.g. to spot a bill marked paid as bill-{id}-{month}.
        return (0 until rows.length()).mapNotNull { rows.getJSONObject(it).optJSONObject("document") }
            .map { fields(it.optJSONObject("fields")) + ("__id" to it.optString("name").substringAfterLast('/')) }
    }

    /** Creates collection/id. Already there counts as done, so a retried entry isn't added twice. */
    suspend fun create(collection: String, id: String, data: Map<String, Any>) {
        val fields = JSONObject()
        for ((k, v) in data) fields.put(k, encode(v))
        try {
            call("/$collection?documentId=$id", "POST", JSONObject().put("fields", fields))
        } catch (e: HttpException) {
            if (e.code != 409) throw e
        }
    }

    private fun fields(o: JSONObject?): Map<String, Any?> =
        if (o == null) emptyMap() else o.keys().asSequence().associateWith { decode(o.getJSONObject(it)) }

    private fun decode(v: JSONObject): Any? = when {
        v.has("stringValue") -> v.getString("stringValue")
        v.has("integerValue") -> v.getString("integerValue").toDouble()
        v.has("doubleValue") -> v.getDouble("doubleValue")
        v.has("booleanValue") -> v.getBoolean("booleanValue")
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
