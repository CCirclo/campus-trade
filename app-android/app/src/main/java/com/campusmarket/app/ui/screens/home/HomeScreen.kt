package com.campusmarket.app.ui.screens.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.lifecycle.viewmodel.compose.viewModel
import com.campusmarket.app.ui.components.EmptyState
import com.campusmarket.app.ui.components.ErrorState
import com.campusmarket.app.ui.components.ItemCard
import com.campusmarket.app.ui.components.Loading

val categories = listOf("教材", "电子产品", "生活用品", "服饰", "运动器材", "其他")
val sortOptions = listOf("latest" to "最新发布", "priceAsc" to "价格从低到高", "priceDesc" to "价格从高到低")

/** 首页:搜索、分类筛选、排序与商品网格(与 Web 端 HomePage 对齐)。 */
@Composable
fun HomeScreen(
    onOpenItem: (Long) -> Unit,
    onOpenUser: (Long) -> Unit,
    vm: HomeViewModel = viewModel(),
) {
    var sortMenuOpen by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }

    Column(Modifier.fillMaxSize()) {
        // 搜索栏
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("搜索教材、电子产品、生活用品…") },
                singleLine = true,
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                trailingIcon = {
                    if (query.isNotBlank()) {
                        TextButton(onClick = { vm.keyword = query; vm.search() }) { Text("搜索") }
                    }
                },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { vm.keyword = query; vm.search() }),
                modifier = Modifier.weight(1f),
            )
        }

        // 分类 chips
        LazyRow(
            contentPadding = PaddingValues(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                FilterChip(
                    selected = vm.category.isEmpty(),
                    onClick = { vm.selectCategory("") },
                    label = { Text("全部") },
                )
            }
            items(categories) { c ->
                FilterChip(
                    selected = vm.category == c,
                    onClick = { vm.selectCategory(c) },
                    label = { Text(c) },
                )
            }
        }

        // 排序
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "共 ${vm.total} 件在售",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.secondary,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = { sortMenuOpen = true }) {
                Text(sortOptions.firstOrNull { it.first == vm.sort }?.second ?: "排序")
            }
            DropdownMenu(expanded = sortMenuOpen, onDismissRequest = { sortMenuOpen = false }) {
                sortOptions.forEach { (value, label) ->
                    DropdownMenuItem(
                        text = { Text(label) },
                        onClick = { vm.selectSort(value); sortMenuOpen = false },
                    )
                }
            }
        }

        when {
            vm.loading -> Loading()
            vm.error.isNotBlank() -> ErrorState(vm.error, onRetry = { vm.reload() })
            vm.items.isEmpty() -> EmptyState("暂无相关商品", "换个关键词或分类试试")
            else -> LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                contentPadding = PaddingValues(12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                items(vm.items, key = { it.id }) { item ->
                    ItemCard(
                        item = item,
                        onClick = { onOpenItem(item.id) },
                    )
                }
                if (vm.hasMore) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                            if (vm.loadMoreError.isNotBlank()) {
                                Text(vm.loadMoreError, color = MaterialTheme.colorScheme.error)
                            }
                            TextButton(
                                onClick = { vm.loadMore() },
                                enabled = !vm.loadingMore,
                            ) {
                                Text(if (vm.loadingMore) "加载中…" else if (vm.loadMoreError.isBlank()) "加载更多" else "重试")
                            }
                        }
                    }
                }
            }
        }
    }
}
