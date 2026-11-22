package com.monthlybudget.app

import java.time.Instant
import java.time.ZoneId

// The phone app's bank SMS reading, for messages that reach the watch while the phone app is
// closed. Kotlin copies of src/data/smsParser.ts (parseBankSms), src/data/egyptBanks.ts
// (walletName) and src/data/smsMatch.ts (alreadyRecorded): keep them in step, so the watch
// reads a message the way the phone will. No Android classes here, so it can be tested on a JVM.

/** One SMS from the inbox; id is the inbox row id the phone app uses too. */
data class RawSms(val id: String, val address: String, val body: String, val date: Long)

data class ParsedSms(
    val smsId: String,
    val sender: String,
    /** spend: a purchase or withdrawal. credit: a refund or money received. */
    val direction: String,
    val transfer: Boolean,
    val amount: Double,
    val currency: String,
    val merchant: String,
    /** Last four digits of the card or account, or the e-wallet's name. */
    val card: String,
    val wallet: String?,
    /** YYYY-MM-DD, from when the SMS arrived. */
    val date: String,
    val body: String,
    /** A fee the message states, like "رسوم 5 جنيه"; 0 when it names none. */
    val fee: Double = 0.0,
    /** An InstaPay (instant) transfer, which InstaPay charges a fee on. */
    val instant: Boolean = false,
    /** When the SMS arrived, ms since epoch. */
    val at: Long = 0,
)

object SmsParser {
    private const val I = "(?i)"

    private val CURRENCIES: List<Pair<Regex, String>> = listOf(
        "^(egp|le|l\\.e\\.?|جنيه|جنيها|جنيهًا|جنيهات|ج\\.م\\.?|جم)$" to "EGP",
        "^(usd|\\$|دولار)$" to "USD",
        "^(eur|€|يورو)$" to "EUR",
        "^gbp$" to "GBP",
        "^(sar|ريال)$" to "SAR",
        "^aed$" to "AED",
        "^kwd$" to "KWD",
        "^qar$" to "QAR",
        "^try$" to "TRY",
    ).map { (re, code) -> Regex(I + re) to code }

    private const val CUR = "EGP|L\\.E\\.?|LE|USD|EUR|GBP|SAR|AED|KWD|QAR|TRY|\\$|€|جنيهات|جنيها|جنيهًا|جنيه|ج\\.م\\.?|جم|دولار|يورو|ريال"
    private const val NUM = "\\d[\\d,]*(?:\\.\\d+)?"
    // A currency code inside a word isn't one ("STYLE 24" is not LE 24), and a number right before
    // a currency that is followed by an amount belongs to something else: "card 2244 EGP 500",
    // "on 05/11/2026 EGP 1,500". As AMOUNT in src/data/smsParser.ts.
    private const val NEXT_AMOUNT = "(?!\\s*\\d[\\d,]*(?:\\.\\d+)?(?![\\d/:\\-]|\\.\\d))"
    private val AMOUNT = Regex("$I(?:(?<![a-z])($CUR)\\s*($NUM))|(?:(?<![a-z\\d.,*•])($NUM)\\s*($CUR)(?![a-z\\u0600-\\u06ff])$NEXT_AMOUNT)")
    // Some wallets leave out the currency: "بقيمة 270.00".
    private val AMOUNT_WORD = Regex("$I(?:بقيمة|قيمة|بمبلغ|مبلغ|amount(?: of)?|value(?: of)?)\\s*:?\\s*($NUM)")

