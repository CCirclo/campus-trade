import Foundation

enum APIError: LocalizedError {
    case invalidURL, invalidResponse, server(String), transport(String)
    var errorDescription: String? {
        switch self { case .invalidURL: "服务地址无效"; case .invalidResponse: "服务器响应异常"; case .server(let s), .transport(let s): s }
    }
}

final class APIClient: @unchecked Sendable {
    static let shared = APIClient()
    private let decoder = JSONDecoder()
    private let session: URLSession
    let baseURL: URL

    private init() {
        let configured = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String ?? "https://20250821cdcdifc.top/campus-trade"
        baseURL = URL(string: configured) ?? URL(string: "https://20250821cdcdifc.top/campus-trade")!
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = .shared; config.httpShouldSetCookies = true; config.httpCookieAcceptPolicy = .always
        session = URLSession(configuration: config)
    }

    func request<T: Decodable>(_ path: String, method: String = "GET", body: Encodable? = nil) async throws -> T {
        guard let url = endpointURL(path) else { throw APIError.invalidURL }
        var request = URLRequest(url: url); request.httpMethod = method; request.timeoutInterval = 30
        if let body { request.httpBody = try JSONEncoder().encode(AnyEncodable(body)); request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        return try await perform(request)
    }

    func upload(_ images: [(Data, String)]) async throws -> [String] {
        let boundary = "Boundary-\(UUID().uuidString)"
        var data = Data()
        for (index, image) in images.enumerated() {
            data.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"images\"; filename=\"image-\(index).jpg\"\r\nContent-Type: \(image.1)\r\n\r\n".data(using: .utf8)!)
            data.append(image.0); data.append("\r\n".data(using: .utf8)!)
        }
        data.append("--\(boundary)--\r\n".data(using: .utf8)!)
        guard let uploadURL = endpointURL("/api/uploads") else { throw APIError.invalidURL }
        var request = URLRequest(url: uploadURL); request.httpMethod = "POST"; request.httpBody = data
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        let response: UploadResponse = try await perform(request); return response.urls
    }

    func uploadAvatar(_ image: Data) async throws -> AvatarResponse {
        let boundary = "Boundary-\(UUID().uuidString)"
        var data = Data()
        data.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"avatar\"; filename=\"avatar.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        data.append(image)
        data.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        guard let url = endpointURL("/api/me/avatar") else { throw APIError.invalidURL }
        var request = URLRequest(url: url); request.httpMethod = "POST"; request.httpBody = data
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        return try await perform(request)
    }

    private func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
            guard (200..<300).contains(http.statusCode) else {
                let message = (try? JSONDecoder().decode(ServerError.self, from: data).error) ?? "请求失败（\(http.statusCode)）"
                throw APIError.server(message)
            }
            return try decoder.decode(T.self, from: data)
        } catch let error as APIError { throw error }
        catch { throw APIError.transport(error.localizedDescription) }
    }

    private func endpointURL(_ path: String) -> URL? {
        // API is deployed below /campus-trade. A leading slash must not discard
        // that base path, so resolve a normalized relative URL against a directory URL.
        let directory = baseURL.absoluteString.hasSuffix("/") ? baseURL : baseURL.appending(path: "")
        let relativePath = path.hasPrefix("/") ? String(path.dropFirst()) : path
        return URL(string: relativePath, relativeTo: directory)?.absoluteURL
    }
}

private struct ServerError: Codable { let error: String }
private struct AnyEncodable: Encodable {
    private let encodeValue: (Encoder) throws -> Void
    init(_ value: Encodable) { encodeValue = value.encode }
    func encode(to encoder: Encoder) throws { try encodeValue(encoder) }
}

@MainActor final class SessionStore: ObservableObject {
    @Published var user: User?; @Published var restoring = true; @Published var showLogin = false
    var isCampusUser: Bool { user?.campusVerified == true }
    func restore() async {
        defer { restoring = false }
        let response: MeResponse? = try? await APIClient.shared.request("/api/auth/me")
        user = response?.user
    }
    func login(email: String, password: String) async throws {
        struct Payload: Encodable { let email: String; let password: String }
        let response: MeResponse = try await APIClient.shared.request("/api/auth/login", method: "POST", body: Payload(email: email, password: password)); user = response.user
    }
    func register(email: String, password: String, nickname: String, code: String, notifications: Bool) async throws {
        struct Payload: Encodable { let email, password, nickname, code: String; let emailMessageNotifications: Bool }
        let p = Payload(email: email, password: password, nickname: nickname, code: code, emailMessageNotifications: notifications)
        let response: MeResponse = try await APIClient.shared.request("/api/auth/register", method: "POST", body: p); user = response.user
    }
    func logout() async { let _: OKResponse? = try? await APIClient.shared.request("/api/auth/logout", method: "POST"); user = nil }
    func refresh() async { let response: MeResponse? = try? await APIClient.shared.request("/api/auth/me"); user = response?.user }
}
