import Foundation
import UserNotifications
import UIKit

// MARK: - APNs 与系统通知

/// 负责：请求通知授权、注册 APNs 设备 token、登录态上传/注销 token、
/// 前台展示通知、处理前台/后台/冷启动的会话深链、以及角标同步。
@MainActor
final class NotificationManager: NSObject, ObservableObject {
    static let shared = NotificationManager()

    /// 系统授权状态（用于设置页展示）。
    @Published private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    /// 当用户在通知（前台/后台/冷启动）点击后，弹出需要深链到的目标路由。
    @Published var pendingDeepLink: AppRoute?
    /// 是否已注册 APNs 远程通知（供设置页展示，模拟器上为 false）。
    @Published private(set) var isRegisteredForRemoteNotifications = false

    private let center = UNUserNotificationCenter.current()
    private var lastToken: String?

    override init() {
        super.init()
        center.delegate = self
    }
    func bootstrap() {
        Task { await refreshAuthorizationStatus() }
    }

    func refreshAuthorizationStatus() async {
        let settings = await center.notificationSettings()
        authorizationStatus = settings.authorizationStatus
    }

    /// 请求通知授权（设置页「系统通知」开关）。授权后回到主线程刷新状态。
    @discardableResult
    func requestAuthorization() async -> Bool {
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        await refreshAuthorizationStatus()
        if granted { await refreshRemoteNotificationRegistration() }
        return granted
    }

    /// 根据授权状态决定是否注册（/注销）APNs 远程通知，并把 token 同步到后端。
    func refreshRemoteNotificationRegistration() async {
        await refreshAuthorizationStatus()
        if authorizationStatus == .authorized || authorizationStatus == .provisional {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    /// 收到 device token 后回调（AppDelegate / UIApplicationDelegateAdaptor 触发）。
    /// - 原样十六进制编码（大小写无关），交给后端归一化与哈希。
    nonisolated func didRegisterForRemoteNotifications(withDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { @MainActor in
            self.lastToken = token
            self.isRegisteredForRemoteNotifications = true
            await self.uploadToken(token)
        }
    }

    nonisolated func didFailToRegisterForRemoteNotifications(error: Error) {
        // 模拟器 / 未配 Capability 时 APNs 不可用；静默降级，不影响站内消息。
        Task { @MainActor in self.isRegisteredForRemoteNotifications = false }
    }

    /// 登录后上传 token；退出登录调用 unregisterToken。
    func uploadToken(_ token: String?) async {
        guard let token, !token.isEmpty else { return }
        struct Payload: Encodable { let token: String; let platform: String }
        let _: OKResponse? = try? await APIClient.shared.request(
            "/api/push/register", method: "POST",
            body: Payload(token: token, platform: "ios"))
    }

    /// 退出登录：注销 token 并清零本地角标。
    func unregisterToken() async {
        if let token = lastToken {
            struct Payload: Encodable { let token: String; let platform: String }
            let _: OKResponse? = try? await APIClient.shared.request(
                "/api/push/unregister", method: "POST",
                body: Payload(token: token, platform: "ios"))
        }
        lastToken = nil
        clearBadge()
    }

    // MARK: - 角标

    /// 把 App 图标角标与服务端未读数同步。
    func setBadge(_ count: Int) {
        let value = max(0, count)
        if #available(iOS 16.0, *) {
            center.setBadgeCount(value)
        } else {
            UIApplication.shared.applicationIconBadgeNumber = value
        }
    }

    /// 读完 / 退出登录后清零。
    func clearBadge() {
        if #available(iOS 16.0, *) {
            center.setBadgeCount(0)
        } else {
            UIApplication.shared.applicationIconBadgeNumber = 0
        }
    }
}

// MARK: - 通知点击 → 会话深链（回调在非主线程触发，统一转发到主 actor）

extension NotificationManager: UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .badge])
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo
        let extracted: Int? = {
            if let v = userInfo["conversationId"] as? Int { return v >= 1 ? v : nil }
            if let s = userInfo["conversationId"] as? String, let id = Int(s) { return id >= 1 ? id : nil }
            return nil
        }()
        if let conversationId = extracted {
            Task { @MainActor in self.pendingDeepLink = .conversation(conversationId) }
        }
        completionHandler()
    }
}
