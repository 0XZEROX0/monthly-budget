// Checks the bank SMS parser against real message templates. Run: npm run test:sms
import assert from 'node:assert/strict'
import { alreadyRecorded } from '../src/data/smsMatch.ts'
import { parseBankSms, type ParsedSms } from '../src/data/smsParser.ts'
import type { Transaction } from '../src/data/types.ts'

const at = new Date(2026, 9, 28, 21, 16).getTime()
const parse = (body: string) => parseBankSms({ id: '1', address: 'CIB', body, date: at })
const fromWallet = parseBankSms({ id: '2', address: 'VF-Cash', body: 'تم تحويل 150 جنيه الى 01001122334 المسجل باسم MONA ALI. رصيدك 900 جنيه', date: at }, 'Vodafone Cash')
const cases: [string, Partial<ParsedSms> | null][] = [
  // CIB, from Static's phone (2026-10-29)
  [
    'يرجى العلم انه تم تنفيذ تحويل لحظي بمبلغ 100.00 جم إلى حسابك المنتهي بـ ********4275 من YOUSSEF MAHMOUD برقم مرجعي dc1c24b7 بتاريخ 28-10-2026 21:16 للمزيد، برجاء الاتصال بـ 19666',
    { direction: 'credit', transfer: true, amount: 100, currency: 'EGP', card: '4275', merchant: 'YOUSSEF MAHMOUD' },
  ],
  [
    'يرجى العلم انه تم تنفيذ تحويل لحظي بمبلغ 1010.00 جم من حسابك المنتهي بـ ********4275 برقم مرجعي b2226ab4 بتاريخ 27-10-2026 09:45 للمزيد، برجاء الاتصال بـ 19666',
    { direction: 'spend', transfer: true, amount: 1010, currency: 'EGP', card: '4275', merchant: '' },
  ],
  [
    'تم خصم مبلغ EGP 215.00 من بطاقة الخصم المباشر المنتهية بـ **2244 عند ELSAHEL MOBIL في 26/10/26 10:05 ، الرصيد المتاح 39004.36 EGP',
    { direction: 'spend', transfer: false, amount: 215, currency: 'EGP', card: '2244', merchant: 'ELSAHEL MOBIL' },
  ],
  [
    'تم إيداع مبلغ 13800.00 EGP في CIB BOSTAN BR VIBOSTAN في بطاقتك المنتهية بـ **2244 بتاريخ 02/10/26 23:19 ،الرصيد المتاح 65668.59 EGP',
    { direction: 'credit', amount: 13800, currency: 'EGP', card: '2244', merchant: 'CIB BOSTAN BR VIBOSTAN' },
  ],
  // Common English wordings
  [
    'Your credit card ending with 1234 was charged for EGP 1,250.50 at CARREFOUR MAADI on 29/10/2026 14:20. Available limit EGP 30,000.00',
    { direction: 'spend', amount: 1250.5, card: '1234', merchant: 'CARREFOUR MAADI' },
  ],
  ['Purchase of USD 9.99 using card xx5678 at NETFLIX.COM on 29-10-26. Avl Bal: EGP 5,000', { amount: 9.99, currency: 'USD', card: '5678', merchant: 'NETFLIX.COM' }],
  // Masked cards in other shapes
  ['Your Visa card XXXX-XXXX-XXXX-9876 was used for EGP 450.00 at ZARA CITY STARS on 30/10/2026', { direction: 'spend', amount: 450, card: '9876', merchant: 'ZARA CITY STARS' }],
  ['تم شراء بمبلغ 320.50 جنيه ببطاقة فيزا *3311 لدى KFC MAADI يوم 30/10', { direction: 'spend', amount: 320.5, card: '3311', merchant: 'KFC MAADI' }],
  // E-wallets
  [
    'تم استلام مبلغ 500.00 جنيه من رقم 01012345678؛ المسجل باسم AHMED MOHAMED على رقم محفظتك 01098765432. رصيدك الحالي 1500.00 جنيه. رقم العملية 012345678901.',
    { direction: 'credit', amount: 500, currency: 'EGP', card: 'E-wallet', wallet: 'E-wallet', merchant: 'AHMED MOHAMED' },
  ],
  [
    'تم تحويل 200.00 جنيه لرقم 01198765432 بنجاح. رصيد فودافون كاش الحالي 1300.00 جنيه.',
    { direction: 'spend', transfer: true, amount: 200, card: 'Vodafone Cash', merchant: '01198765432' },
  ],
  ['You have received EGP 1,000.00 from 01223344556 via Orange Cash. Your balance is EGP 2,500.00', { direction: 'credit', amount: 1000, card: 'Orange Cash', merchant: '01223344556' }],
  ['تم دفع 75 جنيه لفاتورة الكهرباء بنجاح من محفظتك. رقم العملية 99887766', { direction: 'spend', amount: 75, card: 'E-wallet' }],
  // Orange Cash recharge, from Static's phone (2026-10-31): no currency on the amount, and an ad after the receipt.
  [
    'تم شحن بنجاح لرقم 01208077997 بقيمة 270.00، رصيدك الحالي 36.13 جنيه، رقم المعاملة 25000278539056.\n\nعرض مايتفوتش!\nوفّر 540 جنيه على اشتراك Yango Play واتفرج على اجمد الافلام والمسلسلات في مصر\nخصم 65% على اشتراك 6 شهور بـ300 جنيه بدل 840 جنيه\nادفع دلوقتي باورنچ كاش\nhttps://myo.orange.eg/YANGO\n\n+لأي استفسار كلم 7770 \nأو تواصل معانا على الواتساب: https://myo.orange.eg/O-whatsapp',
    { direction: 'spend', transfer: false, amount: 270, currency: 'EGP', card: 'Orange Cash', merchant: 'Orange recharge' },
  ],
  [
    'Recharge of EGP 50.00 to 01012345678 was successful. Your current balance is EGP 120.00. Transaction ID 123456789\nGet 20% off with Vodafone Cash! https://vf.eg/x',
    { direction: 'spend', amount: 50, card: 'Vodafone Cash', merchant: 'Vodafone recharge' },
  ],
  ['احصل على 50 جنيه كاش باك عند الدفع بفودافون كاش! تم تفعيل العرض', null],
  ['Your OTP for purchase of EGP 500 at NOON is 123456', null],
  ['Transaction of EGP 300 at UBER declined: insufficient funds', null],
  ['Get EGP 100 cashback on your next order!', null],
]

