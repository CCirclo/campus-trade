package com.campusmarket.app.ui.screens.home

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.campusmarket.app.data.ApiClient
import com.campusmarket.app.data.Comment
import com.campusmarket.app.data.Item
import com.campusmarket.app.data.ReportBody
import com.campusmarket.app.data.toApiException
import kotlinx.coroutines.launch

/** 商品详情:数据加载、收藏、评论、举报、发起会话。 */
class ItemDetailViewModel : ViewModel() {
    var item by mutableStateOf<Item?>(null)
        private set
    var comments by mutableStateOf<List<Comment>>(emptyList())
        private set
    var favorited by mutableStateOf(false)
        private set
    var loading by mutableStateOf(true)
        private set
    var error by mutableStateOf("")
        private set
    var busy by mutableStateOf(false)
        private set
    var toast by mutableStateOf("")
        private set

    private var loadedId: Long = 0

    fun load(id: Long) {
        loadedId = id
        viewModelScope.launch {
            loading = true
            error = ""
            runCatching { ApiClient.api.itemDetail(id) }
                .onSuccess {
                    item = it.item
                    comments = it.comments
                    favorited = it.favorited
                }
                .onFailure { error = it.toApiException().message }
            loading = false
        }
    }

    fun reload() = load(loadedId)

    fun toggleFavorite() {
        val id = item?.id ?: return
        if (busy) return
        viewModelScope.launch {
            busy = true
            runCatching { ApiClient.api.toggleFavorite(id) }
                .onSuccess { favorited = it.favorited }
                .onFailure { toast = it.toApiException().message }
            busy = false
        }
    }

    fun sendComment(content: String, onDone: () -> Unit) {
        val id = item?.id ?: return
        if (busy) return
        viewModelScope.launch {
            busy = true
            runCatching { ApiClient.api.addComment(id, com.campusmarket.app.data.CommentBody(content.trim())) }
                .onSuccess { onDone(); reload() }
                .onFailure { toast = it.toApiException().message }
            busy = false
        }
    }

    fun submitReport(reason: String, detail: String, onDone: () -> Unit) {
        val id = item?.id ?: return
        if (busy) return
        viewModelScope.launch {
            busy = true
            runCatching { ApiClient.api.report(ReportBody(id, reason, detail.trim())) }
                .onSuccess { toast = "举报已提交,感谢你的反馈"; onDone() }
                .onFailure { toast = it.toApiException().message }
            busy = false
        }
    }

    /** 发起会话,返回会话 id 供导航。 */
    fun startChat(onSuccess: (Long) -> Unit) {
        val id = item?.id ?: return
        if (busy) return
        viewModelScope.launch {
            busy = true
            runCatching { ApiClient.api.startConversation(com.campusmarket.app.data.StartConversationBody(id)) }
                .onSuccess { onSuccess(it.id) }
                .onFailure { toast = it.toApiException().message }
            busy = false
        }
    }

    fun clearToast() {
        toast = ""
    }
}
