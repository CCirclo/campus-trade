import SwiftUI

// MARK: - 通用：交易币种与时间展示

/// 交易币种展示名称与符号（与 backend currency.ts TRADE_CURRENCIES 一致，仅 cny / lungmen）。
func tradeCurrencyName(_ code: String) -> String {
    switch code { case "lungmen": return "原石"; case "cny": return "人民币"; default: return code }
}
func tradeCurrencySymbol(_ code: String) -> String {
    switch code { case "lungmen": return "石"; default: return "¥" }
}
/// 订单金额展示：人民币带 ¥，原石带「石」后缀。
func orderAmountText(_ amount: Double, currency: String) -> String {
    let whole = amount.rounded() == amount ? "\(Int(amount).formatted())" : amount.formatted(.number.precision(.fractionLength(2)))
    let sym = tradeCurrencySymbol(currency)
    return sym == "¥" ? "¥\(whole)" : "\(whole) \(sym)"
}

/// ISO 时间转本地展示（今年省略年份，与 Web formatTimestamp 语义一致）。
func marketTimestamp(_ iso: String) -> String {
    guard let d = isoDate(iso) else { return "时间未知" }
    let cal = Calendar.current
    let now = Date()
    let sameYear = cal.component(.year, from: d) == cal.component(.year, from: now)
    let f = DateFormatter()
    f.locale = Locale(identifier: "zh_CN")
    f.dateFormat = sameYear ? "M月d日 HH:mm" : "yyyy年M月d日 HH:mm"
    return f.string(from: d)
}
private func isoDate(_ iso: String) -> Date? {
    if let d = ISO8601DateFormatter().date(from: iso) { return d }
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = f.date(from: iso) { return d }
    f.formatOptions = [.withInternetDateTime]
    return f.date(from: iso)
}

// MARK: - 我的钱包（余额 + 最近流水）

struct WalletView: View {
    @EnvironmentObject var session: SessionStore
    @State private var wallet: WalletResponse?
    @State private var loading = false
    @State private var error: String?
    var body: some View {
        Group {
            if session.user == nil {
                ContentUnavailableView { Label("登录后查看钱包", systemImage: "wallet.pass") }
                description: { Text("原石与创世结晶余额会在这里展示。") }
                actions: { Button("去登录") { session.showLogin = true }.buttonStyle(.borderedProminent).tint(Theme.ink) }
            } else if loading && wallet == nil {
                LoadingState()
            } else if let error, wallet == nil {
                ErrorState(message: error) { Task { await load() } }
            } else if let wallet {
                ScrollView {
                    VStack(spacing: 18) {
                        balanceCards(wallet.wallet)
                        ledgerSection(wallet)
                    }.padding().padding(.bottom, 76).marketContentWidth(alignment: .leading)
                }
                .refreshable { await load() }
            }
        }
        .marketBackground()
        .navigationTitle("我的钱包")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.paper, for: .navigationBar).toolbarBackground(.visible, for: .navigationBar)
        .task { if session.user != nil && wallet == nil { await load() } }
    }

    private func balanceCards(_ wallet: [String: WalletBalance]) -> some View {
        // 固定顺序：原石(lungmen) → 创世结晶(originium)，与后端 CURRENCY_LIST 一致。
        let ordered = ["lungmen", "originium"].compactMap { wallet[$0] }
        return VStack(spacing: 12) {
            ForEach(ordered) { b in
                HStack(spacing: 14) {
                    Text(balanceSymbol(b.code)).font(.system(size: 28))
                        .frame(width: 52, height: 52)
                        .background(Theme.paper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    VStack(alignment: .leading, spacing: 4) {
                        Text(b.name).font(.headline)
                        Text(b.description).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text("\(Int(b.balance.rounded()).formatted())").font(.system(.title, design: .rounded).bold()).foregroundStyle(Theme.coral)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Theme.separator, lineWidth: 0.5))
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(b.name) \(Int(b.balance.rounded()))")
            }
        }
    }

    @ViewBuilder private func ledgerSection(_ wallet: WalletResponse) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("最近流水").font(.title3.bold())
            if wallet.entries.isEmpty {
                ContentUnavailableView("还没有奖励记录", systemImage: "clock.arrow.circlepath", description: Text("发布商品、完成购买后，奖励流水会显示在这里。"))
                    .frame(maxWidth: .infinity).padding(.vertical, 24)
            } else {
                VStack(spacing: 0) {
                    ForEach(wallet.entries) { entry in
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(WalletView.entryCurrencyName(wallet.wallet, entry.currency)).font(.subheadline.weight(.semibold))
                                Text("\(marketTimestamp(entry.createdAt)) · \(entry.operator_)").font(.caption).foregroundStyle(.secondary)
                                Text(entry.reason).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 3) {
                                Text(entry.amount > 0 ? "+\(Int(entry.amount.rounded()))" : "\(Int(entry.amount.rounded()))")
                                    .font(.headline).foregroundStyle(entry.amount > 0 ? .green : Theme.coral)
                                Text("余额 \(Int(entry.balanceAfter.rounded()))").font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 12)
                        if entry.id != wallet.entries.last?.id { Divider() }
                    }
                }
                .padding(.horizontal, 14)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Theme.separator, lineWidth: 0.5))
            }
        }
    }

    private func balanceSymbol(_ code: String) -> String { code == "originium" ? "✨" : "💎" }
    private static func entryCurrencyName(_ wallet: [String: WalletBalance], _ code: String) -> String {
        wallet[code]?.name ?? tradeCurrencyName(code)
    }
    private func load() async {
        loading = true; error = nil; defer { loading = false }
        do { wallet = try await APIClient.shared.request("/api/me/wallet") }
        catch { self.error = error.localizedDescription }
    }
}

