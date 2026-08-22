package com.campusmarket.app.ui.screens.mine

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.campusmarket.app.data.ApiClient
import com.campusmarket.app.data.SessionManager
import com.campusmarket.app.data.Stats
import com.campusmarket.app.ui.components.Avatar
import kotlinx.coroutines.launch

class MineViewModel : ViewModel() {
    var stats by mutableStateOf(Stats())
        private set

    init {
        viewModelScope.launch {
            runCatching { ApiClient.api.myStats() }.onSuccess { stats = it.stats }
        }
    }
}

private data class Entry(val label: String, val icon: ImageVector, val route: String)

/** 个人中心(与 Web 端 MinePage 对齐)。 */
@Composable
fun MineScreen(onOpen: (String) -> Unit, vm: MineViewModel = androidx.lifecycle.viewmodel.compose.viewModel()) {
    val user = SessionManager.user.collectAsState().value
    if (user == null) return

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        // 用户卡片
        Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.primaryContainer) {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar(user.avatarUrl, user.nickname, 60.dp)
                Column(Modifier.padding(start = 14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(user.nickname, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
                        if (user.campusVerified) {
                            Icon(
                                Icons.Filled.CheckCircle,
                                contentDescription = "校园认证",
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(start = 6.dp),
                            )
                        }
                    }
                    Text(
                        if (user.campusVerified) "校园认证用户" else "未认证(仅可浏览)",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                    Text(
                        user.email,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
            }
        }

        // 统计
        Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Row(Modifier.padding(vertical = 16.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                StatItem("发布", vm.stats.total)
                StatItem("在售", vm.stats.selling)
                StatItem("已售出", vm.stats.sold)
            }
        }

        // 功能入口
        val entries = listOf(
            Entry("我的发布", Icons.AutoMirrored.Filled.List, "collection/mine"),
            Entry("我的收藏", Icons.Filled.Star, "collection/favorites"),
            Entry("编辑资料", Icons.Filled.AccountCircle, "edit-profile"),
            Entry("修改密码", Icons.Filled.Lock, "change-password"),
            Entry("奖励与资产", Icons.Filled.ThumbUp, "wallet"),
            Entry("意见反馈", Icons.Filled.Email, "feedback"),
            Entry("安全交易指南", Icons.Filled.Info, "safety"),
        )
        Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column {
                entries.forEachIndexed { index, entry ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onOpen(entry.route) }
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(entry.icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Text(entry.label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f).padding(start = 12.dp))
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.outline)
                    }
                    if (index < entries.size - 1) HorizontalDivider()
                }
            }
        }

        OutlinedButton(
            onClick = { SessionManager.logout() },
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
        ) {
            Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null)
            Text("退出登录", modifier = Modifier.padding(start = 8.dp))
        }
    }
}

@Composable
private fun StatItem(label: String, value: Int) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text("$value", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
    }
}
