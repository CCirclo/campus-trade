import SwiftUI
import PhotosUI
import UIKit

struct ConversationsView: View {
    @EnvironmentObject var session: SessionStore; @State private var conversations: [Conversation] = []; @State private var error: String?; @State private var loading = false
    var body: some View {
        Group {
            if session.user == nil { loginEmpty }
            else if loading && conversations.isEmpty { LoadingState() }
            else if let error, conversations.isEmpty { ErrorState(message: error) { Task { await load() } } }
            else if conversations.isEmpty { ContentUnavailableView("暂无消息", systemImage: "message", description: Text("从商品详情联系卖家后，会话会显示在这里。")) }
            else { List(conversations) { item in NavigationLink { ChatView(conversation: item) } label: { HStack(spacing: 12) { AvatarImage(url: item.partner.avatarUrl, name: item.partner.nickname); VStack(alignment: .leading) { HStack { Text(item.partner.nickname).font(.headline); Spacer(); if item.unreadCount > 0 { Text("\(item.unreadCount)").font(.caption.bold()).padding(6).background(Theme.coral).foregroundStyle(.white).clipShape(Circle()) } }; Text(item.itemTitle).font(.caption).foregroundStyle(.secondary); Text(item.lastMessage).lineLimit(1) } } } }.refreshable { await load() } }
        }.navigationTitle("商品消息").task { if session.user != nil { await load() } }
    }
    private var loginEmpty: some View { ContentUnavailableView { Label("登录后查看消息", systemImage: "message.badge") } actions: { Button("去登录") { session.showLogin = true }.buttonStyle(.borderedProminent).tint(Theme.ink) } }
    private func load() async { loading = true; defer { loading = false }; do { let r: ConversationsResponse = try await APIClient.shared.request("/api/conversations"); conversations = r.conversations; error = nil } catch { self.error = error.localizedDescription } }
}

struct ChatView: View {
    @EnvironmentObject var session: SessionStore; let conversation: Conversation
    @State private var messages: [ChatMessage] = []; @State private var text = ""; @State private var notice: String?; @State private var loading = true; @State private var sending = false
    @FocusState private var composerFocused: Bool
    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        if loading && messages.isEmpty {
                            ProgressView().padding(.top, 48)
                        } else if messages.isEmpty {
                            ContentUnavailableView("还没有消息", systemImage: "bubble.left.and.bubble.right", description: Text("发条消息开始沟通吧。")).padding(.top, 48)
                        }
                        ForEach(messages) { message in
                            HStack(alignment: .bottom) {
                                if message.mine { Spacer(minLength: 48) }
                                if message.type == "item_card", let item = message.item {
                                    ChatItemCard(item: item)
                                } else {
                                    Text(message.content).padding(.horizontal, 13).padding(.vertical, 10).background(message.mine ? Theme.ink : Color.gray.opacity(0.12)).foregroundStyle(message.mine ? .white : .primary).clipShape(RoundedRectangle(cornerRadius: 16))
                                }
                                if !message.mine { Spacer(minLength: 48) }
                            }.id(message.id)
                        }
                    }.padding().padding(.bottom, 8)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: messages.count) { _, _ in
                    if let last = messages.last { withAnimation(.easeOut(duration: 0.18)) { proxy.scrollTo(last.id, anchor: .bottom) } }
                }
            }
            HStack {
                TextField("输入消息", text: $text, axis: .vertical).focused($composerFocused).submitLabel(.send).onSubmit { Task { await send() } }
                if sending { ProgressView().controlSize(.small).frame(width: 44) }
                else { Button("发送") { Task { await send() } }.disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !session.isCampusUser) }
            }.padding().background(.bar)
        }.navigationTitle(conversation.partner.nickname).navigationBarTitleDisplayMode(.inline).task {
            await refresh()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(5)) } catch { break }
                guard !Task.isCancelled else { break }
                await refresh()
            }
        }
        .alert("发送失败", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) { Button("知道了") {} } message: { Text(notice ?? "") }
    }
    private func refresh() async { do { let r: MessagesResponse = try await APIClient.shared.request("/api/conversations/\(conversation.id)/messages"); messages = r.messages; let _: OKResponse? = try? await APIClient.shared.request("/api/conversations/\(conversation.id)/read", method: "POST") } catch { if messages.isEmpty { notice = error.localizedDescription } }; loading = false }
    private func send() async { struct P: Encodable { let content: String }; let value = text.trimmingCharacters(in: .whitespacesAndNewlines); guard !value.isEmpty, !sending else { return }; sending = true; defer { sending = false }; do { let _: IDResponse = try await APIClient.shared.request("/api/conversations/\(conversation.id)/messages", method: "POST", body: P(content: value)); text = ""; await refresh() } catch { notice = error.localizedDescription } }
}

