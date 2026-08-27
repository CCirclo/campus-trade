import SwiftUI

struct RootView: View {
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var notifications: NotificationManager
    @EnvironmentObject var pendingRoute: PendingRouteStore
    @StateObject private var unread = UnreadStore.shared
    @State private var routedDestination: AppRoute?

    var body: some View {
        Group {
            if session.restoring { LoadingState() } else {
                TabView {
                    NavigationStack { HomeView() }.tabItem { Label("首页", systemImage: "house") }
                    NavigationStack { ErrandListView() }.tabItem { Label("代取", systemImage: "shippingbox") }
                    NavigationStack { PublishView() }.tabItem { Label("发布", systemImage: "plus.circle") }
                    NavigationStack { ConversationsView() }.tabItem { Label("消息", systemImage: "message") }.badge(unread.count)
                    NavigationStack { MineView() }.tabItem { Label("我的", systemImage: "person") }
                }
                .toolbarBackground(.ultraThinMaterial, for: .tabBar)
                .toolbarBackground(.visible, for: .tabBar)
            }
        }
        .sheet(isPresented: $session.showLogin) { NavigationStack { AuthView() } }
        .fullScreenCover(item: $routedDestination) { route in
            NavigationStack { RoutedDestinationView(route: route) }
        }
        .onChange(of: session.user?.id) { _, _ in
            if session.user != nil { unread.startPolling(); Task { await unread.refresh() } }
            else { unread.stopPolling() }
        }
        .onChange(of: notifications.pendingDeepLink) { _, route in
            guard let route else { return }
            notifications.pendingDeepLink = nil
            if session.user == nil {
                pendingRoute.save(route)
                session.showLogin = true
            } else {
                routedDestination = route
            }
        }
        .onChange(of: pendingRoute.pendingRoute) { _, route in
            guard let route, session.user != nil else { return }
            pendingRoute.clear()
            routedDestination = route
        }
        .onOpenURL { url in
            // Universal Link / 自定义 scheme 深链：解析为目标路由并物化。
            guard let route = DeepLinkRouter.route(from: url) else { return }
            if session.user == nil {
                // 未登录：保存目标，登录后恢复。
                pendingRoute.save(route)
                session.showLogin = true
            } else {
                routedDestination = route
            }
        }
    }
}

extension AppRoute: Identifiable {}

/// 把深链目标物化为一个可导航页面；命中失败（如会话不存在）时降级为商品详情/首页。
struct RoutedDestinationView: View {
    let route: AppRoute
    @Environment(\.dismiss) private var dismiss
    @State private var loading = true
    @State private var conversation: Conversation?

    var body: some View {
        Group {
            switch route {
            case .item(let id):
                ItemDetailView(id: id)
            case .errand(let id):
                ErrandDetailView(id: id)
            case .conversation(let id):
                // 会话需要对方昵称等信息；用会话列表回填后进入聊天，失败降级到消息列表。
                conversationDestination(id: id)
            case .home:
                HomeView()
            }
        }
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("关闭") { dismiss() } } }
    }

    @ViewBuilder private func conversationDestination(id: Int) -> some View {
        if let conversation {
            ChatView(conversation: conversation)
        } else if loading {
            ProgressView().task { await loadConversation(id: id) }
        } else {
            EmptyView()
        }
    }

    private func loadConversation(id: Int) async {
        loading = true; defer { loading = false }
        let response: ConversationsResponse? = try? await APIClient.shared.request("/api/conversations")
        if let match = response?.conversations.first(where: { $0.id == id }) {
            conversation = match
        }
    }
}

@MainActor final class HomeModel: ObservableObject {
    @Published var items: [Item] = []; @Published var loading = false; @Published var error: String?
    @Published var loadingMore = false
    @Published var search = ""; @Published var category = ""; @Published var sort = "latest"
    @Published var condition = ""; @Published var region = ""
    @Published var searchHistory: [String] = []
    @Published var showHistory = false

    /// 当前范围（由 HomeView 在 scope/user 变化时传入）。
    private var schoolId: String?; private var campusId: String?

    private let pageSize = 20
    private var page = 1
    private var hasMore = false
    private var history = SearchHistoryStore()

    /// 防抖：搜索输入连续变化时只在停顿后真正发起请求。
    private let debouncer = Debouncer(delay: .milliseconds(350))

