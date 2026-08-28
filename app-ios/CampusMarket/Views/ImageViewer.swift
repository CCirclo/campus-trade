import SwiftUI
import Photos
import UIKit

// MARK: - 商品图片查看器（分页 / 缩放 / 保存）

/// 全屏图片查看器：分页、双击/捏合缩放、拖动复位、当前页指示，以及保存到相册。
struct ImageViewerSheet: View {
    let images: [String]
    @State private var selection = 0
    @State private var saveMessage: String?
    @State private var saved = false
    @State private var showSettingsAction = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            TabView(selection: $selection) {
                ForEach(Array(images.enumerated()), id: \.offset) { index, url in
                    ZoomableRemoteImage(url: url)
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .ignoresSafeArea()
            .overlay(alignment: .bottom) { pageIndicator }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { Image(systemName: "xmark").foregroundStyle(.white).padding(8).background(.black.opacity(0.4), in: Circle()) } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { Task { await saveCurrent() } } label: { Image(systemName: "square.and.arrow.down").foregroundStyle(.white).padding(8).background(.black.opacity(0.4), in: Circle()) }.accessibilityLabel("保存当前图片")
                }
            }
            .toolbarBackground(.hidden, for: .navigationBar)
            .alert("保存图片", isPresented: Binding(get: { saveMessage != nil }, set: { if !$0 { saveMessage = nil } })) {
                if showSettingsAction {
                    Button("前往设置") {
                        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                        UIApplication.shared.open(url)
                    }
                }
                Button("知道了") {}
            } message: { Text(saveMessage ?? "") }
        }
        .preferredColorScheme(.dark)
    }

    private var pageIndicator: some View {
        Text("\(selection + 1) / \(images.count)").font(.caption.weight(.semibold)).foregroundStyle(.white).padding(.horizontal, 12).padding(.vertical, 6).background(.black.opacity(0.55), in: Capsule())
    }

    private func saveCurrent() async {
        showSettingsAction = false
        guard images.indices.contains(selection), let url = URL(string: images[selection]) else { saveMessage = "无法读取这张图片"; return }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            guard let image = UIImage(data: data) else { throw APIError.server("图片解析失败") }
            let status = await requestPhotoPermission()
            switch status {
            case .authorized, .limited:
                try await saveToPhotoLibrary(image)
                saveMessage = "已保存到相册"
            case .denied, .restricted:
                showSettingsAction = true
                saveMessage = "没有相册权限，请在系统设置中开启后重试。"
            default:
                saveMessage = "无法访问相册。"
            }
        } catch {
            saveMessage = "保存失败：\(error.localizedDescription)"
        }
    }
}

/// 单张可缩放的远程图片（双击放大、捏合缩放、缩小到 1 时复位）。
struct ZoomableRemoteImage: View {
    let url: String
    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var dragOrigin: CGSize = .zero

    var body: some View {
        GeometryReader { proxy in
            AsyncImage(url: URL(string: url)) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFit()
                        .scaleEffect(scale)
                        .offset(offset)
                        .simultaneousGesture(magnificationGesture)
                        .simultaneousGesture(dragGesture)
                        .simultaneousGesture(doubleTapGesture)
                        .frame(width: proxy.size.width, height: proxy.size.height)
                        .clipped()
                case .empty:
                    ProgressView().frame(width: proxy.size.width, height: proxy.size.height)
                case .failure:
                    ZStack { Color.gray.opacity(0.12); Image(systemName: "photo").font(.largeTitle).foregroundStyle(.secondary) }.frame(width: proxy.size.width, height: proxy.size.height)
                @unknown default: EmptyView()
                }
            }
        }
    }

    private var magnificationGesture: some Gesture {
        MagnificationGesture()
            .onChanged { value in
                let delta = value / lastScale
                lastScale = value
                scale = min(max(scale * delta, 1), 4)
            }
            .onEnded { _ in
                lastScale = 1
                if scale <= 1.05 { withAnimation(.easeOut(duration: 0.2)) { reset() } }
            }
    }

    private var doubleTapGesture: some Gesture {
        TapGesture(count: 2).onEnded {
            withAnimation(.easeInOut(duration: 0.2)) {
                if scale > 1 { reset() } else { scale = 2 }
            }
        }
    }

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                guard scale > 1 else { return }
                offset = CGSize(width: dragOrigin.width + value.translation.width,
                                height: dragOrigin.height + value.translation.height)
            }
            .onEnded { _ in
                if scale <= 1.05 {
                    withAnimation(.easeOut(duration: 0.2)) { reset() }
                } else {
                    dragOrigin = offset
                }
            }
    }

    private func reset() { scale = 1; offset = .zero; dragOrigin = .zero }
}

// MARK: - 相册保存辅助（权限 + 写入）

enum PhotoSave {
    static func requestPermission() async -> PHAuthorizationStatus {
        await withCheckedContinuation { continuation in
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in continuation.resume(returning: status) }
        }
    }
}

private func requestPhotoPermission() async -> PHAuthorizationStatus { await PhotoSave.requestPermission() }

private func saveToPhotoLibrary(_ image: UIImage) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
        PHPhotoLibrary.shared().performChanges {
            PHAssetChangeRequest.creationRequestForAsset(from: image)
        } completionHandler: { success, error in
            if success { continuation.resume() }
            else { continuation.resume(throwing: error ?? APIError.server("保存失败")) }
        }
    }
}
