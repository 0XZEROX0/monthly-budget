package com.monthlybudget.app

import kotlin.math.round

// Mirrors src/data/fees.ts: a transfer fee is saved as its own expense from the same account.

/** A fee worked out as a percentage of the amount, kept between an optional minimum and maximum. */
data class FeeTemplate(val id: String, val name: String, val pct: Double, val min: Double? = null, val max: Double? = null)

/** The fees every account gets; the phone user's own templates come after these. */
val BUILT_IN_FEES = listOf(
    FeeTemplate("instapay", "InstaPay", 0.1, 0.5, 20.0),
    FeeTemplate("wallet", "E-wallet", 1.0),
)

fun feeTemplates(s: WatchSettings) = BUILT_IN_FEES + s.fees

/** The fee for sending [amount] with [t]. */
fun feeFor(t: FeeTemplate?, amount: Double): Double {
    if (t == null || amount <= 0) return 0.0
    var fee = amount * t.pct / 100
    t.min?.let { fee = maxOf(it, fee) }
    t.max?.let { fee = minOf(it, fee) }
    return round(fee * 100) / 100
}

private val WALLET = Regex("wallet|orange|vodafone|etisalat|e&|we ?pay|محفظ", RegexOption.IGNORE_CASE)

/** The usual fee for an account, from its name: a template it's named after, InstaPay, or a mobile wallet. Null is no fee. */
fun defaultFee(account: String, own: List<FeeTemplate>): String? {
    own.firstOrNull { it.name.isNotBlank() && account.lowercase().contains(it.name.trim().lowercase()) }?.let { return it.id }
    if (Regex("insta", RegexOption.IGNORE_CASE).containsMatchIn(account)) return "instapay"
    if (WALLET.containsMatchIn(account)) return "wallet"
    return null
}

/** The expense category fees go to: one already about fees if there is one, otherwise Bank Fees. */
fun feeCategory(categories: List<String>) =
    categories.firstOrNull { Regex("fee|عمول|رسوم", RegexOption.IGNORE_CASE).containsMatchIn(it) } ?: "Bank Fees"

/** The fee's own expense entry, saved next to the entry it belongs to. */
fun feeEntry(main: Entry, t: FeeTemplate, s: WatchSettings): Entry? {
    val amount = feeFor(t, main.amount)
    if (amount <= 0) return null
    return Entry(
        id = "${main.id}-fee",
        kind = "expense",
        amount = amount,
        category = feeCategory(s.expense),
        account = main.account,
        date = main.date,
        time = main.time,
        description = feeLabel(t.name) + if (main.description.isNotEmpty()) " · ${main.description}" else "",
    )
}

/** A fee the SMS states, offered as its own choice. Named Transfer, like the phone's typed-in fee. */
fun statedFee(amount: Double) = FeeTemplate("sms", "Transfer", 0.0, amount, amount)

/**
 * The fee to start on for a bank SMS, as smsFee in src/data/fees.ts: the one it states, else for
 * money sent out, the account's usual fee or InstaPay's for an instant transfer. Null is no fee.
 */
fun smsFee(item: SmsItem, account: String, s: WatchSettings): String? = when {
    item.kind != "expense" -> null
    item.fee > 0 -> "sms"
    !item.transfer && !item.instant -> null
    else -> defaultFee(account, s.fees) ?: if (item.instant || item.wallet == "InstaPay") "instapay" else null
}

/** The fee entry for an SMS saved as it is, without picking a category. */
fun smsFeeEntry(item: SmsItem, main: Entry, s: WatchSettings): Entry? {
    val id = smsFee(item, main.account, s) ?: return null
    val t = if (id == "sms") statedFee(item.fee) else feeTemplates(s).firstOrNull { it.id == id } ?: return null
    return feeEntry(main, t, s)
}