    /// 竞态保护：保证旧响应不能覆盖新查询。
    private let race = LatestRequestGuard()

    func setScope(schoolId: String?, campusId: String?) {
        self.schoolId = schoolId; self.campusId = campusId
    }

    func loadHistory(userId: Int?) {
        searchHistory = history.entries(for: userId)
    }
    func submitSearch(userId: Int?) {
        var h = history
        h.record(search, for: userId)
        searchHistory = h.entries(for: userId)
        showHistory = false
        Task { await reload() }
    }
    func clearHistory(userId: Int?) {
        var h = history; h.clear(for: userId)
        searchHistory = h.entries(for: userId)
    }
    func useHistory(_ term: String) {
        search = term
        showHistory = false
        Task { await reload() }
    }

    /// 刷新/重置：清空游标与列表，重新从第一页拉取。
    func reload() async {
        await debouncer.cancel()
        page = 1; hasMore = false
        loading = true; error = nil; defer { loading = false }
        await fetch(append: false)
    }

    /// 搜索输入防抖触发：取消上一次未执行的请求，延迟后重新加载。
    func searchChanged() {
        showHistory = search.isEmpty
        Task { [self] in
            await debouncer.call { [weak self] in await self?.reload() }
        }
    }

    /// 无限滚动加载下一页（分页去重）。
    func loadNext() async {
        guard hasMore, !loading, !loadingMore else { return }
        loadingMore = true; defer { loadingMore = false }
        await fetch(append: true)
    }

    private func fetch(append: Bool) async {
        let handle = await race.begin()
        var parts: [String] = []
        if let schoolId { parts.append("schoolId=\(q(schoolId))") }
        if let campusId { parts.append("campusId=\(q(campusId))") }
        parts.append("sort=\(q(sort))")
        parts.append("page=\(page)")
        parts.append("pageSize=\(pageSize)")
        if !search.isEmpty { parts.append("keyword=\(q(search))") }
        if !category.isEmpty { parts.append("category=\(q(category))") }
        if !condition.isEmpty { parts.append("condition=\(q(condition))") }
        if !region.isEmpty { parts.append("region=\(q(region))") }
        do {
            let response: ItemsResponse = try await APIClient.shared.request("/api/items?" + parts.joined(separator: "&"))
            guard let committed = await race.commit(response.items, for: handle) else { return }
            if append {
                items = mergePage(items, appending: dedicated(committed))
            } else {
                items = dedicated(committed)
            }
            page = (response.page ?? page) + 1
            hasMore = response.hasMore ?? (items.count < (response.total ?? 0))
            error = nil
        } catch {
            let _ = await race.commit([Item](), for: handle)
            if !append || items.isEmpty { self.error = error.localizedDescription }
        }
    }
    private func q(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? s }
    private func dedicated(_ list: [Item]) -> [Item] { deduplicated(list) }
}

