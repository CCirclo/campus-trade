import Foundation

// MARK: - 可取消的稳定轮询

/// 稳定的轮询循环：按固定间隔反复执行 `body`，直到 `cancel()` 或所属任务被取消。
/// 用于会话列表 / 当前会话的轮询，避免页面消失后继续请求。
actor Poller {
    private let interval: Duration
    private var generation = 0
    private var stopped = false

    init(interval: Duration) { self.interval = interval }

    /// 开始轮询。返回一个 token；后续 `cancel` 会停止本轮及之后所有 tick。
    /// 每次调用会取代上一轮（旧的 tick 全部失效），保证同一时刻只有一个循环。
    func start(_ body: @escaping @Sendable () async -> Void) {
        generation += 1
        let myGen = generation
        stopped = false
        Task { [interval] in
            while true {
                guard !stopped, myGen == self.generation, !Task.isCancelled else { return }
                try? await Task.sleep(for: interval)
                guard !stopped, myGen == self.generation, !Task.isCancelled else { return }
                await body()
            }
        }
    }

    /// 停止当前轮询循环。
    func cancel() {
        stopped = true
        generation += 1
    }
}
