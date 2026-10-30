// SMS sender names that Egyptian banks send from. A sender is matched after lowercasing
// and dropping spaces and punctuation, so "CIB", "Banque Misr" and "BANQUE-MISR" all match.
// Senders that aren't here (shops, TRU, valU and other pay-later apps) stay off until turned on.
const BANKS: { name: string; senders: string[] }[] = [
  { name: 'CIB', senders: ['cib', 'cibegypt', 'cibeg'] },
  { name: 'National Bank of Egypt', senders: ['nbe', 'nbeegypt', 'alahly', 'ahly', 'alahlybank', 'ahlybank', 'nbebank'] },
  { name: 'Banque Misr', senders: ['banquemisr', 'bm', 'bmisr', 'bankmisr', 'misrbank', 'banquemisregypt'] },
  { name: 'Banque du Caire', senders: ['banqueducaire', 'bdc', 'bdcegypt', 'bankofcairo', 'cairobank'] },
  { name: 'QNB', senders: ['qnb', 'qnbalahli', 'qnbaa', 'qnbegypt', 'qnbeg'] },
  { name: 'AAIB', senders: ['aaib', 'arabafrican'] },
  { name: 'HSBC', senders: ['hsbc', 'hsbcegypt', 'hsbceg'] },
  { name: 'Alex Bank', senders: ['alexbank', 'bankofalexandria'] },
  { name: 'ADIB', senders: ['adib', 'adibegypt', 'adibeg'] },
  { name: 'FAB Misr', senders: ['fab', 'fabmisr', 'fabegypt'] },
  { name: 'Emirates NBD', senders: ['enbd', 'emiratesnbd', 'enbdegypt'] },
  { name: 'Crédit Agricole', senders: ['cae', 'caegypt', 'creditagricole', 'cagricole'] },
  { name: 'Faisal Islamic Bank', senders: ['faisalbank', 'fibe', 'faisal'] },
  { name: 'SAIB', senders: ['saib', 'saibbank'] },
  { name: 'Suez Canal Bank', senders: ['scbank', 'suezcanalbank', 'scb'] },
  { name: 'Housing & Development Bank', senders: ['hdb', 'hdbank', 'hdbegypt'] },
  { name: 'Egyptian Gulf Bank', senders: ['egbank', 'egb'] },
  { name: 'Mashreq', senders: ['mashreq', 'mashreqbank'] },
  { name: 'Attijariwafa', senders: ['attijari', 'attijariwafa'] },
  { name: 'NBK', senders: ['nbk', 'nbkegypt'] },
  { name: 'ABK', senders: ['abk', 'abkegypt'] },
  { name: 'Arab Bank', senders: ['arabbank'] },
  { name: 'Banque Misr Liban', senders: ['bml'] },
  { name: 'Ahli United Bank', senders: ['aub', 'ahliunited'] },
  { name: 'Al Baraka', senders: ['albaraka', 'baraka'] },
  { name: 'aiBANK', senders: ['aibank'] },
  { name: 'Export Development Bank', senders: ['ebank', 'edbe'] },
  { name: 'Agricultural Bank of Egypt', senders: ['abe', 'agribank'] },
  { name: 'Bank NXT', senders: ['banknxt', 'nxt'] },
  { name: 'Misr Digital (ONE)', senders: ['onebank'] },
]

// E-wallets send from their own names. Their messages name a phone number, not a card.
const WALLETS: { name: string; senders: string[] }[] = [
  { name: 'Vodafone Cash', senders: ['vfcash', 'vodafonecash', 'vfcashegypt'] },
  { name: 'Orange Cash', senders: ['orangecash', 'orangemoney', 'orangecashegypt'] },
  { name: 'Etisalat Cash', senders: ['etisalatcash', 'ecash', 'emoney', 'eandmoney', 'eandcash'] },
  { name: 'WE Pay', senders: ['wepay', 'wecash', 'wewallet'] },
  { name: 'InstaPay', senders: ['instapay', 'ipn'] },
  { name: 'Telda', senders: ['telda'] },
]

// Senders whose messages can look like a bank's (a card number and an amount) but aren't
// money leaving your account: pay-later apps and shops confirming an order already paid by card.
const NOT_BANKS = [
  'tru', 'valu', 'sympl', 'souhoola', 'contact', 'contactnow', 'aman', 'forsa', 'halan', 'mogo', 'premium',
  'talabat', 'noon', 'amazon', 'jumia', 'uber', 'careem', 'fawry', 'breadfast', 'instashop', 'swvl', 'indrive', 'btech',
]

export const senderKey = (sender: string) => sender.toLowerCase().replace(/[^a-z0-9]/g, '')

const byKey = new Map([...BANKS, ...WALLETS].flatMap((b) => b.senders.map((s) => [s, b.name] as const)))
const walletKeys = new Set(WALLETS.flatMap((w) => w.senders))

/** The bank's or e-wallet's name when this SMS sender is a known one. */
export const bankName = (sender: string): string | null => byKey.get(senderKey(sender)) ?? null

/** The e-wallet's name when this SMS sender is one. */
export const walletName = (sender: string): string | null => (walletKeys.has(senderKey(sender)) ? bankName(sender) : null)

/** Pay-later apps and shops, never picked up on their own even when a message looks like a bank's. */
export const notABank = (sender: string) => NOT_BANKS.includes(senderKey(sender))

/** Every known bank and e-wallet sender, so the phone can notify about its first message too. */
export const KNOWN_BANK_SENDERS = [...byKey.keys()]
