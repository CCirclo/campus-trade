import SwiftUI

// MARK: - 快递代取

/// 代取详情导航路由值
struct ErrandRoute: Hashable { let errandID: Int }

/// 供给/需求中文标签
func errandSideLabel(_ side: String) -> String { side == "supply" ? "代取服务" : "取件需求" }

/// 状态色相（与 Web statusTone 一致）
func errandStatusColor(_ status: String) -> Color {
    switch status {
    case "进行中": return .green
    case "未开始": return .blue
    case "已完成": return Theme.ink
    case "已过期", "已关闭", "已下架": return .secondary
    default: return .secondary
    }
}

private func errandPriceRange(_ e: Errand) -> String {
    if let min = e.priceMin, let max = e.priceMax {
        return min == max ? "¥\(formatYuan(min))" : "¥\(formatYuan(min)) ~ ¥\(formatYuan(max))"
    }
    if let min = e.priceMin { return "¥\(formatYuan(min)) 起" }
    if let max = e.priceMax { return "¥\(formatYuan(max)) 以内" }
    return "价格面议"
}
private func formatYuan(_ v: Double) -> String { v.rounded() == v ? "\(Int(v))" : v.formatted(.number.precision(.fractionLength(2))) }
private func errandSnapshotPrice(_ e: ErrandCardSnapshot) -> String {
    if let min = e.priceMin, let max = e.priceMax { return min == max ? "¥\(formatYuan(min))" : "¥\(formatYuan(min)) ~ ¥\(formatYuan(max))" }
    if let min = e.priceMin { return "¥\(formatYuan(min))" }
    if let max = e.priceMax { return "¥\(formatYuan(max)) 以内" }
    return "价格面议"
}

/// 将 ISO 时间转为本地展示（今年省略年份，与 Web formatWindow 一致）
private func errandWindow(_ iso: String) -> String {
    guard let d = ISO8601DateFormatter().date(from: iso) ?? parseDateFallback(iso) else { return "时间未知" }
    let cal = Calendar.current
    let now = Date()
    let yy = cal.component(.year, from: d) == cal.component(.year, from: now)
    let f = DateFormatter()
    f.locale = Locale(identifier: "zh_CN")
    f.dateFormat = yy ? "M月d日 HH:mm" : "yyyy年M月d日 HH:mm"
    return f.string(from: d)
}
private func parseDateFallback(_ iso: String) -> Date? {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = f.date(from: iso) { return d }
    f.formatOptions = [.withInternetDateTime]
    return f.date(from: iso)
}

// MARK: - 列表

@MainActor final class ErrandListModel: ObservableObject {
    @Published var errands: [Errand] = []; @Published var total = 0
    @Published var loading = false; @Published var error: String?
    @Published var side = ""; @Published var cargoType = ""
    @Published var keyword = ""; @Published var location = ""; @Published var status = ""; @Published var mine = false

    func load(schoolId: String?, campusId: String?) async {
        loading = true; error = nil; defer { loading = false }
        var parts: [String] = []
        if let schoolId { parts.append("schoolId=\(q(schoolId))") }
        if let campusId { parts.append("campusId=\(q(campusId))") }
        if !side.isEmpty { parts.append("side=\(q(side))") }
        if !cargoType.isEmpty { parts.append("cargoType=\(q(cargoType))") }
        if !keyword.isEmpty { parts.append("keyword=\(q(keyword))") }
        if mine { parts.append("mine=1") }
        do {
            let r: ErrandsResponse = try await APIClient.shared.request("/api/errands?" + parts.joined(separator: "&"))
            var list = r.errands
            if !location.isEmpty {
                list = list.filter { ($0.pickupLocations + $0.deliveryLocations).contains { $0.localizedCaseInsensitiveContains(location) } }
            }
            if !status.isEmpty { list = list.filter { $0.status == status } }
            errands = list; total = list.count
        } catch { self.error = error.localizedDescription }
    }
    private func q(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? s }
}

struct ErrandListView: View {
    @EnvironmentObject var session: SessionStore
    @StateObject private var model = ErrandListModel()
    @State private var showFilters = false