let failed = 0
for (const [body, want] of cases) {
  const got = parse(body)
  try {
    if (want === null) assert.equal(got, null)
    else {
      assert.ok(got, 'no match')
      for (const [k, v] of Object.entries(want)) assert.deepEqual(got[k as keyof ParsedSms], v, k)
    }
  } catch (e) {
    failed++
    console.error(`FAIL ${body.slice(0, 60)}…\n  ${(e as Error).message}\n  got ${JSON.stringify(got && { ...got, body: undefined })}`)
  }
}
try {
  // A known wallet sender names the wallet even when the message doesn't.
  assert.ok(fromWallet)
  assert.deepEqual([fromWallet.card, fromWallet.amount, fromWallet.merchant, fromWallet.direction], ['Vodafone Cash', 150, 'MONA ALI', 'spend'])
} catch (e) {
  failed++
  console.error(`FAIL wallet sender: ${(e as Error).message} ${JSON.stringify(fromWallet && { ...fromWallet, body: undefined })}`)
}
// Messages already entered (by hand or from the sheet import) aren't offered again.
const sms = (id: string, amount: number, date: string, direction: ParsedSms['direction'] = 'spend'): ParsedSms =>
  ({ smsId: id, sender: 'CIB', direction, transfer: false, amount, currency: 'EGP', merchant: '', card: '2244', date, body: '' })
const txn = (id: string, kind: Transaction['kind'], amount: number, date: string): Transaction =>
  ({ id, kind, amount, date, month: date.slice(0, 7), description: '', category: '' })
const matched = alreadyRecorded(
  [sms('a', 215, '2026-10-26'), sms('b', 215, '2026-10-26'), sms('c', 1010, '2026-10-27'), sms('d', 13800, '2026-10-02', 'credit'), sms('e', 99, '2026-10-20')],
  [txn('x', 'expense', 215, '2026-10-25'), txn('y', 'transfer', 1010, '2026-10-27'), txn('z', 'income', 13800, '2026-10-03'), txn('w', 'income', 99, '2026-10-20')],
)
try {
  // Two 215 payments but one entry: only one is matched. 99 out doesn't match 99 in.
  assert.deepEqual([...matched].sort(), ['a', 'c', 'd'])
} catch (e) {
  failed++
  console.error(`FAIL alreadyRecorded: ${(e as Error).message}`)
}
console.log(`${cases.length + 2 - failed}/${cases.length + 2} passed`)
process.exit(failed ? 1 : 0)
