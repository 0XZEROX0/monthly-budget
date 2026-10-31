package com.monthlybudget.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Every few hours: when a newer watch build is out, posts a notification that opens the
 * app, where Update watch app installs it. (The budget itself syncs hourly in SyncWorker.)
 */
class UpdateWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val context = applicationContext
        val release = runCatching { Updater.check(context) }.getOrNull() ?: return Result.success()
        if (release.build > Store.notifiedBuild(context)) {
            notifyUpdate(context, release.build)
            Store.saveNotifiedBuild(context, release.build)
        }
        return Result.success()
    }

    companion object {
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<UpdateWorker>(4, TimeUnit.HOURS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("update-check", ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}

private fun notifyUpdate(context: Context, build: Int) {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel("updates", "App updates", NotificationManager.IMPORTANCE_DEFAULT))
    val open = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
    val notification = NotificationCompat.Builder(context, "updates")
        .setSmallIcon(R.drawable.ic_wallet)
        .setContentTitle("Budget update ready")
        .setContentText("Build $build is out. Open Budget and tap Update watch app.")
        .setContentIntent(open)
        .setAutoCancel(true)
        .build()
    manager.notify(1, notification)
}
