package com.monthlybudget.app;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import org.json.JSONArray;
import org.json.JSONObject;

/** Feeds the scrolling lists of the Categories, Latest expenses and Accounts widgets. */
public class WidgetListService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Rows(getApplicationContext(), intent.getStringExtra("kind"));
    }

    private static final class Rows implements RemoteViewsFactory {
        private final Context ctx;
        private final String kind;
        private JSONArray list;

        Rows(Context ctx, String kind) {
            this.ctx = ctx;
            this.kind = kind == null ? "categories" : kind;
        }

        @Override public void onCreate() { load(); }
        @Override public void onDataSetChanged() { load(); }
        @Override public void onDestroy() {}

        private void load() {
            JSONObject data = BoardWidget.data(ctx);
            list = data == null ? null : data.optJSONArray(kind);
        }

        @Override public int getCount() { return list == null ? 0 : list.length(); }
        @Override public RemoteViews getViewAt(int i) { return WidgetViews.row(ctx, kind, list, i); }
        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int i) { return i; }
        @Override public boolean hasStableIds() { return false; }
    }
}
