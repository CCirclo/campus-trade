import XCTest
@testable import CampusMarket

// 图片上传队列：顺序、单张状态、删除、排序、失败重试、总体进度。
final class ImageUploadQueueTests: XCTestCase {
    private func queue3() -> ImageUploadQueue {
        ImageUploadQueue(items: [
            UploadItem(id: "a", sourceFile: "a.jpg"),
            UploadItem(id: "b", sourceFile: "b.jpg"),
            UploadItem(id: "c", sourceFile: "c.jpg"),
        ])
    }

    func testOverallProgressAverages() {
        var q = queue3()
        q.markDone("a", url: "u-a")
        q.markUploading("b")
        // a=1, b=0.5, c=0 -> (1.5)/3 = 0.5
        XCTAssertEqual(q.overallProgress, 0.5, accuracy: 0.001)
    }

    func testUploadedURLsInOrder() {
        var q = queue3()
        q.markDone("b", url: "u-b")
        q.markDone("a", url: "u-a")
        // 顺序保持 a, b（c 未完成）
        XCTAssertEqual(q.uploadedURLsInOrder, ["u-a", "u-b"])
    }

    func testRetryFailedResetsToPending() {
        var q = queue3()
        q.markFailed("a", reason: "网络错误")
        q.markDone("b", url: "u-b")
        // a 从 failed 恢复为 pending；c 仍是默认 pending；b 已完成。
        let retriable = q.retryFailed()
        XCTAssertEqual(retriable.map(\.id), ["a", "c"])
        XCTAssertFalse(q.hasFailure)
    }

    func testRemoveAndMove() {
        var q = queue3()
        q.remove(id: "b")
        XCTAssertEqual(q.items.map(\.id), ["a", "c"])
        q.move(from: IndexSet(integer: 1), to: 0)
        XCTAssertEqual(q.items.map(\.id), ["c", "a"])
    }

    func testHasFailureDetection() {
        var q = queue3()
        XCTAssertFalse(q.hasFailure)
        q.markFailed("c", reason: "x")
        XCTAssertTrue(q.hasFailure)
    }
}
