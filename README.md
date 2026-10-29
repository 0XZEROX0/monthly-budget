# Monthly Budget

A mobile-friendly web app for planning a monthly budget and tracking income and
expenses, modeled on the Google Sheets "Monthly budget" sheet. It installs as a
PWA from the browser and is built to be wrapped as an Android APK with Capacitor.

## What it does

- **Accounts**: Cash and Bank (liquidity) and Thndr (investment, with an interest
  rate and "Update value"). Expenses are paid from an account; transfers move money
  between accounts without counting as spending.
- **Debts**: lenders with limits; borrowing raises what you owe, repayments count as spending.
- **Summary**: left to spend, saved this month (liquidity change, with money moved into
  investments counted as saved), capital, budget vs actual per category, and charts.
- **Plan**: planned spending per category, with "copy from last month".
- **Import**: reads an .xlsx download of the "Monthly budget" Google Sheet (one tab per
  month) and reconciles every month's balances to the sheet's own totals.

## Sync

With Firebase configured, you sign in with Google and data is stored in
Firestore under `users/{uid}`, syncing live across devices and working offline.
Without Firebase config the app runs in local mode (this browser only).

1. Create a Firebase project, enable **Authentication > Google** and **Firestore**.
2. Put the web app config in `.env` (already set for monthly-budget-393b6; `.env.example` shows the keys).
3. Deploy `firestore.rules` (each user can only access their own data).

## Develop

```sh
npm install
npm run dev      # local dev server
npm run build    # production build in dist/
```

## Android app

The `android/` folder wraps the same web app with [Capacitor](https://capacitorjs.com). GitHub Actions (`.github/workflows/android.yml`) builds the APK on every push; on `main` it replaces the `android` release, so the latest APK is always at
https://github.com/0XZEROX0/monthly-budget/releases/latest/download/monthly-budget.apk

- **Bank SMS.** The app reads card and transfer messages from the bank senders picked in Settings › Bank SMS (`SmsReaderPlugin.java`), parses them in `src/data/smsParser.ts`, and lists them under Transactions › Pending until each is reviewed. `SmsReceiver.java` raises a notification when one arrives with the app closed. Check the parser with `npm run test:sms`.
- **Sign-in.** Google blocks its sign-in page inside app WebViews, so the app opens the website at `?app-signin` in the browser, which signs in and returns the Google ID token through `monthlybudget://signin`.
- **Signing.** Builds use the committed `android/app/shared-debug.keystore` so each APK installs over the last. To use a private key instead, add the repository secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` (the app must then be reinstalled once).

To build locally: `npm run build && npx cap sync android`, then open `android/` in Android Studio.
