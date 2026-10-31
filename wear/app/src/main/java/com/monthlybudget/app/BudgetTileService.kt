package com.monthlybudget.app

import android.content.Context
import androidx.concurrent.futures.SuspendToFutureAdapter
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DeviceParametersBuilders.DeviceParameters
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.protolayout.material.Button
import androidx.wear.protolayout.material.ButtonColors
import androidx.wear.protolayout.material.CircularProgressIndicator
import androidx.wear.protolayout.material.Colors
import androidx.wear.protolayout.material.CompactChip
import androidx.wear.protolayout.material.ProgressIndicatorColors
import androidx.wear.protolayout.material.Text
import androidx.wear.protolayout.material.Typography
import androidx.wear.protolayout.material.layouts.EdgeContentLayout
import androidx.wear.protolayout.material.layouts.PrimaryLayout
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.Dispatchers

private const val RESOURCES = "1"
private const val PRIVACY = "privacy"
private const val EXPENSE = 0xFFFF8A80.toInt()
private const val INCOME = 0xFF81C995.toInt()
private const val TRANSFER = 0xFF8AB4F8.toInt()
private const val DEBT = 0xFFFDD663.toInt()

/** Left to spend with a ring for the month, and buttons to add an expense, income, transfer or debt entry. */
class BudgetTileService : TileService() {
    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> =
        SuspendToFutureAdapter.launchFuture(Dispatchers.IO) {
            val context = this@BudgetTileService
            // Tapping the number on the tile switches privacy mode.
            val toggled = requestParams.currentState.lastClickableId == PRIVACY
            if (toggled) {
                Store.setHidden(context, !Store.hidden(context))
                Surfaces.updateComplication(context)
            }
            // A tap should redraw at once, so it uses the saved figures.
            val glance = (if (toggled) Store.glance(context) else null) ?: Budget.glanceForSurface(context)
            val hidden = Store.hidden(context)
            val device = requestParams.deviceConfiguration
            val layout = if (glance == null) unlinked(context, device) else budget(context, device, glance, hidden)
            TileBuilders.Tile.Builder()
                .setResourcesVersion(RESOURCES)
                .setFreshnessIntervalMillis(30 * 60_000L)
                .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(layout))
                .build()
        }

    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> =
        Futures.immediateFuture(ResourceBuilders.Resources.Builder().setVersion(RESOURCES).build())
}

private fun open(context: Context, id: String, kind: String?): ModifiersBuilders.Clickable {
    val activity = ActionBuilders.AndroidActivity.Builder()
        .setPackageName(context.packageName)
        .setClassName(MainActivity::class.java.name)
    if (kind != null) activity.addKeyToExtraMapping("kind", ActionBuilders.AndroidStringExtra.Builder().setValue(kind).build())
    return ModifiersBuilders.Clickable.Builder()
        .setId(id)
        .setOnClick(ActionBuilders.LaunchAction.Builder().setAndroidActivity(activity.build()).build())
        .build()
}

private fun text(context: Context, s: String, typography: Int, color: Int) =
    Text.Builder(context, s).setTypography(typography).setColor(argb(color)).setMaxLines(2).build()

private fun budget(context: Context, device: DeviceParameters, g: Glance, hidden: Boolean): LayoutElementBuilders.LayoutElement {
    val colors = Colors.DEFAULT
    val over = g.planned > 0 && g.left < 0
    val amount = when {
        hidden -> MASK
        g.planned > 0 -> whole(kotlin.math.abs(g.left))
        else -> whole(g.spent)
    }
    val detail = when {
        g.planned <= 0 -> "spent this month"
        hidden -> "${(g.fractionSpent * 100).toInt()}% spent"
        else -> "${compact(g.spent)} of ${compact(g.planned)} ${g.currency}"
    }
    // Four in a row, sized to fit inside the ring.
    val size = minOf(40f, (device.screenWidthDp * 0.74f - 12f) / 4f)
    fun button(label: String, kind: String, description: String, color: Int) =
        Button.Builder(context, open(context, kind, kind))
            .setTextContent(label)
            .setSize(dp(size))
            .setContentDescription(description)
            .setButtonColors(ButtonColors(color, 0xFF000000.toInt()))
            .build()
    fun gap() = LayoutElementBuilders.Spacer.Builder().setWidth(dp(4f)).build()
    val content = LayoutElementBuilders.Column.Builder()
        .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
        .addContent(
            LayoutElementBuilders.Box.Builder()
                .setModifiers(
                    ModifiersBuilders.Modifiers.Builder()
                        .setClickable(
                            ModifiersBuilders.Clickable.Builder()
                                .setId(PRIVACY)
                                .setOnClick(ActionBuilders.LoadAction.Builder().build())
                                .build(),
                        )
                        .build(),
                )
                .addContent(text(context, amount, Typography.TYPOGRAPHY_TITLE1, if (over) EXPENSE else colors.onSurface))
                .build(),
        )
        .addContent(LayoutElementBuilders.Spacer.Builder().setHeight(dp(6f)).build())
        .addContent(
            LayoutElementBuilders.Row.Builder()
                .addContent(button("−", "expense", "Add expense", EXPENSE))
                .addContent(gap())
                .addContent(button("+", "income", "Add income", INCOME))
                .addContent(gap())
                .addContent(button("⇄", "transfer", "Add transfer", TRANSFER))
                .addContent(gap())
                .addContent(button("💳", "debt", "Add debt payment or borrowing", DEBT))
                .build(),
        )
        .build()
    return EdgeContentLayout.Builder(device)
        .setEdgeContent(
            CircularProgressIndicator.Builder()
                .setProgress(if (g.planned > 0) g.fractionSpent else 0f)
                .setCircularProgressIndicatorColors(ProgressIndicatorColors(if (over) EXPENSE else colors.primary, 0xFF303030.toInt()))
                .build(),
        )
        .setPrimaryLabelTextContent(text(context, leftLabel(g), Typography.TYPOGRAPHY_CAPTION1, colors.onSurface))
        .setContent(content)
        .setSecondaryLabelTextContent(text(context, detail, Typography.TYPOGRAPHY_CAPTION2, colors.onSurface))
        .build()
}

private fun unlinked(context: Context, device: DeviceParameters): LayoutElementBuilders.LayoutElement =
    PrimaryLayout.Builder(device)
        .setContent(text(context, "Open Monthly Budget on your phone to link this watch", Typography.TYPOGRAPHY_BODY2, Colors.DEFAULT.onSurface))
        .setPrimaryChipContent(CompactChip.Builder(context, "Open", open(context, "open", null), device).build())
        .build()
