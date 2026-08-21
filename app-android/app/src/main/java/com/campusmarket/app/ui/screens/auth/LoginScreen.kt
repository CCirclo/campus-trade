package com.campusmarket.app.ui.screens.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel

/** 登录/注册页(与 Web 端 LoginPage 对齐)。 */
@Composable
fun LoginScreen(
    onLoggedIn: () -> Unit,
    onForgotPassword: () -> Unit = {},
    vm: AuthViewModel = viewModel(),
) {
    var mode by rememberSaveable { mutableStateOf("login") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var nickname by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }
    var notifications by rememberSaveable { mutableStateOf(true) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("校园闲置", style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.primary)
        Text(
            "同校好物 · 放心交易",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.secondary,
            modifier = Modifier.padding(top = 4.dp, bottom = 24.dp),
        )

        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            SegmentedButton(
                selected = mode == "login",
                onClick = { mode = "login"; vm.clearError() },
                shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2),
            ) { Text("登录") }
            SegmentedButton(
                selected = mode == "register",
                onClick = { mode = "register"; vm.clearError() },
                shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2),
            ) { Text("注册") }
        }

        Spacer(Modifier.height(20.dp))

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("邮箱") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("密码") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(),
        )

        if (mode == "register") {
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = nickname,
                onValueChange = { nickname = it },
                label = { Text("昵称(至少 2 个字符)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it },
                    label = { Text("邮箱验证码") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                )
                OutlinedButton(
                    onClick = { vm.sendCode(email) },
                    enabled = vm.countdown == 0 && !vm.busy,
                    modifier = Modifier.padding(start = 8.dp),
                ) {
                    Text(if (vm.countdown > 0) "${vm.countdown}s" else "发送验证码")
                }
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            ) {
                Checkbox(checked = notifications, onCheckedChange = { notifications = it })
                Text("接收新消息邮件通知", style = MaterialTheme.typography.bodySmall)
            }
            Text(
                "注册需要使用 @ruc.edu.cn 校园邮箱,完成邮箱验证后才能发布、评论、收藏和聊天。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.secondary,
            )
        }

        if (vm.error.isNotBlank()) {
            Text(
                vm.error,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 12.dp),
            )
        }
        if (vm.info.isNotBlank()) {
            Text(
                vm.info,
                color = MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 12.dp),
            )
        }

        Spacer(Modifier.height(20.dp))
        Button(
            onClick = {
                if (mode == "login") vm.login(email, password, onLoggedIn)
                else vm.register(email, password, nickname, code, notifications, onLoggedIn)
            },
            enabled = !vm.busy,
            modifier = Modifier.fillMaxWidth().height(48.dp),
        ) {
            Text(if (vm.busy) "提交中…" else if (mode == "login") "登录" else "注册并登录")
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onForgotPassword) { Text("忘记密码?") }
        }
    }
}