// MARK: - 我的订单（买家/卖家）

struct OrdersView: View {
    @EnvironmentObject var session: SessionStore
    @State private var filter: String = "全部"   // 全部 / 买家 / 卖家
    @State private var orders: [Order] = []
    @State private var loading = false
    @State private var error: String?
    @State private var pendingConfirm: Order?    // 待确认的确认收货
    @State private var pendingCancel: Order?     // 待确认的取消订单
    @State private var busyOrderId: Int?
    @State private var notice: String?

    private var filtered: [Order] {
        switch filter {
        case "买家": return orders.filter { $0.role == "buyer" }
        case "卖家": return orders.filter { $0.role == "seller" }
        default: return orders
        }
    }

    var body: some View {
        Group {
            if session.user == nil {
                ContentUnavailableView { Label("登录后查看订单", systemImage: "bag") }
                description: { Text("购买与售出的担保交易订单会显示在这里。") }
                actions: { Button("去登录") { session.showLogin = true }.buttonStyle(.borderedProminent).tint(Theme.ink) }
            } else if loading && orders.isEmpty {
                LoadingState()
            } else if let error, orders.isEmpty {
                ErrorState(message: error) { Task { await load() } }
            } else {
                ScrollView {
                    VStack(spacing: 16) {
                        filterPicker
                        if filtered.isEmpty {
                            ContentUnavailableView("还没有订单", systemImage: "bag", description: Text("确认收货或售出商品后，订单会出现在这里。"))
                                .frame(maxWidth: .infinity).padding(.vertical, 24)
                        } else {
                            LazyVStack(spacing: 12) { ForEach(filtered) { orderRow($0) } }
                        }
                    }.padding().padding(.bottom, 76).marketContentWidth(alignment: .leading)
                }.refreshable { await load() }
            }
        }
        .marketBackground()
        .navigationTitle("我的订单")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.paper, for: .navigationBar).toolbarBackground(.visible, for: .navigationBar)
        .task { if session.user != nil && orders.isEmpty { await load() } }
        .alert("提示", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) { Button("知道了") {} } message: { Text(notice ?? "") }
        .confirmationDialog("确认收货？", isPresented: Binding(get: { pendingConfirm != nil }, set: { if !$0 { pendingConfirm = nil } }), titleVisibility: .visible) {
            if let order = pendingConfirm {
                Button("确认收货") { Task { await act(order, action: "confirm") } }
                Button("取消", role: .cancel) {}
            }
        } message: { Text("确认后货款将转给卖家，订单标记为已完成。确认收货后无法取消。") }
        .confirmationDialog("取消订单？", isPresented: Binding(get: { pendingCancel != nil }, set: { if !$0 { pendingCancel = nil } }), titleVisibility: .visible) {
            if let order = pendingCancel {
                Button("取消订单", role: .destructive) { Task { await act(order, action: "cancel") } }
                Button("再想想", role: .cancel) {}
            }
        } message: { Text("取消后支付的币种将退回你的钱包，商品恢复在售。") }
    }

    private var filterPicker: some View {
        Picker("订单类型", selection: $filter) {
            ForEach(["全部", "买家", "卖家"], id: \.self) { Text($0).tag($0) }
        }
        .pickerStyle(.segmented)
    }

    private func orderRow(_ order: Order) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                AsyncImage(url: URL(string: order.itemImage)) { phase in
                    if let image = phase.image { image.resizable().scaledToFill() }
                    else { ZStack { Color.gray.opacity(0.12); Image(systemName: "bag").foregroundStyle(.secondary) } }
                }
                .frame(width: 56, height: 56).clipShape(RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 4) {
                    Text(order.itemTitle.isEmpty ? "商品交易" : order.itemTitle).font(.subheadline.weight(.semibold)).lineLimit(2)
                    Text("\(order.role == "buyer" ? "卖家" : "买家")：\(order.counterpart.nickname)").font(.caption).foregroundStyle(.secondary)
                    Text(marketTimestamp(order.createdAt)).font(.caption2).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
            HStack {
                HStack(spacing: 6) {
                    Text(orderStatusLabel(order.status)).font(.caption.bold())
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(orderStatusColor(order.status).opacity(0.14), in: Capsule())
                        .foregroundStyle(orderStatusColor(order.status))
                    Text(orderAmountText(order.amount, currency: order.currency)).font(.subheadline.bold()).foregroundStyle(Theme.coral)
                }
                Spacer()
                if order.role == "buyer" && order.status == "待确认收货" {
                    if busyOrderId == order.id {
                        ProgressView().controlSize(.small)
                    } else {
                        Button("确认收货") { pendingConfirm = order }
                            .font(.caption.bold()).buttonStyle(.bordered).tint(Theme.ink)
                        Button("取消", role: .destructive) { pendingCancel = order }
                            .font(.caption.bold()).buttonStyle(.bordered).tint(.red)
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Theme.separator, lineWidth: 0.5))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("订单 \(order.itemTitle)，\(orderAmountText(order.amount, currency: order.currency))，\(orderStatusLabel(order.status))")
    }

    private func orderStatusLabel(_ s: String) -> String { s.isEmpty ? "未知" : s }
    private func orderStatusColor(_ s: String) -> Color {
        switch s { case "已完成": return .green; case "已取消": return .secondary; default: return Theme.coral }
    }

    private func act(_ order: Order, action: String) async {
        guard busyOrderId == nil else { return }
        busyOrderId = order.id; defer { busyOrderId = nil }
        do {
            let _: OKResponse = try await APIClient.shared.request("/api/orders/\(order.id)/\(action)", method: "POST")
            notice = action == "confirm" ? "已确认收货" : "订单已取消，退款已退回钱包"
            await load()
        } catch { notice = error.localizedDescription }
    }

    private func load() async {
        loading = true; error = nil; defer { loading = false }
        do { let r: OrdersResponse = try await APIClient.shared.request("/api/me/orders"); orders = r.orders }
        catch { self.error = error.localizedDescription }
    }
}

