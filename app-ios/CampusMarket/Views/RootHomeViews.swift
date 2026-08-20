import SwiftUI

struct RootView: View {
    @EnvironmentObject var session: SessionStore
    var body: some View {
        Group {
            if session.restoring { LoadingState() } else {
                TabView {
                    NavigationStack { HomeView() }.tabItem { Label("首页", systemImage: "house") }
                    NavigationStack { PublishView() }.tabItem { Label("发布", systemImage: "plus.circle") }
                    NavigationStack { ConversationsView() }.tabItem { Label("消息", systemImage: "message") }
                    NavigationStack { MineView() }.tabItem { Label("我的", systemImage: "person") }
                }.tint(Theme.coral)
            }
        }.sheet(isPresented: $session.showLogin) { NavigationStack { AuthView() } }
    }
}

@MainActor final class HomeModel: ObservableObject {
    @Published var items: [Item] = []; @Published var loading = false; @Published var error: String?
    @Published var search = ""; @Published var category = ""; @Published var sort = "latest"
    func load() async {
        loading = true; error = nil; defer { loading = false }
        var parts = ["schoolId=ruc_suzhou", "sort=\(sort)"]
        if !search.isEmpty { parts.append("keyword=\(search.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? search)") }
        if !category.isEmpty { parts.append("category=\(category.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? category)") }
        do { let response: ItemsResponse = try await APIClient.shared.request("/api/items?" + parts.joined(separator: "&")); items = response.items }
        catch { self.error = error.localizedDescription }
    }
}

struct HomeView: View {
    @StateObject private var model = HomeModel()
    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) { Text("RUC SUZHOU MARKET").font(.caption.bold()).foregroundStyle(Theme.coral); Text("让闲置，在校园里\n继续被喜欢。").font(.largeTitle.bold()).foregroundStyle(Theme.ink); Text("只看同校真实好物，聊好细节，再当面交易。").foregroundStyle(.secondary) }
                .padding(.top)
                HStack { Image(systemName: "magnifyingglass"); TextField("搜索教材、数码或宿舍好物", text: $model.search).submitLabel(.search).onSubmit { Task { await model.load() } }; Button("搜索") { Task { await model.load() } }.buttonStyle(.borderedProminent).tint(Theme.ink) }.padding(10).background(.white).clipShape(RoundedRectangle(cornerRadius: 15))
                ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 8) { categoryButton("全部"); ForEach(MarketData.categories, id: \.self, content: categoryButton) }.padding(.vertical, 2) }
                HStack { Label("校内限定 · 当面验货再交易", systemImage: "shield.checkered").foregroundStyle(Theme.ink); Spacer(); Picker("排序", selection: $model.sort) { Text("最新").tag("latest"); Text("价格↑").tag("priceAsc"); Text("价格↓").tag("priceDesc") }.tint(Theme.coral).onChange(of: model.sort) { _, _ in Task { await model.load() } } }.font(.subheadline)
                if model.loading && model.items.isEmpty { ProgressView().frame(maxWidth: .infinity).padding(60) }
                else if let error = model.error { ErrorState(message: error) { Task { await model.load() } }.frame(height: 280) }
                else if model.items.isEmpty { ContentUnavailableView("暂无好物", systemImage: "shippingbox", description: Text("换个关键词试试吧")) }
                else { LazyVGrid(columns: columns, spacing: 14) { ForEach(model.items) { item in NavigationLink(value: item.id) { ItemCard(item: item) }.buttonStyle(.plain) } } }
            }.padding().padding(.bottom, 76)
        }.marketBackground().navigationTitle("校园闲置").navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.paper, for: .navigationBar).toolbarBackground(.visible, for: .navigationBar)
        .navigationDestination(for: Int.self) { ItemDetailView(id: $0) }.task { if model.items.isEmpty { await model.load() } }.refreshable { await model.load() }
    }
    private func categoryButton(_ title: String) -> some View {
        let value = title == "全部" ? "" : title
        let selected = model.category == value
        return Button(title) { model.category = value; Task { await model.load() } }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(selected ? Color.white : Theme.ink)
            .padding(.horizontal, 14).padding(.vertical, 9)
            .background(selected ? Theme.coral : Color.white, in: Capsule())
            .overlay(Capsule().stroke(Theme.ink.opacity(selected ? 0 : 0.12), lineWidth: 1))
            .buttonStyle(.plain)
    }
}