    private let statusOptions = ["进行中", "未开始", "已完成", "已过期", "已关闭", "已下架"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // 标题
                VStack(alignment: .leading, spacing: 6) {
                    Label(session.scopeTitle, systemImage: "building.columns.fill").font(.caption.bold()).foregroundStyle(Theme.coral)
                    Text(model.mine ? "我的代取" : "快递代取")
                        .font(.system(.largeTitle, design: .rounded, weight: .bold)).foregroundStyle(Theme.ink)
                    Text(model.mine ? "管理你发布的代取服务与取件需求。" : "找人代取快递/外卖，或帮同学代取赚零花钱。")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(20)
                .background(LinearGradient(colors: [Theme.ink.opacity(0.12), Theme.coral.opacity(0.08), Theme.surface], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(Theme.separator, lineWidth: 0.5))

                // 需求/服务切换 + 关键词
                HStack(spacing: 8) {
                    segmentedButton("全部", model.side == "") { model.side = ""; Task { await reload() } }
                    segmentedButton("代取服务", model.side == "supply") { model.side = "supply"; Task { await reload() } }
                    segmentedButton("取件需求", model.side == "demand") { model.side = "demand"; Task { await reload() } }
                }
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass").foregroundStyle(Theme.ink)
                    TextField("搜索标题或地点", text: $model.keyword).submitLabel(.search)
                        .onSubmit { Task { await reload() } }
                    if !model.keyword.isEmpty {
                        Button { model.keyword = ""; Task { await reload() } } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.tertiary) }
                    }
                    Button { Task { await reload() } } label: { Image(systemName: "arrow.right").font(.headline).frame(width: 38, height: 38).background(Theme.ink, in: Circle()).foregroundStyle(Color(uiColor: .systemBackground)) }
                        .buttonStyle(MarketPressStyle()).accessibilityLabel("搜索")
                }
                HStack(spacing: 10) {
                    Image(systemName: "mappin.and.ellipse").foregroundStyle(Theme.coral)
                    TextField("按取件或送达地点筛选", text: $model.location).submitLabel(.search)
                        .onSubmit { Task { await reload() } }
                    if !model.location.isEmpty {
                        Button { model.location = ""; Task { await reload() } } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(.tertiary)
                        }
                        .accessibilityLabel("清除地点筛选")
                    }
                }
                .padding(12)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.separator, lineWidth: 0.5))
                .padding(8).padding(.leading, 6)
                .background(Theme.surface).clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Theme.separator, lineWidth: 0.5))

                // 货物 / 状态 / 位置 / 操作
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        cargoButton("全部货物", "")
                        ForEach(MarketData.errandCargoTypes, id: \.self) { cargoButton($0, $0) }
                    }.padding(.vertical, 2)
                }
                HStack(spacing: 10) {
                    Button { showFilters.toggle() } label: {
                        Label(statusOptionLabel, systemImage: "line.3.horizontal.decrease.circle")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .background(model.status.isEmpty ? Theme.surface : Theme.ink.opacity(0.12), in: Capsule())
                            .foregroundStyle(model.status.isEmpty ? Theme.ink : Theme.ink)
                    }.buttonStyle(MarketPressStyle())

                    Spacer()

                    Button(model.mine ? "返回全部" : "我的代取") {
                        model.mine.toggle(); Task { await reload() }
                    }.font(.subheadline.weight(.semibold)).buttonStyle(.bordered).tint(Theme.coral)

                    if !model.mine {
                        NavigationLink { ErrandFormView() } label: {
                            Label("发布", systemImage: "plus").font(.subheadline.weight(.semibold))
                        }.buttonStyle(.borderedProminent).tint(Theme.ink)
                    }
                }

                Text("共 \(model.total) 条").font(.footnote).foregroundStyle(.secondary)

                // 内容
                if model.loading && model.errands.isEmpty {
                    ProgressView("正在加载代取单…").frame(maxWidth: .infinity).padding(60)
                } else if let error = model.error, model.errands.isEmpty {
                    ErrorState(message: error) { Task { await reload() } }.frame(minHeight: 280)
                } else if model.errands.isEmpty {
                    ContentUnavailableView {
                        Label("暂无代取单", systemImage: "shippingbox")
                    } description: {
                        Text(model.mine || !model.status.isEmpty || !model.keyword.isEmpty ? "没有符合条件的代取单。" : "当前校区还没有人发布，来发第一单吧。")
                    } actions: {
                        if !model.mine {
                            NavigationLink { ErrandFormView() } label: { Text("发布代取/需求").buttonStyle(.borderedProminent).tint(Theme.ink) }
                        }
                    }
                } else {
                    LazyVStack(spacing: 12) {
                        ForEach(model.errands) { errand in
                            if isClickable(errand) {
                                NavigationLink(value: ErrandRoute(errandID: errand.id)) { ErrandCard(errand: errand) }.buttonStyle(.plain)
                            } else {
                                ErrandCard(errand: errand).opacity(0.6)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 76).marketContentWidth(alignment: .leading)
        }
        .marketBackground()
        .navigationTitle("快递代取").navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.ultraThinMaterial, for: .navigationBar).toolbarBackground(.visible, for: .navigationBar)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { NavigationLink { ErrandFormView() } label: { Image(systemName: "plus") } } }
        .navigationDestination(for: ErrandRoute.self) { route in ErrandDetailView(id: route.errandID) }
        .refreshable { await reload() }
        .task { if model.errands.isEmpty { await reload() } }
        .onChange(of: session.selectedScope) { _, _ in Task { await reload() } }
        .onChange(of: session.user?.id) { _, _ in Task { await reload() } }
        .sheet(isPresented: $showFilters) { statusFilterSheet }
        .presentationDetents([.medium])
    }

    private var statusOptionLabel: String { model.status.isEmpty ? "状态筛选" : "状态：\(model.status)" }

    private var statusFilterSheet: some View {
        NavigationStack {
            List {
                Button("全部状态") { model.status = ""; showFilters = false; Task { await reload() } }
                ForEach(statusOptions, id: \.self) { s in
                    Button(s) { model.status = s; showFilters = false; Task { await reload() } }
                }
            }.navigationTitle("按状态筛选").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("关闭") { showFilters = false } } }
        }
    }

    private func isClickable(_ e: Errand) -> Bool {
        model.mine || session.user?.id == e.userId || e.status == "进行中" || e.status == "未开始"
    }
    private func reload() async { await model.load(schoolId: session.scope?.schoolId, campusId: session.scope?.campusId) }
    private func segmentedButton(_ title: String, _ selected: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.subheadline.weight(.semibold)).padding(.horizontal, 14).padding(.vertical, 8).frame(maxWidth: .infinity)
                .background(selected ? Theme.coral : Theme.surface, in: Capsule())
                .foregroundStyle(selected ? Color.white : Theme.ink)
        }.buttonStyle(MarketPressStyle())
    }
    private func cargoButton(_ title: String, _ value: String) -> some View {
        let selected = model.cargoType == value
        return Button(title) { model.cargoType = value; Task { await reload() } }
            .font(.subheadline.weight(.semibold)).foregroundStyle(selected ? Color.white : Theme.ink)
            .padding(.horizontal, 14).padding(.vertical, 9)
            .background(selected ? Theme.coral : Theme.surface, in: Capsule())
            .overlay(Capsule().stroke(Theme.ink.opacity(selected ? 0 : 0.12), lineWidth: 1))
            .buttonStyle(MarketPressStyle())
    }
}

