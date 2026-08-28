import SwiftUI
import PhotosUI
import UIKit

/// 用于测量聊天列表内容底部相对可视区距离的 PreferenceKey。
private struct ScrollBottomKey: PreferenceKey {
    static let defaultValue: CGFloat = .infinity
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

struct ConversationsView: View {
    @EnvironmentObject var session: SessionStore
    @State private var conversations: [Conversation] = []
    @State private var error: String?; @State private var loading = false
    @State private var pollerActive = false

    var body: some View {
        Group {
            if session.user == nil { loginEmpty }
            else if loading && conversations.isEmpty { LoadingState() }
            else if let error, conversations.isEmpty { ErrorState(message: error) { Task { await load() } } }
            else if conversations.isEmpty { ContentUnavailableView("暂无消息", systemImage: "message", description: Text("从商品详情联系卖家后，会话会显示在这里。")) }
            else { List(conversations) { item in NavigationLink { ChatView(conversation: item, onRead: { await reloadForRead() }) } label: { HStack(spacing: 12) { AvatarImage(url: item.partner.avatarUrl, name: item.partner.nickname); VStack(alignment: .leading) { HStack { Text(item.partner.nickname).font(.headline); Spacer(); if item.unreadCount > 0 { Text("\(item.unreadCount)").font(.caption.bold()).padding(6).background(Theme.coral).foregroundStyle(.white).clipShape(Circle()) } }; Text(item.itemTitle).font(.caption).foregroundStyle(.secondary); Text(item.lastMessage).lineLimit(1) } } } }.refreshable { await load() } }
        }.navigationTitle("商品消息")
        .task {
            if session.user != nil {
                await load()
                startPolling()
            }
        }
        .onDisappear { stopPolling() }
    }
    private var loginEmpty: some View { ContentUnavailableView { Label("登录后查看消息", systemImage: "message.badge") } actions: { Button("去登录") { session.showLogin = true }.buttonStyle(.borderedProminent).tint(Theme.ink) } }

    /// 可取消的稳定轮询：每 5 秒拉取会话列表；离开页面自动取消。
    private func startPolling() {
        stopPolling()
        pollerActive = true
        Task {
            while pollerActive && !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
                guard pollerActive, !Task.isCancelled else { return }
                await load(silent: true)
            }
        }
    }
    private func stopPolling() { pollerActive = false }

    private func load(silent: Bool = false) async {
        if !silent { loading = true }
        defer { if !silent { loading = false } }
        do {
            let r: ConversationsResponse = try await APIClient.shared.request("/api/conversations")
            conversations = r.conversations
            error = nil
            await UnreadStore.shared.refresh()
        } catch {
            if !silent { self.error = error.localizedDescription }
        }
    }
    private func reloadForRead() async { await load(silent: true) }
}

struct ChatView: View {
    @EnvironmentObject var session: SessionStore
    let conversation: Conversation
    var onRead: (() async -> Void)? = nil

    @State private var messages: [ChatMessage] = []
    @State private var pending: [LocalPendingMessage] = []
    @State private var text = ""; @State private var notice: String?; @State private var loading = true
    @State private var failedResend: LocalPendingMessage?
    @FocusState private var composerFocused: Bool
    @State private var pollerActive = false
    @State private var isNearBottom = true