struct ItemDetailView: View {
    @EnvironmentObject var session: SessionStore; let id: Int
    @State private var response: ItemResponse?; @State private var error: String?; @State private var comment = ""; @State private var notice: String?
    var body: some View {
        Group {
            if let response {
                ScrollView { VStack(alignment: .leading, spacing: 18) {
                    TabView { ForEach(response.item.images.isEmpty ? [""] : response.item.images, id: \.self) { RemoteImage(url: $0, height: 300) } }.frame(height: 300).tabViewStyle(.page)
                    VStack(alignment: .leading, spacing: 12) {
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
                                        Text("中国人民大学苏州校区 · 查看主页").font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.tertiary)
                                }
                                .padding(12)
                                .background(.white, in: RoundedRectangle(cornerRadius: 17))
                            }.buttonStyle(.plain)
                        }
                        Text(response.item.description).frame(maxWidth: .infinity, alignment: .leading)
                        HStack(spacing: 10) { Button(response.favorited ? "已收藏" : "收藏", systemImage: response.favorited ? "heart.fill" : "heart") { Task { await favorite() } }.buttonStyle(.bordered).tint(Theme.coral); Button("联系卖家", systemImage: "message") { Task { await chat() } }.buttonStyle(.borderedProminent).tint(Theme.ink) }.controlSize(.large)
                        Divider(); Text("留言").font(.title2.bold())
                        ForEach(response.comments) { c in VStack(alignment: .leading) { Text(c.author.nickname).font(.subheadline.bold()); Text(c.content) }.padding(.vertical, 4) }
                        HStack { TextField("写下你的留言", text: $comment); Button("发送") { Task { await sendComment() } }.disabled(comment.trimmingCharacters(in: .whitespaces).count < 2) }.padding().background(.white).clipShape(RoundedRectangle(cornerRadius: 14))
                    }.padding().padding(.bottom, 82)
                } }
            } else if let error { ErrorState(message: error) { Task { await load() } } } else { LoadingState() }
        }.marketBackground().navigationTitle("商品详情").navigationBarTitleDisplayMode(.inline).toolbarBackground(Theme.paper, for: .navigationBar).toolbarBackground(.visible, for: .navigationBar).task { await load() }
        .alert("提示", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) { Button("知道了") {} } message: { Text(notice ?? "") }
    }
    private func requireCampus() -> Bool { if session.user == nil { session.showLogin = true; return false }; if !session.isCampusUser { notice = "仅通过 @ruc.edu.cn 验证的校园用户可以进行此操作。"; return false }; return true }
    private func load() async { do { response = try await APIClient.shared.request("/api/items/\(id)") } catch { self.error = error.localizedDescription } }
    private func favorite() async { guard requireCampus() else { return }; do { let _: FavoriteResponse = try await APIClient.shared.request("/api/items/\(id)/favorite", method: "POST"); await load() } catch { notice = error.localizedDescription } }
    private func chat() async { guard requireCampus() else { return }; struct P: Encodable { let itemId: Int }; do { let r: IDResponse = try await APIClient.shared.request("/api/conversations", method: "POST", body: P(itemId: id)); notice = "会话已创建（编号 \(r.id)），请前往消息页继续沟通。" } catch { notice = error.localizedDescription } }
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
                            Label("中国人民大学苏州校区", systemImage: "building.columns").font(.subheadline).foregroundStyle(.secondary)
                            Text("主页仅展示昵称、头像、认证状态和当前在售商品。").font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(22)
                        .background(.white, in: RoundedRectangle(cornerRadius: 22))

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
}