struct HomeView: View {
    @EnvironmentObject var session: SessionStore
    @StateObject private var model = HomeModel()
    @State private var showFilters = false
    private let columns = [GridItem(.adaptive(minimum: 158, maximum: 230), spacing: 14)]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                heroHeader
                searchBar
                ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 8) { categoryButton("全部"); ForEach(MarketData.categories, id: \.self, content: categoryButton) }.padding(.vertical, 2) }
                sortAndFilterRow
                if model.loading && model.items.isEmpty { ProgressView().frame(maxWidth: .infinity).padding(60) }
                else if let error = model.error { ErrorState(message: error) { Task { await reload() } }.frame(height: 280) }
                else if model.items.isEmpty { ContentUnavailableView("暂无好物", systemImage: "shippingbox", description: Text("换个关键词试试吧")) }
                else { itemGrid }
            }.padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 76).marketContentWidth(alignment: .leading)
        }.marketBackground().navigationTitle("校园闲置").navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.ultraThinMaterial, for: .navigationBar).toolbarBackground(.visible, for: .navigationBar)
        .navigationDestination(for: Int.self) { ItemDetailView(id: $0) }
        .task {
            model.setScope(schoolId: session.scope?.schoolId, campusId: session.scope?.campusId)
            model.loadHistory(userId: session.user?.id)
            if model.items.isEmpty { await reload() }
        }
        .refreshable { await reload() }
        .onChange(of: session.selectedScope) { _, _ in model.setScope(schoolId: session.scope?.schoolId, campusId: session.scope?.campusId); Task { await reload() } }
        .onChange(of: session.user?.id) { _, _ in model.loadHistory(userId: session.user?.id); Task { await reload() } }
        .sheet(isPresented: $showFilters) {
            NavigationStack { FilterPanelView(model: model, onApply: { showFilters = false; Task { await reload() } }) }
        }
    }

    private var heroHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(session.scopeTitle, systemImage: "building.columns.fill").font(.caption.bold()).foregroundStyle(Theme.coral)
            Text("让闲置，在校园里\n继续被喜欢。")
                .font(.system(.largeTitle, design: .rounded, weight: .bold)).foregroundStyle(Theme.ink).minimumScaleFactor(0.82)
            Text("只看同校真实好物，聊好细节，再当面交易。").font(.subheadline).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(20)
        .background(LinearGradient(colors: [Theme.ink.opacity(0.12), Theme.coral.opacity(0.08), Theme.surface], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(Theme.separator, lineWidth: 0.5))
    }

    private var searchBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").foregroundStyle(Theme.ink)
                TextField("搜索教材、数码或宿舍好物", text: $model.search).submitLabel(.search)
                    .onSubmit { model.submitSearch(userId: session.user?.id) }
                    .onChange(of: model.search) { _, _ in model.searchChanged() }
                if !model.search.isEmpty {
                    Button { model.search = ""; model.showHistory = true; Task { await reload() } } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.tertiary) }.accessibilityLabel("清除搜索词")
                }
                Button { model.submitSearch(userId: session.user?.id) } label: { Image(systemName: "arrow.right").font(.headline).frame(width: 38, height: 38).background(Theme.ink, in: Circle()).foregroundStyle(Color(uiColor: .systemBackground)) }.buttonStyle(MarketPressStyle()).accessibilityLabel("搜索")
            }.padding(8).padding(.leading, 6).background(Theme.surface).clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous)).overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Theme.separator, lineWidth: 0.5))
            if model.showHistory && !model.searchHistory.isEmpty {
                historyPanel
            }
        }
    }

    private var historyPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack { Text("搜索历史").font(.caption).foregroundStyle(.secondary); Spacer(); Button("清除") { model.clearHistory(userId: session.user?.id) }.font(.caption).foregroundStyle(Theme.coral) }
            FlowLayout(spacing: 8) {
                ForEach(model.searchHistory, id: \.self) { term in
                    Button { model.useHistory(term) } label: {
                        Text(term).font(.caption).padding(.horizontal, 12).padding(.vertical, 6).background(Theme.elevated, in: Capsule()).foregroundStyle(.primary)
                    }.buttonStyle(MarketPressStyle())
                }
            }
        }.padding(12).background(Theme.surface).clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var sortAndFilterRow: some View {
        HStack {
            Label("校内限定 · 当面验货再交易", systemImage: "shield.checkered").foregroundStyle(Theme.ink)
            Spacer()
            Button { showFilters = true } label: {
                Label("筛选", systemImage: "slider.horizontal.3").font(.subheadline.weight(.semibold))
                    .foregroundStyle(hasActiveFilter ? Color.white : Theme.ink)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(hasActiveFilter ? Theme.coral : Theme.surface, in: Capsule())
            }.buttonStyle(MarketPressStyle())
        }.font(.subheadline)
    }
    private var hasActiveFilter: Bool { !model.category.isEmpty || !model.condition.isEmpty || !model.region.isEmpty || model.sort != "latest" }

    private var itemGrid: some View {
        LazyVGrid(columns: columns, spacing: 14) {
            ForEach(model.items) { item in
                NavigationLink(value: item.id) { ItemCard(item: item) }.buttonStyle(.plain)
                    .onAppear { if item.id == model.items.last?.id { Task { await loadNext() } } }
            }
            if model.loadingMore { ProgressView().padding(.vertical, 18).frame(maxWidth: .infinity) }
        }
    }

    private func reload() async { await model.reload() }
    private func loadNext() async { await model.loadNext() }
    private func categoryButton(_ title: String) -> some View {
        let value = title == "全部" ? "" : title
        let selected = model.category == value
        return Button(title) { model.category = value; Task { await reload() } }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(selected ? Color.white : Theme.ink)
            .padding(.horizontal, 14).padding(.vertical, 9)
            .background(selected ? Theme.coral : Theme.surface, in: Capsule())
            .overlay(Capsule().stroke(Theme.ink.opacity(selected ? 0 : 0.12), lineWidth: 1))
            .buttonStyle(MarketPressStyle())
    }
}

