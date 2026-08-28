import XCTest
@testable import CampusMarket

// SessionStore 单元测试：恢复、登录、退出、目录加载、校区切换、会话失效。
// 注入桩 APIClient，不依赖真实后端与真实登录。

@MainActor
final class SessionStoreTests: XCTestCase {
    private var store: SessionStore!
    private var client: APIClient!

    override func setUp() {
        super.setUp()
        MockURLProtocol.lastRequest = nil
        client = APIClient(baseURL: "https://example.test/campus-trade", session: MockURLProtocol.makeSession())
        store = SessionStore(client: client)
    }

    override func tearDown() {
        MockURLProtocol.handler = nil
        MockURLProtocol.lastRequest = nil
        store = nil
        client = nil
        super.tearDown()
    }

    private static func mock(_ json: String, status: Int = 200) -> (HTTPURLResponse, Data) {
        let url = URL(string: "https://example.test/")!
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        return (response, Data(json.utf8))
    }

    private static func userJSON(id: Int = 1, nickname: String = "阿鱼", school: String = "s1", campus: String = "c1", campusName: String = "独墅湖", verified: Bool = true) -> String {
        #"{"user":{"id":\#(id),"email":"a@example.edu","nickname":"\#(nickname)","schoolId":"\#(school)","campusId":"\#(campus)","schoolName":"示例大学","campusName":"\#(campusName)","campusVerified":\#(verified)}}"#
    }

    // MARK: - 恢复

    func testRestorePopulatesUserAndCatalog() async {
        MockURLProtocol.handler = { request in
            let path = request.url?.path ?? ""
            if path.hasSuffix("/auth/me") {
                return Self.mock(Self.userJSON())
            }
            if path.hasSuffix("/campuses") {
                return Self.mock(#"{"schools":[{"id":"s1","name":"示例大学","emailDomains":["example.edu"],"campuses":[{"id":"c1","name":"独墅湖"}]}],"default":{"schoolId":"s1","campusId":"c1"}}"#)
            }
            return Self.mock(#"{}"#, status: 404)
        }
        await store.restore()
        XCTAssertEqual(store.user?.nickname, "阿鱼")
        XCTAssertEqual(store.catalog?.schools.first?.name, "示例大学")
        XCTAssertFalse(store.restoring)
        XCTAssertTrue(store.isCampusUser)
        // 已登录用户 scope 优先用服务端字段。
        XCTAssertEqual(store.scope?.campusId, "c1")
    }

    func testRestoreWithoutUserKeepsGuestScope() async {
        MockURLProtocol.handler = { request in
            if request.url?.path.hasSuffix("/campuses") ?? false {
                return Self.mock(#"{"schools":[{"id":"s1","name":"示例大学","emailDomains":["example.edu"],"campuses":[{"id":"c1","name":"独墅湖"}]}],"default":{"schoolId":"s1","campusId":"c1"}}"#)
            }
            if request.url?.path.hasSuffix("/auth/me") ?? false {
                return Self.mock(#"{"user":null}"#)
            }
            return Self.mock(#"{}"#, status: 404)
        }
        await store.restore()
        XCTAssertNil(store.user)
        XCTAssertFalse(store.isCampusUser)
        // 游客使用目录默认范围。
        XCTAssertEqual(store.scope?.schoolId, "s1")
        XCTAssertEqual(store.scope?.campusId, "c1")
    }

    // MARK: - 登录 / 退出

    func testLoginSetsUser() async throws {
        MockURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertTrue(request.url?.path.hasSuffix("/auth/login") ?? false)
            return Self.mock(Self.userJSON(nickname: "登录用户"))
        }
        try await store.login(email: "a@example.edu", password: "password123")
        XCTAssertEqual(store.user?.nickname, "登录用户")
        XCTAssertTrue(store.isCampusUser)
    }

    func testLoginFailureKeepsGuestState() async {
        MockURLProtocol.handler = { _ in Self.mock(#"{"error":"邮箱或密码错误"}"#, status: 401) }
        do {
            try await store.login(email: "a@example.edu", password: "wrong")
            XCTFail("应当抛错")
        } catch {
            XCTAssertNil(store.user)
            XCTAssertFalse(store.isCampusUser)
        }
    }

    func testLogoutClearsUserAndScope() async throws {
        MockURLProtocol.handler = { _ in Self.mock(Self.userJSON()) }
        try await store.login(email: "a@example.edu", password: "password123")
        store.selectedScope = CampusScope(schoolId: "s1", campusId: "c1")

        MockURLProtocol.handler = { _ in Self.mock(#"{"ok":true}"#) }
        await store.logout()
        XCTAssertNil(store.user)
        XCTAssertNil(store.selectedScope)
        XCTAssertFalse(store.isCampusUser)
    }

    // MARK: - 目录加载降级

    func testCatalogFailureDoesNotBlockRestore() async {
        MockURLProtocol.handler = { request in
            if request.url?.path.hasSuffix("/campuses") ?? false {
                throw MockURLProtocol.transportError(.notConnectedToInternet)
            }
            return Self.mock(Self.userJSON())
        }
        await store.restore()
        // 目录失败后 catalog 为 nil，但用户仍正常恢复，不阻塞浏览。
        XCTAssertNil(store.catalog)
        XCTAssertEqual(store.user?.nickname, "阿鱼")
        XCTAssertFalse(store.restoring)
        // scope 回退到服务端字段。
        XCTAssertEqual(store.scope?.campusId, "c1")
    }

    // MARK: - 校区切换与范围

    func testScopeUsesSelectedWhenGuest() async {
        MockURLProtocol.handler = { _ in Self.mock(#"{"user":null}"#) }
        await store.restore()
        XCTAssertNil(store.user)
        store.selectedScope = CampusScope(schoolId: "s9", campusId: "c9")
        XCTAssertEqual(store.scope?.schoolId, "s9")
        XCTAssertEqual(store.scope?.campusId, "c9")
    }

    func testUpdateProfileSwitchesCampusAndSyncsScope() async throws {
        MockURLProtocol.handler = { _ in Self.mock(Self.userJSON()) }
        try await store.login(email: "a@example.edu", password: "password123")

        MockURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "PUT")
            return Self.mock(Self.userJSON(campus: "c2", campusName: "阳澄湖"))
        }
        try await store.updateProfile(nickname: "阿鱼", wechatId: "wx", campusId: "c2", emailMessageNotifications: false)
        XCTAssertEqual(store.user?.campusId, "c2")
        // 切换校区后同步本地默认范围。
        XCTAssertEqual(store.selectedScope?.campusId, "c2")
    }

    // MARK: - 会话失效

    func testSessionExpiredClearsStateAndShowsLogin() async throws {
        MockURLProtocol.handler = { _ in Self.mock(Self.userJSON()) }
        try await store.login(email: "a@example.edu", password: "password123")
        XCTAssertNotNil(store.user)

        // 广播 sessionExpired，模拟任意接口 401。
        await MainActor.run {
            NotificationCenter.default.post(name: .sessionExpired, object: "/api/items/18")
        }
        // 观察者异步处理，稍作等待。
        try? await Task.sleep(for: .milliseconds(50))
        XCTAssertNil(store.user)
        XCTAssertNil(store.selectedScope)
        XCTAssertTrue(store.showLogin)
    }
}
