package com.campusmarket.app.data

import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** 业务异常:携带后端返回的 {error} 消息与 HTTP 状态码。 */
class ApiException(
    override val message: String,
    val status: Int = 0,
    cause: Throwable? = null,
) : Exception(message, cause)

/** 把任意异常规整为可直接展示的 ApiException。 */
fun Throwable.toApiException(): ApiException = when (this) {
    is ApiException -> this
    is retrofit2.HttpException -> {
        val body = try {
            response()?.errorBody()?.string()
        } catch (_: Exception) {
            null
        }
        val message = try {
            body?.let { text ->
                kotlinx.serialization.json.Json.parseToJsonElement(text)
                    .jsonObject["error"]?.jsonPrimitive?.content
            }
        } catch (_: Exception) {
            null
        }
        ApiException(message?.takeIf { it.isNotBlank() } ?: "请求失败,请稍后重试", code(), this)
    }
    is java.io.IOException -> ApiException("网络连接失败,请检查网络后重试", 0, this)
    else -> ApiException(message?.takeIf { it.isNotBlank() } ?: "请求失败,请稍后重试", 0, this)
}

/** 统一执行网络请求,把异常规整为 ApiException。 */
suspend fun <T> safeCall(block: suspend () -> T): Result<T> = try {
    Result.success(block())
} catch (e: Exception) {
    Result.failure(e.toApiException())
}