/// 筛选面板：覆盖分类、成色、排序和适用范围。
struct FilterPanelView: View {
    @ObservedObject var model: HomeModel
    var onApply: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            Section("分类") { ForEach([""] + MarketData.categories, id: \.self) { c in selectionRow(c.isEmpty ? "全部" : c, selected: model.category == c) { model.category = c } } }
            Section("成色") { ForEach([""] + MarketData.conditions, id: \.self) { c in selectionRow(c.isEmpty ? "全部" : c, selected: model.condition == c) { model.condition = c } } }
            Section("排序") {
                Picker("排序", selection: $model.sort) {
                    Text("最新").tag("latest"); Text("价格↑").tag("priceAsc"); Text("价格↓").tag("priceDesc")
                }
            }
            Section("适用范围") {
                ForEach([""] + MarketData.regions, id: \.self) { r in selectionRow(r.isEmpty ? "不限" : r, selected: model.region == r) { model.region = r } }
            }
            Section { Button("应用筛选") { onApply(); dismiss() }.frame(maxWidth: .infinity) }
        }.navigationTitle("筛选").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } } }
    }
    private func selectionRow(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button { action() } label: {
            HStack { Text(title).foregroundStyle(.primary); Spacer(); if selected { Image(systemName: "checkmark").foregroundStyle(Theme.coral) } }
        }
    }
}

