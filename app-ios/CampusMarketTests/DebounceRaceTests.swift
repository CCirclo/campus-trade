import XCTest
@testable import CampusMarket

// 防抖与竞态保护：旧响应不能覆盖新查询；防抖只执行最后一次。
final class DebounceRaceTests: XCTestCase {
    func testLatestRequestGuardDropsStaleResponse() async {
        let guard1 = LatestRequestGuard()
        let h1 = await guard1.begin()
        let h2 = await guard1.begin()
        // 旧句柄已被新代际取代，commit 应返回 nil。
        let stale = await guard1.commit("old", for: h1)
        XCTAssertNil(stale)
        // 最新句柄提交成功。
        let fresh = await guard1.commit("new", for: h2)
        XCTAssertEqual(fresh, "new")
    }

    func testDebouncerOnlyRunsLastCall() async {
        actor Box { var calls = 0; func bump() { calls += 1 }; func value() -> Int { calls } }
        let box = Box()
        let debouncer = Debouncer(delay: .milliseconds(40))
        await debouncer.call { await box.bump() }
        await debouncer.call { await box.bump() }
        await debouncer.call { await box.bump() }
        // 等待超过 delay，只有最后一次真正执行。
        try? await Task.sleep(for: .milliseconds(120))
        let count = await box.value()
        XCTAssertEqual(count, 1)
        await debouncer.cancel()
    }

    func testDebouncerCancelSuppressesExecution() async {
        actor Box { var calls = 0; func bump() { calls += 1 }; func value() -> Int { calls } }
        let box = Box()
        let debouncer = Debouncer(delay: .milliseconds(50))
        await debouncer.call { await box.bump() }
        await debouncer.cancel()
        try? await Task.sleep(for: .milliseconds(100))
        let count = await box.value()
        XCTAssertEqual(count, 0)
    }
}
