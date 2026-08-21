package com.campusmarket.app.ui.screens.home

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.campusmarket.app.data.ApiClient
import com.campusmarket.app.data.Item
import com.campusmarket.app.data.toApiException
import kotlinx.coroutines.launch

/** 首页商品流:搜索/分类/排序。 */
class HomeViewModel : ViewModel() {
    var keyword by mutableStateOf("")
    var category by mutableStateOf("")
        private set
    var sort by mutableStateOf("latest")
        private set
    var items by mutableStateOf<List<Item>>(emptyList())
        private set
    var loading by mutableStateOf(true)
        private set
    var error by mutableStateOf("")
        private set

    init {
        load()
    }

    fun search() {
        load()
    }

    fun selectCategory(value: String) {
        category = value
        load()
    }

    fun selectSort(value: String) {
        sort = value
        load()
    }

    fun reload() = load()

    private fun load() {
        viewModelScope.launch {
            loading = true
            error = ""
            runCatching {
                ApiClient.api.items(
                    keyword = keyword.trim().ifBlank { null },
                    category = category.ifBlank { null },
                    sort = sort,
                )
            }.onSuccess { items = it.items }
                .onFailure { error = it.toApiException().message }
            loading = false
        }
    }
}
