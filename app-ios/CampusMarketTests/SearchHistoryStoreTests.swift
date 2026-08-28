import XCTest
@testable import CampusMarket

// 搜索历史：有限上限、去重提升、可清除。
final class SearchHistoryStoreTests: XCTestCase {
    private var defaults: UserDefaults!
    private let suiteName = "SearchHistoryStoreTests"

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: suiteName)
        defaults.removePersistentDomain(forName: suiteName)
    }

    func testRecordInsertsNewestFirstAndDedups() {
        var store = SearchHistoryStore(limit: 5, defaults: defaults)
        store.record("教材", for: 1)
        store.record("数码", for: 1)
        store.record("教材", for: 1) // 重复：应提升到最前
        XCTAssertEqual(store.entries(for: 1), ["教材", "数码"])
    }

    func testRecordEnforcesLimit() {
        var store = SearchHistoryStore(limit: 3, defaults: defaults)
        for i in 1...6 { store.record("词\(i)", for: 1) }
        let entries = store.entries(for: 1)
        XCTAssertEqual(entries.count, 3)
        XCTAssertEqual(entries.first, "词6")
    }

    func testRecordIgnoresBlank() {
        var store = SearchHistoryStore(limit: 5, defaults: defaults)
        store.record("   ", for: 1)
        XCTAssertEqual(store.entries(for: 1), [])
    }

    func testClearRemovesAll() {
        var store = SearchHistoryStore(limit: 5, defaults: defaults)
        store.record("a", for: 1)
        store.record("b", for: 1)
        store.clear(for: 1)
        XCTAssertEqual(store.entries(for: 1), [])
    }

    func testHistoryIsPartitionedByUser() {
        var store = SearchHistoryStore(limit: 5, defaults: defaults)
        store.record("user1词", for: 1)
        store.record("user2词", for: 2)
        XCTAssertEqual(store.entries(for: 1), ["user1词"])
        XCTAssertEqual(store.entries(for: 2), ["user2词"])
    }
}
