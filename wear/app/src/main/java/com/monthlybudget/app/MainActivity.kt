package com.monthlybudget.app

import android.content.Intent
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.result.contract.ActivityResultContracts
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.unit.Dp
import androidx.compose.foundation.layout.size
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.CompactChip
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.ListHeader
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import java.time.LocalDate
import java.util.UUID
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val ExpenseColor = Color(0xFFFF8A80)
private val IncomeColor = Color(0xFF81C995)

private sealed interface Screen {
    data object Home : Screen
    /** With a bill: its amount wasn't set, so it's typed here and then confirmed. */
    data class Amount(val kind: String, val bill: Bill? = null) : Screen
    data class Category(val kind: String, val amount: Double) : Screen
    /** A spoken entry or a bill payment, shown before it's saved. */
    data class Confirm(val entry: Entry, val title: String) : Screen
    data class Done(val sent: Boolean, val entry: Entry) : Screen
}

class MainActivity : ComponentActivity() {
    /** Set by the tile's + and − buttons: go straight to the amount. */
    private var start by mutableStateOf<String?>(null)

    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) {}

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        start = startOf(intent)
        // For the "update ready" notification.
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        UpdateWorker.schedule(this)
        setContent {
            MaterialTheme {
                App(start, onStarted = { start = null }, finish = ::finish)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        start = startOf(intent)
    }

    /** The tile's expense or income button. */
    private fun startOf(intent: Intent): String? = intent.getStringExtra("kind")
}

@Composable
private fun App(start: String?, onStarted: () -> Unit, finish: () -> Unit) {
    var screen by remember { mutableStateOf<Screen>(Screen.Home) }
    // Opened from the tile for one entry: close once it's saved.
    var quick by remember { mutableStateOf(false) }
    val context = LocalContext.current
    LaunchedEffect(start) {
        if (start != null) {
            quick = true
            screen = Screen.Amount(start)
            onStarted()
        }
    }
    val home: () -> Unit = {
        if (quick) finish() else { screen = Screen.Home }
    }
    val scope = rememberCoroutineScope()
    var saving by remember { mutableStateOf(false) }
    val save: (Entry) -> Unit = { entry ->
        if (!saving) {
            saving = true
            Store.remember(context, entry.kind, entry.category, entry.account)
            scope.launch {
                val sent = Budget.add(context, entry)
                saving = false
                screen = Screen.Done(sent, entry)
            }
        }
    }
    when (val s = screen) {
        Screen.Home -> HomeScreen(
            onAdd = { quick = false; screen = Screen.Amount(it) },
            onSave = save,
            onConfirm = { entry, title -> screen = Screen.Confirm(entry, title) },
            onPickCategory = { kind, amount -> screen = Screen.Category(kind, amount) },
            onPayBill = { bill ->
                val entry = billEntry(context, bill, bill.amount)
                screen = if (bill.amount > 0) Screen.Confirm(entry, "Pay ${bill.name}") else Screen.Amount("expense", bill)
            },
        )
        is Screen.Amount -> {
            BackHandler { home() }
            AmountScreen(s.kind, onNext = { amount ->
                screen = if (s.bill != null) Screen.Confirm(billEntry(context, s.bill, amount), "Pay ${s.bill.name}") else Screen.Category(s.kind, amount)
            })
        }
        is Screen.Category -> {
            BackHandler { screen = Screen.Amount(s.kind) }
            CategoryScreen(s.kind, s.amount, onSaved = { sent, entry -> screen = Screen.Done(sent, entry) })
        }
        is Screen.Confirm -> {
            BackHandler { home() }
            ConfirmScreen(
                s.title,
                s.entry,
                onSave = { save(s.entry) },
                onChange = if (s.entry.debt.isEmpty() && !s.entry.id.startsWith("bill-")) {
                    { screen = Screen.Category(s.entry.kind, s.entry.amount) }
                } else null,
            )
        }
        is Screen.Done -> {
            val warning = remember(s) { overBudget(context, s.entry) }
            val haptics = LocalHapticFeedback.current
            LaunchedEffect(s) {
                if (warning != null) haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                delay(if (warning != null) 3000 else 1200)
                home()
            }
            DoneScreen(s.sent, s.entry, warning)
        }
    }
}

