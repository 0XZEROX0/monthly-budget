# Monthly Budget

A mobile-friendly web app for planning a monthly budget and tracking income and
expenses, modeled on the Google Sheets "Monthly budget" sheet. It installs as a
PWA from the browser and is built to be wrapped as an Android APK with Capacitor.

## What it does

- **Summary**: starting balance, ending balance (starting + income − expenses),
  amount saved, and planned vs actual per category for expenses and income.
- **Transactions**: add, edit and delete expenses and income per month.
- **Plan**: starting balance and planned amount per category, with "copy from last month".
- **Settings**: currency, and your own expense and income categories.

## Sync

With Firebase configured, you sign in with Google and data is stored in
Firestore under `users/{uid}`, syncing live across devices and working offline.
Without Firebase config the app runs in local mode (this browser only).

1. Create a Firebase project, enable **Authentication > Google** and **Firestore**.
2. Copy `.env.example` to `.env.local` and fill in the web app config.
3. Deploy `firestore.rules` (each user can only access their own data).

## Develop

```sh
npm install
npm run dev      # local dev server
npm run build    # production build in dist/
```