struct ErrandCard: View {
    let errand: Errand
    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 8) {
                Text(errandSideLabel(errand.side)).font(.caption2.bold())
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(errand.side == "supply" ? Theme.ink : Theme.coral, in: Capsule())
                    .foregroundStyle(.white)
                Text(errand.cargoType).font(.caption.bold()).foregroundStyle(.secondary)
                Spacer()
                Text(errand.status).font(.caption.bold()).foregroundStyle(errandStatusColor(errand.status))
            }
            Text(errand.title).font(.headline).lineLimit(2)
            if !errand.description.isEmpty { Text(errand.description).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
            HStack(spacing: 6) {
                Image(systemName: "arrow.up.circle").font(.caption2).foregroundStyle(.secondary)
                Text("取 \(errand.pickupLocations.joined(separator: "、"))").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                Image(systemName: "arrow.down.circle").font(.caption2).foregroundStyle(.secondary)
                Text("送 \(errand.deliveryLocations.joined(separator: "、"))").font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            HStack {
                Text(errandPriceRange(errand)).font(.subheadline.bold()).foregroundStyle(Theme.coral)
                if let m = errand.transportMethod { Text("🚶 \(m)").font(.caption).foregroundStyle(.secondary) }
                Spacer()
                Text("\(errandWindow(errand.startsAt)) 起").font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Theme.separator, lineWidth: 0.5))
        .shadow(color: .black.opacity(0.045), radius: 10, y: 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(errandSideLabel(errand.side))，\(errand.title)，\(errand.status)，\(errandPriceRange(errand))")
    }
}

