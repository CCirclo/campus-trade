package com.campusmarket.app.data

import kotlinx.serialization.Serializable

@Serializable
data class User(
    val id: Long,
    val email: String,
    val nickname: String,
    val avatarUrl: String = "",
    val schoolId: String = "",
    val wechatId: String = "",
    val verified: Boolean = false,
    val campusVerified: Boolean = false,
    val adminVerified: Boolean = false,
    val emailMessageNotifications: Boolean = true,
    val role: String = "user",
)

@Serializable
data class Seller(
    val id: Long,
    val nickname: String,
    val avatarUrl: String = "",
    val verified: Boolean = false,
)

@Serializable
data class PublicProfile(
    val id: Long,
    val nickname: String,
    val avatarUrl: String = "",
    val campusVerified: Boolean = false,
)

@Serializable
data class Item(
    val id: Long,
    val userId: Long,
    val title: String,
    val price: Double,
    val images: List<String> = emptyList(),
    val category: String,
    val condition: String,
    val description: String = "",
    val schoolId: String = "",
    val status: String = "在售",
    val createdAt: String = "",
    val updatedAt: String = "",
    val seller: Seller? = null,
)

@Serializable
data class CommentAuthor(
    val id: Long,
    val nickname: String,
    val avatarUrl: String = "",
    val verified: Boolean = false,
    val isSeller: Boolean = false,
)

@Serializable
data class Comment(
    val id: Long,
    val content: String,
    val createdAt: String = "",
    val author: CommentAuthor,
)

@Serializable
data class Partner(
    val nickname: String,
    val avatarUrl: String = "",
)

@Serializable
data class Conversation(
    val id: Long,
    val itemId: Long,
    val itemTitle: String = "",
    val partner: Partner,
    val lastMessage: String = "",
    val unreadCount: Int = 0,
    val updatedAt: String = "",
)

@Serializable
data class ItemCardSnapshot(
    val id: Long,
    val title: String,
    val price: Double,
    val image: String = "",
    val condition: String = "",
    val status: String = "",
)

@Serializable
data class ChatMessage(
    val id: Long,
    val content: String,
    val type: String = "text",
    val item: ItemCardSnapshot? = null,
    val createdAt: String = "",
    val mine: Boolean = false,
    val sender: Partner,
)

@Serializable
data class ConversationHeader(
    val id: Long,
    val itemId: Long,
    val itemTitle: String = "",
)

@Serializable
data class Stats(val total: Int = 0, val selling: Int = 0, val sold: Int = 0)

@Serializable
data class WalletCurrency(
    val code: String,
    val name: String,
    val description: String = "",
    val balance: Long = 0,
)

@Serializable
data class WalletEntry(
    val id: Long,
    val currency: String,
    val amount: Long,
    val balanceAfter: Long = 0,
    val reason: String = "",
    val operator: String = "",
    val createdAt: String = "",
)

// ---------- 请求体 ----------

@Serializable
data class EmailCodeBody(val email: String)

@Serializable
data class RegisterBody(
    val email: String,
    val password: String,
    val nickname: String,
    val code: String,
    val emailMessageNotifications: Boolean = true,
)

@Serializable
data class LoginBody(val email: String, val password: String)

@Serializable
data class ChangePasswordBody(val currentPassword: String, val newPassword: String)

@Serializable
data class ResetPasswordBody(val email: String, val code: String, val password: String)

@Serializable
data class ItemPayload(
    val title: String,
    val price: Double,
    val category: String,
    val condition: String,
    val description: String,
    val images: List<String>,
    val status: String? = null,
)

@Serializable
data class CommentBody(val content: String)

@Serializable
data class ReportBody(val itemId: Long, val reason: String, val detail: String)

@Serializable
data class StartConversationBody(val itemId: Long)

@Serializable
data class SendMessageBody(val content: String)

@Serializable
data class ProfileBody(
    val nickname: String,
    val wechatId: String,
    val emailMessageNotifications: Boolean,
)

@Serializable
data class FeedbackBody(val type: String, val content: String)

// ---------- 响应包装 ----------

@Serializable
data class MeResponse(val user: User? = null, val emailConfigured: Boolean = false)

@Serializable
data class UserResponse(val user: User)

@Serializable
data class OkResponse(val ok: Boolean = true)

@Serializable
data class ItemsResponse(
    val items: List<Item> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 20,
    val hasMore: Boolean = false,
)

@Serializable
data class ItemDetailResponse(
    val item: Item,
    val favorited: Boolean = false,
    val comments: List<Comment> = emptyList(),
)

@Serializable
data class CreatedIdResponse(val id: Long)

@Serializable
data class FavoriteResponse(val favorited: Boolean)

@Serializable
data class ProfileResponse(val profile: PublicProfile, val items: List<Item> = emptyList())

@Serializable
data class StatsResponse(val stats: Stats)

@Serializable
data class WalletResponse(
    val wallet: Map<String, WalletCurrency> = emptyMap(),
    val entries: List<WalletEntry> = emptyList(),
)

@Serializable
data class AvatarResponse(val avatarUrl: String = "", val user: User)

@Serializable
data class UrlsResponse(val urls: List<String> = emptyList())

@Serializable
data class ConversationsResponse(val conversations: List<Conversation> = emptyList())

@Serializable
data class UnreadCountResponse(val count: Int = 0)

@Serializable
data class MessagesResponse(
    val conversation: ConversationHeader,
    val messages: List<ChatMessage> = emptyList(),
)

@Serializable
data class SendMessageResponse(val id: Long, val emailNotification: String? = null)
