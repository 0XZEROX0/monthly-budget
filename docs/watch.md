# Galaxy Watch app

A Wear OS companion for the budget, made for the Galaxy Watch 8 (it runs on any Wear OS 3+ watch).

- **Quick add**: tap **Add expense** or **Add income**, type the amount, tap a category. The chip at the top picks the account (Cash, Bank…). Your last category comes first.
- **Glance**: left to spend this month with a ring for how much of the plan is used, the same figure as the phone's Summary.
- **This month**: scroll down for income, spent, the categories you've spent most in (against their budgets) and your latest entries.
- **Voice**: tap 🎤 and say something like "50 food cash" or "got 5000 salary into bank"; check it and tap Save (or Change).
- **Favorites**: hold a recent entry to pin it; tap a favorite to save it again. Until you pin some, entries you repeated this month are suggested.
- **Due**: bills from the phone's Bills in their reminder days (instalments on days 1–5, cards on their day) until paid; tap one to pay it.
- **Goals**: savings goals with progress and how much a month is still needed by the deadline.
- **Daily allowance**: "≈ X a day" for the rest of the month, and a warning after saving when a category or the month goes over budget.
- **Update notification**: the watch checks every few hours and notifies you when a new watch build is out.
- **Tile**: left to spend plus **−** and **+** buttons that go straight to the keypad.
- **Complication**: "left to spend" for your watch face (short text or a ring).
- **Accounts**: Cash, Bank, Thndr and the Cash + bank total, worked out like the phone's balances.
- **Privacy mode**: tap the big number in the app or on the tile to hide amounts on the watch, tile and complication (they show •••• or percentages). Turning the eye on or off in the phone app switches the watch too.

## How it syncs

The phone app hands its sign-in to the watch over the Wear OS Data Layer (Bluetooth between the paired devices). That only reaches an app with the same package name and signing key, which is why both APKs are signed with the same key. From then on the watch talks to Firestore directly, as you, so:

- entries from the watch land straight in the budget, even when the phone app is closed;
- it works whenever the watch is online (through the phone's Bluetooth, Wi-Fi or LTE);
- with no connection, entries wait on the watch and send automatically when it's back online.

Signing out on the phone signs the watch out too.

## Install

The watch app isn't on the Play Store, so you install it with `adb` once (and again for updates).

1. **Update the phone app first** (Settings › Update in the app, or the latest APK). The watch needs this version to link. Open it once while signed in.
2. **Download the watch APK**: https://github.com/0XZEROX0/monthly-budget/releases/download/wear/monthly-budget-watch.apk
3. **Turn on developer options on the watch**: Settings › About watch › Software information › tap **Software version** 7 times.
4. Settings › Developer options: turn on **ADB debugging** and **Wireless debugging**. Put the watch and the computer (or phone) on the same Wi-Fi.
5. In **Wireless debugging**, tap **Pair new device**. It shows an IP, a port and a code.

### From a computer (Windows, Mac or Linux)

Install [Android platform tools](https://developer.android.com/tools/releases/platform-tools), then:

```sh
adb pair 192.168.1.23:41235        # the pairing IP:port, then type the code
adb connect 192.168.1.23:39813     # the IP:port shown on the Wireless debugging screen (not the pairing one)
adb install -r monthly-budget-watch.apk
```

### From the phone only

Install **Bugjaeger** or **Wear Installer 2** from the Play Store, pair with the watch using the code from step 5, and install the APK you downloaded.

## After installing

- Open **Budget** on the watch. If it says to open the phone app, open Monthly Budget on the phone once.
- **Tile**: swipe left from the watch face to the end of your tiles, tap **+ Add**, pick **Budget**.
- **Complication**: long-press the watch face › **Customize** › tap a slot › **Budget › Left to spend**.
- You can turn **Wireless debugging** off again afterwards.

## Updates

You only need adb once. When a newer watch build is out, the watch app shows **Update watch app**; tap it and confirm on the watch. It downloads the APK from the `wear` release (about 2 MB) and Android's installer updates it in place, keeping your data.

If tapping it does nothing or Android says the app isn't allowed to install apps, allow it once from the computer while adb is connected:

```sh
adb shell appops set com.monthlybudget.app REQUEST_INSTALL_PACKAGES allow
```

## Building

`.github/workflows/wear.yml` builds `wear/` on every push that touches it, and on `main` replaces the `wear` release. To build locally: `cd wear && ./gradlew assembleRelease` (needs the Android SDK).
