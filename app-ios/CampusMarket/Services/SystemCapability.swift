import Foundation
import UIKit
import AVFoundation
import Photos

// MARK: - 相机 / 相册权限与系统设置入口

/// 统一管理相机与相册授权状态，并提供「拒绝时前往系统设置」入口。
/// 用途说明已在 Info.plist 声明（NSCameraUsageDescription / NSPhotoLibraryUsageDescription）。
@MainActor
final class SystemCapability: ObservableObject {
    static let shared = SystemCapability()

    @Published private(set) var cameraAuthorized = false
    @Published private(set) var photoAuthorized = false

    /// 相机是否可用：设备有相机 + 授权（或未确定，可再请求）。
    var cameraAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    func refresh() {
        cameraAuthorized = AVCaptureDevice.authorizationStatus(for: .video) == .authorized
        let photoStatus = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        photoAuthorized = photoStatus == .authorized || photoStatus == .limited
    }

    /// 请求相机授权，返回是否已授权。
    func requestCamera() async -> Bool {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        switch status {
        case .authorized:
            cameraAuthorized = true
            return true
        case .notDetermined:
            let granted = await AVCaptureDevice.requestAccess(for: .video)
            cameraAuthorized = granted
            return granted
        default:
            cameraAuthorized = false
            return false
        }
    }

    /// 打开系统设置（作者拒绝时的引导入口）。
    func openSystemSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
}
