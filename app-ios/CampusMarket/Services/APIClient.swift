import Foundation

extension Notification.Name {
    /// 会话失效（任意接口返回 401）时广播；SessionStore 监听后统一退出并引导登录。
    static let sessionExpired = Notification.Name("CampusMarket.sessionExpired")
}

enum APIError: LocalizedError, Equatable {
    case invalidURL, invalidResponse, server(String), unauthorized
    /// 传输错误：携带本地化描述 + 可选底层 URLError 代码（供离线/超时精确归类）。
    case transport(String, URLError.Code?)
    var errorDescription: String? {
        switch self {
        case .invalidURL: return "服务地址无效"
        case .invalidResponse: return "服务器响应异常"
        case .server(let s): return s
        case .transport(let s, _): return s
        case .unauthorized: return "登录已过期，请重新登录"
        }
    }
    var transportCode: URLError.Code? {
        if case .transport(_, let code) = self { return code }
        return nil
    }
    var statusCode: Int? {
        switch self { case .unauthorized: return 401; default: return nil }
    }
}

final class APIClient: @unchecked Sendable {
    static let shared = APIClient()
    private let decoder = JSONDecoder()
    private let session: URLSession
    let baseURL: URL

    /// 从构建配置注入的 Info.plist 值读取 API 基址；Swift 源码不绑定生产环境。
    private init() {
        let configured = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String ?? ""
        guard let configuredURL = URL(string: configured), configuredURL.scheme != nil else {
            preconditionFailure("API_BASE_URL 未通过构建配置注入")
        }
        baseURL = configuredURL
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = .shared; config.httpShouldSetCookies = true; config.httpCookieAcceptPolicy = .always
        config.timeoutIntervalForRequest = 30
        #if DEBUG
        // UI 测试（`-ui-testing` 启动参数）将确定性本地桩协议注入到会话，确保不触碰真实后端。
        if let stub = UITestSupport.protocolClass {
            config.protocolClasses = [stub]
        }
        #endif
        session = URLSession(configuration: config)
    }