struct ItemDetailView: View {
    @EnvironmentObject var session: SessionStore; let id: Int
    @State private var response: ItemResponse?; @State private var error: String?; @State private var comment = ""; @State private var notice: String?
    @State private var chatDestination: Conversation?
    @State private var contacting = false
    @State private var manageBusy = false
    @State private var confirmStatus: String?
    @State private var confirmDelete = false
    @State private var deleted = false
    @State private var confirmOrder = false
    @State private var ordering = false
    @State private var showViewer = false
    var body: some View {
        Group {
            if let response {
                ScrollView { VStack(alignment: .leading, spacing: 18) {
                    if response.item.images.isEmpty {
                        RemoteImage(url: nil, height: 300)
                    } else {
                        TabView { ForEach(response.item.images, id: \.self) { RemoteImage(url: $0, height: 300) } }
                            .frame(height: 300).tabViewStyle(.page)
                            .onTapGesture { showViewer = true }
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 8) {
                            Text(statusLabel(response.item.status)).font(.caption.bold())
                                .padding(.horizontal, 8).padding(.vertical, 4)
                                .background(statusColor(response.item.status).opacity(0.14), in: Capsule())
                                .foregroundStyle(statusColor(response.item.status))
                            Spacer()
                        }
                        Text(priceText(response.item.price)).font(.largeTitle.bold()).foregroundStyle(Theme.coral)
                        Text(response.item.title).font(.title.bold()); Text("\(response.item.category) · \(response.item.condition) · 同校面交").foregroundStyle(.secondary)
                        if let seller = response.item.seller {
                            NavigationLink { SellerProfileView(userID: seller.id) } label: {
                                HStack(spacing: 12) {
                                    AvatarImage(url: seller.avatarUrl, name: seller.nickname, size: 52)
                                    VStack(alignment: .leading, spacing: 4) {
                                        HStack(spacing: 6) {
                                            Text(seller.nickname).font(.headline).foregroundStyle(.primary)
                                            if seller.verified == true { Image(systemName: "checkmark.seal.fill").font(.caption).foregroundStyle(Theme.coral).accessibilityLabel("已认证") }
                                        }
                                        Text(itemCampusLabel(response.item) + " · 查看主页").font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.tertiary)
                                }
                                .padding(12)
                                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
                            }.buttonStyle(.plain)
                        }
                        Text(response.item.description).frame(maxWidth: .infinity, alignment: .leading)
                        HStack(spacing: 10) { Button(response.favorited ? "已收藏" : "收藏", systemImage: response.favorited ? "heart.fill" : "heart") { Task { await favorite() } }.buttonStyle(.bordered).tint(Theme.coral); Button(contacting ? "正在连接…" : "联系卖家", systemImage: "message") { Task { await chat() } }.buttonStyle(.borderedProminent).tint(Theme.ink).disabled(contacting) }.controlSize(.large)
                        if showsOrderEntry { orderEntry(response.item) }
                        if isOwner { ownerActions(response.item) }
                        Divider(); Text("留言").font(.title2.bold())
                        ForEach(response.comments) { c in VStack(alignment: .leading) { Text(c.author.nickname).font(.subheadline.bold()); Text(c.content) }.padding(.vertical, 4) }
                        HStack { TextField("写下你的留言", text: $comment); Button("发送") { Task { await sendComment() } }.disabled(comment.trimmingCharacters(in: .whitespaces).count < 2) }.padding().background(Theme.surface).clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }.padding().padding(.bottom, 82)
                } }
            } else if let error { ErrorState(message: error) { Task { await load() } } } else { LoadingState() }
        }.marketBackground().navigationTitle(deleted ? "商品详情" : "商品详情").navigationBarTitleDisplayMode(.inline).toolbarBackground(Theme.paper, for: .navigationBar).toolbarBackground(.visible, for: .navigationBar).task { await load() }
        .toolbar {
            if let url = shareLink {
                ToolbarItem(placement: .topBarTrailing) { ShareLink(item: url) }
            }
        }
        .navigationDestination(isPresented: Binding(get: { chatDestination != nil }, set: { if !$0 { chatDestination = nil } })) {
            if let chatDestination { ChatView(conversation: chatDestination) }
        }
        .fullScreenCover(isPresented: $showViewer) {
            if let response, !response.item.images.isEmpty { ImageViewerSheet(images: response.item.images) }
        }
        .alert("提示", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) { Button("知道了") {} } message: { Text(notice ?? "") }
        .confirmationDialog(statusConfirmTitle, isPresented: Binding(get: { confirmStatus != nil }, set: { if !$0 { confirmStatus = nil } }), titleVisibility: .visible) {
            if let target = confirmStatus {
                Button(statusConfirmAction(target), role: statusConfirmRole(target)) { Task { await changeStatus(to: target) } }
                Button("取消", role: .cancel) {}
            }
        } message: { Text(statusConfirmMessage) }
        .confirmationDialog("确定删除这个商品？", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("删除", role: .destructive) { Task { await deleteItem() } }
            Button("取消", role: .cancel) {}
        } message: { Text("删除后不可恢复，相关收藏、留言与订单关联也会一并清理。") }
        .confirmationDialog(orderConfirmTitle, isPresented: $confirmOrder, titleVisibility: .visible) {
            Button("支付并下单") { Task { await placeOrder() } }
            Button("取消", role: .cancel) {}
        } message: { Text(orderConfirmMessage) }
    }
    private var isOwner: Bool { session.user?.id == response?.item.userId }

    /// 商品 Universal Link：已安装 App 打开商品详情，未安装回落 Web 页面。
    private var shareLink: URL? {
        DeepLinkRouter.itemUniversalLink(base: ItemDetailView.webBase, itemId: id)
    }
    private static let webBase = (Bundle.main.object(forInfoDictionaryKey: "WEB_BASE_URL") as? String)
        ?? "http://127.0.0.1:5173/campus-trade"

    /// 仅对后端支持在线支付的币种（原石 lungmen）且可购买状态显示下单入口。
    private var showsOrderEntry: Bool {
        guard let item = response?.item else { return false }
        return item.currency == "lungmen" && item.status == "在售" && !isOwner
    }

    private var orderConfirmTitle: String {
        guard let item = response?.item else { return "确认下单" }
        return "用 \(Int(item.price.rounded())) 原石购买？"
    }
    private var orderConfirmMessage: String {
        guard let item = response?.item else { return "" }
        return "将使用 \(Int(item.price.rounded())) 原石购买「\(item.title)」。支付后货款先由平台担保，确认收货后才打给卖家。"
    }

    @ViewBuilder private func orderEntry(_ item: Item) -> some View {
        Button {
            if requireCampus() { confirmOrder = true }
        } label: {
            Label(ordering ? "下单中…" : "下单购买（\(Int(item.price.rounded())) 原石）", systemImage: "cart.badge.plus")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent).tint(Theme.coral)
        .controlSize(.large)
        .disabled(ordering)
    }

    private func placeOrder() async {
        guard let item = response?.item else { return }
        ordering = true; defer { ordering = false }
        struct P: Encodable { let itemId: Int }
        do {
            let _: IDResponse = try await APIClient.shared.request("/api/orders", method: "POST", body: P(itemId: item.id))
            notice = "下单成功，可在「我的订单」中查看担保交易进度。"
        } catch {
            let msg = error.localizedDescription
            // 余额不足 / 本人商品 / 非法状态 等由后端状态机返回，逐字透传。
            notice = msg
        }
    }

    @ViewBuilder private func ownerActions(_ item: Item) -> some View {
        VStack(spacing: 10) {
            NavigationLink { ItemFormView(itemID: item.id) } label: {
                Label("编辑", systemImage: "square.and.pencil").frame(maxWidth: .infinity)
            }.buttonStyle(.bordered).tint(Theme.coral)
            switch item.status {
            case "在售":
                Button { confirmStatus = "已下架" } label: { Label("下架", systemImage: "arrow.down.circle").frame(maxWidth: .infinity) }.buttonStyle(.bordered).tint(Theme.ink).disabled(manageBusy)
                Button { confirmStatus = "已售出" } label: { Label("标记售出", systemImage: "checkmark.circle").frame(maxWidth: .infinity) }.buttonStyle(.bordered).tint(.green).disabled(manageBusy)
            case "已下架":
                Button { confirmStatus = "在售" } label: { Label("重新上架", systemImage: "arrow.up.circle").frame(maxWidth: .infinity) }.buttonStyle(.bordered).tint(Theme.ink).disabled(manageBusy)
                Button { confirmStatus = "已售出" } label: { Label("标记售出", systemImage: "checkmark.circle").frame(maxWidth: .infinity) }.buttonStyle(.bordered).tint(.green).disabled(manageBusy)
            case "已售出":
                Button { confirmStatus = "在售" } label: { Label("重新上架", systemImage: "arrow.up.circle").frame(maxWidth: .infinity) }.buttonStyle(.bordered).tint(Theme.ink).disabled(manageBusy)
            default: EmptyView()
            }
            Button(role: .destructive) { confirmDelete = true } label: {
                Label("删除", systemImage: "trash").frame(maxWidth: .infinity)
            }.buttonStyle(.bordered).tint(.red).disabled(manageBusy)
        }.controlSize(.large)
    }

    private var statusConfirmTitle: String {
        switch confirmStatus { case "在售": return "重新上架这个商品？"; case "已下架": return "下架这个商品？"; case "已售出": return "标记为已售出？"; default: return "确认操作" }
    }
    private var statusConfirmMessage: String {
        switch confirmStatus { case "在售": return "商品将重新对校区同学可见。"; case "已下架": return "下架后其他同学将无法看到这个商品。"; case "已售出": return "标记售出后商品将下线，且记录为已成交。"; default: return "" }
    }
    private func statusConfirmAction(_ s: String) -> String {
        switch s { case "在售": return "重新上架"; case "已下架": return "下架"; case "已售出": return "标记售出"; default: return "确定" }
    }
    private func statusConfirmRole(_ s: String) -> ButtonRole? { s == "在售" ? nil : .destructive }

    private func statusLabel(_ s: String) -> String {
        switch s { case "在售": return "在售中"; case "已售出": return "已售出"; case "已下架": return "已下架"; default: return s }
    }
    private func statusColor(_ s: String) -> Color {
        switch s { case "在售": return .green; case "已售出": return Theme.ink; case "已下架": return .secondary; default: return .secondary }
    }

    private func requireCampus() -> Bool { if session.user == nil { session.showLogin = true; return false }; if !session.isCampusUser { notice = "仅通过 \(session.campusEmailHint) 验证的校园用户可以进行此操作。"; return false }; return true }
    private func itemCampusLabel(_ item: Item) -> String {
        if let school = item.schoolName, !school.isEmpty {
            if let campus = item.campusName, !campus.isEmpty { return "\(school) · \(campus)" }
            return school
        }
        return session.scopeTitle
    }
    private func statusPayload(_ item: Item, status: String) -> ItemPayload {
        ItemPayload(title: item.title, price: item.price, currency: item.currency.isEmpty ? "cny" : item.currency,
                    rmbPrice: item.rmbPrice, regions: item.regions.isEmpty ? MarketData.regions : item.regions,
                    kind: item.kind.isEmpty ? "商品" : item.kind, images: item.images, category: item.category,
                    condition: item.condition, description: item.description, status: status, campusId: item.campusId)
    }
    private func load() async { do { response = try await APIClient.shared.request("/api/items/\(id)") } catch { self.error = error.localizedDescription } }
    private func favorite() async { guard requireCampus() else { return }; do { let _: FavoriteResponse = try await APIClient.shared.request("/api/items/\(id)/favorite", method: "POST"); await load() } catch { notice = error.localizedDescription } }
    private func changeStatus(to status: String) async {
        guard let item = response?.item else { return }
        manageBusy = true; defer { manageBusy = false }
        do {
            let _: OKResponse = try await APIClient.shared.request("/api/items/\(id)", method: "PATCH", body: statusPayload(item, status: status))
            notice = statusNotice(status)
            await load()
        } catch { notice = error.localizedDescription }
    }
    private func statusNotice(_ s: String) -> String {
        switch s { case "在售": return "已重新上架"; case "已下架": return "已下架"; case "已售出": return "已标记为售出"; default: return "操作成功" }
    }
    private func deleteItem() async {
        manageBusy = true; defer { manageBusy = false }
        do {
            let _: OKResponse = try await APIClient.shared.request("/api/items/\(id)", method: "DELETE")
            notice = "商品已删除。"
            deleted = true
        } catch { notice = error.localizedDescription }
    }
    private func chat() async {
        guard requireCampus(), let item = response?.item, let seller = item.seller else { return }
        struct P: Encodable { let itemId: Int }
        contacting = true; defer { contacting = false }
        do {
            let result: IDResponse = try await APIClient.shared.request("/api/conversations", method: "POST", body: P(itemId: id))
            chatDestination = Conversation(id: result.id, itemId: item.id, itemTitle: item.title, partner: Partner(nickname: seller.nickname, avatarUrl: seller.avatarUrl), lastMessage: "", unreadCount: 0, updatedAt: "")
        } catch { notice = error.localizedDescription }
    }
    private func sendComment() async { guard requireCampus() else { return }; struct P: Encodable { let content: String }; do { let _: IDResponse = try await APIClient.shared.request("/api/items/\(id)/comments", method: "POST", body: P(content: comment)); comment = ""; await load() } catch { notice = error.localizedDescription } }
}

