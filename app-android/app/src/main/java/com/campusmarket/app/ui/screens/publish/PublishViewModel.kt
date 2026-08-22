package com.campusmarket.app.ui.screens.publish

import android.content.Context
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.campusmarket.app.data.ApiClient
import com.campusmarket.app.data.ItemPayload
import com.campusmarket.app.data.toApiException
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

/** 发布/编辑商品表单状态与提交逻辑。 */
class PublishViewModel : ViewModel() {
    var title by mutableStateOf("")
    var priceText by mutableStateOf("")
    var category by mutableStateOf("")
    var condition by mutableStateOf("")
    var description by mutableStateOf("")
    var images by mutableStateOf<List<String>>(emptyList())
    var status by mutableStateOf("在售")

    var editing by mutableStateOf(false)
        private set
    var loadingItem by mutableStateOf(false)
        private set
    var uploading by mutableStateOf(false)
        private set
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf("")
        private set

    private var itemId: Long = -1

    /** 编辑态:拉取商品详情填充表单。 */
    fun loadForEdit(id: Long) {
        itemId = id
        editing = true
        loadingItem = true
        viewModelScope.launch {
            runCatching { ApiClient.api.itemDetail(id) }
                .onSuccess {
                    val item = it.item
                    title = item.title
                    priceText = formatPrice(item.price)
                    category = item.category
                    condition = item.condition
                    description = item.description
                    images = item.images
                    status = item.status
                }
                .onFailure { error = it.toApiException().message }
            loadingItem = false
        }
    }

    fun removeImage(index: Int) {
        images = images.filterIndexed { i, _ -> i != index }
    }

    /** 上传多图(≤9 张,单张 ≤5MB)。 */
    fun uploadImages(context: Context, uris: List<Uri>, onUploaded: (List<String>) -> Unit) {
        if (uploading) return
        val remaining = (9 - images.size).coerceAtLeast(0)
        if (remaining == 0) {
            error = "最多上传 9 张图片"
            return
        }
        val picked = uris.take(remaining)
        if (picked.isEmpty()) return
        viewModelScope.launch {
            uploading = true
            error = ""
            try {
                val parts = picked.map { uri ->
                    val resolver = context.contentResolver
                    val mime = resolver.getType(uri) ?: "image/jpeg"
                    val bytes = resolver.openInputStream(uri)?.use { it.readBytes() }
                        ?: throw IOException("无法读取所选图片")
                    val ext = when {
                        mime.contains("png") -> "png"
                        mime.contains("webp") -> "webp"
                        mime.contains("gif") -> "gif"
                        else -> "jpg"
                    }
                    val body = bytes.toRequestBody(mime.toMediaType())
                    MultipartBody.Part.createFormData("images", "upload.$ext", body)
                }
                val response = ApiClient.api.uploadImages(parts)
                images = images + response.urls
                onUploaded(response.urls)
            } catch (e: Exception) {
                error = e.toApiException().message
            } finally {
                uploading = false
            }
        }
    }

    fun submit(onDone: (Long) -> Unit) {
        if (busy || uploading) return
        val price = title.trim().let { t ->
            priceText.trim().toDoubleOrNull()?.takeIf { it in 0.0..999999.0 }
        }
        when {
            title.trim().length < 3 -> error = "商品标题至少需要 3 个字符"
            price == null -> error = "请输入有效价格(0–999999)"
            category.isBlank() -> error = "请选择分类"
            condition.isBlank() -> error = "请选择成色"
            else -> {
                error = ""
                viewModelScope.launch {
                    busy = true
                    val payload = ItemPayload(
                        title = title.trim(),
                        price = (kotlin.math.round(price * 100) / 100.0),
                        category = category,
                        condition = condition,
                        description = description.trim(),
                        images = images,
                        status = status.takeIf { editing },
                    )
                    runCatching {
                        if (editing) {
                            ApiClient.api.updateItem(itemId, payload)
                            itemId
                        } else {
                            ApiClient.api.createItem(payload).id
                        }
                    }.onSuccess { onDone(it) }
                        .onFailure { error = it.toApiException().message }
                    busy = false
                }
            }
        }
    }

    private fun formatPrice(value: Double): String =
        if (value == value.toLong().toDouble()) value.toLong().toString() else "%.2f".format(value)
}
