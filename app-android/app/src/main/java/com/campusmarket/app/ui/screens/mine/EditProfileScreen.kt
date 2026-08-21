package com.campusmarket.app.ui.screens.mine

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import com.campusmarket.app.data.ApiClient
import com.campusmarket.app.data.ProfileBody
import com.campusmarket.app.data.SessionManager
import com.campusmarket.app.data.toApiException
import com.campusmarket.app.ui.components.AppTopBar
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream

class EditProfileViewModel : ViewModel() {
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf("")
        private set
    var uploading by mutableStateOf(false)
        private set

    fun save(nickname: String, wechatId: String, notifications: Boolean, onDone: () -> Unit) {
        if (busy) return
        viewModelScope.launch {
            busy = true
            error = ""
            runCatching { ApiClient.api.updateProfile(ProfileBody(nickname.trim(), wechatId.trim(), notifications)) }
                .onSuccess { SessionManager.setUser(it.user); onDone() }
                .onFailure { error = it.toApiException().message }
            busy = false
        }
    }

    fun uploadAvatar(bitmap: Bitmap, onDone: () -> Unit) {
        if (uploading) return
        viewModelScope.launch {
            uploading = true
            error = ""
            try {
                val bytes = compressJpeg(bitmap)
                val body = bytes.toRequestBody("image/jpeg".toMediaType())
                val part = MultipartBody.Part.createFormData("avatar", "avatar.jpg", body)
                val response = ApiClient.api.uploadAvatar(part)
                SessionManager.setUser(response.user)
                onDone()
            } catch (e: Exception) {
                error = e.toApiException().message
            } finally {
                uploading = false
            }
        }
    }
}

/** JPEG 压缩:从 88 质量逐步下降,直到 ≤2MB(与 Web 端头像压缩逻辑一致)。 */
fun compressJpeg(bitmap: Bitmap): ByteArray {
    var quality = 88
    var output = compress(bitmap, quality)
    while (quality > 40 && output.size > 2 * 1024 * 1024) {
        quality -= 10
        output = compress(bitmap, quality)
    }
    return output
}

private fun compress(bitmap: Bitmap, quality: Int): ByteArray {
    val stream = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)
    return stream.toByteArray()
}

/** 编辑个人资料:昵称、微信号、邮件通知开关、头像更换(裁剪后上传)。 */
@Composable
fun EditProfileScreen(
    onBack: () -> Unit,
    onCrop: () -> Unit,
    vm: EditProfileViewModel = androidx.lifecycle.viewmodel.compose.viewModel(),
) {
    val context = LocalContext.current
    val user = SessionManager.user.collectAsState().value
    var nickname by rememberSaveable { mutableStateOf(user?.nickname ?: "") }
    var wechatId by rememberSaveable { mutableStateOf(user?.wechatId ?: "") }
    var notifications by rememberSaveable { mutableStateOf(user?.emailMessageNotifications != false) }

    val picker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri: Uri? ->
        if (uri != null) {
            AvatarCropStore.setUri(uri)
            onCrop()
        }
    }

    // 裁剪完成后自动上传头像
    LaunchedEffect(Unit) {
        val pending = AvatarCropStore.pendingBitmap
        if (pending != null) {
            vm.uploadAvatar(pending, onDone = { AvatarCropStore.clear() })
        }
    }

    Column(Modifier.fillMaxSize()) {
        AppTopBar("编辑资料", onBack = onBack)
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
        ) {
            // 头像
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (user != null) {
                    AsyncImage(
                        model = user.avatarUrl,
                        contentDescription = "头像",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .size(72.dp)
                            .clip(CircleShape)
                            .clickable {
                                picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                            },
                    )
                }
                Column(Modifier.padding(start = 16.dp)) {
                    Text("头像", style = MaterialTheme.typography.titleSmall)
                    Text(
                        if (vm.uploading) "上传中…" else "点击更换(裁剪为正方形)",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.secondary,
                    )
                }
            }

            Spacer(Modifier.height(20.dp))
            OutlinedTextField(
                value = nickname,
                onValueChange = { nickname = it },
                label = { Text("昵称(至少 2 个字符)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = wechatId,
                onValueChange = { wechatId = it },
                label = { Text("微信号(选填)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)) {
                Checkbox(checked = notifications, onCheckedChange = { notifications = it })
                Text("接收新消息邮件通知", style = MaterialTheme.typography.bodySmall)
            }

            if (vm.error.isNotBlank()) {
                Text(vm.error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 12.dp))
            }

            Spacer(Modifier.height(24.dp))
            Row(Modifier.fillMaxWidth()) {
                OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f).padding(end = 6.dp)) {
                    Text("取消")
                }
                Button(
                    onClick = {
                        if (nickname.trim().length < 2) {
                            Toast.makeText(context, "昵称至少需要 2 个字符", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                        vm.save(nickname, wechatId, notifications, onDone = onBack)
                    },
                    enabled = !vm.busy,
                    modifier = Modifier.weight(1f).padding(start = 6.dp),
                ) {
                    Text(if (vm.busy) "保存中…" else "保存")
                }
            }
        }
    }
}

/** 按比例下采样解码,限制最长边,避免大图 OOM。 */
fun decodeUriBitmap(context: android.content.Context, uri: Uri, maxSide: Int = 2048): Bitmap? {
    return try {
        val resolver = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / sample > maxSide) sample *= 2
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
    } catch (_: Exception) {
        null
    }
}