    /// 测试/可替换入口：注入自定义 baseURL 与 URLSession（配合 URLProtocol 桩），
    /// 用于单元测试 URL 解析、解码、服务端错误、401、超时与传输错误，不依赖真实后端。
    init(baseURL: String, session: URLSession) {
        self.baseURL = URL(string: baseURL) ?? URL(string: "https://invalid.local")!
        self.session = session
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

    /// 单张上传：返回该图 URL。供「总体/单张进度」与「失败重试」按张推进。
    func uploadSingle(_ image: Data, mimeType: String = "image/jpeg") async throws -> String {
        let urls = try await upload([(image, mimeType)])
        guard let first = urls.first else { throw APIError.server("上传返回为空") }
        return first
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
                if http.statusCode == 401 {
                    // 统一 401：广播会话失效，由 SessionStore 收回登录态并引导登录，
                    // 同时保留可恢复目标路由。调用方只需展示统一的「登录过期」提示。
                    NotificationCenter.default.post(name: .sessionExpired, object: request.url?.path)
                    throw APIError.unauthorized
                }
                let message = (try? JSONDecoder().decode(ServerError.self, from: data).error) ?? "请求失败（\(http.statusCode)）"
                throw APIError.server(message)
            }
            return try decoder.decode(T.self, from: data)
        } catch let error as APIError { throw error }
        catch let error as URLError { throw APIError.transport(error.localizedDescription, error.code) }
        catch { throw APIError.transport(error.localizedDescription, nil) }
    }

    /// 便捷方法：注册 / 注销 APNs 设备 token（登录态）。返回是否成功。
    func registerDeviceToken(_ token: String) async throws {
        struct Payload: Encodable { let token: String; let platform: String }
        let _: OKResponse = try await request("/api/push/register", method: "POST", body: Payload(token: token, platform: "ios"))
    }
    func unregisterDeviceToken(_ token: String) async throws {
        struct Payload: Encodable { let token: String; let platform: String }
        let _: OKResponse = try await request("/api/push/unregister", method: "POST", body: Payload(token: token, platform: "ios"))
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
    @Published private(set) var catalog: CampusCatalog?
    @Published var selectedScope: CampusScope?
    var isCampusUser: Bool { user?.campusVerified == true }

    /// 会话失效观察：任意接口 401 时收回登录态并引导登录（保留可恢复路由由调用处处理）。
    private nonisolated(unsafe) var expiredObserver: NSObjectProtocol?

    /// 网络客户端。默认共享实例；测试可注入桩客户端以避免真实网络。
    private let client: APIClient

    init(client: APIClient = .shared) {
        self.client = client
        expiredObserver = NotificationCenter.default.addObserver(
            forName: .sessionExpired, object: nil, queue: .main
        ) { [weak self] notification in
            let path = notification.object as? String
            Task { @MainActor in self?.handleSessionExpired(apiPath: path) }
        }
    }
    deinit {
        if let observer = expiredObserver { NotificationCenter.default.removeObserver(observer) }
    }

    private func handleSessionExpired(apiPath: String?) {
        guard user != nil else { return }
        if let apiPath, let route = DeepLinkRouter.route(fromAPIPath: apiPath) {
            PendingRouteStore.shared.save(route)
        }
        user = nil
        selectedScope = nil
        // 通知 token 注销交给异步；本地角标清零。
        Task { await NotificationManager.shared.unregisterToken() }
        showLogin = true
    }

    /// 当前生效的学校/校区范围：已登录用户优先使用服务端字段，否则用目录默认范围。
    var scope: CampusScope? {
        if let user, let schoolId = user.schoolId, let campusId = user.campusId, !schoolId.isEmpty, !campusId.isEmpty {
            return CampusScope(schoolId: schoolId, campusId: campusId)
        }
        if let selectedScope { return selectedScope }
        return catalog?.defaultScope
    }

    /// 当前展示的学校名 + 校区名；目录加载失败时回退到服务端字段或通用文案。
    var scopeTitle: String {
        let fallback = "校园好物"
        let schoolName = name(forSchool: scope?.schoolId) ?? user?.schoolName
        let campusName = name(forCampus: scope?.schoolId, campusId: scope?.campusId) ?? user?.campusName
        if let schoolName { return campusName.map { "\(schoolName) · \($0)" } ?? schoolName }
        return fallback
    }

    /// 已入驻校园邮箱域名的提示文案（用于校园用户引导，避免硬编码具体域名）。
    var campusEmailHint: String {
        if let domains = catalog?.allEmailDomains, !domains.isEmpty {
            return domains.map { "@\($0)" }.joined(separator: " / ")
        }
        return "@校园邮箱"
    }

    /// 当前学校的校区列表（用于注册选校区、个人资料切校区）。
    func campuses(forSchool schoolId: String?) -> [Campus] {
        catalog?.schools.first(where: { $0.id == schoolId })?.campuses ?? []
    }

    func name(forSchool id: String?) -> String? {
        guard let id else { return nil }
        return catalog?.schools.first(where: { $0.id == id })?.name
    }

    func name(forCampus schoolId: String?, campusId: String?) -> String? {
        guard let schoolId, let campusId else { return nil }
        return catalog?.schools.first(where: { $0.id == schoolId })?.campuses.first(where: { $0.id == campusId })?.name
    }

    func schoolId(forEmailDomain domain: String) -> String? {
        let normalized = domain.lowercased()
        return catalog?.schools.first(where: { $0.emailDomains.contains(normalized) })?.id
    }

    func restore() async {
        defer { restoring = false }
        async let catalogTask = loadCatalog()
        let response: MeResponse? = try? await client.request("/api/auth/me")
        user = response?.user
        catalog = await catalogTask
        if user != nil { await NotificationManager.shared.refreshRemoteNotificationRegistration() }
    }

    /// 加载学校目录。失败时保留 catalog 为 nil，调用方以降级文案兜底，不阻塞。
    private func loadCatalog() async -> CampusCatalog? {
        do {
            let response: CampusCatalog = try await client.request("/api/campuses")
            return response
        } catch { return nil }
    }

    func login(email: String, password: String) async throws {
        struct Payload: Encodable { let email: String; let password: String }
        let response: MeResponse = try await client.request("/api/auth/login", method: "POST", body: Payload(email: email, password: password)); user = response.user
        onSessionEstablished()
    }
    func register(email: String, password: String, nickname: String, code: String, notifications: Bool, campusId: String?) async throws {
        struct Payload: Encodable { let email, password, nickname, code: String; let campusId: String?; let emailMessageNotifications: Bool }
        let p = Payload(email: email, password: password, nickname: nickname, code: code, campusId: campusId, emailMessageNotifications: notifications)
        let response: MeResponse = try await client.request("/api/auth/register", method: "POST", body: p); user = response.user
        onSessionEstablished()
    }

    /// 登录/注册成功后：确保请求通知授权（首次）并上传已注册的 token。
    private func onSessionEstablished() {
        Task {
            _ = await NotificationManager.shared.requestAuthorization()
            await NotificationManager.shared.refreshRemoteNotificationRegistration()
        }
    }
    func logout() async { let _: OKResponse? = try? await client.request("/api/auth/logout", method: "POST"); await NotificationManager.shared.unregisterToken(); user = nil; selectedScope = nil }
    func refresh() async { let response: MeResponse? = try? await client.request("/api/auth/me"); user = response?.user }

    /// 更新个人资料：昵称、微信号、校区、邮件消息通知。成功后刷新会话用户。
    func updateProfile(nickname: String, wechatId: String, campusId: String, emailMessageNotifications: Bool) async throws {
        struct Payload: Encodable { let nickname: String; let wechatId: String; let campusId: String; let emailMessageNotifications: Bool }
        let p = Payload(nickname: nickname, wechatId: wechatId, campusId: campusId, emailMessageNotifications: emailMessageNotifications)
        let response: ProfileUpdateResponse = try await client.request("/api/me/profile", method: "PUT", body: p)
        if let updated = response.user { user = updated }
        // 同步本地默认范围（学校不变，仅校区变化），保证首页在切换后能重新加载。
        if let schoolId = user?.schoolId { selectedScope = CampusScope(schoolId: schoolId, campusId: campusId) }
    }
}
