// Checks the bank SMS parser against real message templates. Run: npm run test:sms
import assert from 'node:assert/strict'
import { parseBankSms, type ParsedSms } from '../src/data/smsParser.ts'

const at = new Date(2026, 9, 28, 21, 16).getTime()
const parse = (body: string) => parseBankSms({ id: '1', address: 'CIB', body, date: at })
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
console.log(`${cases.length - failed}/${cases.length} passed`)
process.exit(failed ? 1 : 0)
