import Foundation

// MARK: - 图片上传队列（可单测）

/// 单张待上传图片的上传状态。
enum UploadItemState: Equatable {
    case pending        // 待上传
    case uploading      // 上传中
    case done           // 上传完成（已拿到 URL）
    case failed(String) // 上传失败，附原因，可重试

    var isFailed: Bool { if case .failed = self { return true }; return false }
}

/// 上传队列中的一张图片。`source` 为本地草稿文件名，`uploadedURL` 成功后回填。
struct UploadItem: Identifiable, Equatable {
    let id: String          // 稳定标识（与草稿图片文件名一致）
    let sourceFile: String  // 落盘文件名
    var state: UploadItemState = .pending
    var uploadedURL: String?

    var progress: Double {
        switch state {
        case .pending: return 0
        case .uploading: return 0.5 // 粗粒度；真正进度由单张字节流回调细化
        case .done: return 1
        case .failed: return 0
        }
    }
}

/// 上传队列：维护图片顺序、单张状态，支持删除、排序、失败重试与总体进度。
struct ImageUploadQueue {
    private(set) var items: [UploadItem] = []

    init(items: [UploadItem] = []) { self.items = items }

    /// 总体进度（0…1，取所有条目平均）。
    var overallProgress: Double {
        guard !items.isEmpty else { return 1 }
        return items.reduce(0) { $0 + $1.progress } / Double(items.count)
    }

    /// 已完成的图片 URL，保持当前顺序。
    var uploadedURLsInOrder: [String] {
        items.compactMap(\.uploadedURL)
    }

    /// 是否存在失败项（用于展示重试入口）。
    var hasFailure: Bool { items.contains { $0.state.isFailed } }

    /// 标记某张开始上传。
    mutating func markUploading(_ id: String) {
        guard let i = items.firstIndex(where: { $0.id == id }) else { return }
        items[i].state = .uploading
    }

    /// 标记某张上传完成。
    mutating func markDone(_ id: String, url: String) {
        guard let i = items.firstIndex(where: { $0.id == id }) else { return }
        items[i].state = .done
        items[i].uploadedURL = url
    }

    /// 标记某张失败（可重试）。
    mutating func markFailed(_ id: String, reason: String) {
        guard let i = items.firstIndex(where: { $0.id == id }) else { return }
        items[i].state = .failed(reason)
    }

    /// 重试失败项：把 failed 恢复为 pending。
    mutating func retryFailed() -> [UploadItem] {
        for i in items.indices where items[i].state.isFailed {
            items[i].state = .pending
        }
        return items.filter { $0.state == .pending }
    }

    /// 删除一张。
    mutating func remove(id: String) { items.removeAll { $0.id == id } }

    /// 移动顺序（IndexSet -> destination）。
    mutating func move(from source: IndexSet, to destination: Int) {
        items.move(fromOffsets: source, toOffset: destination)
    }
}