// MARK: - 成就徽章

/// 成就徽章配色：与 Web achColors 保持一致。缺省回退到 Theme 浅色。
func achievementTint(_ color: String) -> Color {
    switch color {
    case "green": return .green
    case "teal": return .teal
    case "red": return .red
    case "violet": return .purple
    case "blue": return .blue
    case "amber": return .orange
    case "sky": return .cyan
    case "pink": return .pink
    case "slate": return .gray
    default: return Theme.coral
    }
}

/// 单个成就徽章：名称 + 描述 + 可选数值。
struct AchievementBadgeView: View {
    let achievement: Achievement
    var body: some View {
        VStack(spacing: 8) {
            Text(achievement.symbol).font(.system(size: 30))
            Text(achievement.name).font(.caption.bold()).multilineTextAlignment(.center).lineLimit(2)
            if let value = achievement.value {
                Text(value.rounded() == value ? "\(Int(value).formatted())" : value.formatted(.number.precision(.fractionLength(2))))
                    .font(.caption2.bold()).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14).padding(.horizontal, 6)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(achievementTint(achievement.color).opacity(0.35), lineWidth: 1))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(achievementAccessibilityLabel(achievement))
    }
    private func achievementAccessibilityLabel(_ a: Achievement) -> String {
        var label = "成就 \(a.name)，\(a.description)"
        if let v = a.value { label += "，数值 \(Int(v.rounded()))" }
        return label
    }
}

/// 成就总览页：完整列表 + 空状态。
struct AchievementsView: View {
    @EnvironmentObject var session: SessionStore
    @State private var achievements: [Achievement] = []
    @State private var loading = false
    @State private var error: String?

    private let columns = [GridItem(.adaptive(minimum: 96, maximum: 140), spacing: 12)]

    var body: some View {
        Group {
            if session.user == nil {
                ContentUnavailableView { Label("登录后查看成就", systemImage: "rosette") }
                description: { Text("注册、认证、发布和购买都会点亮对应徽章。") }
                actions: { Button("去登录") { session.showLogin = true }.buttonStyle(.borderedProminent).tint(Theme.ink) }
            } else if loading && achievements.isEmpty {
                LoadingState()
            } else if let error, achievements.isEmpty {
                ErrorState(message: error) { Task { await load() } }
            } else if achievements.isEmpty {
                ContentUnavailableView("还没有成就", systemImage: "rosette", description: Text("完成注册认证、发布或购买商品后，徽章会显示在这里。"))
            } else {
                ScrollView {
                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(achievements) { AchievementBadgeView(achievement: $0) }
                    }.padding().padding(.bottom, 76).marketContentWidth()
                }.refreshable { await load() }
            }
        }
        .marketBackground()
        .navigationTitle("我的成就")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.paper, for: .navigationBar).toolbarBackground(.visible, for: .navigationBar)
        .task { if session.user != nil && achievements.isEmpty { await load() } }
    }

    private func load() async {
        loading = true; error = nil; defer { loading = false }
        do { let r: AchievementsResponse = try await APIClient.shared.request("/api/me/achievements"); achievements = r.achievements }
        catch { self.error = error.localizedDescription }
    }
}
