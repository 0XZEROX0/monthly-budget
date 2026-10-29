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

export const senderKey = (sender: string) => sender.toLowerCase().replace(/[^a-z0-9]/g, '')

const byKey = new Map(BANKS.flatMap((b) => b.senders.map((s) => [s, b.name] as const)))

/** The bank's name when this SMS sender is a known Egyptian bank. */
export const bankName = (sender: string): string | null => byKey.get(senderKey(sender)) ?? null

/** Every known bank sender, so the phone can notify about a bank's first message too. */
export const KNOWN_BANK_SENDERS = [...byKey.keys()]
