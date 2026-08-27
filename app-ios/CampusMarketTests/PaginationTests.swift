import XCTest
@testable import CampusMarket

// 分页去重、刷新重置游标、合并去重。
final class PaginationTests: XCTestCase {
    struct Sample: Identifiable, Equatable { let id: Int; let name: String }

    func testMergePageDedupsByID() {
        let page1 = [Sample(id: 1, name: "a"), Sample(id: 2, name: "b")]
        let page2 = [Sample(id: 2, name: "b"), Sample(id: 3, name: "c")]
        let merged = mergePage(page1, appending: page2)
        XCTAssertEqual(merged.map(\.id), [1, 2, 3])
    }

    func testMergePageKeepsExistingWhenEmptyIncoming() {
        let page1 = [Sample(id: 1, name: "a")]
        let merged = mergePage(page1, appending: [])
        XCTAssertEqual(merged.map(\.id), [1])
    }

    func testDeduplicatedKeepsFirstOccurrenceOrder() {
        let list = [Sample(id: 3, name: "c"), Sample(id: 1, name: "a"), Sample(id: 3, name: "c"), Sample(id: 1, name: "a")]
        XCTAssertEqual(deduplicated(list).map(\.id), [3, 1])
    }

    func testPageCursorReset() {
        var cursor = PageCursor(page: 5, pageSize: 20, hasMore: false, total: 100)
        cursor.reset()
        XCTAssertEqual(cursor.page, 1)
        XCTAssertTrue(cursor.hasMore)
        XCTAssertEqual(cursor.total, 0)
    }

    func testPageCursorNextPageOnLastPageIsNil() {
        var cursor = PageCursor(page: 2, pageSize: 20, hasMore: false, total: 40)
        XCTAssertNil(cursor.nextPage)
        cursor.hasMore = true
        XCTAssertEqual(cursor.nextPage, 3)
    }
}