// MARK: - 详情

@MainActor final class ErrandDetailModel: ObservableObject {
    @Published var errand: Errand?; @Published var loading = false; @Published var error: String?
    func load(id: Int) async {
        loading = true; error = nil; defer { loading = false }
        do { let r: ErrandResponse = try await APIClient.shared.request("/api/errands/\(id)"); errand = r.errand } catch { self.error = error.localizedDescription }
    }
}

struct ErrandDetailView: View {
    @EnvironmentObject var session: SessionStore
    let id: Int
    @StateObject private var model = ErrandDetailModel()
    @State private var notice: String?
    @State private var confirmAction: ErrandAction?
    @State private var busy = false
    @State private var chatDestination: Conversation?

    var body: some View {
        Group {
            if let errand = model.errand {
                ScrollView { VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 8) {
                            Text(errandSideLabel(errand.side)).font(.caption2.bold())
                                .padding(.horizontal, 8).padding(.vertical, 4)
                                .background(errand.side == "supply" ? Theme.ink : Theme.coral, in: Capsule()).foregroundStyle(.white)
                            Text(errand.cargoType).font(.caption.bold()).foregroundStyle(.secondary)
                            Spacer()
                            Text(errand.status).font(.caption.bold()).foregroundStyle(errandStatusColor(errand.status))
                        }
                        Text(errand.title).font(.title.bold())
                        Text(errandPriceRange(errand)).font(.largeTitle.bold()).foregroundStyle(Theme.coral)
                        Label("\(errandWindow(errand.startsAt)) 至 \(errandWindow(errand.endsAt))", systemImage: "clock").font(.subheadline).foregroundStyle(.secondary)
                        if !errand.description.isEmpty { Text(errand.description).frame(maxWidth: .infinity, alignment: .leading) }

                        specGrid(errand)

                        // 发布者
                        NavigationLink { SellerProfileView(userID: errand.userId) } label: {
                            HStack(spacing: 12) {
                                AvatarImage(url: errand.publisher.avatarUrl, name: errand.publisher.nickname, size: 48)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(errand.publisher.nickname).font(.headline).foregroundStyle(.primary)
                                    Text("\(errand.schoolName) · \(errand.campusName) · 查看主页").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.tertiary)
                            }
                            .padding(12).background(Theme.surface, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
                        }.buttonStyle(.plain)

                        // 操作
                        actionButtons(errand)

                        // 安全提示
                        HStack(spacing: 12) {
                            Image(systemName: "shield.checkered").font(.title2).foregroundStyle(Theme.coral)
                            VStack(alignment: .leading, spacing: 4) {
                                Text("线下自行协商与交付").font(.subheadline.bold())
                                Text("本平台只提供信息与展示，不参与资金交易。请线下当面协商价格并完成交接。").font(.caption).foregroundStyle(.secondary)
                            }
                        }.padding(14).frame(maxWidth: .infinity, alignment: .leading)
                            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 17, style: .continuous).stroke(Theme.separator, lineWidth: 0.5))
                    }
                    .padding().padding(.bottom, 24)
                } }
            } else if let error = model.error {
                ErrorState(message: error) { Task { await model.load(id: id) } }
            } else { LoadingState() }
        }
        .marketBackground().navigationTitle("代取详情").navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.paper, for: .navigationBar).toolbarBackground(.visible, for: .navigationBar)
        .task { await model.load(id: id) }
        .navigationDestination(isPresented: Binding(get: { chatDestination != nil }, set: { if !$0 { chatDestination = nil } })) {
            if let chatDestination { ChatView(conversation: chatDestination) }
        }
        .alert("提示", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) { Button("知道了") {} } message: { Text(notice ?? "") }
        .confirmationDialog(confirmTitle, isPresented: Binding(get: { confirmAction != nil }, set: { if !$0 { confirmAction = nil } }), titleVisibility: .visible) {
            if let action = confirmAction {
                Button(destructiveLabel(action), role: .destructive) { Task { await perform(action) } }
                Button("取消", role: .cancel) {}
            }
        } message: { Text(confirmMessage) }
    }

    private var confirmTitle: String {
        switch confirmAction { case .delete: return "确定删除这条代取单？"; case .complete: return "确认这条代取单已经完成？"; case .close: return "确认关闭这条代取单？"; default: return "确认操作" }
    }
    private var confirmMessage: String {
        switch confirmAction { case .delete: return "删除后不可恢复。"; case .complete: return "完成后将标记为已完成。"; case .close: return "关闭后他人无法再接单。"; default: return "" }
    }
    private func destructiveLabel(_ a: ErrandAction) -> String {
        switch a { case .delete: return "删除"; case .complete: return "标记完成"; case .close: return "关闭" }
    }

    @ViewBuilder private func specGrid(_ errand: Errand) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            specRow("取件地点", errand.pickupLocations.joined(separator: "、"))
            specRow("收件地点", errand.deliveryLocations.joined(separator: "、"))
            if let m = errand.transportMethod { specRow("运输方式", "🚶 \(m)") }
            if !errand.weightLimit.isEmpty { specRow("载重上限", errand.weightLimit) }
            if !errand.transportTime.isEmpty { specRow("参考时间", errand.transportTime) }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 17, style: .continuous).stroke(Theme.separator, lineWidth: 0.5))
    }
    private func specRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(label).font(.caption).foregroundStyle(.secondary).frame(width: 64, alignment: .leading)
            Text(value).font(.subheadline).frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder private func actionButtons(_ errand: Errand) -> some View {
        let mine = session.user?.id == errand.userId
        if mine {
            VStack(spacing: 10) {
                NavigationLink { ErrandFormView(errandID: errand.id) } label: {
                    Label("编辑", systemImage: "square.and.pencil").frame(maxWidth: .infinity)
                }.buttonStyle(.bordered).tint(Theme.coral)

                if errand.status != "已完成" && errand.status != "已关闭" {
                    Button { confirmAction = .complete } label: {
                        Label("标记完成", systemImage: "checkmark.circle").frame(maxWidth: .infinity)
                    }.buttonStyle(.bordered).tint(Theme.ink).disabled(busy)
                    Button { confirmAction = .close } label: {
                        Label("关闭", systemImage: "xmark.circle").frame(maxWidth: .infinity)
                    }.buttonStyle(.bordered).tint(.secondary).disabled(busy)
                }
                Button(role: .destructive) { confirmAction = .delete } label: {
                    Label("删除", systemImage: "trash").frame(maxWidth: .infinity)
                }.buttonStyle(.bordered).tint(.red).disabled(busy)
            }
        } else {
            VStack(spacing: 10) {
                Button { Task { await chat() } } label: {
                    Label("联系 TA", systemImage: "message").frame(maxWidth: .infinity)
                }.buttonStyle(.borderedProminent).tint(Theme.ink).disabled(busy)
                NavigationLink { SellerProfileView(userID: errand.userId) } label: {
                    Label("查看发布者主页", systemImage: "person.crop.circle").frame(maxWidth: .infinity)
                }.buttonStyle(.bordered).tint(.secondary)
            }
        }
    }

    private func requireCampus() -> Bool {
        if session.user == nil { session.showLogin = true; return false }
        if !session.isCampusUser { notice = "仅通过 \(session.campusEmailHint) 验证的校园用户可以进行此操作。"; return false }
        return true
    }

    private func chat() async {
        guard requireCampus() else { return }
        struct P: Encodable { let errandId: Int }
        busy = true; defer { busy = false }
        do {
            let result: IDResponse = try await APIClient.shared.request("/api/conversations", method: "POST", body: P(errandId: id))
            let e = model.errand!
            chatDestination = Conversation(id: result.id, itemId: 0, itemTitle: e.title, partner: Partner(nickname: e.publisher.nickname, avatarUrl: e.publisher.avatarUrl), lastMessage: "", unreadCount: 0, updatedAt: "")
        } catch { notice = error.localizedDescription }
    }

    private func perform(_ action: ErrandAction) async {
        busy = true; defer { busy = false }
        do {
            if action == .delete {
                let _: OKResponse = try await APIClient.shared.request("/api/errands/\(id)", method: "DELETE")
                notice = nil
                // 删除后返回列表
            } else {
                let _: OKResponse = try await APIClient.shared.request("/api/errands/\(id)/\(action.rawValue)", method: "POST")
                notice = action == .complete ? "已标记完成" : "已关闭"
                await model.load(id: id)
            }
        } catch { notice = error.localizedDescription }
    }
}

