// Emoji for common category names so they're quick to spot; others get their initial.
const ICONS: [RegExp, string][] = [
  [/^cash$/i, '💵'],
  [/^bank$/i, '🏦'],
  [/thndr|thunder|stock|invest/i, '📈'],
  [/loan to|lend/i, '🤝'],
  [/debt|loan|credit|tru|valu/i, '💳'],
  [/coffee|caf[eé]/i, '☕'],
  [/fee/i, '🧾'],
  [/instal/i, '📆'],
  [/^car$/i, '🚙'],
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
  // Arabic category names, as other budget apps export them.
  [/قهوة|كافيه/, '☕'],
  [/اكل|أكل|طعام|مطعم/, '🛒'],
  [/مواصلات|مترو|توكتوك|تاكسي|اوبر/, '🚗'],
  [/عربية|عربيه|بنزين/, '🚙'],
  [/قسط|اقساط|أقساط/, '📆'],
  [/مرتب|راتب/, '💼'],
  [/هدوم|ملابس/, '🛍️'],
  [/جمعية|جمعيه/, '🤝'],
  [/عيدية|هدية|هدايا/, '🎁'],
  [/عمولة|رسوم/, '🧾'],
  [/كورس|دراسة|مدرسة/, '📚'],
  [/ماما|بابا|اهل|أهل|بيت/, '🏠'],
  [/دكتور|دوا|صيدلية/, '💊'],
  [/مصاريف/, '💸'],
]

let custom: Record<string, string> = {}
/** Icons the user picked; set from their settings. */
export const setCustomIcons = (icons: Record<string, string> | undefined) => {
  custom = icons ?? {}
}

/** Icons offered when picking one for a category or account. */
export const ICON_CHOICES = [
  '🛒', '🍔', '☕', '🍕', '🏠', '💡', '📱', '🌐', '🚗', '🚙', '⛽', '🚌',
  '✈️', '🏖️', '💊', '🏥', '🛍️', '👕', '💄', '💇', '🎁', '🎉', '🎬', '🎮',
  '📚', '🎓', '🧸', '🐾', '🏋️', '⚽', '🎵', '📺', '🧾', '📆', '💳', '🏦',
  '💵', '💰', '💼', '📈', '🪙', '🤝', '🕌', '❤️', '🔧', '🧹', '📦', '💸',
]

export function categoryIcon(name: string): string {
  if (custom[name]) return custom[name]
  for (const [re, icon] of ICONS) if (re.test(name)) return icon
  return name.trim().charAt(0).toUpperCase() || '•'
}
