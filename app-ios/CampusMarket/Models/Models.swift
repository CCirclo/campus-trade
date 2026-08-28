import Foundation

struct User: Codable, Identifiable {
    let id: Int; let email: String; let nickname: String
    var avatarUrl: String?; var schoolId: String?; var wechatId: String?
    var schoolName: String?; var campusId: String?; var campusName: String?
    var verified: Bool?; var campusVerified: Bool; var adminVerified: Bool?
    var emailMessageNotifications: Bool?; var role: String?
}

// 学校与校区目录：GET /api/campuses -> { schools: [...], default: { schoolId, campusId } }
struct CampusCatalog: Codable {
    let schools: [School]; let `default`: DefaultScope?
    var defaultScope: CampusScope? {
        guard let `default` else { return nil }
        return CampusScope(schoolId: `default`.schoolId, campusId: `default`.campusId)
    }
    var allEmailDomains: [String] { schools.flatMap { $0.emailDomains } }
}
struct School: Codable, Identifiable {
    let id: String; let name: String; let emailDomains: [String]; let campuses: [Campus]
    var defaultCampus: Campus? { campuses.first }
}
struct Campus: Codable, Identifiable, Hashable {
    let id: String; let name: String
}
struct DefaultScope: Codable { let schoolId: String; let campusId: String }
struct CampusScope: Codable, Hashable {
    let schoolId: String; let campusId: String
}
struct Seller: Codable, Identifiable { let id: Int; let nickname: String; var avatarUrl: String?; var verified: Bool? }
struct PublicProfile: Codable, Identifiable { let id: Int; let nickname: String; var avatarUrl: String?; var schoolName: String?; var campusName: String?; var campusVerified: Bool?; var emailVerified: Bool? }
struct Item: Codable, Identifiable {
    let id: Int; let userId: Int; var title: String; var price: Double; var images: [String]
    var category: String; var condition: String; var description: String; var schoolId: String?
    var campusId: String?; var schoolName: String?; var campusName: String?
    var status: String; var createdAt: String; var updatedAt: String?; var seller: Seller?
    var currency: String; var rmbPrice: Double?; var regions: [String]; var kind: String
}
struct Comment: Codable, Identifiable { let id: Int; let content: String; let createdAt: String; let author: CommentAuthor }
struct CommentAuthor: Codable { let id: Int; let nickname: String; var avatarUrl: String?; var verified: Bool?; var isSeller: Bool? }
struct Conversation: Codable, Identifiable {
    let id: Int; let itemId: Int; let itemTitle: String; let partner: Partner
    let lastMessage: String; let unreadCount: Int; let updatedAt: String
}
struct Partner: Codable { let nickname: String; var avatarUrl: String? }
struct ChatMessage: Codable, Identifiable {
    let id: Int; let content: String; let type: String; var item: ItemSnapshot?; var errand: ErrandCardSnapshot?; let createdAt: String; let mine: Bool; let sender: Partner
}
struct ItemSnapshot: Codable { let id: Int; let title: String; let price: Double; var image: String?; var condition: String?; var status: String? }
// 代取卡片快照（聊天 errand_card 消息），字段与 errandCardSnapshot 严格一致。
struct ErrandCardSnapshot: Codable, Identifiable {
    let id: Int; let title: String; let cargoType: String; let side: String
    let priceMin: Double?; let priceMax: Double?; let pickupLocations: [String]; let deliveryLocations: [String]
}

struct MeResponse: Codable { let user: User?; var emailConfigured: Bool? }
struct ProfileUpdateResponse: Codable { let user: User? }
struct ItemsResponse: Codable { let items: [Item]; var total: Int?; var page: Int?; var pageSize: Int?; var hasMore: Bool? }
struct ItemResponse: Codable { let item: Item; let comments: [Comment]; let favorited: Bool }
struct ProfileResponse: Codable { let profile: PublicProfile; let items: [Item] }
struct ConversationsResponse: Codable { let conversations: [Conversation] }
struct MessagesResponse: Codable { let conversation: ConversationHeader; let messages: [ChatMessage] }
struct ConversationHeader: Codable { let id: Int; let itemId: Int; let itemTitle: String }
struct StatsResponse: Codable { let stats: Stats }
struct Stats: Codable { let total: Int; let selling: Int; let sold: Int }
struct IDResponse: Codable { let id: Int }
struct FavoriteResponse: Codable { let favorited: Bool }
struct UploadResponse: Codable { let urls: [String] }
struct AvatarResponse: Codable { let avatarUrl: String; let user: User }
struct OKResponse: Codable { var ok: Bool? }

