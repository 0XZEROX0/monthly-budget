// Turns a bank's card SMS or an e-wallet's SMS into the parts of a transaction. Egyptian
// banks and wallets word these messages differently (English and Arabic), so this looks for
// the pieces rather than matching one template: an amount with a currency, whether money went
// out or came in, the card's last four digits (or the wallet), and the merchant or person.

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
  /** Last four digits of the card or account, or the e-wallet's name, e.g. Vodafone Cash. */
  card: string
  /** Set for e-wallet messages: the wallet's name. */
  wallet?: string
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
// Some wallets leave out the currency: "بقيمة 270.00".
const AMOUNT_WORD = new RegExp(String.raw`(?:بقيمة|قيمة|بمبلغ|مبلغ|amount(?: of)?|value(?: of)?)\s*:?\s*(${NUM})`, 'i')

// Not a finished payment: codes for approving one, or one that failed.
const IGNORE = /\b(otp|one[- ]time|passcode|password|verification|pin)\b|كود|رمز|كلمة (?:السر|المرور)|declined|failed|unsuccessful|insufficient|rejected|مرفوض|رفض|لم تتم|غير ناجح/i
const CREDIT = /\b(credited|refund(?:ed)?|reversal|reversed|deposit(?:ed)?|received|cash ?back|salary)\b|إيداع|ايداع|إضافة|اضافة|استرداد|استلام|تحويل وارد|راتب/i
// "...to your account" (إلى حسابك) is money coming in.
const INTO_ACCOUNT = /(?:إلى|الى|ل)\s*حسابك|to your (?:account|card)/i
const TRANSFER = /\btransfer|تحويل/i
const SPEND = /\b(purchase[ds]?|charged|debited|spent|paid|payment|pos|withdrawal|withdrawn|deducted|transaction|trx|txn|transfer(?:red)?|bought|sent|used|recharged?|top[- ]?up)\b|خصم|شراء|سحب|عملية|مشتريات|دفع|تحويل|شحن/i
// An amount right after these words is a balance or limit, not what was paid.
const BALANCE_BEFORE = /(balance|bal|limit|available|avl|avail|remaining|رصيد|المتاح|متاح|الحد)[^\d\n]{0,20}$/i

