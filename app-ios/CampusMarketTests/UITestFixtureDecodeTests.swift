import XCTest
@testable import CampusMarket

// UI 测试夹具的模型解码校验：逐个校验 fixture 返回的 JSON 能解码为真实模型，
// 避免 UI 层因缺字段静默丢弃数据。仅 Debug 构建可用（UITestSupport 在 #if DEBUG 下）。

#if DEBUG
final class UITestFixtureDecodeTests: XCTestCase {
    private func fixture(_ method: String, _ path: String) -> Data {
        let url = URL(string: "https://example.test" + path)!
        let (status, json) = UITestURLProtocol.fixture(method: method, url: url) ?? (0, "")
        XCTAssertEqual(status, 200, "fixture 未命中 \(method) \(path)")
        return Data(json.utf8)
    }

    func testMeResponseDecodes() throws {
        let data = fixture("GET", "/campus-trade/api/auth/me")
        let me = try JSONDecoder().decode(MeResponse.self, from: data)
        XCTAssertEqual(me.user?.nickname, "测试同学")
        XCTAssertEqual(me.user?.campusVerified, true)
    }

    func testCampusesDecode() throws {
        let data = fixture("GET", "/campus-trade/api/campuses")
        let catalog = try JSONDecoder().decode(CampusCatalog.self, from: data)
        XCTAssertEqual(catalog.schools.first?.name, "示例大学")
        XCTAssertEqual(catalog.defaultScope?.campusId, "c1")
    }

    func testItemsDecode() throws {
        let data = fixture("GET", "/campus-trade/api/items")
        let items = try JSONDecoder().decode(ItemsResponse.self, from: data)
        XCTAssertEqual(items.items.count, 2)
        XCTAssertEqual(items.items.first?.title, "二手羽毛球拍")
    }

    func testItemDetailDecodes() throws {
        let data = fixture("GET", "/campus-trade/api/items/1")
        let detail = try JSONDecoder().decode(ItemResponse.self, from: data)
        XCTAssertEqual(detail.item.title, "二手羽毛球拍")
        XCTAssertEqual(detail.item.seller?.nickname, "卖家同学")
    }

    func testErrandsDecode() throws {
        let data = fixture("GET", "/campus-trade/api/errands")
        let errands = try JSONDecoder().decode(ErrandsResponse.self, from: data)
        XCTAssertEqual(errands.errands.count, 1)
        XCTAssertEqual(errands.errands.first?.title, "帮取快递到东门")
        XCTAssertEqual(errands.total, 1)
    }

    func testErrandDetailDecodes() throws {
        let data = fixture("GET", "/campus-trade/api/errands/1")
        let detail = try JSONDecoder().decode(ErrandResponse.self, from: data)
        XCTAssertEqual(detail.errand.title, "帮取快递到东门")
        XCTAssertEqual(detail.errand.status, "进行中")
    }

    func testErrandLocationsDecode() throws {
        let data = fixture("GET", "/campus-trade/api/errands/locations?campusId=c1")
        let loc = try JSONDecoder().decode(ErrandLocationsResponse.self, from: data)
        XCTAssertEqual(loc.locations.campusId, "c1")
        XCTAssertTrue(loc.locations.pickup.contains("菜鸟驿站"))
    }

    func testConversationsDecode() throws {
        let data = fixture("GET", "/campus-trade/api/conversations")
        let conversations = try JSONDecoder().decode(ConversationsResponse.self, from: data)
        XCTAssertEqual(conversations.conversations.count, 1)
        XCTAssertEqual(conversations.conversations.first?.partner.nickname, "卖家同学")
    }

    func testMessagesDecode() throws {
        let data = fixture("GET", "/campus-trade/api/conversations/1/messages")
        let messages = try JSONDecoder().decode(MessagesResponse.self, from: data)
        XCTAssertEqual(messages.messages.count, 1)
        XCTAssertEqual(messages.messages.first?.content, "还在吗")
    }
}
#endif
