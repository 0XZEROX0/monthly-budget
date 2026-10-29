// Emoji for common category names so they're quick to spot; others get their initial.
const ICONS: [RegExp, string][] = [
  [/food|grocer|restaurant|eat/i, '🛒'],
  [/gift/i, '🎁'],
  [/health|medical|doctor|pharma/i, '💊'],
  [/home|rent|house|mortgage/i, '🏠'],
  [/transport|car|fuel|gas|taxi|uber/i, '🚗'],
  [/personal|clothes|shopping/i, '🛍️'],
  [/pet/i, '🐾'],
  [/utilit|electric|water|internet|phone|bill/i, '💡'],
  [/travel|holiday|vacation|flight/i, '✈️'],
  [/debt|loan|credit/i, '💳'],
  [/saving/i, '🏦'],
  [/pay|salary|wage/i, '💼'],
  [/bonus/i, '🎉'],
  [/interest|invest|dividend/i, '📈'],
  [/educat|school|course/i, '📚'],
  [/entertain|fun|movie|game/i, '🎬'],
  [/kid|child|baby/i, '🧸'],
  [/charity|donat/i, '🤝'],
  [/sub(scription)?s?\b|stream/i, '📺'],
  [/other|misc/i, '📦'],
]

export function categoryIcon(name: string): string {
  for (const [re, icon] of ICONS) if (re.test(name)) return icon
  return name.trim().charAt(0).toUpperCase() || '•'
}
