package com.monthlybudget.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.PaddingValues
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
    data class Amount(val kind: String) : Screen
    data class Category(val kind: String, val amount: Double) : Screen
    data class Done(val sent: Boolean) : Screen
}

class MainActivity : ComponentActivity() {
    /** Set by the tile's + and − buttons: go straight to the amount. */
    private var start by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        start = intent.getStringExtra("kind")
        setContent {
            MaterialTheme {
                App(start, onStarted = { start = null }, finish = ::finish)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        start = intent.getStringExtra("kind")
    }
}

@Composable
private fun App(start: String?, onStarted: () -> Unit, finish: () -> Unit) {
    var screen by remember { mutableStateOf<Screen>(Screen.Home) }
    // Opened from the tile for one entry: close once it's saved.
    var quick by remember { mutableStateOf(false) }
    LaunchedEffect(start) {
        if (start != null) {
            screen = Screen.Amount(start)
            quick = true
            onStarted()
        }
    }
    val home: () -> Unit = {
        if (quick) finish() else { screen = Screen.Home }
    }
    when (val s = screen) {
        Screen.Home -> HomeScreen(onAdd = { quick = false; screen = Screen.Amount(it) })
        is Screen.Amount -> {
            BackHandler { home() }
            AmountScreen(s.kind, onNext = { screen = Screen.Category(s.kind, it) })
        }
        is Screen.Category -> {
            BackHandler { screen = Screen.Amount(s.kind) }
            CategoryScreen(s.kind, s.amount, onSaved = { screen = Screen.Done(it) })
        }
        is Screen.Done -> {
            LaunchedEffect(s) {
                delay(1200)
                home()
            }
            DoneScreen(s.sent)
        }
    }
}

@Composable
private fun HomeScreen(onAdd: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var glance by remember { mutableStateOf(Store.glance(context)) }
    var detail by remember { mutableStateOf(Store.detail(context)) }
    var link by remember { mutableStateOf(Store.link(context)) }
    var status by remember { mutableStateOf<String?>(null) }
    var revealed by remember { mutableStateOf(false) }
    var update by remember { mutableStateOf<WatchRelease?>(null) }
    var updating by remember { mutableStateOf<String?>(null) }
    val waiting = remember(glance) { Store.queue(context).size }
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
            val hidden = link?.hidden == true && !revealed
            val secret = { n: Double -> if (hidden) MASK else whole(n) }
            if (g != null) {
                item { Text(leftLabel(g), style = MaterialTheme.typography.caption2, color = MaterialTheme.colors.onSurfaceVariant) }
                item {
                    Text(
                        if (hidden) MASK else whole(abs(if (g.planned > 0) g.left else g.spent)),
                        style = MaterialTheme.typography.title1,
                        color = if (g.left < 0) ExpenseColor else MaterialTheme.colors.onSurface,
                        // Privacy mode: tap to show the amounts here, until the app closes.
                        modifier = Modifier.clickable(enabled = link?.hidden == true) { revealed = !revealed },
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
            if (d != null && g != null) {
                item { ListHeader { Text("This month") } }
                item { Line("Income", secret(d.income), if (d.incomePlanned > 0) "of ${secret(d.incomePlanned)}" else null, IncomeColor) }
                item { Line("Spent", secret(g.spent), if (g.planned > 0) "of ${secret(g.planned)}" else null, ExpenseColor) }
                // Category budgets stay visible in privacy mode, as on the phone.
                items(d.rows.take(6)) { row -> CategoryLine(row) }
                if (d.recent.isNotEmpty()) item { ListHeader { Text("Recent") } }
                items(d.recent.take(10)) { t -> TxnLine(t) }
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
        Row(Modifier.fillMaxWidth()) {
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
private fun TxnLine(t: Txn) {
    val (sign, color) = when (t.kind) {
        "income", "borrow" -> "+" to IncomeColor
        "expense", "repay" -> "−" to ExpenseColor
        else -> "" to MaterialTheme.colors.onSurface
    }
    val day = runCatching { LocalDate.parse(t.date).format(dayFormat) }.getOrDefault(t.date)
    Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(t.label, style = MaterialTheme.typography.caption1, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(listOf(day, t.account).filter { it.isNotEmpty() }.joinToString(" · "), style = MaterialTheme.typography.caption3, color = MaterialTheme.colors.onSurfaceVariant)
        }
        Text(sign + whole(t.amount), style = MaterialTheme.typography.caption1, color = color)
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
private fun CategoryScreen(kind: String, amount: Double, onSaved: (Boolean) -> Unit) {
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
                    label = { Text((if (kind == "income") "Into " else "From ") + account + if (settings.accounts.size > 1) "  ⇄" else "") },
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
                        scope.launch { onSaved(Budget.add(context, entry)) }
                    },
                    label = { Text(category, style = MaterialTheme.typography.caption1, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    colors = ChipDefaults.primaryChipColors(backgroundColor = MaterialTheme.colors.surface, contentColor = MaterialTheme.colors.onSurface),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 4.dp),
                    modifier = Modifier.fillMaxWidth().height(40.dp),
                )
            }
        }
    }
}


@Composable
private fun DoneScreen(sent: Boolean) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("✓", fontSize = 40.sp, color = IncomeColor)
        Text("Saved", style = MaterialTheme.typography.title3)
        if (!sent) Text("Syncs when you're back online", style = MaterialTheme.typography.caption2, textAlign = TextAlign.Center)
    }
}

/** A 20-character id like Firestore's own. */
private fun newId(): String = UUID.randomUUID().toString().replace("-", "").take(20)
