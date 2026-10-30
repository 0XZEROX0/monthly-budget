package com.monthlybudget.app

// Same emoji as src/data/icons.ts in the phone app; keep the two lists in step.
private val ICONS: List<Pair<Regex, String>> = listOf(
    "^cash$" to "💵",
    "^bank$" to "🏦",
    "thndr|thunder|stock|invest" to "📈",
    "loan to|lend" to "🤝",
    "debt|loan|credit|tru|valu" to "💳",
    "coffee|caf[eé]" to "☕",
    "fee" to "🧾",
    "instal" to "📆",
    "^car$" to "🚙",
    "food|grocer|restaurant|eat" to "🛒",
    "gift" to "🎁",
    "health|medical|doctor|pharma" to "💊",
    "home|rent|house|mortgage" to "🏠",
    "transport|car|fuel|gas|taxi|uber" to "🚗",
    "personal|clothes|shopping" to "🛍️",
    "pet" to "🐾",
    "utilit|electric|water|internet|phone|bill" to "💡",
    "travel|holiday|vacation|flight" to "✈️",
    "debt|loan|credit" to "💳",
    "saving" to "🏦",
    "pay|salary|wage" to "💼",
    "bonus" to "🎉",
    "interest|invest|dividend" to "📈",
    "educat|school|course" to "📚",
    "entertain|fun|movie|game" to "🎬",
    "kid|child|baby" to "🧸",
    "charity|donat" to "🤝",
    "sub(scription)?s?\\b|stream" to "📺",
    "other|misc" to "📦",
    // Arabic category names, e.g. from a Money Manager import.
    "قهوة" to "☕",
    "اكل" to "🛒",
    "مواصلات|مترو|توكتوك" to "🚗",
    "عربية" to "🚙",
    "قسط" to "📆",
    "مرتب" to "💼",
    "هدوم" to "🛍️",
    "جمعية" to "🤝",
    "عيدية" to "🎁",
    "عمولة" to "🧾",
    "كورس" to "📚",
    "ماما|بيت" to "🏠",
    "دكتور" to "💊",
    "مصاريف" to "💸",
).map { (pattern, icon) -> Regex(pattern, RegexOption.IGNORE_CASE) to icon }

/** An emoji for a category or account; others get their initial. */
fun categoryIcon(name: String): String =
    ICONS.firstOrNull { it.first.containsMatchIn(name) }?.second
        ?: name.trim().take(1).uppercase().ifEmpty { "•" }
