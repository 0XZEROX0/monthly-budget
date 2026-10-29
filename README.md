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
