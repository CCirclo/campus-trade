package com.campusmarket.app

import android.app.Application
import com.campusmarket.app.data.SessionManager

class CampusApp : Application() {
    override fun onCreate() {
        super.onCreate()
        SessionManager.init(this)
        // 用持久化的会话 Cookie 恢复登录态(内部异步执行)
        SessionManager.onBoot()
    }
}
