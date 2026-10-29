package com.monthlybudget.app

import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

const val MASK = "••••"

/** 12,345 */
fun whole(n: Double): String = String.format(Locale.US, "%,d", n.roundToLong())

/** 950, 12.3K, 1.2M: fits a complication. */
fun compact(n: Double): String {
    val a = abs(n)
    val sign = if (n < 0) "-" else ""
    return when {
        a >= 1_000_000 -> sign + trim(a / 1_000_000) + "M"
        a >= 1_000 -> sign + trim(a / 1_000) + "K"
        else -> whole(n)
    }
}

private fun trim(n: Double) = if (n >= 100) String.format(Locale.US, "%.0f", n) else String.format(Locale.US, "%.1f", n).removeSuffix(".0")

/** "Left to spend" or "Over budget by", as on the phone's Summary. */
fun leftLabel(g: Glance) = if (g.planned <= 0) "No plan this month" else if (g.left >= 0) "Left to spend" else "Over budget by"