private enum ErrandAction: String { case close, complete, delete }

// MARK: - 表单

@MainActor final class ErrandFormModel: ObservableObject {
    @Published var errandID: Int?
    @Published var side = "supply"; @Published var cargoType = "快递"
    @Published var title = ""; @Published var description = ""
    @Published var priceMin = ""; @Published var priceMax = ""
    @Published var pickupLocations: [String] = []; @Published var deliveryLocations: [String] = []
    @Published var customPickup = ""; @Published var customDelivery = ""
    @Published var transportMethod = "步行"; @Published var weightLimit = ""; @Published var transportTime = ""
    @Published var startsAt = Date(); @Published var endsAt = Date()
    @Published var campusId = ""
    @Published var locations: ErrandLocations?
    @Published var busy = false; @Published var error: String?
    @Published var loadingEdit = false

    var editing: Bool { errandID != nil }

    func setup(session: SessionStore) {
        if campusId.isEmpty { campusId = session.scope?.campusId ?? "" }
        let now = Date()
        startsAt = Date(timeIntervalSince1970: ceil(now.timeIntervalSince1970 / 600) * 600)
        endsAt = startsAt.addingTimeInterval(2 * 3600)
        if editing { Task { await loadForEdit()} } else { Task { await loadLocations() } }
    }

