import SwiftUI
import PhotosUI
import UIKit

struct AuthView: View {
    @EnvironmentObject var session: SessionStore; @Environment(\.dismiss) var dismiss
    @State private var register = false; @State private var email = ""; @State private var password = ""; @State private var nickname = ""; @State private var code = ""; @State private var notifications = true; @State private var busy = false; @State private var error: String?; @State private var selectedCampus: String? = nil
    var body: some View {
        Form {
            Section { Text(register ? "加入校园圈" : "欢迎回来").font(.largeTitle.bold()).foregroundStyle(Theme.ink); Text(session.scopeTitle).foregroundStyle(.secondary) }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            Section {
                TextField("邮箱地址", text: $email).textInputAutocapitalization(.never).keyboardType(.emailAddress)
                if register {
                    TextField("校园昵称", text: $nickname)
                    if let school = matchedSchool {
                        if school.campuses.count > 1 {
                            Picker("所属校区", selection: campusBinding) {
                                ForEach(school.campuses, id: \.id) { Text($0.name).tag(Optional($0.id)) }
                            }
                        }
                        Text("学校：\(school.name)").font(.caption).foregroundStyle(.secondary)
                    } else if !email.isEmpty {
                        Text("邮箱域名未匹配到已入驻学校，将使用默认范围。").font(.caption).foregroundStyle(.secondary)
                    }
                    HStack { TextField("6 位验证码", text: $code).keyboardType(.numberPad); Button("获取验证码") { Task { await sendCode() } } }; Toggle("接收新消息邮件提醒", isOn: $notifications)
                }
                SecureField("密码（至少 8 位）", text: $password)
            }
            Section { Button(busy ? "请稍候…" : (register ? "创建账号并登录" : "登录")) { Task { await submit() } }.disabled(busy || email.isEmpty || password.count < 8).frame(maxWidth: .infinity); Button(register ? "已有账号？返回登录" : "第一次来？创建邮箱账号") { register.toggle(); error = nil }.frame(maxWidth: .infinity) }
        }.navigationTitle("校园身份").toolbar { ToolbarItem(placement: .cancellationAction) { Button("关闭") { dismiss() } } }
    }
    private var matchedSchool: School? {
        guard let domain = email.split(separator: "@").last.map(String.init) else { return nil }
        guard let schoolId = session.schoolId(forEmailDomain: domain) else { return nil }
        return session.catalog?.schools.first(where: { $0.id == schoolId })
    }
    private var campusBinding: Binding<String?> {
        Binding(get: { selectedCampus ?? matchedSchool?.defaultCampus?.id }, set: { selectedCampus = $0 })
    }
    private func sendCode() async { struct P: Encodable { let email: String }; do { let _: OKResponse = try await APIClient.shared.request("/api/auth/email-code", method: "POST", body: P(email: email)); error = "验证码已发送，请检查邮箱。" } catch { self.error = error.localizedDescription } }
    private func submit() async { busy = true; defer { busy = false }; do { if register { try await session.register(email: email, password: password, nickname: nickname, code: code, notifications: notifications, campusId: selectedCampus ?? matchedSchool?.defaultCampus?.id) } else { try await session.login(email: email, password: password) }; dismiss() } catch { self.error = error.localizedDescription } }
}

struct PublishView: View {
    @EnvironmentObject var session: SessionStore
    var body: some View {
        ItemFormView()
    }
}
