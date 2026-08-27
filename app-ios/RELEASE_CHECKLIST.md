# iOS 发布清单

## 构建与凭据

- 在 Xcode/Apple Developer 中确认团队 `3KD8VZCLDZ`、Bundle ID `com.ccirclo.ios`、Distribution 证书和描述文件有效。
- Release 构建使用生产 API、`aps-environment=production` 和 Associated Domains；Debug 使用本机 API 与开发推送环境。
- 在 Archive 前递增 `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`，执行单元测试、UI 测试、Release 构建和 `git diff --check`。
- APNs 私钥、证书和私有 xcconfig 只放 CI/服务器密钥存储，禁止提交仓库。

## App Store 元数据

- 名称：校园闲置；副标题：同校闲置与校园代取。
- 准备 6.7 英寸、6.5 英寸及 iPad 截图，填写支持网址、隐私政策网址、审核账号与审核说明。
- 隐私问卷按 `PrivacyInfo.xcprivacy` 与服务端实际存储填写：账号邮箱、用户内容、商品/聊天图片；不追踪用户。
- 审核说明列出校园邮箱注册、校区不可修改、站内聊天、担保订单和通知用途。

## 上线与回滚

- 先通过 TestFlight 内测验证登录、发布、代取、聊天、推送与 Universal Link，再分阶段发布。
- 观察 401、上传、消息、APNs 和订单错误率；异常时停止分阶段发布并在 App Store Connect 回退到上一个可用版本。
- 服务端保持向后兼容；紧急回滚 nginx/AASA 或 API 时保留旧客户端所需接口。

## 必须真机完成的外部验收

- Development 与 Production APNs 各完成一次后台/冷启动送达、角标和会话深跳。
- 从 Safari、短信和系统分享打开生产域名 Universal Link，验证已安装进 App、未安装落到 Web。
- 验证相机、相册选择/保存及拒绝后“前往设置”。
