import Foundation

// MARK: - 消息发送状态（本地跟踪，可单测）

/// 单条消息的本地发送状态。用于在聊天界面展示「发送中 / 成功 / 失败」并支持重发。
enum MessageSendStatus: Equatable {
    case none      // 服务端已有消息，无需本地状态
    case sending   // 发送中（乐观插入到列表尾部）
    case sent      // 已发送成功
    case failed(String) // 失败，附原因，可重发

    var isFailed: Bool { if case .failed = self { return true }; return false }
}

/// 乐观插入的本地消息：服务端尚未返回 id 时的占位对象。
struct LocalPendingMessage: Identifiable, Equatable {
    let localID: UUID
    let content: String
    var status: MessageSendStatus = .sending

    var id: UUID { localID }
}

/// 消息发送队列的状态机核心：记录待发送与失败项，支持重发去重。
/// 纯值类型，便于单元测试。
struct MessageSendQueue {
    private(set) var pending: [LocalPendingMessage] = []

    /// 入队一条新消息（生成 localID，状态 sending）。
    mutating func enqueue(content: String) -> LocalPendingMessage {
        let item = LocalPendingMessage(localID: UUID(), content: content, status: .sending)
        pending.append(item)
        return item
    }

    /// 标记某条本地消息为已发送（从待发送列表移除，返回移除后的列表）。
    mutating func markSent(_ localID: UUID) {
        pending.removeAll { $0.localID == localID }
    }

    /// 标记发送失败（保留在待发送列表，重发时据此恢复）。
    mutating func markFailed(_ localID: UUID, reason: String) {
        guard let idx = pending.firstIndex(where: { $0.localID == localID }) else { return }
        pending[idx] = LocalPendingMessage(localID: pending[idx].localID, content: pending[idx].content, status: .failed(reason))
    }

    /// 是否已存在某内容仍在发送中（防重复：同内容在队列里只保留一份正在进行的）。
    func hasInFlight(content: String) -> Bool {
        pending.contains { $0.content == content && $0.status == .sending }
    }
}
