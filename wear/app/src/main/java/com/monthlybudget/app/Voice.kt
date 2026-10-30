package com.monthlybudget.app

/** What was understood from something like "50 food cash" or "got 5000 salary into bank". */
data class Draft(val kind: String, val amount: Double?, val category: String?, val account: String)

private val ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩"
private val AMOUNT = Regex("""(\d[\d,]*(?:\.\d+)?)\s*(k\b|thousand)?""")
private val INCOME_WORDS = Regex("""\b(income|salary|received|receive|got paid|earned|bonus)\b""")
private val WORD = Regex("""[\p{L}]{3,}""")

fun parseSpoken(spoken: String, settings: WatchSettings, lastAccount: (String) -> String?): Draft {
    val text = spoken.map { c -> ARABIC_DIGITS.indexOf(c).takeIf { it >= 0 }?.let { '0' + it } ?: c }.joinToString("").lowercase()
    val amount = AMOUNT.find(text)?.let { m ->
        val n = m.groupValues[1].replace(",", "").toDoubleOrNull()
        if (n != null && m.groupValues[2].isNotEmpty()) n * 1000 else n
    }
    val saidIncome = INCOME_WORDS.containsMatchIn(text)
    val expenseMatch = if (saidIncome) null else bestCategory(text, settings.expense)
    val incomeMatch = bestCategory(text, settings.income)
    val kind = if (saidIncome || (expenseMatch == null && incomeMatch != null)) "income" else "expense"
    val category = if (kind == "income") incomeMatch else expenseMatch
    val account = settings.accounts.firstOrNull { text.contains(it.lowercase()) }
        ?: lastAccount(kind)?.takeIf { it in settings.accounts }
        ?: settings.accounts.first()
    return Draft(kind, amount, category, account)
}

/**
 * The category named in the text: its full name first, then one of its words, then a word
 * that gets the same icon (so "groceries" finds Food and "uber" finds Transportation).
 */
private fun bestCategory(text: String, categories: List<String>): String? {
    categories.filter { text.contains(it.lowercase()) }.maxByOrNull { it.length }?.let { return it }
    val words = WORD.findAll(text).map { it.value }.toList()
    categories.firstOrNull { c ->
        WORD.findAll(c.lowercase()).any { part -> words.any { w -> w.startsWith(part.value.take(4)) || part.value.startsWith(w.take(4)) && w.length >= 4 } }
    }?.let { return it }
    for (w in words) {
        val icon = categoryIcon(w)
        // An initial letter isn't a real match.
        if (icon.length == 1 && icon[0].isLetter()) continue
        categories.firstOrNull { categoryIcon(it) == icon }?.let { return it }
    }
    return null
}