/** The entry that pays a bill: a repayment of its debt, or an expense in its category. */
private fun billEntry(context: android.content.Context, bill: Bill, amount: Double): Entry {
    val settings = Store.settings(context)
    val today = LocalDate.now().toString()
    return Entry(
        id = "bill-${bill.id}-${today.take(7)}",
        kind = if (bill.debt.isNotEmpty()) "repay" else "expense",
        amount = amount,
        category = bill.category.ifEmpty { if (bill.debt.isNotEmpty()) "" else "Other" },
        account = bill.account.ifEmpty { settings.accounts.first() },
        date = today,
        debt = bill.debt,
    )
}

/** After saving an expense: its category, or the month, gone over budget. */
private fun overBudget(context: android.content.Context, e: Entry): String? {
    if (e.kind != "expense") return null
    val row = Store.detail(context)?.rows?.firstOrNull { it.category == e.category }
    if (row != null && row.planned > 0 && row.actual > row.planned) return "${e.category} is ${whole(row.actual - row.planned)} over budget"
    val g = Store.glance(context) ?: return null
    if (g.planned > 0 && g.left < 0) return "This month is ${whole(-g.left)} over budget"
    return null
}

@Composable
private fun HomeScreen(
    onAdd: (String) -> Unit,
    onSave: (Entry) -> Unit,
    onConfirm: (Entry, String) -> Unit,
    onPickCategory: (String, Double) -> Unit,
    onPayBill: (Bill) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var glance by remember { mutableStateOf(Store.glance(context)) }
    var detail by remember { mutableStateOf(Store.detail(context)) }
    var link by remember { mutableStateOf(Store.link(context)) }
    var status by remember { mutableStateOf<String?>(null) }
    var hidden by remember { mutableStateOf(Store.hidden(context)) }
    var update by remember { mutableStateOf<WatchRelease?>(null) }
    var updating by remember { mutableStateOf<String?>(null) }
    val waiting = remember(glance) { Store.queue(context).size }
    var favorites by remember { mutableStateOf(Store.favorites(context)) }
    val haptics = LocalHapticFeedback.current
    val pin: (Favorite) -> Unit = { f ->
        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        favorites = if (f in favorites) favorites - f else (listOf(f) + favorites).take(6)
        Store.saveFavorites(context, favorites)
        status = if (f in favorites) "Pinned to favorites" else "Removed from favorites"
    }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(Unit) {
        // Refresh every time the app comes back on screen.
        lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            status = if (glance == null) "Loading…" else null
            status = try {
                glance = Budget.refresh(context)
                detail = Store.detail(context)
                null
            } catch (e: SignedOutException) {
                "Sign in again in the phone app"
            } catch (e: Exception) {
                if (glance == null) "Can't reach your budget. Check the connection." else "Offline: showing saved figures"
            }
            link = Store.link(context)
            // The phone may have switched privacy mode while the app was closed.
            hidden = Store.hidden(context)
            Surfaces.update(context)
            update = runCatching { Updater.check(context) }.getOrNull()
        }
    }

    val listState = rememberScalingLazyListState()
    Scaffold(timeText = { TimeText() }, positionIndicator = { PositionIndicator(scalingLazyListState = listState) }) {
        val g = glance
        if (g != null && g.planned > 0) {
            CircularProgressIndicator(
                progress = g.fractionSpent,
                modifier = Modifier.fillMaxSize().padding(2.dp),
                startAngle = 300f,
                endAngle = 240f,
                indicatorColor = if (g.left < 0) ExpenseColor else MaterialTheme.colors.primary,
                strokeWidth = 4.dp,
            )
        }
        ScalingLazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
            if (link == null) {
                item {
                    Text(
                        "Open Monthly Budget on your phone, signed in, to link this watch.",
                        textAlign = TextAlign.Center,
                        style = MaterialTheme.typography.body2,
                    )
                }
                return@ScalingLazyColumn
            }
            val secret = { n: Double -> if (hidden) MASK else whole(n) }
            if (g != null) {
                item { Text(leftLabel(g), style = MaterialTheme.typography.caption2, color = MaterialTheme.colors.onSurfaceVariant) }
                item {
                    Text(
                        if (hidden) MASK else whole(abs(if (g.planned > 0) g.left else g.spent)),
                        style = MaterialTheme.typography.title1,
                        color = if (g.left < 0) ExpenseColor else MaterialTheme.colors.onSurface,
                        // Privacy mode, like the eye on the phone's Summary: tap the number to
                        // hide or show amounts here, on the tile and on the complication.
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .clickable {
                                hidden = !hidden
                                Store.setHidden(context, hidden)
                                Surfaces.update(context)
                            }
                            .padding(horizontal = 8.dp)
                            .semantics { contentDescription = if (hidden) "Show amounts" else "Hide amounts" },
                    )
                }
                item {
                    val pct = (g.fractionSpent * 100).toInt()
                    Text(
                        if (hidden) "$pct% spent" else "${whole(g.spent)} of ${whole(g.planned)} ${g.currency}",
                        style = MaterialTheme.typography.caption3,
                        color = MaterialTheme.colors.onSurfaceVariant,
                    )
                }
                // Daily allowance: what's left spread over the rest of the month, today included.
                // Over budget there's nothing left to spread, so it says so instead.
                if (g.planned > 0 && g.month == currentMonth()) {
                    val today = LocalDate.now()
                    val days = today.lengthOfMonth() - today.dayOfMonth + 1
                    val daysText = if (days == 1) "last day" else "$days days left"
                    item {
                        Text(
                            when {
                                g.left <= 0 -> "No daily allowance · $daysText"
                                hidden -> daysText
                                else -> "≈ ${whole(g.left / days)} a day · $daysText"
                            },
                            style = MaterialTheme.typography.caption3,
                            color = if (g.left <= 0) ExpenseColor else MaterialTheme.colors.primary,
                        )
                    }
                }
            }
            item {
                Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    AddButton("−", "Add expense", ExpenseColor) { onAdd("expense") }
                    AddButton("+", "Add income", IncomeColor) { onAdd("income") }
                }
            }
            if (waiting > 0) {
                item { Text("$waiting waiting to sync", style = MaterialTheme.typography.caption3, color = MaterialTheme.colors.onSurfaceVariant) }
            }
            status?.let { item { Text(it, style = MaterialTheme.typography.caption3, textAlign = TextAlign.Center, color = MaterialTheme.colors.onSurfaceVariant) } }
            update?.let { release ->
                item {
                    CompactChip(
                        onClick = {
                            if (updating != null) return@CompactChip
                            updating = "Downloading…"
                            scope.launch {
                                updating = try {
                                    Updater.install(context, release) { updating = "Downloading ${(it * 100).toInt()}%" }
                                    "Installing…"
                                } catch (e: Exception) {
                                    null.also { status = "Update failed. Try again on Wi-Fi." }
                                }
                            }
                        },
                        label = { Text(updating ?: "Update watch app") },
                        colors = ChipDefaults.primaryChipColors(),
                    )
                }
            }

            val d = detail
            if (d != null && d.due.isNotEmpty()) {
                item { ListHeader { Text("Due") } }
                items(d.due) { bill -> BillLine(bill, onClick = { onPayBill(bill) }) }
            }
            val shown = favorites.ifEmpty { d?.suggested.orEmpty() }
            if (shown.isNotEmpty()) {
                item { ListHeader { Text(if (favorites.isEmpty()) "Suggested" else "Favorites") } }
                items(shown) { f ->
                    FavoriteLine(
                        f,
                        onClick = { onSave(Entry(newId(), f.kind, f.amount, f.category, f.account, LocalDate.now().toString())) },
                        onLongClick = { pin(f) },
                    )
                }
            }
            if (d != null && d.balances.isNotEmpty()) {
                item { ListHeader { Text("Accounts") } }
                val liquid = d.balances.filter { it.type != "investment" }
                if (liquid.size > 1) item { Line("Cash + bank", secret(liquid.sumOf { it.amount }), null, MaterialTheme.colors.onSurface) }
                items(d.balances) { b -> BalanceLine(b, secret(b.amount)) }
            }
            if (d != null && d.goals.isNotEmpty()) {
                item { ListHeader { Text("Goals") } }
                items(d.goals) { goal -> GoalLine(goal, hidden) }
            }
            if (d != null && g != null) {
                item { ListHeader { Text("This month") } }
                item { Line("Income", secret(d.income), if (d.incomePlanned > 0) "of ${secret(d.incomePlanned)}" else null, IncomeColor) }
                item { Line("Spent", secret(g.spent), if (g.planned > 0) "of ${secret(g.planned)}" else null, ExpenseColor) }
                // Category budgets stay visible in privacy mode, as on the phone.
                items(d.rows.take(6)) { row -> CategoryLine(row) }
                if (d.recent.isNotEmpty()) item { ListHeader { Text("Recent") } }
                // Hold an entry to pin it to favorites.
                items(d.recent.take(10)) { t ->
                    TxnLine(t, onLongClick = if (t.kind == "expense" || t.kind == "income") {
                        { pin(Favorite(t.kind, t.amount, t.category, t.account)) }
                    } else null)
                }
            }
        }
    }
}

