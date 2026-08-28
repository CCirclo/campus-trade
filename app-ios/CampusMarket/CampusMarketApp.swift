import SwiftUI
import UIKit

@main
struct CampusMarketApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var session = SessionStore()
    @StateObject private var notifications = NotificationManager.shared
    @StateObject private var pendingRoute = PendingRouteStore.shared

    init() {
        // 仅 Debug 且带 `-ui-testing` 启动参数时安装确定性网络桩；生产构建不含此逻辑。
        #if DEBUG
        UITestSupport.installIfNeeded()
        #endif
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .environmentObject(notifications)
                .environmentObject(pendingRoute)
                .tint(Theme.coral)
                .task {
                    await session.restore()
                    notifications.bootstrap()
                    pendingRoute.restoreFromStorage()
                }
        }
    }
}

/// 处理 APNs 注册回调（device token / 失败）并转发给 NotificationManager。
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationManager.shared.didRegisterForRemoteNotifications(withDeviceToken: deviceToken)
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationManager.shared.didFailToRegisterForRemoteNotifications(error: error)
    }
}
