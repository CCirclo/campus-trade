import Foundation
import UIKit

// MARK: - 草稿存储

/// 商品发布/编辑草稿。用于失败或意外离开后恢复表单内容。
/// - 文本字段与远程图片 URL 通过 Codable 存入 UserDefaults（小型、可编码）。
/// - 新选的本地图片压缩为 JPEG 落盘到「文件系统drafts目录」，草稿只记录文件名，
///   不把二进制图片塞进 UserDefaults。
struct ItemDraft: Codable, Equatable {
    var itemID: Int?          // 有值表示“编辑某商品”的草稿；nil 表示新建草稿
    var title: String = ""
    var price: String = ""
    var currency: String = "cny"
    var rmbPrice: String = ""
    var category: String = MarketData.categories[0]
    var condition: String = MarketData.conditions[1]
    var detail: String = ""
    var kind: String = MarketData.kinds[0]
    var regions: [String] = []
    var campusId: String = ""
    var status: String = "在售"
    var existingImageURLs: [String] = []   // 已在服务端/远程的图片（保留原 URL）
    var newImageFiles: [String] = []       // 新选本地图的落盘文件名（相对 drafts 目录）
}

/// 基于 UserDefaults + 文件系统的小型草稿存储。
/// 每个用户（按用户 id 分区）最多一份当前草稿；成功提交后调用 clear() 清理。
@MainActor
final class DraftStore {
    static let shared = DraftStore()
    private let defaults: UserDefaults
    private let draftsDir: URL
    private init() {
        defaults = UserDefaults.standard
        let root = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        draftsDir = root.appendingPathComponent("ItemDrafts", isDirectory: true)
        try? FileManager.default.createDirectory(at: draftsDir, withIntermediateDirectories: true)
    }

    // 每个用户独立分区，避免不同账号间草稿串扰。
    private func key(for userId: Int?) -> String { "item-draft-\(userId ?? 0)" }

    func load(for userId: Int?) -> ItemDraft? {
        guard let data = defaults.data(forKey: key(for: userId)),
              let draft = try? JSONDecoder().decode(ItemDraft.self, from: data) else { return nil }
        return draft
    }

    func save(_ draft: ItemDraft, for userId: Int?) {
        let data = try? JSONEncoder().encode(draft)
        defaults.set(data, forKey: key(for: userId))
    }

    func clear(for userId: Int?) {
        if let draft = load(for: userId) {
            for file in draft.newImageFiles { try? FileManager.default.removeItem(at: draftsDir.appendingPathComponent(file)) }
        }
        defaults.removeObject(forKey: key(for: userId))
    }

    /// 将本地图片压缩（等比缩放 + JPEG）后落盘，返回文件名。失败返回 nil。
    func persistImage(_ data: Data) -> String? {
        guard let jpeg = ImageCompressor.compress(data) else { return nil }
        let name = "draft-\(UUID().uuidString).jpg"
        let url = draftsDir.appendingPathComponent(name)
        do { try jpeg.write(to: url, options: .atomic); return name } catch { return nil }
    }

    /// 读取已落盘的本地图片二进制。
    func imageData(fileName: String) -> Data? {
        try? Data(contentsOf: draftsDir.appendingPathComponent(fileName))
    }

    /// 删除单个本地图片文件（删除或替换图片时调用）。
    func removeImageFile(_ fileName: String) {
        try? FileManager.default.removeItem(at: draftsDir.appendingPathComponent(fileName))
    }
}
