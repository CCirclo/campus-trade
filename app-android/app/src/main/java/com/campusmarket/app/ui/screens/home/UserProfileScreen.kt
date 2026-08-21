package com.campusmarket.app.ui.screens.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.campusmarket.app.data.ApiClient
import com.campusmarket.app.data.Item
import com.campusmarket.app.data.PublicProfile
import com.campusmarket.app.data.toApiException
import com.campusmarket.app.ui.components.AppTopBar
import com.campusmarket.app.ui.components.Avatar
import com.campusmarket.app.ui.components.EmptyState
import com.campusmarket.app.ui.components.ErrorState
import com.campusmarket.app.ui.components.ItemCard
import com.campusmarket.app.ui.components.Loading
import kotlinx.coroutines.launch

class UserProfileViewModel : ViewModel() {
    var profile by mutableStateOf<PublicProfile?>(null)
        private set
    var items by mutableStateOf<List<Item>>(emptyList())
        private set
    var loading by mutableStateOf(true)
        private set
    var error by mutableStateOf("")
        private set

    private var loadedId: Long = 0

    fun load(id: Long) {
        loadedId = id
        viewModelScope.launch {
            loading = true
            error = ""
            runCatching { ApiClient.api.userProfile(id) }
                .onSuccess {
                    profile = it.profile
                    items = it.items
                }
                .onFailure { error = it.toApiException().message }
            loading = false
        }
    }
}

/** 用户公开主页:资料 + 在售商品(与 Web 端 UserProfilePage 对齐)。 */
@Composable
fun UserProfileScreen(
    userId: Long,
    onBack: () -> Unit,
    onOpenItem: (Long) -> Unit,
    vm: UserProfileViewModel = androidx.lifecycle.viewmodel.compose.viewModel(),
) {
    LaunchedEffect(userId) { vm.load(userId) }
    Column(Modifier.fillMaxSize()) {
        AppTopBar("用户主页", onBack = onBack)
        when {
            vm.loading -> Loading()
            vm.error.isNotBlank() -> ErrorState(vm.error)
            vm.profile == null -> ErrorState("用户不存在")
            else -> {
                val profile = vm.profile!!
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    contentPadding = PaddingValues(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }) {
                        Row(Modifier.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Avatar(profile.avatarUrl, profile.nickname, 64.dp)
                            Column(Modifier.padding(start = 12.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(profile.nickname, style = MaterialTheme.typography.titleMedium)
                                    if (profile.campusVerified) {
                                        Icon(
                                            Icons.Filled.Star,
                                            contentDescription = "校园认证",
                                            tint = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.padding(start = 4.dp),
                                        )
                                    }
                                }
                                Text(
                                    if (profile.campusVerified) "校园认证用户" else "未认证用户",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (profile.campusVerified) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary,
                                )
                            }
                        }
                    }
                    if (vm.items.isEmpty()) {
                        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }) {
                            EmptyState("暂无在售商品")
                        }
                    } else {
                        items(vm.items, key = { it.id }) { item ->
                            ItemCard(item = item, onClick = { onOpenItem(item.id) })
                        }
                    }
                }
            }
        }
    }
}
