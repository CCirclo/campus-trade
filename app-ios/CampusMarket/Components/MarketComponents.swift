import SwiftUI

enum Theme {
    static let ink = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.66, green: 0.88, blue: 0.84, alpha: 1) : UIColor(red: 0.05, green: 0.22, blue: 0.21, alpha: 1) })
    static let coral = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 1, green: 0.48, blue: 0.39, alpha: 1) : UIColor(red: 0.72, green: 0.20, blue: 0.14, alpha: 1) })
    static let paper = Color(uiColor: .systemGroupedBackground)
    static let surface = Color(uiColor: .secondarySystemGroupedBackground)
    static let elevated = Color(uiColor: .tertiarySystemGroupedBackground)
    static let separator = Color(uiColor: .separator).opacity(0.35)
    static let contentMaxWidth: CGFloat = 980
}

struct RemoteImage: View {
    let url: String?; var height: CGFloat = 180
    var body: some View {
        GeometryReader { proxy in
            AsyncImage(url: URL(string: url ?? "")) { phase in
                if let image = phase.image { image.resizable().scaledToFill() }
                else { ZStack { Color.gray.opacity(0.12); Image(systemName: "photo").font(.largeTitle).foregroundStyle(.secondary) } }
            }
            .frame(width: proxy.size.width, height: height)
            .clipped()
        }
        .frame(height: height)
    }
}

struct AvatarImage: View {
    let url: String?; var name: String = ""; var size: CGFloat = 52
    var body: some View {
        AsyncImage(url: URL(string: url ?? "")) { phase in
            if let image = phase.image { image.resizable().scaledToFill() }
            else {
                ZStack {
                    LinearGradient(colors: [Theme.ink.opacity(0.94), Theme.coral.opacity(0.82)], startPoint: .topLeading, endPoint: .bottomTrailing)
                    if let initial = name.trimmingCharacters(in: .whitespacesAndNewlines).first {
                        Text(String(initial)).font(.system(size: size * 0.42, weight: .bold, design: .rounded)).foregroundStyle(.white)
                    } else { Image(systemName: "person.fill").foregroundStyle(.white.opacity(0.9)) }
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }
}

func priceText(_ value: Double) -> String {
    value.rounded() == value ? "¥\(Int(value).formatted())" : "¥\(value.formatted(.number.precision(.fractionLength(2))))"
}

struct ItemCard: View {
    let item: Item
    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            RemoteImage(url: item.images.first, height: 168).clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            Text(item.title).font(.headline).lineLimit(2, reservesSpace: true)
            Text("\(item.category) · \(item.condition)")
                .font(.caption).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Text(priceText(item.price)).font(.title3.bold()).foregroundStyle(Theme.coral)
        }.padding(10).background(Theme.surface).clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous)).overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Theme.separator, lineWidth: 0.5)).shadow(color: .black.opacity(0.045), radius: 10, y: 4)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct ItemRow: View {
    let item: Item
    var body: some View {
        HStack(spacing: 14) {
            AsyncImage(url: URL(string: item.images.first ?? "")) { phase in
                if let image = phase.image { image.resizable().scaledToFill() }
                else { ZStack { Color.gray.opacity(0.12); Image(systemName: "photo").foregroundStyle(.secondary) } }
            }
            .frame(width: 112, height: 96)
            .clipShape(RoundedRectangle(cornerRadius: 14))

            VStack(alignment: .leading, spacing: 7) {
                Text(item.title).font(.headline).foregroundStyle(.primary).lineLimit(2)
                Text("\(item.category) · \(item.condition)").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                HStack(spacing: 6) {
                    Text(priceText(item.price)).font(.title3.bold()).foregroundStyle(Theme.coral)
                    itemStatusBadge(item.status)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.tertiary)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Theme.separator, lineWidth: 0.5))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(item.title)，价格 \(item.price) 元，\(item.condition)，\(item.status)")
    }
    @ViewBuilder private func itemStatusBadge(_ status: String) -> some View {
        if status != "在售" {
            Text(status).font(.caption2.bold()).padding(.horizontal, 6).padding(.vertical, 2)
                .background(statusColor(status).opacity(0.14), in: Capsule()).foregroundStyle(statusColor(status))
        }
    }
    private func statusColor(_ s: String) -> Color {
        switch s { case "已售出": return Theme.ink; case "已下架": return .secondary; default: return .secondary }
    }
}

struct LoadingState: View { var body: some View { ProgressView("正在加载…").frame(maxWidth: .infinity, maxHeight: .infinity) } }
struct ErrorState: View { let message: String; let retry: () -> Void; var body: some View { ContentUnavailableView { Label("暂时没能加载", systemImage: "exclamationmark.triangle") } description: { Text(message) } actions: { Button("重新加载", action: retry).buttonStyle(.borderedProminent).tint(Theme.ink) } } }

/// 统一状态组件：区分「空 / 加载 / 失败（含离线、超时等分类）」并提供重试。
struct LoadableState<Content: View>: View {
    let isLoading: Bool
    let isEmpty: Bool
    let error: String?
    let emptyTitle: String
    let emptySystemImage: String
    let emptyDescription: String
    let retry: () -> Void
    @ViewBuilder let content: Content

    var body: some View {
        Group {
            if isLoading && isEmpty {
                LoadingState()
            } else if let error {
                classifiedError(error)
            } else if isEmpty {
                ContentUnavailableView(emptyTitle, systemImage: emptySystemImage, description: Text(emptyDescription))
            } else {
                content
            }
        }
    }
    @ViewBuilder private func classifiedError(_ error: String) -> some View {
        switch ErrorClassifier.classifyMessage(error) {
        case .offline:
            ContentUnavailableView { Label("没有网络连接", systemImage: "wifi.slash") } description: { Text("请检查网络后重试。") } actions: { Button("重试", action: retry).buttonStyle(.borderedProminent).tint(Theme.ink) }
        case .timeout:
            ContentUnavailableView { Label("请求超时", systemImage: "clock.badge.exclamationmark") } description: { Text("网络有点慢，请稍后重试。") } actions: { Button("重试", action: retry).buttonStyle(.borderedProminent).tint(Theme.ink) }
        default:
            ErrorState(message: error, retry: retry)
        }
    }
}

extension View {
    func marketBackground() -> some View { background(Theme.paper.ignoresSafeArea()) }
    func marketContentWidth(alignment: Alignment = .center) -> some View {
        frame(maxWidth: Theme.contentMaxWidth, alignment: alignment).frame(maxWidth: .infinity, alignment: alignment)
    }
    func campusGate(_ session: SessionStore, action: @escaping () -> Void) -> some View {
        modifier(CampusGate(session: session, action: action))
    }
}

struct MarketPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.975 : 1)
            .opacity(configuration.isPressed ? 0.88 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}
/// 简单的流式布局（用于搜索历史等胶囊标签自动换行）。
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 0
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width, height: y + rowHeight)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX { x = bounds.minX; y += rowHeight + spacing; rowHeight = 0 }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

private struct CampusGate: ViewModifier {
    @ObservedObject var session: SessionStore; let action: () -> Void
    func body(content: Content) -> some View { content.onTapGesture { if session.user == nil { session.showLogin = true } else if session.isCampusUser { action() } } }
}
