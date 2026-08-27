import Foundation
import UIKit

// MARK: - 图片压缩

enum ImageCompressor {
    /// 最大长边（像素）。超过则等比缩放。
    static let maxDimension: CGFloat = 1600

    /// 压缩一张图片为 JPEG：先等比缩放到 `maxDimension` 内，再按 `quality` 压缩。
    /// - 参数: data 原始图片二进制；quality JPEG 质量 0…1。
    /// - 返回: 压缩后的 JPEG 数据；输入无法解码时返回 nil。
    static func compress(_ data: Data, maxDimension: CGFloat = ImageCompressor.maxDimension, quality: CGFloat = 0.82) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let size = image.size
        let scale = min(1, maxDimension / max(size.width, size.height, 1))
        let target = CGSize(width: max(1, size.width * scale), height: max(1, size.height * scale))
        if scale < 1 {
            // 需要缩放时先重绘到目标尺寸，避免超大原图内存峰值。
            let renderer = UIGraphicsImageRenderer(size: target)
            let resized = renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: target)) }
            return resized.jpegData(compressionQuality: quality)
        }
        return image.jpegData(compressionQuality: quality)
    }
}