const CARD = [
  /(?:ending(?:\s+(?:with|in))?|ends\s+with|card\s*(?:no\.?|number|#)?|acc(?:ount)?\s*(?:no\.?|number|#)?)\s*[:#]?\s*(?:[*xX•.]+\s*)?(\d{4})\b/i,
  // A masked number: ****1234, xx1234, XXXX-XXXX-XXXX-1234
  /(?:[*xX•]{2,}[\s-]*)+(\d{4})\b/,
  // Visa *1234, بطاقة ميزة *1234
  /(?:visa|master\s?card|meeza|card|فيزا|ماستر\s?كارد|ميزة|بطاق\S*)[^\d\n]{0,15}?[*xX•]+\s*(\d{4})\b/i,
  /(?:المنتهية|المنتهي|ينتهي|رقم)\s*(?:ب|بـ|في)?\s*[*xX•]*\s*(\d{4})\b/,
]

// E-wallet messages name a phone number instead of a card.
const WALLET_WORDS: [RegExp, string][] = [
  [/vodafone\s*cash|vf[\s-]?cash|فودافون\s*كاش/i, 'Vodafone Cash'],
  [/orange\s*(?:cash|money)|[أا]ورن[جچ]\s*(?:كاش|موني)/i, 'Orange Cash'],
  [/etisalat\s*cash|e&\s*(?:cash|money)|اتصالات\s*كاش|[إا]تصالات\s*كاش/i, 'Etisalat Cash'],
  [/we\s*pay|وي\s*باي/i, 'WE Pay'],
  [/insta\s*pay|[إا]نستا\s*باي/i, 'InstaPay'],
  [/\bwallet\b|\be-?wallet\b|محفظ/i, 'E-wallet'],
]
// A wallet message reports something done. Without a card number, this tells it apart from an ad.
const DONE = /(?:^|\s)تم\s|\byou have\b|\bha(?:s|ve) been\b|\bsuccessful(?:ly)?\b|بنجاح|رقم العملية|\btransaction (?:id|no|number|ref)/i
const PROMO = /\b(get|win|offer|enjoy|up to|discount)\b|احصل|اكسب|استمتع|عرض|%/i
// Wallets add ads and links after the receipt. The receipt ends at the first blank line, link or ad line.
const AD_LINE = /https?:\/\/|www\.|\b(get|win|offer|enjoy|up to|subscribe|download)\b|احصل|اكسب|استمتع|عرض|اشترك|اشتراك|%/i
// A mobile recharge: name the carrier from the number's prefix.
const RECHARGE = /شحن|\brecharged?\b|\btop[- ]?up\b/i
const CARRIERS: Record<string, string> = { '010': 'Vodafone', '011': 'Etisalat', '012': 'Orange', '015': 'WE' }
// The person on the other side: "registered to AHMED ALI" / "المسجل باسم احمد علي", else their number.
const NAMED = [
  /(?:المسجل|المسجلة)\s*(?:باسم|بإسم|بأسم)\s*:?\s*([^\n.,،;؛]+?)(?=\s+(?:على|علي|رصيد|الرصيد|بتاريخ|في|يوم)(?:\s|$)|[\n.,،;؛]|$)/,
  /\b(?:registered (?:to|under|as|in the name of)|name:)\s*([A-Za-z][A-Za-z .'-]{1,40}?)(?=\s+(?:on|at|with|your|balance|via)\b|[\n,;]|\.\s|\.?$)/i,
]
const PHONE = /(?:من|إلى|الى|لرقم|لـ|ل|to|from)\s*(?:رقم|number|mobile|wallet)?\s*:?\s*(\+?2?01\d{9})\b/i

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
  const amount = Number(AMOUNT_WORD.exec(body)?.[1].replace(/,/g, ''))
  return amount > 0 ? { amount, currency: 'EGP' } : null
}

/** The receipt itself, without the ads and links some senders add after it. */
function receipt(body: string): string {
  const lines: string[] = []
  for (const line of body.split('\n')) {
    if (lines.length && (!line.trim() || AD_LINE.test(line))) break
    if (line.trim()) lines.push(line)
  }
  return lines.join('\n')
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

function findPerson(body: string): string {
  for (const re of NAMED) {
    const name = re.exec(body)?.[1]?.replace(/\s+/g, ' ').trim()
    if (name && name.length >= 2) return name.slice(0, 40)
  }
  const phone = PHONE.exec(body)?.[1] ?? ''
  const carrier = CARRIERS[phone.replace(/^\+?2?/, '').slice(0, 3)]
  return carrier && RECHARGE.test(body) ? `${carrier} recharge` : phone
}

/** `walletSender` is the wallet's name when the SMS comes from a known e-wallet sender. */
export function parseBankSms(sms: SmsMessage, walletSender?: string | null): ParsedSms | null {
  const full = normalize(sms.body)
  const body = receipt(full)
  if (IGNORE.test(body)) return null
  const credit = CREDIT.test(body) || INTO_ACCOUNT.test(body)
  if (!credit && !SPEND.test(body)) return null
  const found = findAmount(body)
  if (!found) return null
  // Real card and account messages name the card; offers and ads don't.
  const card = CARD.map((re) => re.exec(body)?.[1]).find(Boolean)
  if (!card) {
    // A wallet message instead: from a wallet, or naming one, and reporting a finished payment.
    // The ad after a receipt often names the wallet ("ادفع باورنچ كاش") when the receipt doesn't.
    const wallet = walletSender ?? WALLET_WORDS.find(([re]) => re.test(full))?.[1]
    if (!wallet || !DONE.test(body) || PROMO.test(body)) return null
    return {
      smsId: sms.id,
      sender: sms.address,
      direction: credit ? 'credit' : 'spend',
      transfer: TRANSFER.test(body),
      ...found,
      merchant: findPerson(body) || findMerchant(body),
      card: wallet,
      wallet,
      date: isoDate(sms.date),
      body: sms.body,
    }
  }
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
