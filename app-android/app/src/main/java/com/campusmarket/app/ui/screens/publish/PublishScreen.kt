package com.campusmarket.app.ui.screens.publish

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.campusmarket.app.data.SessionManager
import com.campusmarket.app.ui.components.AppTopBar
import com.campusmarket.app.ui.components.EmptyState
import com.campusmarket.app.ui.components.Loading
import com.campusmarket.app.ui.screens.home.categories

private val conditions = listOf("全新", "九成新", "七成新", "五成新及以下")
private val statuses = listOf("在售", "已售出", "已下架")

/** 发布/编辑商品页(与 Web 端 PublishPage 对齐)。 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PublishScreen(
    itemId: Long,
    onDone: (Long) -> Unit,
    onBack: () -> Unit,
    vm: PublishViewModel = viewModel(),
) {
    val context = LocalContext.current
    val user = SessionManager.user.collectAsState().value

    LaunchedEffect(itemId) {
        if (itemId > 0) vm.loadForEdit(itemId)
    }

    val picker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(9)
    ) { uris: List<Uri> ->
        if (uris.isNotEmpty()) vm.uploadImages(context, uris) {}
    }

    Column(Modifier.fillMaxSize()) {
        AppTopBar(if (itemId > 0) "编辑商品" else "发布商品", onBack = onBack)

        if (user == null) {
            EmptyState("请先登录后发布商品")
            return@Column
        }
        if (user.campusVerified != true) {
            EmptyState("只有校园认证用户才能发布商品", "请使用 @ruc.edu.cn 邮箱完成认证")
            return@Column
        }
        if (vm.loadingItem) {
            Loading()
            return@Column
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            // 图片选择与预览
            Text("商品图片(最多 9 张)", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(8.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                itemsIndexed(vm.images) { index, url ->
                    Box(Modifier.size(96.dp)) {
                        AsyncImage(
                            model = url,
                            contentDescription = "已上传图片",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp)),
                        )
                        IconButton(
                            onClick = { vm.removeImage(index) },
                            modifier = Modifier.align(Alignment.TopEnd).size(24.dp),
                        ) {
                            Icon(Icons.Filled.Close, contentDescription = "移除", tint = MaterialTheme.colorScheme.surface)
                        }
                    }
                }
                if (vm.images.size < 9) {
                    item {
                        Box(
                            modifier = Modifier
                                .size(96.dp)
                                .clickable(enabled = !vm.uploading) {
                                    picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                                }
                                .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp)),
                            contentAlignment = Alignment.Center,
                        ) {
                            if (vm.uploading) CircularProgressIndicator(modifier = Modifier.size(24.dp))
                            else Icon(Icons.Filled.Add, contentDescription = "添加图片", tint = MaterialTheme.colorScheme.secondary)
                        }
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
            OutlinedTextField(
                value = vm.title,
                onValueChange = { vm.title = it },
                label = { Text("标题(至少 3 个字符)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = vm.priceText,
                onValueChange = { vm.priceText = it },
                label = { Text("价格(元)") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(16.dp))
            Text("分类", style = MaterialTheme.typography.titleSmall)
            FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                categories.forEach { c ->
                    FilterChip(selected = vm.category == c, onClick = { vm.category = c }, label = { Text(c) })
                }
            }

            Spacer(Modifier.height(16.dp))
            Text("成色", style = MaterialTheme.typography.titleSmall)
            FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                conditions.forEach { c ->
                    FilterChip(selected = vm.condition == c, onClick = { vm.condition = c }, label = { Text(c) })
                }
            }

            Spacer(Modifier.height(16.dp))
            OutlinedTextField(
                value = vm.description,
                onValueChange = { vm.description = it },
                label = { Text("描述(1000 字以内)") },
                minLines = 4,
                modifier = Modifier.fillMaxWidth(),
            )

            if (itemId > 0) {
                Spacer(Modifier.height(16.dp))
                Text("商品状态", style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(8.dp))
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    statuses.forEachIndexed { index, s ->
                        SegmentedButton(
                            selected = vm.status == s,
                            onClick = { vm.status = s },
                            shape = SegmentedButtonDefaults.itemShape(index = index, count = statuses.size),
                        ) { Text(s) }
                    }
                }
            }

            if (vm.error.isNotBlank()) {
                Text(vm.error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 12.dp))
            }

            Spacer(Modifier.height(24.dp))
            Button(
                onClick = { vm.submit(onDone = onDone) },
                enabled = !vm.busy && !vm.uploading,
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) {
                Text(if (vm.busy) "提交中…" else if (itemId > 0) "保存修改" else "发布")
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