// MARK: - 钱包与流水（GET /api/me/wallet，字段与 index.ts 一致）
struct WalletBalance: Codable, Identifiable {
    let code: String; let name: String; let description: String; let balance: Double
    var id: String { code }
}
struct WalletEntry: Codable, Identifiable {
    let id: Int; let currency: String; let amount: Double; let balanceAfter: Double
    let reason: String; let operator_: String; let createdAt: String
    enum CodingKeys: String, CodingKey {
        case id, currency, amount, balanceAfter, reason, createdAt
        case operator_ = "operator"
    }
}
struct WalletResponse: Codable { let wallet: [String: WalletBalance]; let entries: [WalletEntry] }

// MARK: - 担保交易订单（GET /api/me/orders，字段与 index.ts 一致）
struct Order: Codable, Identifiable {
    let id: Int; let itemId: Int?; let itemTitle: String; let itemImage: String
    let buyerId: Int; let sellerId: Int; let currency: String; let amount: Double
    let status: String; let createdAt: String; let paidAt: String?; let completedAt: String?
    let role: String; let counterpart: OrderCounterpart
}
struct OrderCounterpart: Codable { let nickname: String; var avatarUrl: String? }
struct OrdersResponse: Codable { let orders: [Order] }

// MARK: - 成就徽章（GET /api/me/achievements）
struct Achievement: Codable, Identifiable {
    let code: String; let name: String; let description: String
    let symbol: String; let color: String; var value: Double?
    var id: String { code }
}
struct AchievementsResponse: Codable { let achievements: [Achievement] }

// 下单载荷与结果（POST /api/orders）
struct CreateOrderPayload: Encodable { let itemId: Int }

// MARK: - 快递代取（字段与 backend/server/errands.ts mapErrand 严格一致）
struct Errand: Codable, Identifiable {
    let id: Int; let userId: Int; let side: String; let cargoType: String
    let title: String; let description: String
    let priceMin: Double?; let priceMax: Double?
    let pickupLocations: [String]; let deliveryLocations: [String]
    let transportMethod: String?; let weightLimit: String; let transportTime: String
    let startsAt: String; let endsAt: String
    let schoolId: String; let campusId: String; let schoolName: String; let campusName: String
    let status: String; let createdAt: String
    let publisher: ErrandPublisher
}
struct ErrandPublisher: Codable { let id: Int; let nickname: String; let avatarUrl: String? }
struct ErrandLocations: Codable {
    let campusId: String
    let pickup: [String]; let delivery: [String]
    let cargoTypes: [String]; let transportMethods: [String]; let sides: [String]
}
struct ErrandsResponse: Codable { let errands: [Errand]; let total: Int; var page: Int?; var pageSize: Int?; var hasMore: Bool? }
struct ErrandResponse: Codable { let errand: Errand }
struct ErrandLocationsResponse: Codable { let locations: ErrandLocations }

// 发布/编辑载荷。priceMin/priceMax 与 transportMethod 可空（需求方不填运输方式），其余与 parseErrandPayload 对齐。
struct ErrandPayload: Encodable {
    let side: String; let cargoType: String; let title: String; let description: String
    let priceMin: Double?; let priceMax: Double?
    let pickupLocations: [String]; let deliveryLocations: [String]
    let transportMethod: String?; let weightLimit: String; let transportTime: String
    let startsAt: String; let endsAt: String; let campusId: String
}

enum MarketData {
    static let categories = ["教材", "电子产品", "生活用品", "服饰", "运动器材", "其他"]
    static let conditions = ["全新", "九成新", "七成新", "五成新及以下"]
    static let regions = ["苏州区", "北京区"]
    static let kinds = ["商品", "贴图"]
    static let itemStatuses = ["在售", "已售出", "已下架"]
    static let errandCargoTypes = ["快递", "外卖", "其他"]
    static let errandTransportMethods = ["步行", "自行车", "电瓶车", "摩托车"]
    static let errandStatusOptions = ["进行中", "未开始", "已完成", "已过期", "已关闭", "已下架"]
}

// 发布/编辑商品载荷（与 backend/server/index.ts itemPayload 对齐）。
// currency 缺省 cny；rmbPrice 仅在 currency==lungmen 时透传；regions 至少一项；kind 缺省 商品。
struct ItemPayload: Encodable {
    let title: String; let price: Double; let currency: String; let rmbPrice: Double?
    let regions: [String]; let kind: String
    let images: [String]; let category: String; let condition: String; let description: String
    let status: String?; let campusId: String?
}