    private let sendGuard = SubmitGuard()

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        if loading && messages.isEmpty {
                            ProgressView().padding(.top, 48)
                        }
                        ForEach(messages) { message in
                            messageRow(message)
                        }
                        ForEach(pending) { item in
                            pendingRow(item)
                        }
                    }
                    .padding().padding(.bottom, 8)
                    .background(
                        GeometryReader { geo in
                            Color.clear.preference(key: ScrollBottomKey.self, value: distanceFromContainerBottom(geo))
                        }
                    )
                }
                .coordinateSpace(name: "chatsv")
                .scrollDismissesKeyboard(.interactively)
                .onPreferenceChange(ScrollBottomKey.self) { distance in
                    isNearBottom = distance < 160
                }
                .onChange(of: messages.count) { _, _ in
                    guard isNearBottom, let last = lastMessageID else { return }
                    withAnimation(.easeOut(duration: 0.18)) { proxy.scrollTo(last, anchor: .bottom) }
                }
                .onChange(of: pending.count) { _, _ in
                    if isNearBottom, let last = lastMessageID { withAnimation(.easeOut(duration: 0.18)) { proxy.scrollTo(last, anchor: .bottom) } }
                }
            }
            composerBar
        }
        .navigationTitle(conversation.partner.nickname).navigationBarTitleDisplayMode(.inline)
        .task {
            await refresh()
            startPolling()
        }
        .onDisappear { stopPolling() }
        .alert("发送失败", isPresented: Binding(get: { failedResend != nil }, set: { if !$0 { failedResend = nil } })) {
            Button("重发") { if let item = failedResend { Task { await resend(item) } } }
            Button("取消", role: .cancel) {}
        } message: { Text(failedResend?.content ?? "") }
    }

    private var lastMessageID: String? {
        if let last = pending.last { return "local-\(last.localID.uuidString)" }
        if let last = messages.last { return "m-\(last.id)" }
        return nil
    }

    @ViewBuilder private func messageRow(_ message: ChatMessage) -> some View {
        HStack(alignment: .bottom) {
            if message.mine { Spacer(minLength: 48) }
            if message.type == "item_card", let item = message.item {
                ChatItemCard(item: item)
            } else if message.type == "errand_card", let errand = message.errand {
                ChatErrandCard(errand: errand)
            } else {
                Text(message.content).padding(.horizontal, 13).padding(.vertical, 10).background(message.mine ? Theme.ink : Color.gray.opacity(0.12)).foregroundStyle(message.mine ? .white : .primary).clipShape(RoundedRectangle(cornerRadius: 16))
            }
            if !message.mine { Spacer(minLength: 48) }
        }.id("m-\(message.id)")
    }

    @ViewBuilder private func pendingRow(_ item: LocalPendingMessage) -> some View {
        HStack {
            Spacer(minLength: 48)
            VStack(alignment: .trailing, spacing: 4) {
                Text(item.content).padding(.horizontal, 13).padding(.vertical, 10).background(Theme.ink).foregroundStyle(.white).clipShape(RoundedRectangle(cornerRadius: 16))
                HStack(spacing: 4) {
                    switch item.status {
                    case .sending:
                        ProgressView().controlSize(.mini)
                    case .sent:
                        Image(systemName: "checkmark").font(.caption2).foregroundStyle(.secondary)
                    case .failed(let reason):
                        Text(reason).font(.caption2).foregroundStyle(.red)
                        Button("重发") { failedResend = item }.font(.caption2.weight(.semibold)).foregroundStyle(Theme.coral)
                    case .none: EmptyView()
                    }
                }
            }
        }
        .id("local-\(item.localID.uuidString)")
    }

    private var composerBar: some View {
        HStack {
            TextField("输入消息", text: $text, axis: .vertical).focused($composerFocused).submitLabel(.send).onSubmit { Task { await send() } }
            if pending.contains(where: { $0.status == .sending }) { ProgressView().controlSize(.small).frame(width: 44) }
            else { Button("发送") { Task { await send() } }.disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !session.isCampusUser) }
        }.padding().background(.bar)
        .safeAreaInset(edge: .bottom) { Color.clear.frame(height: 0) }
        .animation(.easeOut(duration: 0.18), value: composerFocused)
    }

    private func startPolling() {
        stopPolling()
        pollerActive = true
        Task {
            while pollerActive && !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
                guard pollerActive, !Task.isCancelled else { return }
                await refresh(markRead: true)
            }
        }
    }
    private func stopPolling() { pollerActive = false }

    /// 拉取消息；`markRead` 时进入会话标记已读并同步清零未读。
    private func refresh(markRead: Bool = false) async {
        do {
            let r: MessagesResponse = try await APIClient.shared.request("/api/conversations/\(conversation.id)/messages")
            messages = r.messages
            if markRead {
                let _: OKResponse? = try? await APIClient.shared.request("/api/conversations/\(conversation.id)/read", method: "POST")
                await UnreadStore.shared.refresh()
                await onRead?()
            }
        } catch {
            if messages.isEmpty { notice = error.localizedDescription }
        }
        loading = false
    }

    /// 发送：乐观插入 + 防重复。失败保留在 pending 中展示「重发」。
    private func send() async {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, session.isCampusUser else { return }
        text = ""
        let item = LocalPendingMessage(localID: UUID(), content: value, status: .sending)
        pending.append(item)
        await deliver(item)
    }

    private func resend(_ item: LocalPendingMessage) async {
        guard let idx = pending.firstIndex(where: { $0.localID == item.localID }) else { return }
        pending[idx] = LocalPendingMessage(localID: item.localID, content: item.content, status: .sending)
        await deliver(pending[idx])
    }

    private func deliver(_ item: LocalPendingMessage) async {
        guard sendGuard.tryBegin() else { return }
        defer { sendGuard.end() }
        struct P: Encodable { let content: String }
        do {
            let _: IDResponse = try await APIClient.shared.request("/api/conversations/\(conversation.id)/messages", method: "POST", body: P(content: item.content))
            if let idx = pending.firstIndex(where: { $0.localID == item.localID }) {
                pending[idx] = LocalPendingMessage(localID: item.localID, content: item.content, status: .sent)
            }
            try? await Task.sleep(for: .milliseconds(700))
            withAnimation { pending.removeAll { $0.localID == item.localID } }
            await refresh()
        } catch {
            if let idx = pending.firstIndex(where: { $0.localID == item.localID }) {
                pending[idx] = LocalPendingMessage(localID: item.localID, content: item.content, status: .failed(error.localizedDescription))
            }
        }
    }

    private func distanceFromContainerBottom(_ geo: GeometryProxy) -> CGFloat {
        // 内容底部到 ScrollView 可视区底部的距离：用 global 坐标近似。
        // 正值表示底部还在视口下方（未滚到底），0 或负值表示已接近/越过底部。
        let contentFrame = geo.frame(in: .named("chatsv"))
        return contentFrame.maxY - contentFrame.height
    }
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
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 17).stroke(Theme.ink.opacity(0.08), lineWidth: 1))
        .shadow(color: .black.opacity(0.05), radius: 8, y: 3)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("商品 \(item.title)，\(priceText(item.price))")
    }
}