private struct ChatItemCard: View {
    let item: ItemSnapshot
    var body: some View {
        HStack(spacing: 11) {
            AsyncImage(url: URL(string: item.image ?? "")) { phase in
                if let image = phase.image { image.resizable().scaledToFill() }
                else { ZStack { Theme.paper; Image(systemName: "shippingbox.fill").foregroundStyle(Theme.ink.opacity(0.42)) } }
            }
            .frame(width: 72, height: 72)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            VStack(alignment: .leading, spacing: 5) {
                Text("商品").font(.caption2.bold()).foregroundStyle(Theme.coral)
                Text(item.title).font(.subheadline.weight(.semibold)).lineLimit(2)
                HStack(spacing: 7) {
                    Text(priceText(item.price)).font(.subheadline.bold()).foregroundStyle(Theme.coral)
                    if let condition = item.condition, !condition.isEmpty { Text(condition).font(.caption2).foregroundStyle(.secondary) }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(9)
        .frame(width: 258, alignment: .leading)
        .background(.white, in: RoundedRectangle(cornerRadius: 17))
        .overlay(RoundedRectangle(cornerRadius: 17).stroke(Theme.ink.opacity(0.08), lineWidth: 1))
        .shadow(color: .black.opacity(0.05), radius: 8, y: 3)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("商品 \(item.title)，\(priceText(item.price))")
    }
}

struct MineView: View {
    @EnvironmentObject var session: SessionStore; @State private var stats = Stats(total: 0, selling: 0, sold: 0)
    var body: some View {
        Group {
            if let user = session.user {
                List {
                Section { HStack(spacing: 14) { AvatarImage(url: user.avatarUrl, name: user.nickname, size: 64); VStack(alignment: .leading) { Text(user.nickname).font(.title2.bold()); Text(user.email).font(.caption).foregroundStyle(.secondary); Label(user.campusVerified ? "已认证校园账号" : "非校园邮箱 · 仅可浏览", systemImage: "checkmark.shield") }.font(.caption) } }
                Section { HStack { stat("累计发布", stats.total); Divider(); stat("正在出售", stats.selling); Divider(); stat("已经售出", stats.sold) }.frame(height: 58) }
                Section { NavigationLink("编辑资料与头像", destination: ProfileEditView()); NavigationLink("我的发布", destination: ItemCollectionView(path: "/api/me/items", title: "我的发布")); NavigationLink("我的收藏", destination: ItemCollectionView(path: "/api/me/favorites", title: "我的收藏")); NavigationLink("安全交易指南", destination: SafetyView()); NavigationLink("问题反馈与建议", destination: FeedbackView()) }
                    Section { Button("退出登录", role: .destructive) { Task { await session.logout() } } }
                }
            } else {
                ContentUnavailableView {
                    Label("登录校园账号", systemImage: "person.crop.circle")
                } description: {
                    Text("管理发布、收藏并与同学沟通。")
                } actions: {
                    Button("去登录") { session.showLogin = true }.buttonStyle(.borderedProminent).tint(Theme.ink)
                }
            }
        }.navigationTitle("我的").task { if session.user != nil { let r: StatsResponse? = try? await APIClient.shared.request("/api/me/stats"); if let r { stats = r.stats } } }
    }
    private func stat(_ name: String, _ value: Int) -> some View { VStack { Text("\(value)").font(.title2.bold()); Text(name).font(.caption).foregroundStyle(.secondary) }.frame(maxWidth: .infinity) }
}

struct ProfileEditView: View {
    @EnvironmentObject var session: SessionStore
    @State private var selection: PhotosPickerItem?
    @State private var preview: UIImage?
    @State private var uploading = false
    @State private var notice: String?

    var body: some View {
        Form {
            Section {
                VStack(spacing: 14) {
                    if let preview {
                        Image(uiImage: preview).resizable().scaledToFill().frame(width: 104, height: 104).clipShape(Circle())
                    } else {
                        AvatarImage(url: session.user?.avatarUrl, name: session.user?.nickname ?? "", size: 104)
                    }
                    PhotosPicker(selection: $selection, matching: .images) {
                        Label(uploading ? "上传中…" : "选择并上传头像", systemImage: "photo.badge.plus")
                    }.disabled(uploading)
                }.frame(maxWidth: .infinity).padding(.vertical, 12)
            }
            Section { Text("头像会显示在商品详情、卖家主页和消息列表中。图片将裁切为正方形并压缩后上传。").font(.footnote).foregroundStyle(.secondary) }
        }
        .navigationTitle("编辑头像")
        .onChange(of: selection) { _, item in guard let item else { return }; Task { await upload(item) } }
        .alert("提示", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) { Button("知道了") {} } message: { Text(notice ?? "") }
    }

    private func upload(_ item: PhotosPickerItem) async {
        uploading = true; defer { uploading = false }
        do {
            guard let data = try await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else { throw APIError.server("无法读取这张图片") }
            let side = min(image.size.width, image.size.height)
            let rect = CGRect(x: (image.size.width - side) / 2, y: (image.size.height - side) / 2, width: side, height: side)
            guard let cg = image.cgImage?.cropping(to: rect), let jpeg = UIImage(cgImage: cg).preparingThumbnail(of: CGSize(width: 900, height: 900))?.jpegData(compressionQuality: 0.82) else { throw APIError.server("头像处理失败") }
            preview = UIImage(data: jpeg)
            let response = try await APIClient.shared.uploadAvatar(jpeg)
            session.user = response.user
            notice = "头像已更新"
        } catch { notice = error.localizedDescription }
    }
}

struct ItemCollectionView: View {
    let path: String; let title: String; @State private var items: [Item] = []; @State private var loading = false; @State private var error: String?
    var body: some View {
        ScrollView {
            if loading && items.isEmpty { ProgressView().frame(maxWidth: .infinity).padding(.top, 80) }
            else if let error, items.isEmpty { ErrorState(message: error) { Task { await load() } }.frame(height: 320) }
            else if items.isEmpty { ContentUnavailableView("这里还是空的", systemImage: "shippingbox") }
            else { LazyVStack(spacing: 12) { ForEach(items) { item in NavigationLink { ItemDetailView(id: item.id) } label: { ItemRow(item: item) }.buttonStyle(.plain) } }.padding().padding(.bottom, 76) }
        }.marketBackground().navigationTitle(title).toolbarBackground(Theme.paper, for: .navigationBar).toolbarBackground(.visible, for: .navigationBar).task { await load() }.refreshable { await load() }
    }
    private func load() async { loading = true; error = nil; defer { loading = false }; do { let response: ItemsResponse = try await APIClient.shared.request(path); items = response.items } catch { self.error = error.localizedDescription } }
}

struct SafetyView: View { var body: some View { List { Section("校园面交，安全第一") { Label("优先在教学楼、食堂等公共区域见面", systemImage: "building.2"); Label("确认型号、功能和成色后再付款", systemImage: "checkmark.circle"); Label("拒绝押金、保证金与陌生付款链接", systemImage: "link.badge.plus"); Label("重要约定保留在站内消息中", systemImage: "message") } }.navigationTitle("安全交易指南") } }

struct FeedbackView: View {
    @State private var type = "问题反馈"; @State private var content = ""; @State private var notice: String?
    var body: some View { Form { Picker("反馈类型", selection: $type) { ForEach(["问题反馈", "功能建议", "其他"], id: \.self) { Text($0) } }; TextField("请详细描述（至少 10 个字符）", text: $content, axis: .vertical).lineLimit(6...12); Button("提交反馈") { Task { await submit() } }.disabled(content.count < 10) }.navigationTitle("反馈与建议").alert("提示", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) { Button("知道了") {} } message: { Text(notice ?? "") } }
    private func submit() async { struct P: Encodable { let type, content: String }; do { let _: IDResponse = try await APIClient.shared.request("/api/feedback", method: "POST", body: P(type: type, content: content)); content = ""; notice = "谢谢，你的反馈已经提交。" } catch { notice = error.localizedDescription } }
}