    func loadLocations() async {
        let cid = campusId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? campusId
        do { let r: ErrandLocationsResponse = try await APIClient.shared.request("/api/errands/locations?campusId=\(cid)"); locations = r.locations } catch { locations = nil }
    }

    func loadForEdit() async {
        guard let id = errandID else { return }
        loadingEdit = true; defer { loadingEdit = false }
        do {
            let r: ErrandResponse = try await APIClient.shared.request("/api/errands/\(id)")
            let e = r.errand
            side = e.side; cargoType = e.cargoType; title = e.title; description = e.description
            priceMin = e.priceMin.map { String($0) } ?? ""; priceMax = e.priceMax.map { String($0) } ?? ""
            pickupLocations = e.pickupLocations; deliveryLocations = e.deliveryLocations
            transportMethod = e.transportMethod ?? "步行"; weightLimit = e.weightLimit; transportTime = e.transportTime
            startsAt = parseDateFallback(e.startsAt) ?? Date(); endsAt = parseDateFallback(e.endsAt) ?? Date()
            campusId = e.campusId
            await loadLocations()
        } catch { self.error = error.localizedDescription }
    }

    func toggle(_ key: ReferenceWritableKeyPath<ErrandFormModel, [String]>, _ value: String) {
        var arr = self[keyPath: key]
        if let idx = arr.firstIndex(of: value) { arr.remove(at: idx) } else { arr.append(value) }
        self[keyPath: key] = arr
    }

