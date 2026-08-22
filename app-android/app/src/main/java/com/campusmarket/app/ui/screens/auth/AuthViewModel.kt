package com.campusmarket.app.ui.screens.auth

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.campusmarket.app.data.ApiClient
import com.campusmarket.app.data.ChangePasswordBody
import com.campusmarket.app.data.EmailCodeBody
import com.campusmarket.app.data.LoginBody
import com.campusmarket.app.data.RegisterBody
import com.campusmarket.app.data.ResetPasswordBody
import com.campusmarket.app.data.SessionManager
import com.campusmarket.app.data.toApiException
import kotlinx.coroutines.launch

/** 登录/注册/找回密码/修改密码共用 ViewModel。 */
class AuthViewModel : ViewModel() {
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf("")
        private set
    var info by mutableStateOf("")
        private set

    // 发送验证码倒计时
    var countdown by mutableIntStateOf(0)
        private set

    fun clearError() {
        error = ""
    }

    fun sendCode(email: String, purpose: String = "register") {
        if (countdown > 0) return
        if (!android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches()) {
            error = "请输入有效的邮箱地址"
            return
        }
        viewModelScope.launch {
            error = ""
            runCatching { ApiClient.api.sendEmailCode(EmailCodeBody(email)) }
                .onFailure { error = it.toApiException().message }
            countdown = 60
            info = if (error.isEmpty()) "验证码已发送,请查收邮箱" else ""
            while (countdown > 0) {
                kotlinx.coroutines.delay(1000)
                countdown--
            }
        }
    }

    fun login(email: String, password: String, onSuccess: () -> Unit) {
        if (busy) return
        busy = true
        error = ""
        viewModelScope.launch {
            runCatching { ApiClient.api.login(LoginBody(email.trim(), password)) }
                .onSuccess { SessionManager.setUser(it.user); onSuccess() }
                .onFailure { error = it.toApiException().message }
            busy = false
        }
    }

    fun register(
        email: String,
        password: String,
        nickname: String,
        code: String,
        emailNotifications: Boolean,
        onSuccess: () -> Unit,
    ) {
        if (busy) return
        busy = true
        error = ""
        viewModelScope.launch {
            runCatching {
                ApiClient.api.register(
                    RegisterBody(email.trim(), password, nickname.trim(), code.trim(), emailNotifications)
                )
            }.onSuccess { SessionManager.setUser(it.user); onSuccess() }
                .onFailure { error = it.toApiException().message }
            busy = false
        }
    }

    fun resetPassword(email: String, code: String, password: String, onDone: () -> Unit) {
        if (busy) return
        busy = true
        error = ""
        viewModelScope.launch {
            runCatching { ApiClient.api.resetPassword(ResetPasswordBody(email.trim(), code.trim(), password)) }
                .onSuccess { onDone() }
                .onFailure { error = it.toApiException().message }
            busy = false
        }
    }

    fun changePassword(current: String, next: String, onDone: () -> Unit) {
        if (busy) return
        busy = true
        error = ""
        viewModelScope.launch {
            runCatching { ApiClient.api.changePassword(ChangePasswordBody(current, next)) }
                .onSuccess { onDone() }
                .onFailure { error = it.toApiException().message }
            busy = false
        }
    }
}
