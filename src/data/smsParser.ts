// Turns a bank's card SMS into the parts of a transaction. Egyptian banks word these
// messages differently (English and Arabic), so this looks for the pieces rather than
// matching one bank's template: an amount with a currency, whether money went out or
// came in, the card's last four digits, and the merchant.

export interface SmsMessage {
  id: string
  address: string
  body: string
  /** Received time, ms since epoch. */
  date: number
}

export interface ParsedSms {
  smsId: string
  sender: string
  /** spend: a purchase or withdrawal. credit: a refund or money received. */
  direction: 'spend' | 'credit'
  /** A bank transfer rather than a card payment; it may be between your own accounts. */
  transfer: boolean
  amount: number
  /** ISO code, e.g. EGP or USD. */
  currency: string
  merchant: string
  /** Last four digits of the card or account. */
  card: string
  /** YYYY-MM-DD, from when the SMS arrived. */
  date: string
  body: string
}

const CURRENCIES: [RegExp, string][] = [
  [/^(egp|le|l\.e\.?|جنيه|جنيها|جنيهًا|ج\.م\.?|جم)$/i, 'EGP'],
  [/^(usd|\$|دولار)$/i, 'USD'],
  [/^(eur|€|يورو)$/i, 'EUR'],
  [/^gbp$/i, 'GBP'],
  [/^(sar|ريال)$/i, 'SAR'],
  [/^aed$/i, 'AED'],
  [/^kwd$/i, 'KWD'],
  [/^qar$/i, 'QAR'],
  [/^try$/i, 'TRY'],
]
const CUR = String.raw`EGP|L\.E\.?|LE|USD|EUR|GBP|SAR|AED|KWD|QAR|TRY|\$|€|جنيها|جنيهًا|جنيه|ج\.م\.?|جم|دولار|يورو|ريال`
const NUM = String.raw`\d[\d,]*(?:\.\d+)?`
const AMOUNT = new RegExp(String.raw`(?:(${CUR})\s*(${NUM}))|(?:(${NUM})\s*(${CUR}))(?![a-z])`, 'gi')

// Not a finished payment: codes for approving one, or one that failed.
const IGNORE = /\b(otp|one[- ]time|passcode|password|verification|pin)\b|كود|رمز|كلمة (?:السر|المرور)|declined|failed|unsuccessful|insufficient|rejected|مرفوض|رفض|لم تتم|غير ناجح/i
const CREDIT = /\b(credited|refund(?:ed)?|reversal|reversed|deposit(?:ed)?|received|cash ?back|salary)\b|إيداع|ايداع|إضافة|اضافة|استرداد|استلام|تحويل وارد|راتب/i
// "...to your account" (إلى حسابك) is money coming in.
const INTO_ACCOUNT = /(?:إلى|الى|ل)\s*حسابك|to your (?:account|card)/i
const TRANSFER = /\btransfer|تحويل/i
const SPEND = /\b(purchase[ds]?|charged|debited|spent|paid|payment|pos|withdrawal|withdrawn|deducted|transaction|trx|txn|transfer(?:red)?|bought)\b|خصم|شراء|سحب|عملية|مشتريات|دفع|تحويل/i
// An amount right after these words is a balance or limit, not what was paid.
const BALANCE_BEFORE = /(balance|bal|limit|available|avl|avail|remaining|رصيد|المتاح|متاح|الحد)[^\d\n]{0,20}$/i

const CARD = [
  /(?:ending(?:\s+(?:with|in))?|ends\s+with|card\s*(?:no\.?|number|#)?|acc(?:ount)?\s*(?:no\.?|number|#)?)\s*[:#]?\s*(?:[*xX•.]+\s*)?(\d{4})\b/i,
  /[*xX•]{2,}\s*(\d{4})\b/,
  /(?:المنتهية|المنتهي|ينتهي|رقم)\s*(?:ب|بـ|في)?\s*[*xX•]*\s*(\d{4})\b/,
]

// The words before a merchant or person, and the words that end its name.
const MERCHANT_EN = /\b(?:at|@|from|to|with|in)\s+([^\n]+?)(?=\s+(?:on|at|dated|date|for|via|using|is|was|has|card|with|ref|available|avl|bal|balance|total)\b|[,;]|\.\s|\.?$|\s+\d{1,2}[/-]\d{1,2}|\n)/gi
const MERCHANT_AR = /(?:^|\s)(?:لدى|لدي|عند|في|من|إلى|الى)\s+([^\n]+?)(?=\s+(?:بتاريخ|برقم|يوم|في|الساعة|رصيد|الرصيد|المتاح|للمزيد)(?:\s|$)|[.,،;]|$|\n)/g
const NOT_MERCHANT = /^(\d|your|the|card|account|egp|usd|le\b|time|date|بطاق|حساب|رصيد|تاريخ|مبلغ|بمبلغ)/i

/** Arabic-Indic digits to 0-9 and the Arabic decimal/thousands marks to . and , */
const normalize = (s: string) =>
  s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .replace(/٬/g, ',')

const isoDate = (ms: number) => {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const currencyCode = (token: string) => CURRENCIES.find(([re]) => re.test(token))?.[1] ?? 'EGP'

function findAmount(body: string): { amount: number; currency: string } | null {
  for (const m of body.matchAll(AMOUNT)) {
    if (BALANCE_BEFORE.test(body.slice(Math.max(0, m.index - 30), m.index))) continue
    const amount = Number((m[2] ?? m[3]).replace(/,/g, ''))
    if (amount > 0) return { amount, currency: currencyCode(m[1] ?? m[4]) }
  }
  return null
}

function findMerchant(body: string): string {
  const re = new RegExp(/[\u0600-\u06ff]/.test(body) ? MERCHANT_AR : MERCHANT_EN)
  for (let m = re.exec(body); m; m = re.exec(body)) {
    const name = m[1].replace(/\s+/g, ' ').replace(/[\s.:-]+$/, '').trim()
    if (name.length >= 2 && !NOT_MERCHANT.test(name) && !new RegExp(`^(${CUR})(\\s|$)`, 'i').test(name)) return name.slice(0, 40)
    // "من بطاقة ... عند SHOP": a rejected match can hide the right one inside it, so retry just after its start.
    re.lastIndex = m.index + 1
  }
  return ''
}

export function parseBankSms(sms: SmsMessage): ParsedSms | null {
  const body = normalize(sms.body)
  if (IGNORE.test(body)) return null
  const credit = CREDIT.test(body) || INTO_ACCOUNT.test(body)
  if (!credit && !SPEND.test(body)) return null
  const found = findAmount(body)
  // Real card and account messages name the card; offers and ads don't.
  const card = CARD.map((re) => re.exec(body)?.[1]).find(Boolean)
  if (!found || !card) return null
  return {
    smsId: sms.id,
    sender: sms.address,
    direction: credit ? 'credit' : 'spend',
    transfer: TRANSFER.test(body),
    ...found,
    merchant: findMerchant(body),
    card,
    date: isoDate(sms.date),
    body: sms.body,
  }
}
