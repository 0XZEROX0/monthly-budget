package com.monthlybudget.app

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** The watch build on GitHub; .github/workflows/wear.yml puts "build N" in its title. */
data class WatchRelease(val build: Int, val url: String, val size: Long)

/**
 * Updates the watch app from the watch itself, so it only needs adb the first time.
 * Downloads the APK from the `wear` release and hands it to Android's installer, which
 * asks on the watch before installing.
 */
object Updater {
    private const val RELEASE_API = "https://api.github.com/repos/0XZEROX0/monthly-budget/releases/tags/wear"

    fun installedBuild(context: Context): Int =
        context.packageManager.getPackageInfo(context.packageName, 0).longVersionCode.toInt()

    /** The newer build, or null when this one is the latest. */
    suspend fun check(context: Context): WatchRelease? = withContext(Dispatchers.IO) {
        val conn = URL(RELEASE_API).openConnection() as HttpURLConnection
        conn.setRequestProperty("Accept", "application/vnd.github+json")
        conn.connectTimeout = 15_000
        conn.readTimeout = 15_000
        val o = try {
            JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
        } finally {
            conn.disconnect()
        }
        val build = Regex("""build (\d+)""").find(o.optString("name"))?.groupValues?.get(1)?.toInt() ?: return@withContext null
        val assets = o.getJSONArray("assets")
        val apk = (0 until assets.length()).map { assets.getJSONObject(it) }.firstOrNull { it.getString("name").endsWith(".apk") }
            ?: return@withContext null
        if (build <= installedBuild(context)) null else WatchRelease(build, apk.getString("browser_download_url"), apk.optLong("size"))
    }

    /** Streams the APK into an install session; the installer then asks on the watch. */
    suspend fun install(context: Context, release: WatchRelease, progress: (Float) -> Unit) = withContext(Dispatchers.IO) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setAppPackageName(context.packageName)
        if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        val id = installer.createSession(params)
        installer.openSession(id).use { session ->
            try {
                val conn = URL(release.url).openConnection() as HttpURLConnection
                conn.connectTimeout = 15_000
                conn.readTimeout = 30_000
                try {
                    val total = conn.contentLengthLong.takeIf { it > 0 } ?: release.size
                    session.openWrite("watch.apk", 0, total).use { out ->
                        conn.inputStream.use { input ->
                            val buf = ByteArray(64 * 1024)
                            var done = 0L
                            while (true) {
                                val n = input.read(buf)
                                if (n < 0) break
                                out.write(buf, 0, n)
                                done += n
                                if (total > 0) progress(done.toFloat() / total)
                            }
                            session.fsync(out)
                        }
                    }
                } finally {
                    conn.disconnect()
                }
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
                val intent = PendingIntent.getBroadcast(context, id, Intent(context, InstallResultReceiver::class.java), flags)
                session.commit(intent.intentSender)
            } catch (e: Exception) {
                session.abandon()
                throw e
            }
        }
    }
}

/** Shows Android's "Update this app?" prompt when the installer asks for it. */
class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE) != PackageInstaller.STATUS_PENDING_USER_ACTION) return
        @Suppress("DEPRECATION")
        val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
        context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
