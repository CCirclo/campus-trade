import XCTest
import UIKit
@testable import CampusMarket

// 发布/编辑草稿单元测试：ItemDraft 编解码往返、编辑 vs 新建区分、图片文件列表顺序、
// 以及 DraftStore 的按用户分区 save/load/clear。

final class ItemDraftCodableTests: XCTestCase {
    func testRoundTripPreservesAllFields() throws {
        var draft = ItemDraft()
        draft.itemID = 42 // 有值 = 编辑草稿
        draft.title = "二手教材"
        draft.price = "25.5"
        draft.currency = "cny"
        draft.category = "教材"
        draft.condition = "九成新"
        draft.detail = "九成新，无笔记"
        draft.kind = "商品"
        draft.regions = ["苏州区"]
        draft.campusId = "c1"
        draft.status = "在售"
        draft.existingImageURLs = ["https://a/img1.jpg", "https://a/img2.jpg"]
        draft.newImageFiles = ["draft-1.jpg"]

        let data = try JSONEncoder().encode(draft)
        let decoded = try JSONDecoder().decode(ItemDraft.self, from: data)

        XCTAssertEqual(decoded, draft)
        XCTAssertEqual(decoded.itemID, 42)
        XCTAssertEqual(decoded.existingImageURLs, ["https://a/img1.jpg", "https://a/img2.jpg"])
        XCTAssertEqual(decoded.newImageFiles, ["draft-1.jpg"])
    }

    func testNewDraftHasNilItemID() {
        let draft = ItemDraft()
        XCTAssertNil(draft.itemID)
        // 缺省值符合发布表单初始状态。
        XCTAssertEqual(draft.currency, "cny")
        XCTAssertEqual(draft.status, "在售")
        XCTAssertTrue(draft.existingImageURLs.isEmpty && draft.newImageFiles.isEmpty)
    }

    func testEditVersusNewDraftIsDistinguishedByItemID() {
        let newDraft = ItemDraft()
        var editDraft = ItemDraft()
        editDraft.itemID = 7
        XCTAssertNil(newDraft.itemID)
        XCTAssertEqual(editDraft.itemID, 7)
    }
}

@MainActor
final class DraftStoreTests: XCTestCase {
    /// 使用独立用户 id 避免与真实草稿串扰。
    private let testUserID = 987_654_321

    override func tearDown() {
        DraftStore.shared.clear(for: testUserID)
        super.tearDown()
    }

    func testSaveLoadRoundTrip() {
        var draft = ItemDraft()
        draft.title = "测试草稿"
        draft.itemID = 3
        draft.newImageFiles = ["draft-x.jpg"]
        DraftStore.shared.save(draft, for: testUserID)

        let loaded = DraftStore.shared.load(for: testUserID)
        XCTAssertEqual(loaded, draft)
        XCTAssertEqual(loaded?.title, "测试草稿")
    }

    func testLoadReturnsNilWhenNoDraft() {
        XCTAssertNil(DraftStore.shared.load(for: testUserID))
    }

    func testClearRemovesDraft() {
        var draft = ItemDraft()
        draft.title = "待删"
        DraftStore.shared.save(draft, for: testUserID)
        XCTAssertNotNil(DraftStore.shared.load(for: testUserID))

        DraftStore.shared.clear(for: testUserID)
        XCTAssertNil(DraftStore.shared.load(for: testUserID))
    }

    func testDraftsArePartitionedByUser() {
        var a = ItemDraft(); a.title = "用户A草稿"
        var b = ItemDraft(); b.title = "用户B草稿"
        DraftStore.shared.save(a, for: 1001)
        DraftStore.shared.save(b, for: 1002)

        XCTAssertEqual(DraftStore.shared.load(for: 1001)?.title, "用户A草稿")
        XCTAssertEqual(DraftStore.shared.load(for: 1002)?.title, "用户B草稿")

        DraftStore.shared.clear(for: 1001)
        DraftStore.shared.clear(for: 1002)
    }

    func testPersistAndReadImageFile() {
        // 用一张 1x1 图片验证压缩落盘 + 读回（不依赖具体像素内容，仅验证往返非空）。
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8))
        let image = renderer.image { ctx in UIColor.red.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: 8, height: 8)) }
        let data = image.jpegData(compressionQuality: 1.0)!

        let name = DraftStore.shared.persistImage(data)
        XCTAssertNotNil(name)
        if let name {
            let readBack = DraftStore.shared.imageData(fileName: name)
            XCTAssertNotNil(readBack)
            XCTAssertFalse(readBack!.isEmpty)
            DraftStore.shared.removeImageFile(name)
            XCTAssertNil(DraftStore.shared.imageData(fileName: name))
        }
    }
}
