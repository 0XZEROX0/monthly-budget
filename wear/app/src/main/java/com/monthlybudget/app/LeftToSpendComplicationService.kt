package com.monthlybudget.app

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.NoDataComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService

/** Left to spend on the watch face. In privacy mode it shows the share left instead of the amount. */
class LeftToSpendComplicationService : SuspendingComplicationDataSourceService() {
    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        val glance = Budget.glanceForSurface(this) ?: return NoDataComplicationData()
        return data(this, request.complicationType, glance, Store.hidden(this))
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        data(this, type, Glance(currentMonth(), "EGP", 20_000.0, 7_600.0, 0), false)
}

private fun plain(s: String) = PlainComplicationText.Builder(s).build()

private fun data(context: Context, type: ComplicationType, g: Glance, hidden: Boolean): ComplicationData? {
    val pctLeft = if (g.planned > 0) ((1 - g.spent / g.planned) * 100).toInt() else 0
    val value = when {
        g.planned <= 0 -> "—"
        hidden -> "$pctLeft%"
        else -> compact(g.left)
    }
    val title = if (g.left < 0) "over" else "left"
    val description = plain(if (g.planned > 0) "${leftLabel(g)}: $value" else "No plan this month")
    val tap = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
    return when (type) {
        ComplicationType.SHORT_TEXT ->
            ShortTextComplicationData.Builder(plain(value), description)
                .setTitle(plain(title))
                .setTapAction(tap)
                .build()
        ComplicationType.RANGED_VALUE -> {
            val max = if (g.planned > 0) g.planned.toFloat() else 1f
            RangedValueComplicationData.Builder(g.left.toFloat().coerceIn(0f, max), 0f, max, description)
                .setText(plain(value))
                .setTitle(plain(title))
                .setTapAction(tap)
                .build()
        }
        else -> null
    }
}
