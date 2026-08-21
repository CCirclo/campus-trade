package com.campusmarket.app.ui.screens.home

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.campusmarket.app.data.SessionManager
import com.campusmarket.app.ui.components.AppTopBar
import com.campusmarket.app.ui.components.Avatar
import com.campusmarket.app.ui.components.ErrorState
import com.campusmarket.app.ui.components.Loading
import com.campusmarket.app.ui.components.PriceText
import com.campusmarket.app.ui.components.TagChip
import com.campusmarket.app.util.formatFullTimestamp
import com.campusmarket.app.util.formatTimestamp

private val reportReasons = listOf("虚假信息", "违规内容", "诈骗风险", "重复发布", "其他")

/** 商品详情:图库、信息、卖家卡、收藏、评论、举报与「我想要」发起会话。 */
@Composable
fun ItemDetailScreen(
    itemId: Long,
    onBack: () -> Unit,
    onOpenUser: (Long) -> Unit,
    onChat: (Long) -> Unit,
    vm: ItemDetailViewModel = viewModel(),
) {
    val context = LocalContext.current
    val user = SessionManager.user.collectAsState().value
    var comment by remember { mutableStateOf("") }
    var reportOpen by remember { mutableStateOf(false) }
    var reportReason by remember { mutableStateOf("") }
    var reportDetail by remember { mutableStateOf("") }

    LaunchedEffect(itemId) { vm.load(itemId) }
    LaunchedEffect(vm.toast) {
        if (vm.toast.isNotBlank()) {
            Toast.makeText(context, vm.toast, Toast.LENGTH_SHORT).show()
            vm.clearToast()
        }
    }

    Column(Modifier.fillMaxSize()) {
        AppTopBar("商品详情", onBack = onBack)
        when {
            vm.loading -> Loading()
            vm.error.isNotBlank() -> ErrorState(vm.error, onRetry = { vm.reload() })
            vm.item == null -> ErrorState("商品不存在或已删除")
            else -> {
                val item = vm.item!!
                LazyColumn(Modifier.fillMaxSize()) {
                    item {
                        Column(Modifier.fillMaxWidth()) {
                        // 图库
                        val pagerState = rememberPagerState(pageCount = { item.images.size.coerceAtLeast(1) })
                        Box(Modifier.fillMaxWidth().aspectRatio(1f)) {
                            HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
                                if (item.images.isEmpty()) {
                                    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
                                        Text("暂无图片", color = MaterialTheme.colorScheme.outline)
                                    }
                                } else {
                                    AsyncImage(
                                        model = item.images[page],
                                        contentDescription = item.title,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize(),
                                    )
                                }
                            }
                            if (item.images.size > 1) {
                                Surface(
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                                    shape = CircleShape,
                                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 10.dp),
                                ) {
                                    Text(
                                        "${pagerState.currentPage + 1}/${item.images.size}",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.surface,
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
                                    )
                                }
                            }
                        }

                        Column(Modifier.padding(16.dp)) {
                            PriceText(item.price, MaterialTheme.typography.headlineSmall)
                            Text(item.title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 4.dp))
                            Row(
                                modifier = Modifier.padding(top = 8.dp),
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                TagChip(item.category)
                                TagChip(item.condition)
                                if (item.status != "在售") TagChip(item.status, MaterialTheme.colorScheme.error)
                            }
                            Text(
                                "发布于 ${formatFullTimestamp(item.createdAt)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.outline,
                                modifier = Modifier.padding(top = 8.dp),
                            )
                            Text(
                                item.description.ifBlank { "卖家没有留下更多描述。" },
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.padding(top = 12.dp),
                            )
                        }

                        // 卖家卡
                        Surface(
                            color = MaterialTheme.colorScheme.surface,
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Row(
                                modifier = Modifier
                                    .clickable { onOpenUser(item.userId) }
                                    .padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Avatar(item.seller?.avatarUrl ?: "", item.seller?.nickname ?: "卖家", 44.dp)
                                Column(Modifier.weight(1f).padding(start = 10.dp)) {
                                    Text(item.seller?.nickname ?: "卖家", style = MaterialTheme.typography.titleSmall)
                                    if (item.seller?.verified == true) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            IconStar()
                                            Text(" 已认证", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                                        }
                                    }
                                }
                                Text("查看主页 ›", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
                            }
                        }

                        // 操作按钮
                        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
                            OutlinedButton(onClick = {
                                if (user == null) return@OutlinedButton
                                vm.toggleFavorite()
                            }, modifier = Modifier.weight(1f).padding(end = 6.dp)) {
                                Icon(
                                    if (vm.favorited) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                                    contentDescription = null,
                                    tint = if (vm.favorited) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary,
                                )
                                Text(if (vm.favorited) "已收藏" else "收藏")
                            }
                            Button(onClick = {
                                if (user == null) {
                                    Toast.makeText(context, "请先登录", Toast.LENGTH_SHORT).show()
                                    return@Button
                                }
                                if (user.campusVerified != true) {
                                    Toast.makeText(context, "只有校园认证用户才能发起聊天", Toast.LENGTH_SHORT).show()
                                    return@Button
                                }
                                vm.startChat(onSuccess = onChat)
                            }, modifier = Modifier.weight(1f).padding(start = 6.dp)) {
                                Text("我想要")
                            }
                        }

                        // 举报入口
                        TextButton(onClick = { reportOpen = true }, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                            Text("举报该商品", color = MaterialTheme.colorScheme.outline)
                        }

                        Text(
                            "评论 (${vm.comments.size})",
                            style = MaterialTheme.typography.titleSmall,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        )

                        // 评论输入
                        if (user != null) {
                            Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                                OutlinedTextField(
                                    value = comment,
                                    onValueChange = { comment = it },
                                    placeholder = { Text("问问卖家…(200 字以内)") },
                                    modifier = Modifier.weight(1f),
                                    maxLines = 2,
                                )
                                Button(
                                    onClick = {
                                        if (user.campusVerified != true) {
                                            Toast.makeText(context, "只有校园认证用户才能评论", Toast.LENGTH_SHORT).show()
                                            return@Button
                                        }
                                        if (comment.trim().length < 2) {
                                            Toast.makeText(context, "评论至少需要 2 个字符", Toast.LENGTH_SHORT).show()
                                            return@Button
                                        }
                                        vm.sendComment(comment, onDone = { comment = "" })
                                    },
                                    enabled = !vm.busy,
                                    modifier = Modifier.padding(start = 8.dp),
                                ) {
                                    Text("发送")
                                }
                            }
                        }
                        }
                    }
                    if (vm.comments.isEmpty()) {
                        item { Text("还没有评论,来成为第一个提问的同学。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(16.dp)) }
                    } else {
                        items(vm.comments.size) { index ->
                            val c = vm.comments[index]
                            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
                                Avatar(c.author.avatarUrl, c.author.nickname, 36.dp)
                                Column(Modifier.padding(start = 10.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(c.author.nickname, style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f, fill = false))
                                        if (c.author.isSeller) {
                                            TagChip("卖家", MaterialTheme.colorScheme.primary)
                                        }
                                    }
                                    Text(c.content, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 2.dp))
                                    Text(formatTimestamp(c.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(top = 2.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (reportOpen) {
        ReportDialog(
            onDismiss = { reportOpen = false },
            onSubmit = { reason, detail ->
                vm.submitReport(reason, detail, onDone = { reportOpen = false })
            },
        )
    }
}

@Composable
private fun IconStar() {
    androidx.compose.material3.Icon(
        Icons.Filled.Star,
        contentDescription = "已认证",
        tint = MaterialTheme.colorScheme.primary,
        modifier = Modifier.size(14.dp),
    )
}

@Composable
private fun ReportDialog(onDismiss: () -> Unit, onSubmit: (String, String) -> Unit) {
    var reason by remember { mutableStateOf("") }
    var detail by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("举报商品") },
        text = {
            Column {
                reportReasons.forEach { r ->
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { reason = r }.fillMaxWidth()) {
                        RadioButton(selected = reason == r, onClick = { reason = r })
                        Text(r)
                    }
                }
                OutlinedTextField(
                    value = detail,
                    onValueChange = { detail = it },
                    label = { Text("补充说明(选填,500 字以内)") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSubmit(reason, detail) },
                enabled = reason.isNotBlank(),
            ) { Text("提交") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}
