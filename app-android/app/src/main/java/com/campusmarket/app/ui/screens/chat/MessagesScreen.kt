package com.campusmarket.app.ui.screens.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Badge
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.campusmarket.app.data.Conversation
import com.campusmarket.app.ui.components.AppTopBar
import com.campusmarket.app.ui.components.Avatar
import com.campusmarket.app.ui.components.EmptyState
import com.campusmarket.app.ui.components.ErrorState
import com.campusmarket.app.ui.components.Loading
import com.campusmarket.app.util.formatTimestamp

/** 消息列表页(与 Web 端 MessagesPage 对齐)。 */
@Composable
fun MessagesScreen(
    onOpenChat: (Long) -> Unit,
    vm: MessagesViewModel = viewModel(),
) {
    Column(Modifier.fillMaxSize()) {
        AppTopBar("商品消息")
        when {
            vm.loading -> Loading()
            vm.error.isNotBlank() -> ErrorState(vm.error, onRetry = { vm.load() })
            vm.conversations.isEmpty() -> EmptyState("还没有会话", "在商品详情页点击「我想要」开始聊天")
            else -> LazyColumn(Modifier.fillMaxSize()) {
                items(vm.conversations, key = { it.id }) { c ->
                    ConversationRow(c, onClick = { onOpenChat(c.id) })
                }
            }
        }
    }
}

@Composable
private fun ConversationRow(conversation: Conversation, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(conversation.partner.avatarUrl, conversation.partner.nickname, 48.dp)
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(conversation.partner.nickname, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                Text(
                    formatTimestamp(conversation.updatedAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.outline,
                )
            }
            Text(
                conversation.itemTitle.takeIf { it.isNotBlank() }?.let { "「$it」" } ?: "商品交流",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                conversation.lastMessage.ifBlank { "暂无消息" },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.secondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (conversation.unreadCount > 0) {
            Surface(color = MaterialTheme.colorScheme.error, shape = CircleShape) {
                Text(
                    if (conversation.unreadCount > 99) "99+" else "${conversation.unreadCount}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onError,
                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                )
            }
        }
    }
}
