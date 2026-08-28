import Foundation

// MARK: - 防重复提交

/// 轻量「进行中」令牌：提交开始置位，提交结束（成功或失败）复位。
/// 用于防止用户连点导致重复发送/重复下单/重复发布。
@MainActor
final class SubmitGuard {
    private(set) var isSubmitting = false

    /// 尝试进入提交状态；已有进行中的提交时返回 false（拒绝重复）。
    func tryBegin() -> Bool {
        guard !isSubmitting else { return false }
        isSubmitting = true
        return true
    }

    func end() { isSubmitting = false }

    /// 包裹一次提交：返回 true 表示真正执行，false 表示被去重拦截。
    /// 无论 `body` 成功还是抛错，都会复位。
    @discardableResult
    func perform(_ body: () async throws -> Void) async rethrows -> Bool {
        guard tryBegin() else { return false }
        defer { end() }
        try await body()
        return true
    }
}
