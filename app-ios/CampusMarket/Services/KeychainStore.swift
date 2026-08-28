import Foundation
import Security

// MARK: - 会话安全存储

/// 用 Keychain 保存会话凭据，避免落普通偏好（UserDefaults）或日志。
/// 当前项目会话本身由 URLSession 的共享 Cookie 存储管理（httpOnly Cookie），
/// 本类负责把「可恢复目标路由」等与登录态相关的敏感信息放进 Keychain，
/// 并提供一个明确的 secureCredential 读写入口，便于后续把任何 cookie/凭据迁移到 Keychain。
final class KeychainStore: @unchecked Sendable {
    static let shared = KeychainStore()
    private let service = "com.ccirclo.ios.session"

    enum Credential: Equatable {
        case string(String)
    }

    /// 读取；Keychain 不存在时返回 nil。
    func read(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    @discardableResult
    func write(_ key: String, value: String) -> Bool {
        let data = Data(value.utf8)
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        // 已存在则更新，否则新增。
        let update: [String: Any] = [kSecValueData as String: data]
        let updateStatus = SecItemUpdate(base as CFDictionary, update as CFDictionary)
        if updateStatus == errSecSuccess { return true }
        var add = base
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }

    @discardableResult
    func delete(_ key: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        return SecItemDelete(query as CFDictionary) == errSecSuccess
    }
}

// MARK: - 可恢复目标路由（401 登录引导后恢复）

/// 会话失效时保存「用户原本想去」的路由，登录成功后恢复。
@MainActor
final class PendingRouteStore: ObservableObject {
    static let shared = PendingRouteStore()
    @Published var pendingRoute: AppRoute?

    private static let keychainKey = "pending_route"

    /// 保存可恢复路由到 Keychain（跨启动也保留，避免进程被杀丢失）。
    func save(_ route: AppRoute) {
        pendingRoute = route
        if let data = try? JSONEncoder().encode(routePayload(route)) {
            KeychainStore.shared.write(Self.keychainKey, value: data.base64EncodedString())
        }
    }

    func restoreFromStorage() {
        guard let base64 = KeychainStore.shared.read(Self.keychainKey),
              let data = Data(base64Encoded: base64),
              let payload = try? JSONDecoder().decode(RoutePayload.self, from: data) else { return }
        pendingRoute = payload.toRoute()
    }

    func clear() {
        pendingRoute = nil
        KeychainStore.shared.delete(Self.keychainKey)
    }

    private func routePayload(_ route: AppRoute) -> RoutePayload {
        switch route {
        case .item(let id): return RoutePayload(kind: "item", id: id)
        case .conversation(let id): return RoutePayload(kind: "conversation", id: id)
        case .errand(let id): return RoutePayload(kind: "errand", id: id)
        case .home: return RoutePayload(kind: "home", id: nil)
        }
    }

    private struct RoutePayload: Codable { let kind: String; let id: Int?
        func toRoute() -> AppRoute? {
            switch kind {
            case "item": return id.map(AppRoute.item)
            case "conversation": return id.map(AppRoute.conversation)
            case "errand": return id.map(AppRoute.errand)
            case "home": return .home
            default: return nil
            }
        }
    }
}
