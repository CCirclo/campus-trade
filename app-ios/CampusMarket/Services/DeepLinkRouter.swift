import Foundation

// MARK: - 深链 / Universal Link 解析

/// 客户端可恢复的目标路由。用于通知点击、Universal Link 分享与 401 登录后恢复。
enum AppRoute: Hashable {
    case item(Int)
    case conversation(Int)
    case errand(Int)
    case home

    /// 客户端内唯一标识，供 NavigationStack path 使用。
    var id: String {
        switch self {
        case .item(let id): return "item:\(id)"
        case .conversation(let id): return "conversation:\(id)"
        case .errand(let id): return "errand:\(id)"
        case .home: return "home"
        }
    }
}

/// 纯函数：把 URL（Universal Link 或站内路径）解析为目标路由。
/// 覆盖 `/items/:id`、`/messages/:id`（映射为会话）、`/errands/:id`。
enum DeepLinkRouter {
    /// 将触发 401 的 API 路径映射回用户正在访问的页面，用于重新登录后恢复目标。
    static func route(fromAPIPath path: String) -> AppRoute? {
        let clean = path.removingQueryAndFragment()
        let segments = clean.split(separator: "/").map(String.init)
        guard let apiIndex = segments.firstIndex(of: "api"), segments.count > apiIndex + 2 else { return nil }
        let resource = segments[apiIndex + 1]
        guard let id = Int(segments[apiIndex + 2]), id >= 1 else { return nil }
        switch resource {
        case "items": return .item(id)
        case "errands": return .errand(id)
        case "conversations": return .conversation(id)
        default: return nil
        }
    }

    static func route(from url: URL) -> AppRoute? {
        // 仅处理 http/https 或纯路径。
        guard let path = normalizedPath(from: url) else { return nil }
        return route(fromPath: path)
    }

    static func route(fromPath path: String) -> AppRoute? {
        let clean = path.trimmingCharacters(in: .whitespaces)
            .removingQueryAndFragment()
            .removingTrailingSlash()
        // 兼容路径里嵌套 base path（如 /campus-trade/items/3）。
        let segments = clean.split(separator: "/").map(String.init)
        guard segments.count >= 2 else { return nil }
        // 从尾部取「类型/id」对，兼容 /items/3 与 /campus-trade/items/3。
        let idPart = segments[segments.count - 1]
        let typePart = segments[segments.count - 2]
        guard let id = Int(idPart), id >= 1 else { return nil }
        switch typePart {
        case "items": return .item(id)
        case "messages": return .conversation(id)
        case "errands": return .errand(id)
        default: return nil
        }
    }

    /// 商品 Universal Link（分享用）。base 不含尾部斜杠。
    static func itemUniversalLink(base: String, itemId: Int) -> URL? {
        let baseTrimmed = base.hasSuffix("/") ? String(base.dropLast()) : base
        return URL(string: "\(baseTrimmed)/items/\(itemId)")
    }

    private static func normalizedPath(from url: URL) -> String? {
        if let scheme = url.scheme?.lowercased(), (scheme == "http" || scheme == "https") {
            return url.path
        }
        // 自定义 scheme 或相对路径：直接用整个字符串作为路径。
        return url.absoluteString
    }
}

private extension String {
    func removingTrailingSlash() -> String {
        var value = self
        while value.hasSuffix("/") { value = String(value.dropLast()) }
        return value
    }
    func removingQueryAndFragment() -> String {
        var value = self
        if let q = value.firstIndex(of: "?") { value = String(value[..<q]) }
        if let h = value.firstIndex(of: "#") { value = String(value[..<h]) }
        return value
    }
}
