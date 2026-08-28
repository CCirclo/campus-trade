import XCTest
@testable import CampusMarket

// 消息发送状态：发送中/成功/失败、失败重发、防重复入队。
final class MessageSendQueueTests: XCTestCase {
    func testEnqueueCreatesSendingMessage() {
        var q = MessageSendQueue()
        let item = q.enqueue(content: "hello")
        XCTAssertEqual(item.status, .sending)
        XCTAssertEqual(q.pending.map(\.content), ["hello"])
    }

    func testMarkSentRemovesFromPending() {
        var q = MessageSendQueue()
        let item = q.enqueue(content: "hi")
        q.markSent(item.localID)
        XCTAssertTrue(q.pending.isEmpty)
    }

    func testMarkFailedKeepsForRetry() {
        var q = MessageSendQueue()
        let item = q.enqueue(content: "boom")
        q.markFailed(item.localID, reason: "超时")
        XCTAssertEqual(q.pending.count, 1)
        XCTAssertEqual(q.pending[0].status, .failed("超时"))
    }

    func testHasInFlightPreventsDuplicateSend() {
        var q = MessageSendQueue()
        _ = q.enqueue(content: "dup")
        XCTAssertTrue(q.hasInFlight(content: "dup"))
        XCTAssertFalse(q.hasInFlight(content: "other"))
    }

    func testFailedStatusIsFailed() {
        XCTAssertTrue(MessageSendStatus.failed("x").isFailed)
        XCTAssertFalse(MessageSendStatus.sending.isFailed)
        XCTAssertFalse(MessageSendStatus.sent.isFailed)
    }
}

// 防重复提交：同一时刻只有一个 in-flight。
@MainActor final class SubmitGuardTests: XCTestCase {
    func testTryBeginOnlyAllowsOne() {
        let guard1 = SubmitGuard()
        XCTAssertTrue(guard1.tryBegin())
        XCTAssertFalse(guard1.tryBegin())
        guard1.end()
        XCTAssertTrue(guard1.tryBegin())
    }
}
