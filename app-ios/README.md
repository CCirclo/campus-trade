# 校园闲置 iOS

原生 SwiftUI 客户端，支持 iOS 17 及以上。已覆盖商品浏览、搜索与筛选、商品详情、登录注册、发布与图片上传、收藏评论、站内聊天、个人中心、安全指南和问题反馈。

## 在 Xcode 中运行

1. 确认生产后端 `https://20250821cdcdifc.top/campus-trade/api/health` 可访问。
2. 用 Xcode 打开 `CampusMarket.xcodeproj`。
3. 选择 `CampusMarket` scheme 和任意 iPhone 模拟器，点击 Run。

模拟器和真机默认连接生产后端 `https://20250821cdcdifc.top/campus-trade`。如需连接本地后端进行开发，可临时在 `CampusMarket/Info.plist` 中修改 `API_BASE_URL`；使用 HTTP 时还需添加仅限开发地址的 ATS 例外。

首次真机构建还需要在 Xcode 的 Signing & Capabilities 中选择你的开发团队；Bundle Identifier 默认为 `com.campusmarket.ios`。

## 命令行构建

```bash
xcodebuild -project CampusMarket.xcodeproj \
  -scheme CampusMarket \
  -sdk iphonesimulator \
  -configuration Debug \
  -derivedDataPath .derived-data \
  CODE_SIGNING_ALLOWED=NO build
```

API 定义见 [`../docs/api.md`](../docs/api.md)。当前 iOS 版未包含 Web 管理后台和商品编辑入口。

## 系统能力（通知 / 通用链接 / 相机）

- **系统通知**：`NotificationManager` 请求授权、注册 APNs token 并在登录态经 `/api/push/register` 上传、退出经 `/api/push/unregister` 注销；新消息通知载荷携带 `conversationId`，前台/后台/冷启动点击深链到会话；App 角标随服务端未读同步，读完与退出清零。
- **设置页**：「我的 → 通知与权限」分别控制邮件消息通知与系统通知，展示系统授权状态与相机/相册状态，授权被拒时提供前往系统设置的入口。
- **通用链接**：商品详情通过 `ShareLink` 分享 Universal Link（`https://20250821cdcdifc.top/campus-trade/items/:id`）；`Associated Domains` entitlement 指向 `applinks:20250821cdcdifc.top`，站点 AASA 见 `frontend/public/.well-known/` 与后端 `/.well-known/apple-app-site-association`。客户端 `DeepLinkRouter` 解析 `items`/`messages`/`errands` 路径。
- **相机**：发布表单在相册选择外提供「拍摄」，经 `CameraPicker` 调用系统相机；`NSCameraUsageDescription` 已声明用途。
- **会话安全**：Cookie 会话由 URLSession 共享 Cookie 存储（httpOnly）管理；`KeychainStore` 将可恢复目标路由等敏感信息存入 Keychain 而非 UserDefaults；`APIClient` 统一把 401 转为 `APIError.unauthorized` 并广播 `sessionExpired`，由 `SessionStore` 收回登录态并引导登录。

> 真机远程送达依赖 Apple team / APNs 凭据（`APNS_*` 环境变量）与真机签名，属外部验收项；缺省时站内消息与邮件通知不受影响。
