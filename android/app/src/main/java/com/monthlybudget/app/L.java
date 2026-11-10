package com.monthlybudget.app;

import android.content.Context;

/**
 * The app's language for text drawn on the Android side (widgets, notifications). The app
 * picks English or Arabic in Settings and passes it along with the widget numbers
 * (WidgetPlugin.update); this side only chooses between the two wordings.
 */
final class L {
    private L() {}

    static boolean ar(Context ctx) {
        return "ar".equals(WidgetPlugin.prefs(ctx).getString("lang", "en"));
    }

    /** The English or the Arabic wording, whichever the app is set to. */
    static String t(Context ctx, String en, String ar) {
        return ar(ctx) ? ar : en;
    }
}
