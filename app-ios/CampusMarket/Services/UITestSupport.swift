import Foundation

#if DEBUG
// MARK: - UI 测试夹具（仅 Debug 生效，绝不进入生产）

/// 当 App 以 `-ui-testing` 启动（UI 测试目标通过 launchArguments 注入）时，
/// 注册一个本地 URLProtocol 桩，把网络层稳定地替换为确定性 JSON 数据。
/// 生产 Release 构建不含本文件（#if DEBUG），且即使 Debug 未带该参数也不会激活。
enum UITestSupport {
    /// 是否处于 UI 测试模式：同时识别环境变量与启动参数，任一生效即启用。
    /// 生产 Release 构建不含本文件（#if DEBUG）。
    static let isEnabled: Bool = {
        let env = ProcessInfo.processInfo.environment
        let args = ProcessInfo.processInfo.arguments
        return env["CAMPUS_MARKET_UI_TESTING"] == "1" || args.contains("-ui-testing")
    }()

    /// 供 APIClient 在构造 URLSession 时注入桩协议类；非 UI 测试返回 nil。
    static var protocolClass: AnyClass? {
        isEnabled ? UITestURLProtocol.self : nil
    }

    /// 在 App 启动最早阶段调用（App.init）。
    static func installIfNeeded() {
        #if DEBUG
        NSLog("[UITestSupport] arguments=%@ isEnabled=%d", ProcessInfo.processInfo.arguments, isEnabled ? 1 : 0)
        #endif
    }
}

