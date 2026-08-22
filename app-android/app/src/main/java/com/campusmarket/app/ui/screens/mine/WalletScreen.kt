package com.campusmarket.app.ui.screens.mine

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.campusmarket.app.data.ApiClient
import com.campusmarket.app.data.WalletCurrency
import com.campusmarket.app.data.WalletEntry
import com.campusmarket.app.data.toApiException
import com.campusmarket.app.ui.components.AppTopBar
import com.campusmarket.app.ui.components.EmptyState
import com.campusmarket.app.ui.components.ErrorState
import com.campusmarket.app.ui.components.Loading
import com.campusmarket.app.util.formatTimestamp
import kotlinx.coroutines.launch

class WalletViewModel : ViewModel() {
    var wallet by mutableStateOf<List<WalletCurrency>>(emptyList())
        private set
    var entries by mutableStateOf<List<WalletEntry>>(emptyList())
        private set
    var loading by mutableStateOf(true)
        private set
    var error by mutableStateOf("")
        private set

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            loading = true
            error = ""
            runCatching { ApiClient.api.myWallet() }
                .onSuccess {
                    wallet = it.wallet.values.toList()
                    entries = it.entries
                }
                .onFailure { error = it.toApiException().message }
            loading = false
        }
    }
}

/** 奖励与资产(与 website 端 WalletPage 对齐)。 */
@Composable
fun WalletScreen(onBack: () -> Unit, vm: WalletViewModel = androidx.lifecycle.viewmodel.compose.viewModel()) {
    Column(Modifier.fillMaxSize()) {
        AppTopBar("奖励与资产", onBack = onBack)
        when {
            vm.loading -> Loading()
            vm.error.isNotBlank() -> ErrorState(vm.error, onRetry = { vm.load() })
            else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp)) {
                item {
                    Text("奖励由管理员根据贡献手动发放,明细随时可查。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
                }
                item {
                    Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        vm.wallet.forEach { c ->
                            WalletCard(c)
                        }
                    }
                }
                item {
                    Text("入账明细(最近 50 条)", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 20.dp, bottom = 8.dp))
                }
                if (vm.entries.isEmpty()) {
                    item { EmptyState("还没有奖励记录", "参与开发或社区贡献,管理员会不定期发放奖励") }
                } else {
                    items(vm.entries, key = { it.id }) { entry ->
                        val currency = vm.wallet.firstOrNull { it.code == entry.currency }
                        Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    "+${entry.amount} ${currency?.name ?: entry.currency}",
                                    style = MaterialTheme.typography.titleSmall,
                                    color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.weight(1f),
                                )
                                Text(formatTimestamp(entry.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                            }
                            Text(entry.reason, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 2.dp))
                            Text("发放人:${entry.operator}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(top = 2.dp))
                        }
                        HorizontalDivider()
                    }
                }
                item {
                    Text("本项目处于测试阶段,以上均为初步设想,具体规则以正式公告为准。", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(top = 12.dp))
                }
            }
        }
    }
}

@Composable
private fun WalletCard(currency: WalletCurrency) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(currency.name, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
                Text(currency.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
            }
            Text(
                "${currency.balance}",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}