private struct ChatErrandCard: View {
    let errand: ErrandCardSnapshot
    var body: some View {
        NavigationLink { ErrandDetailView(id: errand.id) } label: {
            HStack(spacing: 11) {
                Text(errand.cargoType == "外卖" ? "🍱" : "📦").font(.title3)
                    .frame(width: 40, height: 40).background(Theme.paper, in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 5) {
                    Text("\(errandSideLabel(errand.side)) · \(errand.cargoType)").font(.caption2.bold()).foregroundStyle(Theme.coral)
                    Text(errand.title).font(.subheadline.weight(.semibold)).lineLimit(2)
                    Text(chatErrandPrice(errand)).font(.subheadline.bold()).foregroundStyle(Theme.coral)
                    Text("\(errand.pickupLocations.joined(separator: "、")) → \(errand.deliveryLocations.joined(separator: "、"))").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.tertiary)
            }
            .padding(9)
            .frame(width: 258, alignment: .leading)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 17).stroke(Theme.ink.opacity(0.08), lineWidth: 1))
            .shadow(color: .black.opacity(0.05), radius: 8, y: 3)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("代取单 \(errand.title)")
    }
    private func chatErrandPrice(_ e: ErrandCardSnapshot) -> String {
        if let min = e.priceMin, let max = e.priceMax {
            return min == max ? "¥\(fs(min))" : "¥\(fs(min)) ~ ¥\(fs(max))"
        }
        if let min = e.priceMin { return "¥\(fs(min))" }
        if let max = e.priceMax { return "¥\(fs(max)) 以内" }
        return "价格面议"
    }
    private func fs(_ v: Double) -> String { v.rounded() == v ? "\(Int(v))" : v.formatted(.number.precision(.fractionLength(2))) }
}

