package com.campusmarket.app.data

import okhttp3.MultipartBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

/** 与 `docs/api.md` 一一对应的 REST 接口定义。 */
interface ApiService {

    // ---------- 认证 ----------
    @GET("api/auth/me")
    suspend fun me(): MeResponse

    @POST("api/auth/email-code")
    suspend fun sendEmailCode(@Body body: EmailCodeBody): OkResponse

    @POST("api/auth/register")
    suspend fun register(@Body body: RegisterBody): UserResponse

    @POST("api/auth/login")
    suspend fun login(@Body body: LoginBody): UserResponse

    @POST("api/auth/logout")
    suspend fun logout(): OkResponse

    @POST("api/auth/change-password")
    suspend fun changePassword(@Body body: ChangePasswordBody): OkResponse

    @POST("api/auth/forgot-password")
    suspend fun forgotPassword(@Body body: EmailCodeBody): OkResponse

    @POST("api/auth/reset-password")
    suspend fun resetPassword(@Body body: ResetPasswordBody): OkResponse

    // ---------- 商品 ----------
    @GET("api/items")
    suspend fun items(
        @Query("keyword") keyword: String? = null,
        @Query("category") category: String? = null,
        @Query("condition") condition: String? = null,
        @Query("schoolId") schoolId: String = "ruc_suzhou",
        @Query("sort") sort: String = "latest",
    ): ItemsResponse

    @GET("api/items/{id}")
    suspend fun itemDetail(@Path("id") id: Long): ItemDetailResponse

    @POST("api/items")
    suspend fun createItem(@Body body: ItemPayload): CreatedIdResponse

    @PATCH("api/items/{id}")
    suspend fun updateItem(@Path("id") id: Long, @Body body: ItemPayload): OkResponse

    @POST("api/items/{id}/favorite")
    suspend fun toggleFavorite(@Path("id") id: Long): FavoriteResponse

    @POST("api/items/{id}/comments")
    suspend fun addComment(@Path("id") id: Long, @Body body: CommentBody): CreatedIdResponse

    @POST("api/reports")
    suspend fun report(@Body body: ReportBody): CreatedIdResponse

    // ---------- 用户 ----------
    @GET("api/users/{id}")
    suspend fun userProfile(@Path("id") id: Long): ProfileResponse

    // ---------- 个人中心 ----------
    @GET("api/me/items")
    suspend fun myItems(): ItemsResponse

    @GET("api/me/favorites")
    suspend fun myFavorites(): ItemsResponse

    @GET("api/me/stats")
    suspend fun myStats(): StatsResponse

    @GET("api/me/wallet")
    suspend fun myWallet(): WalletResponse

    @PUT("api/me/profile")
    suspend fun updateProfile(@Body body: ProfileBody): UserResponse

    @Multipart
    @POST("api/me/avatar")
    suspend fun uploadAvatar(@Part avatar: MultipartBody.Part): AvatarResponse

    @Multipart
    @POST("api/uploads")
    suspend fun uploadImages(@Part images: List<MultipartBody.Part>): UrlsResponse

    @POST("api/feedback")
    suspend fun feedback(@Body body: FeedbackBody): CreatedIdResponse

    // ---------- 站内聊天 ----------
    @POST("api/conversations")
    suspend fun startConversation(@Body body: StartConversationBody): CreatedIdResponse

    @GET("api/conversations")
    suspend fun conversations(): ConversationsResponse

    @GET("api/conversations/unread-count")
    suspend fun unreadCount(): UnreadCountResponse

    @GET("api/conversations/{id}/messages")
    suspend fun messages(@Path("id") id: Long): MessagesResponse

    @POST("api/conversations/{id}/messages")
    suspend fun sendMessage(@Path("id") id: Long, @Body body: SendMessageBody): SendMessageResponse

    @POST("api/conversations/{id}/read")
    suspend fun markRead(@Path("id") id: Long): OkResponse
}
