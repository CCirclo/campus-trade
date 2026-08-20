import SwiftUI

enum Theme { static let ink = Color(red: 0.05, green: 0.22, blue: 0.21); static let coral = Color(red: 0.93, green: 0.38, blue: 0.29); static let paper = Color(red: 0.97, green: 0.96, blue: 0.92) }

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
        VStack(alignment: .leading, spacing: 8) {
            RemoteImage(url: item.images.first).clipShape(RoundedRectangle(cornerRadius: 16))
            Text(item.title).font(.headline).lineLimit(1)
            Text("\(item.category) · \(item.condition)").font(.caption).foregroundStyle(.secondary)
            Text(priceText(item.price)).font(.title3.bold()).foregroundStyle(Theme.coral)
        }.padding(10).background(.white).clipShape(RoundedRectangle(cornerRadius: 20)).shadow(color: .black.opacity(0.05), radius: 8, y: 3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine).accessibilityLabel("\(item.title)，价格 \(item.price) 元，\(item.condition)")
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
                Text(priceText(item.price)).font(.title3.bold()).foregroundStyle(Theme.coral)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.tertiary)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white, in: RoundedRectangle(cornerRadius: 18))
        .accessibilityElement(children: .combine)
    }
}

struct LoadingState: View { var body: some View { ProgressView("正在加载…").frame(maxWidth: .infinity, maxHeight: .infinity) } }
struct ErrorState: View { let message: String; let retry: () -> Void; var body: some View { ContentUnavailableView { Label("暂时没能加载", systemImage: "exclamationmark.triangle") } description: { Text(message) } actions: { Button("重新加载", action: retry).buttonStyle(.borderedProminent).tint(Theme.ink) } } }

extension View {
    func marketBackground() -> some View { background(Theme.paper.ignoresSafeArea()) }
    func campusGate(_ session: SessionStore, action: @escaping () -> Void) -> some View {
        modifier(CampusGate(session: session, action: action))
    }
}
private struct CampusGate: ViewModifier {
    @ObservedObject var session: SessionStore; let action: () -> Void
    func body(content: Content) -> some View { content.onTapGesture { if session.user == nil { session.showLogin = true } else if session.isCampusUser { action() } } }
}
