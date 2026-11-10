package com.monthlybudget.app

import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

const val MASK = "••••"

/** Arabic text (right to left), following the phone's Settings › Language. */
@Volatile
var arabic = false

/** The English or the Arabic wording, whichever the phone app is set to. */
fun tr(en: String, ar: String): String = if (arabic) ar else en

/** Month and day names in the app's language; digits stay 0-9 either way. */
fun watchLocale(): Locale = if (arabic) Locale("ar", "EG") else Locale.US

/** Expense, Income, Transfer or Debt, as the add screens title them. */
fun kindLabel(kind: String): String = when (kind) {
    "expense" -> tr("Expense", "مصروف")
    "income" -> tr("Income", "دخل")
    "transfer" -> tr("Transfer", "تحويل")
    "debt" -> tr("Debt", "دين")
    else -> kind.replaceFirstChar { it.uppercase() }
}

/** "InstaPay fee": a fee template's name as a fee. */
fun feeLabel(name: String): String = tr("$name fee", "رسوم ${if (name == "E-wallet") "المحفظة" else if (name == "Transfer") "التحويل" else name}")

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
    return "${if (h % 12 == 0) 12 else h % 12}:$m ${if (h < 12) tr("AM", "ص") else tr("PM", "م")}"
}

fun leftLabel(g: Glance) = if (g.planned <= 0) tr("No plan this month", "لا خطة هذا الشهر") else if (g.left >= 0) tr("Left to spend", "المتبقي للصرف") else tr("Over budget by", "تجاوزت الميزانية بـ")

/** An amount as typed: 250, or 250.5 when it has a fraction, whatever Show decimals says. */
fun exact(n: Double): String =
    if (n % 1.0 == 0.0) integer(n) else String.format(Locale.US, "%,.2f", n).trimEnd('0').trimEnd('.')
