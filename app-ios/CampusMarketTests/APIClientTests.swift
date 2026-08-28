import XCTest
@testable import CampusMarket

// APIClient 单元测试：URL 解析、成功解码、服务端错误、401、超时、传输错误。
// 全部使用 URLProtocol 桩，不依赖真实后端。使用原生 async XCTest 方法。

final class APIClientTests: XCTestCase {
    override func tearDown() {
        MockURLProtocol.handler = nil
        MockURLProtocol.lastRequest = nil
        super.tearDown()
    }

    private func makeClient(base: String = "https://example.test/campus-trade") -> APIClient {
        APIClient(baseURL: base, session: MockURLProtocol.makeSession())
    }

    private static func mock(_ json: String, status: Int = 200) -> (HTTPURLResponse, Data) {
        let url = URL(string: "https://example.test/")!
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        return (response, Data(json.utf8))
    }

    // MARK: - URL 解析

    func testEndpointURLPreservesBasePath() async throws {
        let client = makeClient(base: "https://example.test/campus-trade")
        MockURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.absoluteString, "https://example.test/campus-trade/api/items/1")
            return Self.mock(#"{"items":[]}"#)
        }
        let _: ItemsResponse = try await client.request("/api/items/1")
    }

    func testEndpointURLRelativeQueryPreserved() async throws {
        let client = makeClient(base: "https://example.test/campus-trade/")
        MockURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.absoluteString, "https://example.test/campus-trade/api/items?page=2&keyword=a")
            return Self.mock(#"{"items":[]}"#)
        }
        let _: ItemsResponse = try await client.request("/api/items?page=2&keyword=a")
    }

    func testInvalidBaseURLFallsBackWithoutCrash() {
        let client = APIClient(baseURL: "not a valid url", session: MockURLProtocol.makeSession())
        XCTAssertNotNil(client.baseURL)
    }

    // MARK: - 成功解码

    func testSuccessfulDecoding() async throws {
        let client = makeClient()
        MockURLProtocol.handler = { _ in
            Self.mock(#"{"item":{"id":18,"userId":7,"title":"教材","price":12.5,"images":[],"category":"教材","condition":"九成新","description":"","schoolId":null,"campusId":null,"schoolName":null,"campusName":null,"status":"在售","createdAt":"2026-01-01","updatedAt":null,"currency":"cny","rmbPrice":null,"regions":["苏州区"],"kind":"商品"},"comments":[],"favorited":false}"#)
        }
        let response: ItemResponse = try await client.request("/api/items/18")
        XCTAssertEqual(response.item.id, 18)
        XCTAssertEqual(response.item.title, "教材")
    }

    func testPOSTEncodesJSONBody() async throws {
        let client = makeClient()
        MockURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
            let body = Self.bodyData(from: request)
            let json = try JSONSerialization.jsonObject(with: body)
            XCTAssertEqual(json as? [String: String], ["content": "hi"])
            return Self.mock(#"{"id":9}"#)
        }
        let _: IDResponse = try await client.request("/api/conversations/3/messages", method: "POST", body: ["content": "hi"])
    }

    /// 安全读取请求体：优先 httpBody，为空时回退 httpBodyStream（禁止 try! / 强解包）。
    private static func bodyData(from request: URLRequest) -> Data {
        if let body = request.httpBody, !body.isEmpty { return body }
        if let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 1024)
            while stream.hasBytesAvailable {
                let read = stream.read(&buffer, maxLength: buffer.count)
                if read <= 0 { break }
                data.append(buffer, count: read)
            }
            return data
        }
        return Data()
    }

    // MARK: - 服务端错误

    func testServerErrorDecodesMessage() async {
        let client = makeClient()
        MockURLProtocol.handler = { _ in Self.mock(#"{"error":"余额不足"}"#, status: 400) }
        do {
            let _: IDResponse = try await client.request("/api/orders", method: "POST", body: ["itemId": 1])
            XCTFail("应当抛错")
        } catch {
            guard case APIError.server(let msg) = error else { return XCTFail("期望 server，得到 \(error)") }
            XCTAssertEqual(msg, "余额不足")
        }
    }

    func testServerErrorWithoutMessageFallsBackToStatus() async {
        let client = makeClient()
        MockURLProtocol.handler = { _ in Self.mock("service unavailable", status: 500) }
        do {
            let _: ItemsResponse = try await client.request("/api/items")
            XCTFail("应当抛错")
        } catch {
            guard case APIError.server(let msg) = error else { return XCTFail("期望 server，得到 \(error)") }
            XCTAssertEqual(msg, "请求失败（500）")
        }
    }

    // MARK: - 401

    func testUnauthorized401ThrowsAndPostsNotification() async {
        let client = makeClient()
        let exp = expectation(forNotification: .sessionExpired, object: nil, handler: nil)
        MockURLProtocol.handler = { _ in Self.mock(#"{"error":"unauthorized"}"#, status: 401) }
        do {
            let _: MeResponse = try await client.request("/api/auth/me")
            XCTFail("应当抛 401")
        } catch {
            guard case APIError.unauthorized = error else { return XCTFail("期望 unauthorized，得到 \(error)") }
        }
        await fulfillment(of: [exp], timeout: 2)
        XCTAssertEqual(MockURLProtocol.lastRequest?.url?.path, "/campus-trade/api/auth/me")
    }

    // MARK: - 超时 / 传输错误

    func testTimeoutMapsToTransportAndClassifiesAsTimeout() async {
        let client = makeClient()
        MockURLProtocol.handler = { _ in throw MockURLProtocol.transportError(.timedOut) }
        do {
            let _: ItemsResponse = try await client.request("/api/items")
            XCTFail("应当抛传输错误")
        } catch {
            guard case APIError.transport = error else { return XCTFail("期望 transport，得到 \(error)") }
            XCTAssertEqual(ErrorClassifier.classify(error), .timeout)
        }
    }

    func testOfflineMapsToTransportAndClassifiesAsOffline() async {
        let client = makeClient()
        MockURLProtocol.handler = { _ in throw MockURLProtocol.transportError(.notConnectedToInternet) }
        do {
            let _: ItemsResponse = try await client.request("/api/items")
            XCTFail("应当抛传输错误")
        } catch {
            guard case APIError.transport = error else { return XCTFail("期望 transport，得到 \(error)") }
            XCTAssertEqual(ErrorClassifier.classify(error), .offline)
        }
    }

    /// 非 HTTPURLResponse（响应异常）统一归类为服务端错误（可重试）。
    func testInvalidResponseClassifiesAsServer() {
        XCTAssertEqual(ErrorClassifier.classify(APIError.invalidResponse), .server)
        XCTAssertEqual(ErrorClassifier.classify(APIError.invalidURL), .server)
        XCTAssertFalse(APIError.invalidResponse.errorDescription?.isEmpty ?? true)
    }
}
