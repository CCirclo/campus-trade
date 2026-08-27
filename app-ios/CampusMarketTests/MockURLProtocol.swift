import Foundation
import XCTest
@testable import CampusMarket

// MARK: - 网络桩（URLProtocol）

/// 可编程的 URLProtocol 桩：按 path 匹配返回预置响应，覆盖成功解码 / 服务端错误 / 401 / 超时 / 传输错误。
final class MockURLProtocol: URLProtocol {
    /// 全局路由：path（含查询前部分，如 /api/items/1）-> 返回 handler。
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    /// 记录最近一次请求，便于断言请求 method / path / body。
    nonisolated(unsafe) static var lastRequest: URLRequest?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lastRequest = request
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
            return
        }
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch let error as URLError {
            client?.urlProtocol(self, didFailWithError: error)
        } catch {
            // 其它错误：作为传输错误回传（NSError，模拟底层网络异常）。
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

extension MockURLProtocol {
    static func makeSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        return URLSession(configuration: config)
    }

    /// 便捷：构造 200 JSON 响应。
    static func ok(_ json: String, status: Int = 200) -> (HTTPURLResponse, Data) {
        let url = URL(string: "https://example.test/")!
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        return (response, Data(json.utf8))
    }

    /// 便捷：构造传输错误（例如超时 / 网络断开），使用真实 URLError 以便 localizedDescription 可被 ErrorClassifier 识别。
    static func transportError(_ code: URLError.Code) -> URLError {
        URLError(code)
    }
}
