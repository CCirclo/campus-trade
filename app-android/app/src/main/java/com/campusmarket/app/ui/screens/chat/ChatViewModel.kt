package com.campusmarket.app.ui.screens.chat

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.campusmarket.app.data.ApiClient
import com.campusmarket.app.data.ChatMessage
import com.campusmarket.app.data.Conversation
import com.campusmarket.app.data.ConversationHeader
import com.campusmarket.app.data.SendMessageBody
import com.campusmarket.app.data.toApiException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** 会话列表。 */
class MessagesViewModel : ViewModel() {
    var conversations by mutableStateOf<List<Conversation>>(emptyList())
        private set
    var loading by mutableStateOf(true)
        private set
    var error by mutableStateOf("")
        private set

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            loading = true
            error = ""
            runCatching { ApiClient.api.conversations() }
                .onSuccess { conversations = it.conversations }
                .onFailure { error = it.toApiException().message }
            loading = false
        }
    }
}

/** 聊天窗口:3 秒轮询拉取消息(与 Web 端一致),发送后标记已读。 */
class ChatViewModel : ViewModel() {
    var header by mutableStateOf<ConversationHeader?>(null)
        private set
    var messages by mutableStateOf<List<ChatMessage>>(emptyList())
        private set
    var loading by mutableStateOf(true)
        private set
    var error by mutableStateOf("")
        private set
    var sending by mutableStateOf(false)
        private set
    var input by mutableStateOf("")

    private var conversationId: Long = 0
    private var pollJob: Job? = null

    fun start(id: Long) {
        pollJob?.cancel()
        conversationId = id
        load()
        pollJob = viewModelScope.launch {
            while (isActive) {
                delay(3_000)
                load(silent = true)
            }
        }
    }

    fun stop() {
        pollJob?.cancel()
        pollJob = null
    }

    fun load(silent: Boolean = false) {
        viewModelScope.launch {
            if (!silent) loading = true
            runCatching { ApiClient.api.messages(conversationId) }
                .onSuccess {
                    header = it.conversation
                    messages = it.messages
                    runCatching { ApiClient.api.markRead(conversationId) }
                }
                .onFailure { error = it.toApiException().message }
            loading = false
        }
    }

    fun send(onSent: () -> Unit = {}) {
        val content = input.trim()
        if (content.isEmpty() || sending) return
        viewModelScope.launch {
            sending = true
            runCatching { ApiClient.api.sendMessage(conversationId, SendMessageBody(content)) }
                .onSuccess {
                    input = ""
                    onSent()
                    load(silent = true)
                }
                .onFailure { error = it.toApiException().message }
            sending = false
        }
    }

    override fun onCleared() {
        stop()
        super.onCleared()
    }
}