struct SellerProfileView: View {
    let userID: Int
    @State private var response: ProfileResponse?
    @State private var error: String?

    var body: some View {
        Group {
            if let response {
                ScrollView {
                    VStack(spacing: 18) {
                        VStack(spacing: 10) {
                            AvatarImage(url: response.profile.avatarUrl, name: response.profile.nickname, size: 88)
                            HStack(spacing: 6) {
                                Text(response.profile.nickname).font(.title2.bold())
                                if response.profile.campusVerified == true || response.profile.emailVerified == true {
                                    Image(systemName: "checkmark.seal.fill").foregroundStyle(Theme.coral).accessibilityLabel("已认证")
                                }
                            }
                            Label(sellerCampusLabel(response.profile), systemImage: "building.columns").font(.subheadline).foregroundStyle(.secondary)
                            Text("主页仅展示昵称、头像、认证状态和当前在售商品。").font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(22)
                        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))

                        HStack { Text("TA 的在售好物").font(.title3.bold()); Spacer(); Text("\(response.items.count) 件").font(.subheadline).foregroundStyle(.secondary) }
                        if response.items.isEmpty {
                            ContentUnavailableView("暂无在售商品", systemImage: "shippingbox")
                        } else {
                            LazyVStack(spacing: 12) {
                                ForEach(response.items) { item in
                                    NavigationLink { ItemDetailView(id: item.id) } label: { ItemRow(item: item) }.buttonStyle(.plain)
                                }
                            }
                        }
                    }.padding().padding(.bottom, 76)
                }
            } else if let error {
                ErrorState(message: error) { Task { await load() } }
            } else { LoadingState() }
        }
        .marketBackground()
        .navigationTitle("卖家主页")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.paper, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .task { await load() }
    }

    private func load() async {
        do { response = try await APIClient.shared.request("/api/users/\(userID)"); error = nil }
        catch { self.error = error.localizedDescription }
    }
    private func sellerCampusLabel(_ profile: PublicProfile) -> String {
        if let school = profile.schoolName, let campus = profile.campusName, !school.isEmpty { return campus.isEmpty ? school : "\(school) · \(campus)" }
        return "校园同学"
    }
}