    // Not a finished payment: codes for approving one, or one that failed.
    private val IGNORE = Regex("$I\\b(otp|one[- ]time|passcode|password|verification|pin|payment due|due date|amount due|due amount|minimum (?:payment|amount|due)|statement balance)\\b|مستحق|تاريخ الاستحقاق|الحد الأدنى للسداد|كود|رمز|كلمة (?:السر|المرور)|declined|failed|unsuccessful|insufficient|rejected|مرفوض|رفض|لم تتم|غير ناجح")
    private val CREDIT = Regex("$I\\b(credited|refund(?:ed)?|reversal|reversed|deposit(?:ed)?|received|salary)\\b|إيداع|ايداع|إضافة|اضافة|استرداد|استلام|تحويل وارد|راتب|سداد[^\\n]{0,40}(?:لبطاقت|للبطاقة|بطاقتك الائتمانية|البطاقة الائتمانية)")
    // A purchase that mentions cashback earned is still a purchase.
    private val CASHBACK = Regex("$I\\bcash ?back\\b|كاش ?باك")
    private val SPENT = Regex("$I\\b(purchase[ds]?|charged|debited|spent|withdrawal|withdrawn|deducted)\\b|خصم|شراء|سحب")
    private val INTO_ACCOUNT = Regex("$I(?:إلى|الى|ل)\\s*حسابك|to your (?:account|card)")
    private val TRANSFER = Regex("$I\\btransfer|تحويل")
    private val SPEND = Regex("$I\\b(purchase[ds]?|charged|debited|spent|paid|payment|pos|withdrawal|withdrawn|deducted|transaction|trx|txn|transfer(?:red)?|bought|sent|used|recharged?|top[- ]?up)\\b|خصم|شراء|سحب|عملية|مشتريات|دفع|تحويل|شحن|سداد")
    // An amount right after these words is a balance or limit, not what was paid.
    private val BALANCE_BEFORE = Regex("$I(balance|bal|limit|available|avl|avail|remaining|رصيد|المتاح|متاح|الحد)[^\\d\\n]{0,20}$")
    // Words for a fee. "charges" but not "charged", which is what was paid.
    private const val FEE_WORD = "\\b(?:fees?|charges?|commission)\\b|رسوم|عمول[ةه]|مصاريف|مصروفات"
    // An amount right after these words is the fee, not what was paid.
    private val FEE_BEFORE = Regex("$I(?:$FEE_WORD)[^\\d\\n]{0,25}$")
    private val FEE = Regex("$I(?:$FEE_WORD)[^\\d\\n]{0,25}?($NUM)")
    // InstaPay sends: CIB calls them "تحويل لحظي" (instant transfer).
    private val INSTANT = Regex("${I}تحويل\\s*لحظ[يى]|\\binstant\\s+(?:transfer|payment)|\\binsta\\s*pay\\b|[إا]نستا\\s*باي|\\bIPN\\b")

    private val CARD = listOf(
        Regex("$I(?:ending(?:\\s+(?:with|in))?|ends\\s+with|card\\s*(?:no\\.?|number|#)?|acc(?:ount)?\\s*(?:no\\.?|number|#)?)\\s*[:#]?\\s*(?:[*xX•.]+\\s*)?(\\d{4})\\b"),
        Regex("(?:[*xX•]{2,}[\\s-]*)+(\\d{4})\\b"),
        Regex("$I(?:visa|master\\s?card|meeza|card|فيزا|ماستر\\s?كارد|ميزة|بطاق\\S*)[^\\d\\n]{0,15}?[*xX•]+\\s*(\\d{4})\\b"),
        Regex("(?:المنتهية|المنتهي|ينتهي|رقم)\\s*(?:ب|بـ|في)?\\s*[*xX•]*\\s*(\\d{4})\\b"),
    )

