import Foundation

// MARK: - 分页去重

/// 商品列表的分页游标。首页分页复用后端 `/api/items` 的 page/pageSize/hasMore/total。
struct PageCursor: Equatable {
    var page: Int = 1
    var pageSize: Int = 20
    var hasMore: Bool = true
    var total: Int = 0

    /// 下一页页码：末页返回 nil 表示无更多。
    var nextPage: Int? { hasMore ? page + 1 : nil }

    /// 刷新/筛选变更时重置游标。
    mutating func reset() {
        page = 1
        hasMore = true
        total = 0
    }
}

/// 分页追加去重：把新一页按 `id` 合并进已有列表，避免重复数据。
/// - 刷新（reset 后）应先清空列表再调用，本函数只保证「合并时不产生重复」。
/// - 返回值为是否插入了新数据（用于判断是否已到底）。
@discardableResult
func mergePage<T: Identifiable>(_ existing: [T], appending incoming: [T]) -> [T] where T.ID: Hashable {
    var seen = Set(existing.map(\.id))
    var merged = existing
    for element in incoming where seen.insert(element.id).inserted {
        merged.append(element)
    }
    return merged
}

/// 纯粹的去重（按 id），保留首次出现顺序；供测试与列表刷新前清洗使用。
func deduplicated<T: Identifiable>(_ items: [T]) -> [T] where T.ID: Hashable {
    var seen = Set<T.ID>()
    return items.filter { seen.insert($0.id).inserted }
}