struct MineView: View {
    @EnvironmentObject var session: SessionStore; @State private var stats = Stats(total: 0, selling: 0, sold: 0)
    @State private var balances: [WalletBalance] = []; @State private var achievements: [Achievement] = []; @State private var recentEntries: [WalletEntry] = []
    var body: some View {
        Group {
            if let user = session.user {
                List {
                Section { HStack(spacing: 14) { AvatarImage(url: user.avatarUrl, name: user.nickname, size: 64); VStack(alignment: .leading) { Text(user.nickname).font(.title2.bold()); Text(user.email).font(.caption).foregroundStyle(.secondary); Label(user.campusVerified ? "已认证校园账号" : "非校园邮箱 · 仅可浏览", systemImage: "checkmark.shield").font(.caption); if let school = user.schoolName, let campus = user.campusName { Text("\(school) · \(campus)").font(.caption).foregroundStyle(.secondary) } } } }
                Section { HStack { stat("累计发布", stats.total); Divider(); stat("正在出售", stats.selling); Divider(); stat("已经售出", stats.sold) }.frame(height: 58) }
                if !balances.isEmpty || !achievements.isEmpty {
                    Section {
                        if !balances.isEmpty { NavigationLink { WalletView() } label: { walletSummary } }
                        if !achievements.isEmpty { NavigationLink { AchievementsView() } label: { achievementsSummary } }
                    }
                }
                Section { NavigationLink("我的钱包", destination: WalletView()); NavigationLink("我的订单", destination: OrdersView()); NavigationLink("我的成就", destination: AchievementsView()); NavigationLink("通知与权限", destination: NotificationSettingsView()); NavigationLink("编辑资料与头像", destination: ProfileEditView()); NavigationLink("我的发布", destination: ItemCollectionView(path: "/api/me/items", title: "我的发布")); NavigationLink("我的收藏", destination: ItemCollectionView(path: "/api/me/favorites", title: "我的收藏")); NavigationLink("安全交易指南", destination: SafetyView()); NavigationLink("问题反馈与建议", destination: FeedbackView()) }
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
        }.navigationTitle("我的").task { if session.user != nil { await loadAll() } }
    }
    private func stat(_ name: String, _ value: Int) -> some View { VStack { Text("\(value)").font(.title2.bold()); Text(name).font(.caption).foregroundStyle(.secondary) }.frame(maxWidth: .infinity) }

    private var walletSummary: some View {
        HStack(spacing: 12) {
            ForEach(balances) { b in
                HStack(spacing: 6) {
                    Text(b.code == "originium" ? "✨" : "💎").font(.title3)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(b.name).font(.caption).foregroundStyle(.secondary)
                        Text("\(Int(b.balance.rounded()).formatted())").font(.headline).foregroundStyle(Theme.coral)
                    }
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private var achievementsSummary: some View {
        HStack(spacing: 8) {
            ForEach(achievements.prefix(6)) { a in
                Text(a.symbol).font(.title3)
                    .frame(width: 34, height: 34)
                    .background(achievementTint(a.color).opacity(0.16), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .accessibilityLabel(a.name)
            }
            Spacer()
        }
    }

    private func loadAll() async {
        async let statsTask: StatsResponse? = try? APIClient.shared.request("/api/me/stats")
        async let walletTask: WalletResponse? = try? APIClient.shared.request("/api/me/wallet")
        async let achTask: AchievementsResponse? = try? APIClient.shared.request("/api/me/achievements")
        if let s = await statsTask { stats = s.stats }
        if let w = await walletTask { balances = MineView.orderedBalances(w.wallet); recentEntries = w.entries }
        if let a = await achTask { achievements = a.achievements }
    }

    private static func orderedBalances(_ wallet: [String: WalletBalance]) -> [WalletBalance] {
        ["lungmen", "originium"].compactMap { wallet[$0] }
    }
}

struct ProfileEditView: View {
    @EnvironmentObject var session: SessionStore
    @State private var selection: PhotosPickerItem?
    @State private var preview: UIImage?
    @State private var uploading = false
    @State private var notice: String?
    @State private var nickname = ""
    @State private var wechatId = ""
    @State private var campusId = ""
    @State private var emailNotifications = false
    @State private var saving = false
    @State private var initialized = false

    var body: some View {
        let uploadLabel = uploading ? "上传中…" : "选择并上传头像"
        Form {
            Section {
                VStack(spacing: 14) {
                    if let preview {
                        Image(uiImage: preview).resizable().scaledToFill().frame(width: 104, height: 104).clipShape(Circle())
                    } else {
                        AvatarImage(url: session.user?.avatarUrl, name: session.user?.nickname ?? "", size: 104)
                    }
                    PhotosPicker(selection: $selection, matching: .images) {
                        Label(uploadLabel, systemImage: "photo.badge.plus")
                    }.disabled(uploading)
                }.frame(maxWidth: .infinity).padding(.vertical, 12)
            }
            Section("基本资料") {
                TextField("昵称", text: $nickname)
                TextField("微信号（选填）", text: $wechatId)
                if let schoolName = session.user?.schoolName, !schoolName.isEmpty {
                    LabeledContent("所属学校", value: schoolName)
                    Text("学校由校园邮箱确定，不可自行修改。校区代表当前浏览与发布位置。")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let schoolId = session.user?.schoolId {
                    let campuses = session.campuses(forSchool: schoolId)
                    if campuses.count > 1 {
                        Picker("校区", selection: $campusId) {
                            ForEach(campuses, id: \.id) { Text($0.name).tag($0.id) }
                        }
                    } else if let campusName = session.user?.campusName, !campusName.isEmpty {
                        LabeledContent("校区", value: campusName)
                    }
                }
                Toggle("新消息邮件提醒", isOn: $emailNotifications)
            }
            Section("保存") {
                Button(saving ? "保存中…" : "保存资料") { Task { await save() } }
                    .disabled(saving || nickname.trimmingCharacters(in: .whitespaces).count < 2)
                    .frame(maxWidth: .infinity)
            }
            Section { Text("头像会显示在商品详情、卖家主页和消息列表中。图片将裁切为正方形并压缩后上传；昵称、微信号、校区与通知设置通过个人资料接口保存。").font(.footnote).foregroundStyle(.secondary) }
        }
        .navigationTitle("编辑资料")
        .onChange(of: selection) { _, item in guard let item else { return }; Task { await upload(item) } }
        .onAppear { populate() }
        .alert("提示", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) { Button("知道了") {} } message: { Text(notice ?? "") }
    }

    private func populate() {
        guard !initialized, let user = session.user else { return }
        initialized = true
        nickname = user.nickname
        wechatId = user.wechatId ?? ""
        campusId = user.campusId ?? ""
        emailNotifications = user.emailMessageNotifications ?? false
    }

    private func save() async {
        saving = true; defer { saving = false }
        let targetCampus = campusId.isEmpty ? "" : campusId
        do {
            try await session.updateProfile(nickname: nickname.trimmingCharacters(in: .whitespacesAndNewlines),
                                            wechatId: wechatId.trimmingCharacters(in: .whitespacesAndNewlines),
                                            campusId: targetCampus,
                                            emailMessageNotifications: emailNotifications)
            notice = "资料已更新"
        } catch { notice = error.localizedDescription }
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
            else { LazyVStack(spacing: 12) { ForEach(items) { item in NavigationLink { ItemDetailView(id: item.id) } label: { ItemRow(item: item) }.buttonStyle(.plain).overlay(alignment: .topTrailing) { editButton(item) } } }.padding().padding(.bottom, 76) }
        }.marketBackground().navigationTitle(title).toolbarBackground(Theme.paper, for: .navigationBar).toolbarBackground(.visible, for: .navigationBar).task { await load() }.refreshable { await load() }.onAppear { if !items.isEmpty { Task { await load() } } }
    }
    @ViewBuilder private func editButton(_ item: Item) -> some View {
        if isMine {
            NavigationLink { ItemFormView(itemID: item.id) } label: {
                Image(systemName: "square.and.pencil")
                    .font(.caption.bold()).foregroundStyle(Theme.coral)
                    .padding(8).background(.ultraThinMaterial, in: Circle())
            }.buttonStyle(.plain).accessibilityLabel("编辑 \(item.title)")
        }
    }
    private var isMine: Bool { path == "/api/me/items" }
    private func load() async { loading = true; error = nil; defer { loading = false }; do { let response: ItemsResponse = try await APIClient.shared.request(path); items = response.items } catch { self.error = error.localizedDescription } }
}

struct SafetyView: View { var body: some View { List { Section("校园面交，安全第一") { Label("优先在教学楼、食堂等公共区域见面", systemImage: "building.2"); Label("确认型号、功能和成色后再付款", systemImage: "checkmark.circle"); Label("拒绝押金、保证金与陌生付款链接", systemImage: "link.badge.plus"); Label("重要约定保留在站内消息中", systemImage: "message") } }.navigationTitle("安全交易指南") } }

struct FeedbackView: View {
    @State private var type = "问题反馈"; @State private var content = ""; @State private var notice: String?
    var body: some View { Form { Picker("反馈类型", selection: $type) { ForEach(["问题反馈", "功能建议", "其他"], id: \.self) { Text($0) } }; TextField("请详细描述（至少 10 个字符）", text: $content, axis: .vertical).lineLimit(6...12); Button("提交反馈") { Task { await submit() } }.disabled(content.count < 10) }.navigationTitle("反馈与建议").alert("提示", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) { Button("知道了") {} } message: { Text(notice ?? "") } }
    private func submit() async { struct P: Encodable { let type, content: String }; do { let _: IDResponse = try await APIClient.shared.request("/api/feedback", method: "POST", body: P(type: type, content: content)); content = ""; notice = "谢谢，你的反馈已经提交。" } catch { notice = error.localizedDescription } }
}
