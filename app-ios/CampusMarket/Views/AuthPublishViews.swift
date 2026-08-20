import SwiftUI
import PhotosUI
import UIKit

struct AuthView: View {
    @EnvironmentObject var session: SessionStore; @Environment(\.dismiss) var dismiss
    @State private var register = false; @State private var email = ""; @State private var password = ""; @State private var nickname = ""; @State private var code = ""; @State private var notifications = true; @State private var busy = false; @State private var error: String?
    var body: some View {
        Form {
            Section { Text(register ? "加入校园圈" : "欢迎回来").font(.largeTitle.bold()).foregroundStyle(Theme.ink); Text("中国人民大学苏州校区").foregroundStyle(.secondary) }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            Section {
                TextField("邮箱地址", text: $email).textInputAutocapitalization(.never).keyboardType(.emailAddress)
                if register { TextField("校园昵称", text: $nickname); HStack { TextField("6 位验证码", text: $code).keyboardType(.numberPad); Button("获取验证码") { Task { await sendCode() } } }; Toggle("接收新消息邮件提醒", isOn: $notifications) }
                SecureField("密码（至少 8 位）", text: $password)
            }
            Section { Button(busy ? "请稍候…" : (register ? "创建账号并登录" : "登录")) { Task { await submit() } }.disabled(busy || email.isEmpty || password.count < 8).frame(maxWidth: .infinity); Button(register ? "已有账号？返回登录" : "第一次来？创建邮箱账号") { register.toggle(); error = nil }.frame(maxWidth: .infinity) }
        }.navigationTitle("校园身份").toolbar { ToolbarItem(placement: .cancellationAction) { Button("关闭") { dismiss() } } }
    }
    private func sendCode() async { struct P: Encodable { let email: String }; do { let _: OKResponse = try await APIClient.shared.request("/api/auth/email-code", method: "POST", body: P(email: email)); error = "验证码已发送，请检查邮箱。" } catch { self.error = error.localizedDescription } }
    private func submit() async { busy = true; defer { busy = false }; do { if register { try await session.register(email: email, password: password, nickname: nickname, code: code, notifications: notifications) } else { try await session.login(email: email, password: password) }; dismiss() } catch { self.error = error.localizedDescription } }
}

struct PublishView: View {
    @EnvironmentObject var session: SessionStore
    @State private var title = ""; @State private var price = ""; @State private var category = MarketData.categories[0]; @State private var condition = MarketData.conditions[1]; @State private var details = ""
    @State private var picks: [PhotosPickerItem] = []; @State private var images: [Data] = []; @State private var busy = false; @State private var notice: String?
    var body: some View {
        Group {
            if session.user == nil { ContentUnavailableView { Label("登录后发布", systemImage: "person.crop.circle.badge.plus") } description: { Text("登录校园账号，发布你的闲置好物。") } actions: { Button("去登录") { session.showLogin = true }.buttonStyle(.borderedProminent).tint(Theme.ink) } }
            else if !session.isCampusUser { ContentUnavailableView("仅限校园用户", systemImage: "checkmark.shield", description: Text("请使用完成验证的 @ruc.edu.cn 邮箱账号。")) }
            else { Form {
                Section("图片（最多 9 张）") { PhotosPicker(selection: $picks, maxSelectionCount: 9, matching: .images) { Label("选择商品图片", systemImage: "photo.on.rectangle.angled") }.onChange(of: picks) { _, new in Task { await loadPhotos(new) } }; Text("已选 \(images.count) 张").font(.caption).foregroundStyle(.secondary); if !images.isEmpty { ScrollView(.horizontal) { HStack { ForEach(Array(images.enumerated()), id: \.offset) { _, data in if let ui = UIImage(data: data) { Image(uiImage: ui).resizable().scaledToFill().frame(width: 80, height: 80).clipShape(RoundedRectangle(cornerRadius: 10)) } } } } } }
                Section("商品信息") { TextField("标题（至少 3 个字）", text: $title); TextField("价格", text: $price).keyboardType(.decimalPad); Picker("分类", selection: $category) { ForEach(MarketData.categories, id: \.self) { Text($0) } }; Picker("成色", selection: $condition) { ForEach(MarketData.conditions, id: \.self) { Text($0) } }; TextField("详细描述", text: $details, axis: .vertical).lineLimit(4...10) }
                Section { Button(busy ? "发布中…" : "确认发布") { Task { await publish() } }.frame(maxWidth: .infinity).disabled(busy || title.count < 3 || Double(price) == nil || images.isEmpty) }
            } }
        }.navigationTitle("发布闲置").alert("提示", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) { Button("知道了") {} } message: { Text(notice ?? "") }
    }
    private func loadPhotos(_ values: [PhotosPickerItem]) async { var result: [Data] = []; for value in values { if let data = try? await value.loadTransferable(type: Data.self), let ui = UIImage(data: data), let jpg = ui.jpegData(compressionQuality: 0.82) { result.append(jpg) } }; images = result }
    private func publish() async {
        struct Payload: Encodable { let title: String; let price: Double; let category, condition, description: String; let images: [String] }
        guard let value = Double(price) else { return }; busy = true; defer { busy = false }
        do { let urls = try await APIClient.shared.upload(images.map { ($0, "image/jpeg") }); let _: IDResponse = try await APIClient.shared.request("/api/items", method: "POST", body: Payload(title: title, price: value, category: category, condition: condition, description: details, images: urls)); title = ""; price = ""; details = ""; picks = []; images = []; notice = "发布成功，你的好物已经上架。" } catch { notice = error.localizedDescription }
    }
}
