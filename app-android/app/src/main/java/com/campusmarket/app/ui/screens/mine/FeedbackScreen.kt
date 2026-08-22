package com.campusmarket.app.ui.screens.mine

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.campusmarket.app.data.ApiClient
import com.campusmarket.app.data.FeedbackBody
import com.campusmarket.app.data.toApiException
import com.campusmarket.app.ui.components.AppTopBar
import kotlinx.coroutines.launch

private val feedbackTypes = listOf("问题反馈", "功能建议", "其他")

class FeedbackViewModel : ViewModel() {
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf("")
        private set

    fun submit(type: String, content: String, onDone: () -> Unit) {
        if (busy) return
        viewModelScope.launch {
            busy = true
            error = ""
            runCatching { ApiClient.api.feedback(FeedbackBody(type, content.trim())) }
                .onSuccess { onDone() }
                .onFailure { error = it.toApiException().message }
            busy = false
        }
    }
}

/** 意见反馈(与 Web 端 FeedbackPage 对齐)。 */
@Composable
fun FeedbackScreen(onBack: () -> Unit, vm: FeedbackViewModel = androidx.lifecycle.viewmodel.compose.viewModel()) {
    val context = LocalContext.current
    var type by mutableStateOf("问题反馈")
    var content by mutableStateOf("")

    Column(Modifier.fillMaxSize()) {
        AppTopBar("意见反馈", onBack = onBack)
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
        ) {
            Text("告诉我们你遇到的问题或建议", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                feedbackTypes.forEach { t ->
                    FilterChip(selected = type == t, onClick = { type = t }, label = { Text(t) })
                }
            }
            Spacer(Modifier.height(16.dp))
            OutlinedTextField(
                value = content,
                onValueChange = { content = it },
                label = { Text("详细描述(至少 10 个字符)") },
                minLines = 5,
                modifier = Modifier.fillMaxWidth(),
            )
            if (vm.error.isNotBlank()) {
                Text(vm.error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 12.dp))
            }
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = {
                    if (content.trim().length < 10) {
                        Toast.makeText(context, "请至少填写 10 个字符,方便我们理解问题", Toast.LENGTH_SHORT).show()
                        return@Button
                    }
                    vm.submit(type, content, onDone = {
                        Toast.makeText(context, "反馈已提交,感谢你的建议", Toast.LENGTH_SHORT).show()
                        onBack()
                    })
                },
                enabled = !vm.busy,
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) {
                Text(if (vm.busy) "提交中…" else "提交反馈")
            }
        }
    }
}
