package com.monthlybudget.app

import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

const val MASK = "••••"

/** Whether amounts show two decimals, following the phone's Settings › Show decimals. */
@Volatile
var showDecimals = false

/** 12,345, or 12,345.50 with decimals on. */
fun whole(n: Double): String = if (showDecimals) String.format(Locale.US, "%,.2f", n) else integer(n)

/** 12,345 always: for the keypad and tight spots like complications. */
fun integer(n: Double): String = String.format(Locale.US, "%,d", n.roundToLong())

/** 950, 12.3K, 1.2M: fits a complication. */
fun compact(n: Double): String {
    val a = abs(n)
    val sign = if (n < 0) "-" else ""
    return when {
        a >= 1_000_000 -> sign + trim(a / 1_000_000) + "M"
        a >= 1_000 -> sign + trim(a / 1_000) + "K"
        else -> integer(n)
    }
}

private fun trim(n: Double) = if (n >= 100) String.format(Locale.US, "%.0f", n) else String.format(Locale.US, "%.1f", n).removeSuffix(".0")

/** "Left to spend" or "Over budget by", as on the phone's Summary. */
/** An entry's "HH:MM" time, as "8:30 PM" when [clock12] is on. */
fun clock(time: String, clock12: Boolean): String {
    if (!clock12 || time.isEmpty()) return time
    val (h, m) = time.split(":").let { (it.getOrNull(0)?.toIntOrNull() ?: return time) to (it.getOrNull(1) ?: "00") }
    return "${if (h % 12 == 0) 12 else h % 12}:$m ${if (h < 12) "AM" else "PM"}"
}

fun leftLabel(g: Glance) = if (g.planned <= 0) "No plan this month" else if (g.left >= 0) "Left to spend" else "Over budget by"

/** An amount as typed: 250, or 250.5 when it has a fraction, whatever Show decimals says. */
fun exact(n: Double): String =
    if (n % 1.0 == 0.0) integer(n) else String.format(Locale.US, "%,.2f", n).trimEnd('0').trimEnd('.')