/// 确定性本地网络桩：按 (method, path) 返回固定 JSON，覆盖关键流程所需接口。
final class UITestURLProtocol: URLProtocol {
    private static let stateLock = NSLock()
    private nonisolated(unsafe) static var favoritedItemIDs: Set<Int> = []

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url,
              let (status, json) = Self.fixture(method: request.httpMethod ?? "GET", url: url) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(json.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    /// 返回 (statusCode, json)。nil 表示未命中，交给上层报错。
    static func fixture(method: String, url: URL) -> (Int, String)? {
        let path = url.path
        let query = url.query ?? ""

        switch (method, path) {
        // 会话与目录
        case ("GET", path) where path.hasSuffix("/api/auth/me"):
            return (200, #"{"user":{"id":1,"email":"stu@example.edu","nickname":"测试同学","schoolId":"s1","campusId":"c1","schoolName":"示例大学","campusName":"独墅湖校区","campusVerified":true}}"#)
        case ("GET", path) where path.hasSuffix("/api/campuses"):
            return (200, #"{"schools":[{"id":"s1","name":"示例大学","emailDomains":["example.edu"],"campuses":[{"id":"c1","name":"独墅湖校区"},{"id":"c2","name":"阳澄湖校区"}]}],"default":{"schoolId":"s1","campusId":"c1"}}"#)

        // 商品列表（首页 / 搜索 / 筛选共用）
        case ("GET", path) where path.hasSuffix("/api/items"):
            return (200, itemsJSON(keyword: keyword(in: query)))

        // 商品详情
        case ("GET", path) where path.range(of: #"/api/items/\d+$"#, options: .regularExpression) != nil:
            let id = Int(path.split(separator: "/").last ?? "") ?? 1
            return (200, itemDetailJSON(id: id))

        // 收藏
        case ("POST", path) where path.range(of: #"/api/items/\d+/favorite$"#, options: .regularExpression) != nil:
            if let id = path.split(separator: "/").dropLast().last.flatMap({ Int($0) }) {
                stateLock.lock()
                favoritedItemIDs.insert(id)
                stateLock.unlock()
            }
            return (200, #"{"favorited":true}"#)

        // 我的发布 / 我的收藏
        case ("GET", path) where path.hasSuffix("/api/me/items"):
            return (200, itemsJSON())
        case ("GET", path) where path.hasSuffix("/api/me/favorites"):
            return (200, itemsJSON())

        // 我的统计 / 钱包 / 成就
        case ("GET", path) where path.hasSuffix("/api/me/stats"):
            return (200, #"{"stats":{"total":3,"selling":2,"sold":1}}"#)
        case ("GET", path) where path.hasSuffix("/api/me/wallet"):
            return (200, #"{"wallet":{},"entries":[]}"#)
        case ("GET", path) where path.hasSuffix("/api/me/achievements"):
            return (200, #"{"achievements":[]}"#)

        // 代取列表与地点
        case ("GET", path) where path.hasSuffix("/api/errands/locations"):
            return (200, #"{"locations":{"campusId":"c1","pickup":["菜鸟驿站","东门"],"delivery":["宿舍楼","教学楼"],"cargoTypes":["快递","外卖","其他"],"transportMethods":["步行","自行车"],"sides":["supply","demand"]}}"#)
        case ("GET", path) where path.hasSuffix("/api/errands"):
            return (200, errandsJSON())
        case ("GET", path) where path.range(of: #"/api/errands/\d+$"#, options: .regularExpression) != nil:
            let id = Int(path.split(separator: "/").last ?? "") ?? 1
            return (200, errandDetailJSON(id: id))
        case ("POST", path) where path.hasSuffix("/api/errands"):
            return (200, #"{"id":501}"#)

        // 会话与消息
        case ("GET", path) where path.hasSuffix("/api/conversations"):
            return (200, #"{"conversations":[{"id":1,"itemId":1,"itemTitle":"二手教材","partner":{"nickname":"卖家同学"},"lastMessage":"还在吗","unreadCount":1,"updatedAt":"2026-01-01"}]}"#)
        case ("POST", path) where path.hasSuffix("/api/conversations"):
            return (200, #"{"id":1}"#)
        case ("GET", path) where path.range(of: #"/api/conversations/\d+/messages$"#, options: .regularExpression) != nil:
            return (200, #"{"conversation":{"id":1,"itemId":1,"itemTitle":"二手教材"},"messages":[{"id":1,"content":"还在吗","type":"text","createdAt":"2026-01-01","mine":false,"sender":{"nickname":"卖家同学"}}]}"#)
        case ("POST", path) where path.range(of: #"/api/conversations/\d+/messages$"#, options: .regularExpression) != nil:
            return (200, #"{"id":2}"#)
        case ("GET", path) where path.hasSuffix("/api/conversations/unread-count"):
            return (200, #"{"count":1}"#)

        // 无需真实账号的兜底
        default:
            return nil
        }
    }

    private static func keyword(in query: String) -> String {
        guard let range = query.range(of: "keyword=") else { return "" }
        let raw = query[range.upperBound...].split(separator: "&").first ?? ""
        return raw.removingPercentEncoding ?? String(raw)
    }

    private static func itemsJSON(keyword: String = "") -> String {
        if !keyword.isEmpty {
            return #"{"items":[{"id":2,"userId":2,"title":"高等数学教材","price":20.0,"images":[],"category":"教材","condition":"九成新","description":"","status":"在售","createdAt":"2026-01-02","currency":"cny","regions":["苏州区"],"kind":"商品"}],"total":1,"page":1,"pageSize":20,"hasMore":false}"#
        }
        return #"{"items":[{"id":1,"userId":2,"title":"二手羽毛球拍","price":88.0,"images":[],"category":"运动器材","condition":"九成新","description":"几乎全新","status":"在售","createdAt":"2026-01-01","currency":"cny","regions":["苏州区"],"kind":"商品"},{"id":2,"userId":2,"title":"高等数学教材","price":20.0,"images":[],"category":"教材","condition":"九成新","description":"","status":"在售","createdAt":"2026-01-02","currency":"cny","regions":["苏州区"],"kind":"商品"}],"total":2,"page":1,"pageSize":20,"hasMore":false}"#
    }

    private static func itemDetailJSON(id: Int) -> String {
        stateLock.lock()
        let favorited = favoritedItemIDs.contains(id)
        stateLock.unlock()
        return #"{"item":{"id":\#(id),"userId":2,"title":"二手羽毛球拍","price":88.0,"images":[],"category":"运动器材","condition":"九成新","description":"几乎全新","status":"在售","createdAt":"2026-01-01","currency":"cny","regions":["苏州区"],"kind":"商品","seller":{"id":2,"nickname":"卖家同学"}},"comments":[],"favorited":\#(favorited)}"#
    }

    private static func errandsJSON() -> String {
        #"{"errands":[{"id":1,"userId":3,"side":"supply","cargoType":"快递","title":"帮取快递到东门","description":"","priceMin":3.0,"priceMax":5.0,"pickupLocations":["菜鸟驿站"],"deliveryLocations":["东门"],"transportMethod":"步行","weightLimit":"","transportTime":"","startsAt":"2026-01-01T08:00:00Z","endsAt":"2026-01-01T20:00:00Z","schoolId":"s1","campusId":"c1","schoolName":"示例大学","campusName":"独墅湖校区","status":"进行中","createdAt":"2026-01-01","publisher":{"id":3,"nickname":"代取同学"}}],"total":1}"#
    }

    private static func errandDetailJSON(id: Int) -> String {
        #"{"errand":{"id":\#(id),"userId":3,"side":"supply","cargoType":"快递","title":"帮取快递到东门","description":"","priceMin":3.0,"priceMax":5.0,"pickupLocations":["菜鸟驿站"],"deliveryLocations":["东门"],"transportMethod":"步行","weightLimit":"","transportTime":"","startsAt":"2026-01-01T08:00:00Z","endsAt":"2026-01-01T20:00:00Z","schoolId":"s1","campusId":"c1","schoolName":"示例大学","campusName":"独墅湖校区","status":"进行中","createdAt":"2026-01-01","publisher":{"id":3,"nickname":"代取同学"}}}"#
    }
}
#endif