@Composable
private fun AddButton(label: String, description: String, color: Color, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier.size(ButtonDefaults.SmallButtonSize).semantics { contentDescription = description },
        colors = ButtonDefaults.buttonColors(backgroundColor = color, contentColor = Color.Black),
    ) {
        Text(label, fontSize = 22.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun Line(label: String, value: String, of: String?, color: Color) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp), verticalAlignment = Alignment.Bottom) {
        Text(label, style = MaterialTheme.typography.caption1, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.caption1, color = color)
        of?.let { Text(" $it", style = MaterialTheme.typography.caption3, color = MaterialTheme.colors.onSurfaceVariant) }
    }
}

@Composable
private fun CategoryLine(row: CategoryRow) {
    val over = row.planned > 0 && row.actual > row.planned
    Column(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 2.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(categoryIcon(row.category) + " ", fontSize = 12.sp)
            Text(row.category, style = MaterialTheme.typography.caption2, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Text(
                if (row.planned > 0) "${compact(row.actual)} / ${compact(row.planned)}" else compact(row.actual),
                style = MaterialTheme.typography.caption3,
                color = if (over) ExpenseColor else MaterialTheme.colors.onSurfaceVariant,
            )
        }
        if (row.planned > 0) {
            Box(Modifier.padding(top = 2.dp).fillMaxWidth().height(3.dp).clip(RoundedCornerShape(2.dp)).background(MaterialTheme.colors.surface)) {
                Box(
                    Modifier
                        .fillMaxWidth((row.actual / row.planned).toFloat().coerceIn(0f, 1f))
                        .height(3.dp)
                        .background(if (over) ExpenseColor else MaterialTheme.colors.primary),
                )
            }
        }
    }
}