    private func addCustom(text: String, to key: ReferenceWritableKeyPath<ErrandFormModel, [String]>) {
        let value = text.trimmingCharacters(in: .whitespaces)
        guard !value.isEmpty, !self[keyPath: key].contains(value) else { return }
        self[keyPath: key].append(value)
    }
    func addCustomPickup() { addCustom(text: customPickup, to: \.pickupLocations); customPickup = "" }
    func addCustomDelivery() { addCustom(text: customDelivery, to: \.deliveryLocations); customDelivery = "" }

    func payload() -> ErrandPayload {
        struct Stub {}
        let iso: (Date) -> String = { d in
            let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return f.string(from: d)
        }
        return ErrandPayload(
            side: side, cargoType: cargoType, title: title, description: description,
            priceMin: priceMin.isEmpty ? nil : Double(priceMin), priceMax: priceMax.isEmpty ? nil : Double(priceMax),
            pickupLocations: pickupLocations, deliveryLocations: deliveryLocations,
            transportMethod: side == "supply" ? transportMethod : nil,
            weightLimit: weightLimit, transportTime: transportTime,
            startsAt: iso(startsAt), endsAt: iso(endsAt), campusId: campusId)
    }
}

struct ErrandFormView: View {
    @EnvironmentObject var session: SessionStore
    @Environment(\.dismiss) var dismiss
    var errandID: Int?
    @StateObject private var model = ErrandFormModel()
    @State private var notice: String?

    init(errandID: Int? = nil) { self.errandID = errandID }

    var body: some View {
        Group {
            if session.user == nil {
                ContentUnavailableView { Label("登录后发布", systemImage: "person.crop.circle.badge.plus") } description: { Text("登录校园账号后再发布代取。") } actions: { Button("去登录") { session.showLogin = true }.buttonStyle(.borderedProminent).tint(Theme.ink) }
            } else if !session.isCampusUser {
                ContentUnavailableView("仅限校园用户", systemImage: "checkmark.shield", description: Text("请使用完成验证的 \(session.campusEmailHint) 邮箱账号。"))
            } else if model.loadingEdit {
                LoadingState()
            } else {
                form
            }
        }
        .navigationTitle(model.editing ? "编辑代取单" : "发布代取/需求").navigationBarTitleDisplayMode(.inline)
        .onAppear { model.errandID = errandID; model.setup(session: session) }
        .onChange(of: model.campusId) { _, _ in Task { await model.loadLocations() } }
        .alert("提示", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) { Button("知道了") {} } message: { Text(notice ?? "") }
    }

