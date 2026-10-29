package com.monthlybudget.app

import android.content.Context
import android.net.Uri
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMap
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.tasks.await

/** Where the phone app (android/.../WearPlugin.java) puts the sign-in. */
const val LINK_PATH = "/budget/link"

/** The phone app's Firebase sign-in, and whether the phone is in privacy mode. */
data class Link(
    val refreshToken: String,
    val uid: String,
    val apiKey: String,
    val projectId: String,
    val hidden: Boolean,
)

private fun linkFrom(map: DataMap): Link? {
    val token = map.getString("refreshToken") ?: return null
    val uid = map.getString("uid") ?: return null
    return Link(token, uid, map.getString("apiKey") ?: "", map.getString("projectId") ?: "", map.getBoolean("hidden", false))
}

/** Reads the link straight from the Data Layer, for when the listener hasn't run yet. */
suspend fun pullLink(context: Context): Link? {
    val uri = Uri.Builder().scheme("wear").path(LINK_PATH).build()
    val items = Wearable.getDataClient(context).getDataItems(uri).await()
    try {
        return items.firstNotNullOfOrNull { linkFrom(DataMapItem.fromDataItem(it).dataMap) }
    } finally {
        items.release()
    }
}

/** Hears the phone app sign in, sign out, or switch privacy mode. */
class LinkListenerService : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) {
        for (event in events) {
            if (event.dataItem.uri.path != LINK_PATH) continue
            val link = if (event.type == DataEvent.TYPE_DELETED) null else linkFrom(DataMapItem.fromDataItem(event.dataItem).dataMap)
            Store.saveLink(this, link)
        }
        Surfaces.update(this)
    }
}
