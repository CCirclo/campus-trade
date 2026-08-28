import Foundation

// MARK: - 本地搜索历史（有上限、可清除）

/// 基于 UserDefaults 的搜索历史。按用户分区（userId 0 表示未登录的公共历史），
/// 上限固定，最新在前，去重（同样的词提到最前），可整体清除。
struct SearchHistoryStore {
    let limit: Int
    private let defaults: UserDefaults

    init(limit: Int = 20, defaults: UserDefaults = .standard) {
        self.limit = limit
        self.defaults = defaults
    }

    private func key(for userId: Int?) -> String { "search-history-\(userId ?? 0)" }

    func entries(for userId: Int?) -> [String] {
        defaults.stringArray(forKey: key(for: userId)) ?? []
    }

    /// 记录一次搜索词：去掉首尾空白、去重后插入最前，并裁剪到上限。
    mutating func record(_ term: String, for userId: Int?) {
        let t = term.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        var list = entries(for: userId).filter { $0 != t }
        list.insert(t, at: 0)
        if list.count > limit { list = Array(list.prefix(limit)) }
        defaults.set(list, forKey: key(for: userId))
    }

    mutating func clear(for userId: Int?) {
        defaults.removeObject(forKey: key(for: userId))
    }
}
