package com.campusmarket.app.ui.screens.auth

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.campusmarket.app.ui.components.AppTopBar

/** 修改密码(登录后使用)。 */
@Composable
fun ChangePasswordScreen(onBack: () -> Unit, vm: AuthViewModel = viewModel()) {
    var current by rememberSaveable { mutableStateOf("") }
    var next by rememberSaveable { mutableStateOf("") }
    var confirm by rememberSaveable { mutableStateOf("") }
    var done by rememberSaveable { mutableStateOf(false) }
    var mismatch by rememberSaveable { mutableStateOf("") }

    Column(Modifier.fillMaxSize()) {
        AppTopBar("修改密码", onBack = onBack)
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
        ) {
            if (done) {
                Text("密码已修改,其他设备已退出登录。", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyLarge)
                return@Column
            }
            Text("修改成功后,其他设备上的登录状态会自动失效,当前设备保持登录。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
            Spacer(Modifier.height(16.dp))
            OutlinedTextField(
                value = current,
                onValueChange = { current = it },
                label = { Text("当前密码") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = next,
                onValueChange = { next = it },
                label = { Text("新密码(至少 8 个字符)") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = confirm,
                onValueChange = { confirm = it },
                label = { Text("确认新密码") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
            )
            if (mismatch.isNotBlank()) {
                Text(mismatch, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 12.dp))
            }
            if (vm.error.isNotBlank()) {
                Text(vm.error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 12.dp))
            }
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = {
                    if (next != confirm) {
                        mismatch = "两次输入的新密码不一致"
                        return@Button
                    }
                    mismatch = ""
                    vm.changePassword(current, next, onDone = { done = true })
                },
                enabled = !vm.busy,
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) {
                Text(if (vm.busy) "提交中…" else "保存新密码")
            }
        }
    }
}
