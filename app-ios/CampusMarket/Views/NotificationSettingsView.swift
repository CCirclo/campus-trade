import SwiftUI
import UIKit
import Photos

// MARK: - 通知与系统权限设置页

/// 分别控制「邮件消息通知」与「系统通知」，并展示系统授权状态与相机/相册状态；
/// 授权被拒时提供前往系统设置入口。
struct NotificationSettingsView: View {
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var notifications: NotificationManager
    @StateObject private var capability = SystemCapability.shared

    @State private var emailNotifications = false
    @State private var savingEmail = false
    @State private var notice: String?
    @State private var initialized = false

    var body: some View {
        Form {
            Section {
                Toggle(isOn: $emailNotifications) {
                    Label("新消息邮件提醒", systemImage: "envelope.badge")
                }
                .disabled(savingEmail)
                .onChange(of: emailNotifications) { _, newValue in
                    guard initialized else { return }
                    Task { await saveEmailPreference(newValue) }
                }
                Text("对方超过 10 分钟未访问平台时才会发送邮件；站内消息始终即时同步。")
                    .font(.footnote).foregroundStyle(.secondary)
            } header: { Text("邮件通知") }

            Section {
                if notifications.authorizationStatus == .authorized || notifications.authorizationStatus == .provisional {
                    Label("系统通知已开启", systemImage: "bell.badge.fill").foregroundStyle(.green)
                    Label("App 图标角标随未读消息同步", systemImage: "app.badge").foregroundStyle(.secondary)
                } else if notifications.authorizationStatus == .denied {
                    Label("系统通知已关闭", systemImage: "bell.slash").foregroundStyle(.red)
                    Button("前往系统设置开启") { SystemCapability.shared.openSystemSettings() }
                } else {
                    Label("系统通知未设置", systemImage: "bell")
                    Button("允许通知") {
                        Task { _ = await notifications.requestAuthorization() }
                    }
                }
                if notifications.isRegisteredForRemoteNotifications {
                    Label("已注册远程推送", systemImage: "checkmark.seal.fill").foregroundStyle(.secondary)
                }
            } header: { Text("系统通知") }

            Section {
                cameraRow
                albumRow
            } header: { Text("相机与相册权限") } footer: {
                Text("相机用于拍摄发布商品；相册用于选择与保存商品图片。用途已在隐私说明中声明。")
            }
        }
        .navigationTitle("通知与权限")
        .onAppear { populate() }
        .alert("提示", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            Button("知道了") {}
        } message: { Text(notice ?? "") }
    }

    @ViewBuilder private var cameraRow: some View {
        if capability.cameraAvailable, capability.cameraAuthorized {
            Label("相机：已授权", systemImage: "camera.fill").foregroundStyle(.green)
        } else if capability.cameraAvailable {
            Label("相机：未授权", systemImage: "camera").foregroundStyle(.red)
            Button("前往系统设置") { SystemCapability.shared.openSystemSettings() }
        } else {
            Label("相机：此设备不可用", systemImage: "camera").foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private var albumRow: some View {
        if capability.photoAuthorized {
            Label("相册：已授权", systemImage: "photo.fill").foregroundStyle(.green)
        } else {
            Label("相册：未授权", systemImage: "photo").foregroundStyle(.red)
            Button("前往系统设置") { SystemCapability.shared.openSystemSettings() }
        }
    }

    private func populate() {
        guard !initialized, let user = session.user else { return }
        initialized = true
        emailNotifications = user.emailMessageNotifications ?? false
        Task { await notifications.refreshAuthorizationStatus(); capability.refresh() }
    }

    private func saveEmailPreference(_ value: Bool) async {
        savingEmail = true; defer { savingEmail = false }
        guard let user = session.user else { return }
        do {
            try await session.updateProfile(
                nickname: user.nickname,
                wechatId: user.wechatId ?? "",
                campusId: user.campusId ?? "",
                emailMessageNotifications: value)
        } catch {
            emailNotifications = !value // 失败回滚开关
            notice = error.localizedDescription
        }
    }
}
