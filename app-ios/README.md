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