private val dayFormat = DateTimeFormatter.ofPattern("MMM d", Locale.US)

@Composable
private fun TxnLine(t: Txn, onLongClick: (() -> Unit)? = null) {
    val color = when (t.sign) {
        "+" -> IncomeColor
        "−" -> ExpenseColor
        else -> MaterialTheme.colors.onSurface
    }
    val day = runCatching { LocalDate.parse(t.date).format(dayFormat) }.getOrDefault(t.date)
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colors.surface.copy(alpha = 0.5f))
            .combinedClickable(enabled = onLongClick != null, onClick = {}, onLongClick = onLongClick)
            .padding(horizontal = 8.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        IconBadge(t.icon, color)
        Column(Modifier.weight(1f)) {
            Text(t.title, style = MaterialTheme.typography.caption1, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOf(day, t.sub).filter { it.isNotEmpty() }.joinToString(" · "),
                style = MaterialTheme.typography.caption3,
                color = MaterialTheme.colors.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(t.sign + whole(t.amount), style = MaterialTheme.typography.caption1, color = color)
    }
}

@Composable
private fun BalanceLine(b: Balance, amount: String) {
    val tint = if (b.type == "investment") MaterialTheme.colors.secondary else MaterialTheme.colors.primary
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colors.surface.copy(alpha = 0.5f))
            .padding(horizontal = 8.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        IconBadge(categoryIcon(b.name), tint)
        Text(b.name, style = MaterialTheme.typography.caption1, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        Text(amount, style = MaterialTheme.typography.caption1, color = if (b.amount < 0) ExpenseColor else MaterialTheme.colors.onSurface)
    }
}

@Composable
private fun BillLine(bill: Bill, onClick: () -> Unit) {
    val by = runCatching { LocalDate.parse(bill.dueBy).format(dayFormat) }.getOrDefault(bill.dueBy)
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(ExpenseColor.copy(alpha = 0.18f))
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        IconBadge(if (bill.type == "instalment") "📆" else "💳", ExpenseColor)
        Column(Modifier.weight(1f)) {
            Text(bill.name, style = MaterialTheme.typography.caption1, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("by $by · tap to pay", style = MaterialTheme.typography.caption3, color = MaterialTheme.colors.onSurfaceVariant)
        }
        if (bill.amount > 0) Text(whole(bill.amount), style = MaterialTheme.typography.caption1, color = ExpenseColor)
    }
}

/** Tap to save it again; hold to pin or unpin. */
@Composable
private fun FavoriteLine(f: Favorite, onClick: () -> Unit, onLongClick: () -> Unit) {
    val color = if (f.kind == "income") IncomeColor else ExpenseColor
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colors.surface)
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .padding(horizontal = 8.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        IconBadge(categoryIcon(f.category), color)
        Column(Modifier.weight(1f)) {
            Text(f.category, style = MaterialTheme.typography.caption1, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (f.account.isNotEmpty()) Text(f.account, style = MaterialTheme.typography.caption3, color = MaterialTheme.colors.onSurfaceVariant)
        }
        Text((if (f.kind == "income") "+" else "−") + whole(f.amount), style = MaterialTheme.typography.caption1, color = color)
    }
}

private val monthFormat = DateTimeFormatter.ofPattern("MMM yyyy", Locale.US)

@Composable
private fun GoalLine(goal: Goal, hidden: Boolean) {
    val fraction = if (goal.target > 0) (goal.saved / goal.target).toFloat().coerceIn(0f, 1f) else 0f
    val pct = (fraction * 100).toInt()
    Column(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 3.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("🎯 ", fontSize = 12.sp)
            Text(goal.name, style = MaterialTheme.typography.caption1, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Text(if (hidden) "$pct%" else "${compact(goal.saved)} / ${compact(goal.target)}", style = MaterialTheme.typography.caption3, color = MaterialTheme.colors.onSurfaceVariant)
        }
        Box(Modifier.padding(top = 2.dp).fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(MaterialTheme.colors.surface)) {
            Box(Modifier.fillMaxWidth(fraction).height(4.dp).background(IncomeColor))
        }
        val by = goal.deadline?.let { runCatching { LocalDate.parse(it).format(monthFormat) }.getOrDefault(it) }
        val note = when {
            fraction >= 1f -> "Reached 🎉"
            by != null && goal.perMonth != null && !hidden -> "${whole(goal.perMonth)} a month until $by"
            by != null -> "by $by"
            else -> null
        }
        note?.let { Text(it, style = MaterialTheme.typography.caption3, color = MaterialTheme.colors.primary) }
    }
}

@Composable
private fun ConfirmScreen(title: String, entry: Entry, onSave: () -> Unit, onChange: (() -> Unit)?) {
    val color = if (entry.kind == "income") IncomeColor else ExpenseColor
    val label = entry.category.ifEmpty { entry.debt }
    Column(
        Modifier.fillMaxSize().padding(horizontal = 22.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
    ) {
        Text(title, style = MaterialTheme.typography.caption3, color = MaterialTheme.colors.onSurfaceVariant, maxLines = 2, textAlign = TextAlign.Center)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            IconBadge(categoryIcon(label.ifEmpty { "debt" }), color, 32.dp)
            Text((if (entry.kind == "income") "+" else "−") + whole(entry.amount), style = MaterialTheme.typography.title2, color = color)
        }
        Text("$label · ${entry.account}", style = MaterialTheme.typography.caption2, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
            onChange?.let { CompactChip(onClick = it, label = { Text("Change") }, colors = ChipDefaults.secondaryChipColors()) }
            CompactChip(onClick = onSave, label = { Text("Save") }, colors = ChipDefaults.primaryChipColors(backgroundColor = color, contentColor = Color.Black))
        }
    }
}

/** A category's emoji on a soft tinted circle, like the phone app's category icons. */
@Composable
private fun IconBadge(icon: String, tint: Color, size: Dp = 26.dp) {
    Box(
        Modifier.size(size).clip(CircleShape).background(tint.copy(alpha = 0.22f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(icon, fontSize = (size.value * 0.52f).sp, color = MaterialTheme.colors.onSurface)
    }
}

/**
 * A keypad sized to the screen and kept inside the circle: the bottom row, with ⌫ and ✓,
 * is narrower so its keys don't fall off the round edge. Whole amounts, as the sheet uses.
 */
@Composable
private fun AmountScreen(kind: String, onNext: (Double) -> Unit) {
    var digits by remember { mutableStateOf("") }
    val haptics = LocalHapticFeedback.current
    val color = if (kind == "income") IncomeColor else ExpenseColor
    val amount = digits.toDoubleOrNull() ?: 0.0
    val screen = LocalConfiguration.current.screenHeightDp.dp
    val keyHeight = screen * 0.13f
    Column(
        Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp, Alignment.CenterVertically),
    ) {
        Text(if (kind == "income") "Income" else "Expense", style = MaterialTheme.typography.caption3, color = color)
        Text(if (digits.isEmpty()) "0" else whole(amount), style = MaterialTheme.typography.title2, color = MaterialTheme.colors.onSurface)
        val rows = listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"), listOf("⌫", "0", "✓"))
        for ((i, keys) in rows.withIndex()) {
            val width = screen * (if (i == rows.lastIndex) 0.54f else 0.62f)
            Row(Modifier.width(width), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                for (key in keys) {
                    val enabled = key != "✓" || amount > 0
                    val background = when {
                        key == "✓" && enabled -> color
                        key == "✓" || key == "⌫" -> MaterialTheme.colors.surface.copy(alpha = 0.6f)
                        else -> MaterialTheme.colors.surface
                    }
                    Box(
                        Modifier
                            .weight(1f)
                            .height(keyHeight)
                            .clip(RoundedCornerShape(keyHeight / 2))
                            .background(background)
                            .combinedClickable(
                                enabled = enabled,
                                // Hold ⌫ to clear.
                                onLongClick = { if (key == "⌫") digits = "" },
                                onClick = {
                                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    when (key) {
                                        "⌫" -> digits = digits.dropLast(1)
                                        "✓" -> onNext(amount)
                                        else -> if (digits.length < 9 && !(digits.isEmpty() && key == "0")) digits += key
                                    }
                                },
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(key, fontSize = 15.sp, color = if (key == "✓" && enabled) Color.Black else MaterialTheme.colors.onSurface)
                    }
                }
            }
        }
    }
}

/** Tap a category to save. The account chip switches between Cash, Bank and so on. */
@Composable
private fun CategoryScreen(kind: String, amount: Double, onSaved: (Boolean, Entry) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val settings = remember { Store.settings(context) }
    val categories = remember {
        val all = settings.categories(kind)
        val recent = Store.recentCategories(context, kind).filter { it in all }
        recent + all.filter { it !in recent }
    }
    var account by remember {
        mutableStateOf(Store.lastAccount(context, kind)?.takeIf { it in settings.accounts } ?: settings.accounts.first())
    }
    var saving by remember { mutableStateOf(false) }
    val listState = rememberScalingLazyListState()
    val color = if (kind == "income") IncomeColor else ExpenseColor

    Scaffold(positionIndicator = { PositionIndicator(scalingLazyListState = listState) }) {
        ScalingLazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
            item { Text("${whole(amount)} ${settings.currency}", style = MaterialTheme.typography.title3, color = color) }
            item {
                CompactChip(
                    onClick = {
                        val i = settings.accounts.indexOf(account)
                        account = settings.accounts[(i + 1) % settings.accounts.size]
                    },
                    label = { Text(categoryIcon(account) + (if (kind == "income") " Into " else " From ") + account + if (settings.accounts.size > 1) "  ⇄" else "") },
                    colors = ChipDefaults.secondaryChipColors(),
                )
            }
            items(categories) { category ->
                Chip(
                    onClick = {
                        if (saving) return@Chip
                        saving = true
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        Store.remember(context, kind, category, account)
                        val entry = Entry(newId(), kind, amount, category, account, LocalDate.now().toString())
                        scope.launch { onSaved(Budget.add(context, entry), entry) }
                    },
                    label = { Text(category, style = MaterialTheme.typography.caption1, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    icon = { IconBadge(categoryIcon(category), color) },
                    colors = ChipDefaults.primaryChipColors(backgroundColor = MaterialTheme.colors.surface, contentColor = MaterialTheme.colors.onSurface),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                    modifier = Modifier.fillMaxWidth().height(42.dp),
                )
            }
        }
    }
}


@Composable
private fun DoneScreen(sent: Boolean, entry: Entry, warning: String?) {
    val color = if (entry.kind == "income") IncomeColor else ExpenseColor
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
    ) {
        IconBadge(categoryIcon(entry.category.ifEmpty { entry.debt.ifEmpty { "debt" } }), color, 52.dp)
        Text((if (entry.kind == "income") "+" else "−") + whole(entry.amount), style = MaterialTheme.typography.title2, color = color)
        Text("${entry.category.ifEmpty { entry.debt }} · ${entry.account}", style = MaterialTheme.typography.caption2, color = MaterialTheme.colors.onSurfaceVariant)
        Text(if (sent) "✓ Saved" else "✓ Saved · syncs when online", style = MaterialTheme.typography.caption2, textAlign = TextAlign.Center)
        warning?.let { Text("⚠ $it", style = MaterialTheme.typography.caption2, color = ExpenseColor, textAlign = TextAlign.Center) }
    }
}

/** A 20-character id like Firestore's own. */
private fun newId(): String = UUID.randomUUID().toString().replace("-", "").take(20)