    private val WALLET_WORDS: List<Pair<Regex, String>> = listOf(
        "vodafone\\s*cash|vf[\\s-]?cash|فودافون\\s*كاش" to "Vodafone Cash",
        "orange\\s*(?:cash|money)|[أا]ورن[جچ]\\s*(?:كاش|موني)" to "Orange Cash",
        "etisalat\\s*cash|e&\\s*(?:cash|money)|اتصالات\\s*كاش|[إا]تصالات\\s*كاش" to "Etisalat Cash",
        "we\\s*pay|وي\\s*باي" to "WE Pay",
        "insta\\s*pay|[إا]نستا\\s*باي" to "InstaPay",
        "\\bwallet\\b|\\be-?wallet\\b|محفظ" to "E-wallet",
    ).map { (re, name) -> Regex(I + re) to name }
    private val DONE = Regex("$I(?:^|\\s)تم\\s|\\byou have\\b|\\bha(?:s|ve) been\\b|\\bsuccessful(?:ly)?\\b|بنجاح|رقم العملية|\\btransaction (?:id|no|number|ref)")
    // "عرض" (offer) as a word of its own, not inside one like معرض (showroom).
    private const val OFFER_AR = "(?:^|[^\\u0600-\\u06ff])(?:و?ب?ال)?(?:عرض|عروض)(?![\\u0600-\\u06ff])"
    private val PROMO = Regex("$I\\b(get|win|offer|enjoy|up to|discount)\\b|احصل|اكسب|استمتع|$OFFER_AR|%")
    private val AD_LINE = Regex("${I}https?://|www\\.|\\b(get|win|offer|enjoy|up to|subscribe|download)\\b|احصل|اكسب|استمتع|$OFFER_AR|اشترك|اشتراك|%")
    private val RECHARGE = Regex("${I}شحن|\\brecharged?\\b|\\btop[- ]?up\\b")
    private val CARRIERS = mapOf("010" to "Vodafone", "011" to "Etisalat", "012" to "Orange", "015" to "WE")
    private val NAMED = listOf(
        Regex("(?:المسجل|المسجلة)\\s*(?:باسم|بإسم|بأسم)\\s*:?\\s*([^\\n.,،;؛]+?)(?=\\s+(?:على|علي|رصيد|الرصيد|بتاريخ|في|يوم)(?:\\s|$)|[\\n.,،;؛]|$)"),
        Regex("$I\\b(?:registered (?:to|under|as|in the name of)|name:)\\s*([A-Za-z][A-Za-z .'-]{1,40}?)(?=\\s+(?:on|at|with|your|balance|via)\\b|[\\n,;]|\\.\\s|\\.?$)"),
    )
    private val PHONE = Regex("$I(?:من|إلى|الى|لرقم|لـ|ل|to|from)\\s*(?:رقم|number|mobile|wallet)?\\s*:?\\s*(\\+?2?01\\d{9})\\b")

    private val MERCHANT_EN = Regex("$I\\b(?:at|@|from|to|with|in)\\s+([^\\n]+?)(?=\\s+(?:on|at|dated|date|for|via|using|is|was|has|card|with|ref|available|avl|bal|balance|total|egp|usd|eur|to\\s+your)\\b|[,;]|\\.\\s|\\.?$|\\s+\\d{1,2}[/-]\\d{1,2}|\\n)")
    private val MERCHANT_AR = Regex("(?:^|\\s)(?:لدى|لدي|عند|في|من|إلى|الى)\\s+([^\\n]+?)(?=\\s+(?:بتاريخ|برقم|يوم|في|الساعة|رصيد|الرصيد|المتاح|للمزيد|بنجاح)(?:\\s|$|[.,،])|[.,،;]|$|\\n)")
    private val NOT_MERCHANT = Regex("$I^(\\d|your|the|card|account|egp|usd|le\\b|time|date|بطاق|حساب|رصيد|تاريخ|مبلغ|بمبلغ)")
    private val STARTS_WITH_CURRENCY = Regex("$I^($CUR)(\\s|$)")
    private val ARABIC = Regex("[\\u0600-\\u06ff]")

    // E-wallets send from their own names (WALLETS in src/data/egyptBanks.ts).
    private val WALLET_SENDERS = mapOf(
        "Vodafone Cash" to listOf("vfcash", "vodafonecash", "vfcashegypt"),
        "Orange Cash" to listOf("orangecash", "orangemoney", "orangecashegypt"),
        "Etisalat Cash" to listOf("etisalatcash", "ecash", "emoney", "eandmoney", "eandcash"),
        "WE Pay" to listOf("wepay", "wecash", "wewallet"),
        "InstaPay" to listOf("instapay", "ipn"),
        "Telda" to listOf("telda"),
    ).flatMap { (name, keys) -> keys.map { it to name } }.toMap()

    fun senderKey(sender: String) = sender.lowercase().replace(Regex("[^a-z0-9]"), "")

