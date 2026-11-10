// Emails new in-app feedback (the Firestore "feedback" collection) to the developer.
// Runs in the developer's own Google account as a Google Apps Script, on an hourly timer,
// so their email address lives only in that account and never in the app or this repo.
// Setup: scripts/feedback-mailer/README.md
//
// Optional Script properties (Project Settings › Script properties):
//   RECIPIENT   where to send. Default: the Google account running this script.
//   PROJECT_ID  the Firebase project. Default: monthly-budget-393b6.

const MAX_PER_RUN = 20

function sendNewFeedback() {
  const props = PropertiesService.getScriptProperties()
  const project = props.getProperty('PROJECT_ID') || 'monthly-budget-393b6'
  const to = props.getProperty('RECIPIENT') || Session.getEffectiveUser().getEmail()
  const base = 'https://firestore.googleapis.com/v1/projects/' + project + '/databases/(default)/documents'
  const headers = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': project }

  // Only documents not yet emailed: a run with nothing new costs one Firestore read.
  const rows = call('post', base + ':runQuery', headers, {
    structuredQuery: {
      from: [{ collectionId: 'feedback' }],
      where: { fieldFilter: { field: { fieldPath: 'emailed' }, op: 'EQUAL', value: { booleanValue: false } } },
      limit: MAX_PER_RUN,
    },
  })
  rows.filter((r) => r.document).forEach((r) => {
    const doc = r.document
    const f = plain(doc.fields)
    const label = f.kind === 'bug' ? 'Problem' : 'Idea'
    const firstLine = String(f.message || '').split('\n')[0].slice(0, 60)
    const body = [
      f.message,
      '',
      '---',
      'Type: ' + label,
      'From: ' + (f.replyTo || 'did not share their email (user ' + f.uid + ')'),
      'Platform: ' + f.platform + ', build ' + f.build,
      'Sent: ' + f.createdAt,
    ].join('\n')
    const options = { name: 'Monthly Budget feedback' }
    if (f.replyTo) options.replyTo = f.replyTo
    MailApp.sendEmail(to, '[Budget ' + label + '] ' + firstLine, body, options)
    // Mark it so the next run skips it.
    call('patch', 'https://firestore.googleapis.com/v1/' + doc.name + '?updateMask.fieldPaths=emailed', headers, {
      fields: { emailed: { booleanValue: true } },
    })
  })
}

/** Run once by hand to start the hourly timer. */
function setUp() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t))
  ScriptApp.newTrigger('sendNewFeedback').timeBased().everyHours(1).create()
  sendNewFeedback()
}

function call(method, url, headers, payload) {
  const res = UrlFetchApp.fetch(url, { method: method, headers: headers, contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true })
  if (res.getResponseCode() >= 300) throw new Error('Firestore ' + res.getResponseCode() + ': ' + res.getContentText())
  return JSON.parse(res.getContentText() || 'null')
}

/** Firestore's typed values to plain ones. */
function plain(fields) {
  const out = {}
  Object.keys(fields || {}).forEach((k) => {
    const v = fields[k]
    out[k] = 'stringValue' in v ? v.stringValue : 'integerValue' in v ? Number(v.integerValue) : 'booleanValue' in v ? v.booleanValue : 'timestampValue' in v ? v.timestampValue : null
  })
  return out
}
