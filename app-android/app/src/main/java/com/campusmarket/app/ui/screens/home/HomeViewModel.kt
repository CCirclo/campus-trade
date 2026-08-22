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
    private val pageSize = 20
    private var page = 1
    private var queryVersion = 0

    var keyword by mutableStateOf("")
    var category by mutableStateOf("")
        private set
    var sort by mutableStateOf("latest")
        private set
    var items by mutableStateOf<List<Item>>(emptyList())
        private set
    var loading by mutableStateOf(true)
        private set
    var loadingMore by mutableStateOf(false)
        private set
    var total by mutableStateOf(0)
        private set
    var hasMore by mutableStateOf(false)
        private set
    var error by mutableStateOf("")
        private set
    var loadMoreError by mutableStateOf("")
        private set

    init {
        load()
    }

    fun search() {
        load(reset = true)
    }

    fun selectCategory(value: String) {
        category = value
        load(reset = true)
    }

    fun selectSort(value: String) {
        sort = value
        load(reset = true)
    }

    fun reload() = load(reset = true)

    fun loadMore() = load(reset = false)

    private fun load(reset: Boolean = true) {
        if (!reset && (loadingMore || !hasMore)) return
        val version = if (reset) ++queryVersion else queryVersion
        val targetPage = if (reset) 1 else page + 1
        viewModelScope.launch {
            if (reset) {
                loading = true
                error = ""
                loadMoreError = ""
            } else {
                loadingMore = true
                loadMoreError = ""
            }
            runCatching {
                ApiClient.api.items(
                    keyword = keyword.trim().ifBlank { null },
                    category = category.ifBlank { null },
                    sort = sort,
                    page = targetPage,
                    pageSize = pageSize,
                )
            }.onSuccess { response ->
                if (version != queryVersion) return@onSuccess
                items = if (reset) response.items else (items + response.items).distinctBy { it.id }
                page = response.page
                total = response.total
                hasMore = response.hasMore
            }
                .onFailure {
                    if (version == queryVersion) {
                        val message = it.toApiException().message
                        if (reset) error = message else loadMoreError = message
                    }
                }
            if (version == queryVersion) {
                loading = false
                loadingMore = false
            }
        }
    }
}