    /** The e-wallet's name when this SMS sender is one. */
    fun walletName(sender: String): String? = WALLET_SENDERS[senderKey(sender)]

    /** Arabic-Indic digits to 0-9 and the Arabic decimal/thousands marks to . and , */
    private fun normalize(s: String): String {
        val out = StringBuilder(s.length)
        for (c in s) {
            out.append(
                when (c) {
                    in '٠'..'٩' -> '0' + (c - '٠')
                    in '۰'..'۹' -> '0' + (c - '۰')
                    '٫' -> '.'
                    '٬' -> ','
                    else -> c
                },
            )
        }
        return out.toString()
    }

    private fun isoDate(ms: Long) = Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()).toLocalDate().toString()

    private fun currencyCode(token: String) = CURRENCIES.firstOrNull { (re, _) -> re.containsMatchIn(token) }?.second ?: "EGP"

    private fun findAmount(body: String): Pair<Double, String>? {
        var first: Pair<Double, String>? = null
        for (m in AMOUNT.findAll(body)) {
            val start = m.range.first
            val before = body.substring(maxOf(0, start - 30), start)
            if (BALANCE_BEFORE.containsMatchIn(before) || FEE_BEFORE.containsMatchIn(before)) continue
            val g = m.groups
            val amount = ((g[2] ?: g[3])!!.value).replace(",", "").toDoubleOrNull() ?: continue
            if (amount <= 0 || amount >= 1e9) continue
            val found = amount to currencyCode((g[1] ?: g[4])!!.value)
            // "USD 20.00 (EGP 1,000.00)": the bank's own EGP amount is what left the account.
            if (found.second == "EGP") return found
            if (first == null) first = found
        }
        if (first != null) return first
        val amount = AMOUNT_WORD.find(body)?.groupValues?.get(1)?.replace(",", "")?.toDoubleOrNull() ?: return null
        return if (amount > 0) amount to "EGP" else null
    }

    /** The fee the message names, or 0. */
    private fun findFee(body: String): Double =
        FEE.find(body)?.groupValues?.get(1)?.replace(",", "")?.toDoubleOrNull()?.takeIf { it > 0 } ?: 0.0

    /** The receipt itself, without the ads and links some senders add after it. */
    private fun receipt(body: String): String {
        val lines = mutableListOf<String>()
        for (line in body.split("\n")) {
            // An ad line only ends the receipt once the receipt has its amount.
            if (lines.isNotEmpty() && (line.isBlank() || (AD_LINE.containsMatchIn(line) && findAmount(lines.joinToString("\n")) != null))) break
            if (line.isNotBlank()) lines.add(line)
        }
        return lines.joinToString("\n")
    }

    private fun findMerchant(body: String): String {
        val re = if (ARABIC.containsMatchIn(body)) MERCHANT_AR else MERCHANT_EN
        var from = 0
        while (from <= body.length) {
            val m = re.find(body, from) ?: break
            val name = m.groupValues[1].replace(Regex("\\s+"), " ").replace(Regex("[\\s.:-]+$"), "").trim()
            if (name.length >= 2 && !NOT_MERCHANT.containsMatchIn(name) && !STARTS_WITH_CURRENCY.containsMatchIn(name)) return name.take(40)
            // A rejected match can hide the right one inside it, so retry just after its start.
            from = m.range.first + 1
        }
        return ""
    }

    private fun findPerson(body: String): String {
        for (re in NAMED) {
            val name = re.find(body)?.groupValues?.get(1)?.replace(Regex("\\s+"), " ")?.trim()
            if (name != null && name.length >= 2) return name.take(40)
        }
        val phone = PHONE.find(body)?.groupValues?.get(1) ?: ""
        val carrier = CARRIERS[phone.replace(Regex("^\\+?2?"), "").take(3)]
        return if (carrier != null && RECHARGE.containsMatchIn(body)) "$carrier recharge" else phone
    }

    /** A bank or wallet message as a payment, or null when it isn't one. */
    fun parse(sms: RawSms, walletSender: String? = walletName(sms.address)): ParsedSms? {
        val full = normalize(sms.body)
        val body = receipt(full)
        if (IGNORE.containsMatchIn(body)) return null
        val credit = CREDIT.containsMatchIn(body) || INTO_ACCOUNT.containsMatchIn(body) || (CASHBACK.containsMatchIn(body) && !SPENT.containsMatchIn(body))
        if (!credit && !SPEND.containsMatchIn(body)) return null
        val (amount, currency) = findAmount(body) ?: return null
        val direction = if (credit) "credit" else "spend"
        val transfer = TRANSFER.containsMatchIn(body)
        val date = isoDate(sms.date)
        val fee = findFee(body)
        val instant = INSTANT.containsMatchIn(body)
        // Real card and account messages name the card; offers and ads don't.
        val card = CARD.firstNotNullOfOrNull { it.find(body)?.groupValues?.get(1) }
        if (card == null) {
            val wallet = walletSender ?: WALLET_WORDS.firstOrNull { (re, _) -> re.containsMatchIn(full) }?.second
            if (wallet == null || !DONE.containsMatchIn(body) || PROMO.containsMatchIn(body)) return null
            return ParsedSms(sms.id, sms.address, direction, transfer, amount, currency, findPerson(body).ifEmpty { findMerchant(body) }, wallet, wallet, date, sms.body, fee, instant, sms.date)
        }
        return ParsedSms(sms.id, sms.address, direction, transfer, amount, currency, findMerchant(body), card, null, date, sms.body, fee, instant, sms.date)
    }

    private val OUT = setOf("expense", "repay", "transfer", "borrow")
    private val IN = setOf("income", "transfer", "borrow")

    /**
     * Messages already in the budget, entered by hand or imported: an entry with the same
     * amount, a matching kind, and a date at most 3 days apart. Each entry accounts for one
     * message, the one closest in date. [txns] are (id, kind, amount, date).
     */
    fun alreadyRecorded(parsed: List<ParsedSms>, txns: List<Txn4>): Set<String> {
        val used = mutableSetOf<String>()
        val found = mutableSetOf<String>()
        for (p in parsed) {
            if (p.currency != "EGP") continue
            var best: Txn4? = null
            var bestGap = Long.MAX_VALUE
            val day = runCatching { java.time.LocalDate.parse(p.date).toEpochDay() }.getOrNull() ?: continue
            for (t in txns) {
                if (t.id in used || kotlin.math.abs(kotlin.math.abs(t.amount) - p.amount) > 0.005) continue
                if (t.kind !in (if (p.direction == "spend") OUT else IN)) continue
                val d = runCatching { java.time.LocalDate.parse(t.date).toEpochDay() }.getOrNull() ?: continue
                val gap = kotlin.math.abs(d - day)
                if (gap <= 3 && gap < bestGap) {
                    best = t
                    bestGap = gap
                }
            }
            if (best != null) {
                used.add(best.id)
                found.add(p.smsId)
            }
        }
        return found
    }

    /** Two messages for one payment keep only the first (dropDuplicates in src/data/smsMatch.ts). */
    fun dropDuplicates(parsed: List<ParsedSms>): List<ParsedSms> {
        val kept = mutableListOf<ParsedSms>()
        for (p in parsed.sortedBy { it.at }) {
            val twin = kept.any { q ->
                q.amount == p.amount && q.currency == p.currency && q.direction == p.direction &&
                    kotlin.math.abs(p.at - q.at) <= 10 * 60_000L && (q.sender != p.sender || q.body == p.body)
            }
            if (!twin) kept.add(p)
        }
        val ids = kept.map { it.smsId }.toSet()
        return parsed.filter { it.smsId in ids }
    }

    /** Whether two YYYY-MM-DD dates are at most `days` apart. */
    fun withinDays(a: String, b: String, days: Long): Boolean {
        val x = runCatching { java.time.LocalDate.parse(a).toEpochDay() }.getOrNull() ?: return false
        val y = runCatching { java.time.LocalDate.parse(b).toEpochDay() }.getOrNull() ?: return false
        return kotlin.math.abs(x - y) <= days
    }

    data class Txn4(val id: String, val kind: String, val amount: Double, val date: String)
}
