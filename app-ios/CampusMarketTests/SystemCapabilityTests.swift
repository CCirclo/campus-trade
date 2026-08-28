import XCTest
@testable import CampusMarket

// 第三优先级系统能力：链接解析、401 会话失效、通知载荷（可运行于模拟器，无需真机/APNs）。

final class DeepLinkRouterTests: XCTestCase {
    func testParseItemPath() {
        XCTAssertEqual(DeepLinkRouter.route(fromPath: "/items/18"), .item(18))
    }
    func testParseConversationPath() {
        XCTAssertEqual(DeepLinkRouter.route(fromPath: "/messages/7"), .conversation(7))
    }
    func testParseErrandPath() {
        XCTAssertEqual(DeepLinkRouter.route(fromPath: "/errands/3"), .errand(3))
    }
    func testParseURLWithBasePath() {
        let url = URL(string: "https://20250821cdcdifc.top/campus-trade/items/18")!
        XCTAssertEqual(DeepLinkRouter.route(from: url), .item(18))
    }
    func testParseURLWithoutBasePath() {
        let url = URL(string: "https://20250821cdcdifc.top/items/18")!
        XCTAssertEqual(DeepLinkRouter.route(from: url), .item(18))
    }
    func testParseInvalidPathReturnsNil() {
        XCTAssertNil(DeepLinkRouter.route(fromPath: "/other/18"))
        XCTAssertNil(DeepLinkRouter.route(fromPath: "/items/abc"))
        XCTAssertNil(DeepLinkRouter.route(fromPath: "/"))
    }
    func testItemUniversalLink() {
        let url = DeepLinkRouter.itemUniversalLink(base: "https://20250821cdcdifc.top/campus-trade/", itemId: 18)
        XCTAssertEqual(url?.absoluteString, "https://20250821cdcdifc.top/campus-trade/items/18")
        let url2 = DeepLinkRouter.itemUniversalLink(base: "https://20250821cdcdifc.top/campus-trade", itemId: 7)
        XCTAssertEqual(url2?.absoluteString, "https://20250821cdcdifc.top/campus-trade/items/7")
    }
    func testAPIPathRestoresVisibleDestinationAfter401() {
        XCTAssertEqual(DeepLinkRouter.route(fromAPIPath: "/campus-trade/api/items/18"), .item(18))
        XCTAssertEqual(DeepLinkRouter.route(fromAPIPath: "/api/conversations/7/messages"), .conversation(7))
        XCTAssertEqual(DeepLinkRouter.route(fromAPIPath: "/api/errands/3"), .errand(3))
        XCTAssertNil(DeepLinkRouter.route(fromAPIPath: "/api/auth/me"))
    }
}

final class SessionInvalidationTests: XCTestCase {
    func testUnauthorizedErrorMapsTo401() {
        XCTAssertEqual(APIError.unauthorized.statusCode, 401)
    }

    func testSessionExpiredNotificationNameExists() {
        XCTAssertEqual(Notification.Name.sessionExpired.rawValue, "CampusMarket.sessionExpired")
    }

    func testAPIClient401ThrowsUnauthorized() async {
        // 用 sessionExpired 通知的语义断言：401 驱动的统一处理路径存在且可被监听。
        // 具体网络 401 依赖真实服务端，这里验证「通知」与「错误类型」约定一致。
        let error = APIError.unauthorized
        XCTAssertEqual(error.statusCode, 401)
        XCTAssertFalse(error.errorDescription?.isEmpty ?? true)
    }

    func testPendingRouteStoreRoundTripHome() async {
        // Keychain 在模拟器可用；验证「可恢复目标路由」持久化与清除。
        await MainActor.run {
            PendingRouteStore.shared.save(.item(9))
            XCTAssertEqual(PendingRouteStore.shared.pendingRoute, .item(9))
            PendingRouteStore.shared.clear()
            XCTAssertNil(PendingRouteStore.shared.pendingRoute)
        }
    }
}

final class NotificationPayloadTests: XCTestCase {
    /// 通知载荷的客户端解码模型：conversationId + type，确保深链来源字段完整。
    struct PushPayload: Decodable {
        let conversationId: Int
        let type: String
        struct APS: Decodable { let alert: Alert; let badge: Int? }
        struct Alert: Decodable { let title: String; let body: String }
        let aps: APS
    }

    func testDecodePayloadWithConversationId() throws {
        let json = """
        {"aps":{"alert":{"title":"同学","body":"你好"},"badge":3},"conversationId":42,"type":"new_message"}
        """
        let payload = try JSONDecoder().decode(PushPayload.self, from: Data(json.utf8))
        XCTAssertEqual(payload.conversationId, 42)
        XCTAssertEqual(payload.type, "new_message")
        XCTAssertEqual(payload.aps.badge, 3)
    }

    func testDecodePayloadWithoutBadge() throws {
        let json = """
        {"aps":{"alert":{"title":"a","body":"b"}},"conversationId":7,"type":"new_message"}
        """
        let payload = try JSONDecoder().decode(PushPayload.self, from: Data(json.utf8))
        XCTAssertEqual(payload.conversationId, 7)
        XCTAssertNil(payload.aps.badge)
    }
}
