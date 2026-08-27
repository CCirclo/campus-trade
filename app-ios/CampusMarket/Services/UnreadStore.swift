import Foundation
import SwiftUI

// MARK: - 全局未读角标

/// 维护「消息 Tab 未读总数」。调用方（RootView）在登录态轮询 `/api/conversations/unread-count`，
/// 进入会话标记已读后刷新清零。可观察，供 Tab 角标与列表角标共用。
@MainActor
final class UnreadStore: ObservableObject {
    static let shared = UnreadStore()
    @Published var count = 0

    private var pollTask: Task<Void, Never>?
    private var active = false

    /// 拉取一次未读总数；未登录应停止调用。同步 App 图标角标到服务端未读数。
    func refresh() async {
        let response: UnreadCountResponse? = try? await APIClient.shared.request("/api/conversations/unread-count")
        count = response?.count ?? 0
        NotificationManager.shared.setBadge(count)
    }

    /// 轮询开关：登录后调用 start，退出登录后 stop 并清零。
    /// 使用可取消的 Task 循环，避免页面消失后继续请求。
    func startPolling() {
        guard pollTask == nil else { return }
        active = true
        pollTask = Task { [weak self] in
            while let self, self.active, !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(10)) } catch { return }
                guard self.active, !Task.isCancelled else { return }
                await self.refresh()
            }
        }
    }

    func stopPolling() {
        active = false
        pollTask?.cancel()
        pollTask = nil
        count = 0
        NotificationManager.shared.clearBadge()
    }
}

struct UnreadCountResponse: Codable { let count: Int }
