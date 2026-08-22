# app-android — Android 客户端

> ✅ **已实现** — 校园二手交易平台安卓端,基于 **Kotlin + Jetpack Compose** 原生实现,与 Web 端(`../frontend`)功能对齐,对接 `../backend` 的 REST API。

## 技术栈

| 类别 | 选型 |
| --- | --- |
| 语言 / UI | Kotlin 2.0 + Jetpack Compose(Material 3,BOM 2024.12) |
| 架构 | 单 Activity + Navigation Compose + ViewModel + StateFlow |
| 网络 | Retrofit 2.11 + OkHttp 4.12 + kotlinx-serialization |
| 图片 | Coil 2.7(自动跟随 `/api/media/:token` 302 签名跳转) |
| 存储 | Android Keystore + AES-GCM(会话 Cookie)、内存 StateFlow(用户态) |
| 构建 | Gradle 8.9(AGP 8.7.3)、minSdk 26 / targetSdk 35 |

## 目录结构

```
app-android/
├── app/src/main/
│   ├── java/com/campusmarket/app/
│   │   ├── data/        # 模型、ApiService(Retrofit 接口)、会话管理、错误处理
│   │   ├── ui/          # 主题、导航(AppRoot)、components、screens(各页面)
│   │   └── util/        # 时间格式化等
│   └── res/             # 字符串、主题、网络安全配置、矢量图标
└── gradle/              # 版本目录(libs.versions.toml)与 wrapper 配置
```

## 已实现功能(对齐 Web 端)

- **认证**:邮箱密码登录、邮箱验证码注册、找回密码、修改密码;会话 Cookie 持久化,启动自动恢复登录态,401 全局登出
- **商品**:首页分页列表(搜索 / 分类筛选 / 三种排序 / 加载更多)、详情(图库轮播、卖家卡、收藏、评论、举报、『我想要』发起会话)、用户公开主页
- **发布**:新建与编辑(9 图上传、分类、成色、状态管理:在售/已售出/已下架)
- **聊天**:会话列表(未读数)、聊天窗口(商品卡片消息、3 秒轮询、标记已读)、底部导航未读角标(10 秒轮询)
- **个人中心**:发布统计、我的发布(可编辑)、我的收藏、资料编辑(昵称/微信号/邮件通知)、头像裁剪上传(512×512 JPEG ≤2MB)、奖励与资产(钱包)、意见反馈、安全交易指南

> 管理后台(`/admin`)保留在 Web 端,不进入 App。

## 环境要求

- JDK 17(`JAVA_HOME` 指向 JDK 17)
- Android Studio(含 Android SDK 35)+ Android SDK Platform 35 / Build-Tools 35

## 构建与运行

用 Android Studio 打开本目录,等待 Gradle 同步完成后直接运行到模拟器/真机;或命令行:

```bash
# Windows
gradlew.bat assembleDebug      # 产物:app/build/outputs/apk/debug/app-debug.apk
gradlew.bat lint

# macOS / Linux
./gradlew assembleDebug
```

> 首次构建会自动下载 Gradle 8.9 与依赖,需要联网。
> 若 `gradle-wrapper.jar` 缺失(尚未用 Android Studio 打开过),用 Android Studio 打开工程一次即可自动补齐。

## 配置 API 地址

后端基地址由 Gradle 属性 `campusApiBaseUrl` 注入(`gradle.properties`):

- **模拟器(默认)**:`http://10.0.2.2:8787/` — 直接访问宿主机上的后端
- **真机调试**:改为电脑局域网 IP,例如 `http://192.168.1.100:8787/`,并把这个 IP 追加到
  `app/src/main/res/xml/network_security_config.xml` 的 `<domain-config>` 中(否则明文 HTTP 被拦截)
- **生产环境**:Release 固定使用 `https://20250821cdcdifc.top/campus-trade/`,且不包含明文网络例外

命令行临时覆盖:`gradlew assembleDebug -PcampusApiBaseUrl=http://192.168.1.100:8787/`

启动后端(仓库根目录):

```bash
cd .. && npm ci && npm run dev   # Web :5173,API :8787
```

## 会话机制说明

后端使用 **httpOnly Cookie 会话**(`campus_session`,30 天)。原生端通过 OkHttp 的
`CookieJar` 捕获 `Set-Cookie`,使用 Android Keystore 托管的 AES-GCM 密钥加密后再持久化;
应用关闭系统备份,进程重启后可恢复会话,无需在业务页面中处理 token。

## 已知限制(首版)

- 商品列表使用后端分页并支持手动加载更多,暂未实现自动无限滚动
- 图片选择使用系统 Photo Picker(仅相册,无拍照入口)
- 聊天为轮询实现(与 Web 端一致),无推送通知
