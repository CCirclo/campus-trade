import Foundation

// MARK: - 防抖（Debounce）

/// 对连续触发做防抖：只在 `delay` 内没有新触发时才执行 `action`。
/// 每次调用都会取消上一次未执行的任务，避免旧请求覆盖新结果。
actor Debouncer {
    private let delay: Duration
    private var task: Task<Void, Never>?

    init(delay: Duration) { self.delay = delay }

    func call(_ action: @escaping @Sendable () async -> Void) {
        task?.cancel()
        task = Task { [delay] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            await action()
        }
    }

    func cancel() { task?.cancel(); task = nil }
}

// MARK: - 竞态保护（最新一次请求优先）

/// 请求取消 + 竞态保护：保证「旧响应不能覆盖新查询」。
/// 每次 `begin` 返回一个代际句柄；只有最新的句柄在 `commit` 时有效，
/// 旧请求完成后即使返回也会被丢弃。
actor LatestRequestGuard {
    private var generation = 0

    func begin() -> Int {
        generation += 1
        return generation
    }

    /// 仅当 `handle` 仍是最新代际时返回结果；否则返回 nil（旧响应被丢弃）。
    func commit<R>(_ value: R, for handle: Int) -> R? {
        handle == generation ? value : nil
    }
}
