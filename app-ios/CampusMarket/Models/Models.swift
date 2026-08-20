import Foundation

struct User: Codable, Identifiable {
    let id: Int; let email: String; let nickname: String
    var avatarUrl: String?; var schoolId: String?; var wechatId: String?
    var verified: Bool?; var campusVerified: Bool; var adminVerified: Bool?
    var emailMessageNotifications: Bool?; var role: String?
}
struct Seller: Codable, Identifiable { let id: Int; let nickname: String; var avatarUrl: String?; var verified: Bool? }
struct PublicProfile: Codable, Identifiable { let id: Int; let nickname: String; var avatarUrl: String?; var campusVerified: Bool?; var emailVerified: Bool? }
struct Item: Codable, Identifiable {
    let id: Int; let userId: Int; var title: String; var price: Double; var images: [String]
    var category: String; var condition: String; var description: String; var schoolId: String?
    var status: String; var createdAt: String; var updatedAt: String?; var seller: Seller?
}
struct Comment: Codable, Identifiable { let id: Int; let content: String; let createdAt: String; let author: CommentAuthor }
struct CommentAuthor: Codable { let id: Int; let nickname: String; var avatarUrl: String?; var verified: Bool?; var isSeller: Bool? }
struct Conversation: Codable, Identifiable {
    let id: Int; let itemId: Int; let itemTitle: String; let partner: Partner
    let lastMessage: String; let unreadCount: Int; let updatedAt: String
}
struct Partner: Codable { let nickname: String; var avatarUrl: String? }
struct ChatMessage: Codable, Identifiable {
    let id: Int; let content: String; let type: String; var item: ItemSnapshot?; let createdAt: String; let mine: Bool; let sender: Partner
}
struct ItemSnapshot: Codable { let id: Int; let title: String; let price: Double; var image: String?; var condition: String?; var status: String? }

struct MeResponse: Codable { let user: User?; var emailConfigured: Bool? }
struct ItemsResponse: Codable { let items: [Item]; var total: Int? }
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

enum MarketData {
    static let categories = ["教材", "电子产品", "生活用品", "服饰", "运动器材", "其他"]
    static let conditions = ["全新", "九成新", "七成新", "五成新及以下"]
}