    @ViewBuilder private var form: some View {
        let campuses = session.campuses(forSchool: session.user?.schoolId)
        Form {
            if let error = model.error, !model.loadingEdit { Section { Text(error).foregroundStyle(.red) } }

            Section("发布身份") {
                Picker("身份", selection: $model.side) {
                    Text("代取服务（我帮别人取）").tag("supply")
                    Text("取件需求（别人帮我取）").tag("demand")
                }.pickerStyle(.segmented)
                Picker("货物类型", selection: $model.cargoType) { ForEach(MarketData.errandCargoTypes, id: \.self) { Text($0) } }
                if !campuses.isEmpty {
                    Picker("发布校区", selection: $model.campusId) { ForEach(campuses, id: \.id) { Text($0.name).tag($0.id) } }
                }
                TextField("标题（可选，不填自动生成）", text: $model.title)
                TextField("补充说明（可选）", text: $model.description, axis: .vertical).lineLimit(3...6)
            }

            Section("价格") {
                TextField("最低价（元）", text: $model.priceMin).keyboardType(.decimalPad)
                TextField("最高价（元）", text: $model.priceMax).keyboardType(.decimalPad)
            }

            Section("取件地点（多选，可自定义）") {
                locationPicker(list: model.locations?.pickup ?? [], selected: $model.pickupLocations, custom: $model.customPickup, addAction: model.addCustomPickup
                )
            }
            Section("收件地点（多选，可自定义）") {
                locationPicker(list: model.locations?.delivery ?? [], selected: $model.deliveryLocations, custom: $model.customDelivery, addAction: model.addCustomDelivery
                )
            }

            if model.side == "supply" {
                Section("运输信息（可选）") {
                    Picker("运输方式", selection: $model.transportMethod) { ForEach(MarketData.errandTransportMethods, id: \.self) { Text($0) } }
                    TextField("载重上限（可选，如 10kg）", text: $model.weightLimit)
                    TextField("参考运输时间（可选，如 15 分钟）", text: $model.transportTime)
                }
            }

            Section("生效时限") {
                DatePicker("开始时间", selection: $model.startsAt, displayedComponents: [.date, .hourAndMinute])
                DatePicker("结束时间", selection: $model.endsAt, displayedComponents: [.date, .hourAndMinute])
            }

            Section {
                Button(model.busy ? "提交中…" : (model.editing ? "保存修改" : "发布")) { Task { await submit() } }
                    .disabled(model.busy || model.pickupLocations.isEmpty || model.deliveryLocations.isEmpty)
                    .frame(maxWidth: .infinity)
            } footer: {
                Text("超过结束时间会自动灰显，再超过 24 小时自动下架。").font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    private func locationPicker(list: [String], selected: Binding<[String]>, custom: Binding<String>, addAction: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if list.isEmpty {
                Text("正在加载地点…").font(.caption).foregroundStyle(.secondary)
            } else {
                // 已选列表
                if !selected.wrappedValue.isEmpty {
                    ScrollView(.horizontal) {
                        HStack(spacing: 6) {
                            ForEach(selected.wrappedValue, id: \.self) { loc in
                                HStack(spacing: 4) {
                                    Text(loc).font(.caption).lineLimit(1)
                                    Button { if let i = selected.wrappedValue.firstIndex(of: loc) { selected.wrappedValue.remove(at: i) } } label: { Image(systemName: "xmark.circle.fill").font(.caption).foregroundStyle(.secondary) }
                                }
                                .padding(.horizontal, 8).padding(.vertical, 5)
                                .background(Theme.ink.opacity(0.12), in: Capsule())
                            }
                        }
                    }
                }
                // 选项
                ForEach(list, id: \.self) { loc in
                    let isOn = selected.wrappedValue.contains(loc)
                    Button { toggleIn(selected, loc) } label: {
                        HStack {
                            Text(loc).font(.subheadline).foregroundStyle(.primary)
                            Spacer()
                            Image(systemName: isOn ? "checkmark.circle.fill" : "circle").foregroundStyle(isOn ? Theme.coral : .secondary)
                        }
                    }.buttonStyle(.plain)
                }
            }
            HStack {
                TextField("自定义地点", text: custom)
                Button("添加") { addAction() }.disabled(custom.wrappedValue.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }
    private func toggleIn(_ binding: Binding<[String]>, _ value: String) {
        var arr = binding.wrappedValue
        if let idx = arr.firstIndex(of: value) { arr.remove(at: idx) } else { arr.append(value) }
        binding.wrappedValue = arr
    }

    private func submit() async {
        // 客户端校验（与 Web/服务端一致）
        guard !model.pickupLocations.isEmpty else { notice = "请至少选择一个取件地点"; return }
        guard !model.deliveryLocations.isEmpty else { notice = "请至少选择一个收件地点"; return }
        guard model.endsAt > model.startsAt else { notice = "结束时间必须晚于开始时间"; return }
        if let min = Double(model.priceMin), let max = Double(model.priceMax), min > max { notice = "价格下限不能大于上限"; return }

        model.busy = true; defer { model.busy = false }
        let payload = model.payload()
        do {
            if model.editing {
                let _: OKResponse = try await APIClient.shared.request("/api/errands/\(model.errandID!)", method: "PATCH", body: payload)
                dismiss()
            } else {
                let _: IDResponse = try await APIClient.shared.request("/api/errands", method: "POST", body: payload)
                // 刷新会话范围视图后返回
                dismiss()
            }
            notice = nil
        } catch { notice = error.localizedDescription }
    }
}
