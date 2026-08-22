package com.campusmarket.app.data

import android.content.Context
import com.campusmarket.app.BuildConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit

/**
 * 会话管理(单例)。
 *
 * 后端使用 httpOnly Cookie 会话(campus_session),原生端无法直接读取 Cookie,
 * 因此通过 OkHttp CookieJar 捕获 Set-Cookie 并持久化到 SharedPreferences。
 * 用户资料缓存在内存 StateFlow 中,进程重启后由 [onBoot] 恢复。
 */
object SessionManager {
    const val SESSION_COOKIE = "campus_session"
    private const val PREFS_NAME = "campus_session_prefs"
    private const val KEY_COOKIE = "session_cookie_value"

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var appContext: Context

    private val _user = MutableStateFlow<User?>(null)
    val user: StateFlow<User?> = _user.asStateFlow()

    /** 启动恢复是否完成(用于启动页等待)。 */
    private val _ready = MutableStateFlow(false)
    val ready: StateFlow<Boolean> = _ready.asStateFlow()

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    private fun prefs() = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /** 持久化的会话 Cookie 值(使用 Android Keystore 加密后落盘)。 */
    var cookie: String?
        get() = prefs().getString(KEY_COOKIE, null)?.let { SecureSessionStore.decrypt(it) }
        private set(value) {
            val encoded = if (value.isNullOrBlank()) {
                null
            } else {
                try {
                    SecureSessionStore.encrypt(value)
                } catch (_: Exception) {
                    null
                }
            }
            prefs().edit().apply {
                if (encoded == null) remove(KEY_COOKIE) else putString(KEY_COOKIE, encoded)
            }.apply()
        }

    /** 登录/注册成功后写入会话 Cookie。 */
    fun saveCookie(value: String) {
        cookie = value
    }

    /** 应用启动:尝试用持久化的 Cookie 恢复登录态。 */
    fun onBoot() {
        scope.launch {
            try {
                _user.value = ApiClient.api.me().user
            } catch (_: Exception) {
                _user.value = null
                cookie = null
            } finally {
                _ready.value = true
            }
        }
    }

    fun setUser(value: User?) {
        _user.value = value
    }

    /** 401 触发:清除本地会话与用户态(UI 会随之跳转登录页)。 */
    fun onUnauthorized() {
        cookie = null
        _user.value = null
    }

    fun logout(onDone: () -> Unit = {}) {
        scope.launch {
            runCatching { ApiClient.api.logout() }
            cookie = null
            _user.value = null
            onDone()
        }
    }
}

/** 捕获后端 Set-Cookie 中的会话 Cookie,并在请求时注入。 */
private class SessionCookieJar : CookieJar {
    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        cookies.firstOrNull { it.name == SessionManager.SESSION_COOKIE }?.let {
            SessionManager.saveCookie(it.value)
        }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val value = SessionManager.cookie ?: return emptyList()
        return listOf(
            Cookie.Builder()
                .name(SessionManager.SESSION_COOKIE)
                .value(value)
                .domain(url.host)
                .build()
        )
    }
}

/** 网络客户端:OkHttp + Retrofit + kotlinx-serialization。 */
object ApiClient {
    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        explicitNulls = false
    }

    private val unauthorizedInterceptor = Interceptor { chain ->
        val response = chain.proceed(chain.request())
        if (response.code == 401 && !chain.request().url.encodedPath.startsWith("/api/auth/")) {
            SessionManager.onUnauthorized()
        }
        response
    }

    private val okHttpClient = OkHttpClient.Builder()
        .cookieJar(SessionCookieJar())
        .addInterceptor(unauthorizedInterceptor)
        .apply {
            if (BuildConfig.DEBUG) {
                addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC })
            }
        }
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    val api: ApiService = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL)
        .client(okHttpClient)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()
        .create(ApiService::class.java)
}
