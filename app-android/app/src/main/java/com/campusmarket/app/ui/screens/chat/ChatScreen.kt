package com.campusmarket.app.ui.screens.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.campusmarket.app.data.ChatMessage
import com.campusmarket.app.ui.components.AppTopBar
import com.campusmarket.app.ui.components.EmptyState
import com.campusmarket.app.ui.components.ErrorState
import com.campusmarket.app.ui.components.Loading
import com.campusmarket.app.ui.components.PriceText
import com.campusmarket.app.util.formatTimestamp

/** 聊天窗口(与 Web 端 ChatPage 对齐,支持 item_card 商品卡片消息)。 */
@Composable
fun ChatScreen(
    conversationId: Long,
    onBack: () -> Unit,
    onOpenItem: (Long) -> Unit = {},
    vm: ChatViewModel = viewModel(),
) {
    DisposableEffect(conversationId, vm) {
        vm.start(conversationId)
        onDispose { vm.stop() }
    }
    val listState = rememberLazyListState()
    LaunchedEffect(vm.messages.size) {
        if (vm.messages.isNotEmpty()) {
            listState.animateScrollToItem(vm.messages.size - 1)
        }
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        AppTopBar(
            title = vm.header?.itemTitle?.takeIf { it.isNotBlank() } ?: "商品交流",
            onBack = onBack,
        )
        when {
            vm.loading -> Loading()
            vm.error.isNotBlank() && vm.messages.isEmpty() -> ErrorState(vm.error, onRetry = { vm.load() })
            vm.messages.isEmpty() -> EmptyState("打个招呼吧", "先问问商品的具体情况")
            else -> LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(vm.messages, key = { it.id }) { message ->
                    MessageBubble(message, onOpenItem = onOpenItem)
                }
            }
        }
        // 输入栏
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            OutlinedTextField(
                value = vm.input,
                onValueChange = { vm.input = it },
                placeholder = { Text("输入消息…(500 字以内)") },
                modifier = Modifier.weight(1f),
                maxLines = 4,
            )
            IconButton(
                onClick = { vm.send() },
                enabled = !vm.sending,
                modifier = Modifier.padding(start = 6.dp),
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.Send,
                    contentDescription = "发送",
                    tint = if (vm.input.isBlank()) MaterialTheme.colorScheme.outline else MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

@Composable
private fun MessageBubble(message: ChatMessage, onOpenItem: (Long) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (message.mine) Arrangement.End else Arrangement.Start,
    ) {
        val bubbleColor = if (message.mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface
        val contentColor = if (message.mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
        Column(
            horizontalAlignment = if (message.mine) Alignment.End else Alignment.Start,
            modifier = Modifier.width(300.dp),
        ) {
            Text(
                message.sender.nickname,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.outline,
                modifier = Modifier.padding(bottom = 2.dp),
            )
            if (message.type == "item_card" && message.item != null) {
                // 商品卡片消息
                val snapshot = message.item
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surface,
                    shadowElevation = 1.dp,
                    modifier = Modifier
                        .clickable { onOpenItem(snapshot.id) }
                        .size(width = 220.dp, height = 80.dp),
                ) {
                    Row {
                        AsyncImage(
                            model = snapshot.image,
                            contentDescription = snapshot.title,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.size(width = 90.dp, height = 80.dp),
                        )
                        Column(Modifier.padding(10.dp)) {
                            Text(snapshot.title, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Spacer(Modifier.height(4.dp))
                            PriceText(snapshot.price, MaterialTheme.typography.titleSmall)
                            if (snapshot.status != "在售") {
                                Text(snapshot.status, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                            }
                        }
                    }
                }
            } else {
                Surface(
                    shape = RoundedCornerShape(
                        topStart = 12.dp,
                        topEnd = 12.dp,
                        bottomStart = if (message.mine) 12.dp else 2.dp,
                        bottomEnd = if (message.mine) 2.dp else 12.dp,
                    ),
                    color = bubbleColor,
                ) {
                    Text(
                        message.content,
                        style = MaterialTheme.typography.bodyMedium,
                        color = contentColor,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    )
                }
            }
            Text(
                formatTimestamp(message.createdAt),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.outline,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}
