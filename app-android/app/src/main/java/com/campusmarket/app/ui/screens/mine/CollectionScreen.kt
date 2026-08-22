package com.campusmarket.app.ui.screens.mine

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.campusmarket.app.data.ApiClient
import com.campusmarket.app.data.Item
import com.campusmarket.app.data.toApiException
import com.campusmarket.app.ui.components.AppTopBar
import com.campusmarket.app.ui.components.EmptyState
import com.campusmarket.app.ui.components.ErrorState
import com.campusmarket.app.ui.components.ItemCard
import com.campusmarket.app.ui.components.Loading
import kotlinx.coroutines.launch

class CollectionViewModel : ViewModel() {
    var items by mutableStateOf<List<Item>>(emptyList())
        private set
    var loading by mutableStateOf(true)
        private set
    var error by mutableStateOf("")
        private set

    fun load(kind: String) {
        viewModelScope.launch {
            loading = true
            error = ""
            runCatching {
                if (kind == "favorites") ApiClient.api.myFavorites() else ApiClient.api.myItems()
            }.onSuccess { items = it.items }
                .onFailure { error = it.toApiException().message }
            loading = false
        }
    }
}

/** 我的发布 / 我的收藏列表。 */
@Composable
fun CollectionScreen(
    kind: String,
    onBack: () -> Unit,
    onOpenItem: (Long) -> Unit,
    onEditItem: (Long) -> Unit = {},
    vm: CollectionViewModel = androidx.lifecycle.viewmodel.compose.viewModel(),
) {
    LaunchedEffect(kind) { vm.load(kind) }
    Column(Modifier.fillMaxSize()) {
        AppTopBar(if (kind == "favorites") "我的收藏" else "我的发布", onBack = onBack)
        when {
            vm.loading -> Loading()
            vm.error.isNotBlank() -> ErrorState(vm.error, onRetry = { vm.load(kind) })
            vm.items.isEmpty() -> EmptyState(
                if (kind == "favorites") "还没有收藏商品" else "还没有发布商品",
                if (kind == "favorites") "在商品详情页点击收藏即可加入" else "点击底部「发布」按钮发布第一件商品",
            )
            else -> LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                contentPadding = PaddingValues(12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                items(vm.items, key = { it.id }) { item ->
                    Column {
                        Box {
                            ItemCard(item = item, onClick = { onOpenItem(item.id) })
                            if (kind == "mine") {
                                TextButton(
                                    onClick = { onEditItem(item.id) },
                                    modifier = Modifier.align(androidx.compose.ui.Alignment.TopEnd).padding(4.dp),
                                ) {
                                    Text("编辑", style = MaterialTheme.typography.labelSmall)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
