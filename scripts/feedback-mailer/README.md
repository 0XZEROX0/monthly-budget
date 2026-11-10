# Feedback mailer

The app's Settings › Feedback saves each message to the Firestore `feedback` collection.
Users can only add to it (see `firestore.rules`); they can't read anything back. This
Google Apps Script checks that collection every hour and emails each new message to you,
then marks it `emailed`. Your address is only in your own Google account, never in the
app or this repo. It's free: an hour with nothing new costs one Firestore read, and Apps
Script can send 100 emails a day.

You can also read every message any time in the Firebase console › Firestore › `feedback`.

## Setup (once, about 5 minutes)

1. Publish the new rules: Firebase console › Firestore Database › Rules, paste the whole
   `firestore.rules` from this repo, and press **Publish**. Until then, sending feedback
   fails with "Missing or insufficient permissions".
2. Sign in to Google with the account that **owns the Firebase project**, open
   <https://script.google.com>, and press **New project**. Name it "Budget feedback".
3. Project Settings (gear) › tick **Show "appsscript.json" manifest file in editor**.
4. Editor: replace `Code.gs` with this folder's `Code.gs`, and `appsscript.json` with this
   folder's `appsscript.json`. Save.
5. If you want the emails at a different address than this Google account: Project
   Settings › Script properties › add `RECIPIENT` with that address.
6. In the editor, pick the `setUp` function and press **Run**. Allow the permissions it
   asks for (Google shows "unverified app" because it's your own script: Advanced › Go to
   Budget feedback). That starts the hourly timer and sends anything already waiting.

To test: send feedback from the app, then run `sendNewFeedback` by hand. Pressing
**Reply** on the email answers the user if they chose to share their address.
