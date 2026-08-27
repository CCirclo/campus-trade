import Foundation

// MARK: - 统一错误分类

/// 统一把 APIError 归类为「离线 / 超时 / 空 / 服务端失败」等可展示、可重试的状态。
enum FailureKind: Equatable {
    case offline      // 无网络
    case timeout      // 超时
    case server       // 服务端错误（带状态码或业务错误信息）
    case empty        // 空数据（不是错误，但需要空状态）
    case transport    // 其他传输错误

    var message: String {
        switch self {
        case .offline: return "当前网络不可用，请检查网络连接。"
        case .timeout: return "请求超时，请稍后重试。"
        case .server: return "服务开小差了，请稍后重试。"
        case .empty: return "这里暂时还没有内容。"
        case .transport: return "网络出了点问题，请重试。"
        }
    }
}

enum ErrorClassifier {
    /// 把任意 Error / 可读信息归类为 FailureKind。
    static func classify(_ error: Error?) -> FailureKind {
        guard let error else { return .server }
        if let api = error as? APIError {
            switch api {
            case .invalidURL, .invalidResponse: return .server
            case .server: return .server
            case .unauthorized: return .server // 401 由会话层统一处理，显示「登录已过期」。
            case .transport(let s, let code):
                if let code { return classifyURLError(code) }
                return classifyMessage(s)
            }
        }
        if let urlError = error as? URLError { return classifyURLError(urlError.code) }
        return classifyMessage(error.localizedDescription)
    }

    /// 按 URLError.Code 精确归类（不依赖字符串猜测）。
    static func classifyURLError(_ code: URLError.Code) -> FailureKind {
        switch code {
        case .timedOut: return .timeout
        case .notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost,
             .cannotFindHost, .dnsLookupFailed, .dataNotAllowed, .internationalRoamingOff:
            return .offline
        default: return .transport
        }
    }

    /// 把 `error.localizedDescription` 转成 FailureKind，供离线/超时识别。
    static func classifyMessage(_ message: String) -> FailureKind {
        let m = message.lowercased()
        let offlineHints = ["offline", "not connected", "无法连接到", "无网络", "网络连接已断开", "似乎已断开", "internet connection appears to be offline", "the network connection was lost", "网络连接丢失"]
        let timeoutHints = ["timed out", "timeout", "超时", "请求已超时", "the request timed out"]
        if offlineHints.contains(where: { m.contains($0.lowercased()) }) { return .offline }
        if timeoutHints.contains(where: { m.contains($0.lowercased()) }) { return .timeout }
        return .transport
    }
}
