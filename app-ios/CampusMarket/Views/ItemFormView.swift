import SwiftUI
import PhotosUI
import UIKit

// MARK: - 商品发布 / 编辑表单

/// 统一的图片条目：已有远程图或新选本地图，在同一个可排序列表中管理。
enum ItemImageEntry: Identifiable, Equatable {
    case remote(String)   // 已在服务端的图片 URL（保留，不重传）
    case local(String)    // 新选图片落到草稿目录的文件名

    var id: String {
        switch self { case .remote(let url): return "r:\(url)"; case .local(let name): return "l:\(name)" }
    }
    var remoteURL: String? { if case .remote(let url) = self { return url }; return nil }
    var localFile: String? { if case .local(let name) = self { return name }; return nil }
}

@MainActor
final class ItemFormModel: ObservableObject {
    @Published var itemID: Int?
    @Published var title = ""; @Published var price = ""; @Published var currency = "cny"
    @Published var rmbPrice = ""; @Published var category = MarketData.categories[0]
    @Published var condition = MarketData.conditions[1]; @Published var detail = ""
    @Published var kind = MarketData.kinds[0]; @Published var regions: [String] = []
    @Published var campusId = ""; @Published var status = "在售"
    @Published var images: [ItemImageEntry] = []
    @Published var picks: [PhotosPickerItem] = []
    @Published var busy = false; @Published var error: String?
    @Published var loadingEdit = false
    @Published var editing = false

    /// 上传进度：总体 0…1，以及每张图片的上传状态（用于进度与失败重试）。
    @Published var uploadProgress: Double = 0
    @Published var imageUploadStates: [String: UploadItemState] = [:]

    var userId: Int?
    var store: DraftStore { .shared }

    func setup(userId: Int?, session: SessionStore) {
        self.userId = userId
        editing = itemID != nil
        if campusId.isEmpty { campusId = session.scope?.campusId ?? "" }
        var restoredDraft = false
        if let draft = store.load(for: userId), draft.itemID == itemID {
            // 新建草稿只恢复到新建页；编辑草稿只恢复到同一商品，避免串稿。
            restore(draft)
            restoredDraft = true
        }
        // 编辑失败后的本地内容优先于服务端回填，否则恢复后会被网络响应覆盖。
        if editing && !restoredDraft { Task { await loadForEdit() } }
    }

    private func restore(_ d: ItemDraft) {
        title = d.title; price = d.price; currency = d.currency; rmbPrice = d.rmbPrice
        category = d.category; condition = d.condition; detail = d.detail; kind = d.kind
        regions = d.regions; campusId = d.campusId.isEmpty ? campusId : d.campusId; status = d.status
        images = d.existingImageURLs.map { .remote($0) } + d.newImageFiles.map { .local($0) }
    }

    func draft() -> ItemDraft {
        var d = ItemDraft()
        d.itemID = itemID; d.title = title; d.price = price; d.currency = currency; d.rmbPrice = rmbPrice
        d.category = category; d.condition = condition; d.detail = detail; d.kind = kind
        d.regions = regions; d.campusId = campusId; d.status = status
        d.existingImageURLs = images.compactMap(\.remoteURL)
        d.newImageFiles = images.compactMap(\.localFile)
        return d
    }

    func persistDraft() { store.save(draft(), for: userId) }
    func clearDraft() { store.clear(for: userId) }

    func loadForEdit() async {
        guard let id = itemID else { return }
        loadingEdit = true; defer { loadingEdit = false }
        do {
            let r: ItemResponse = try await APIClient.shared.request("/api/items/\(id)")
            let it = r.item
            title = it.title; price = it.price.rounded() == it.price ? String(Int(it.price)) : String(it.price)
            currency = it.currency.isEmpty ? "cny" : it.currency
            rmbPrice = it.rmbPrice.map { $0.rounded() == $0 ? String(Int($0)) : String($0) } ?? ""
            category = it.category; condition = it.condition; detail = it.description; kind = it.kind.isEmpty ? "商品" : it.kind
            regions = it.regions; campusId = it.campusId ?? campusId; status = it.status
            images = it.images.map { .remote($0) }
        } catch { self.error = error.localizedDescription }
    }

    func loadPhotos(_ values: [PhotosPickerItem]) async {
        for value in values {
            if let data = try? await value.loadTransferable(type: Data.self), let name = store.persistImage(data) {
                images.append(.local(name))
            }
        }
        persistDraft()
    }

    func removeImage(at index: Int) {
        let entry = images[index]
        if let file = entry.localFile { store.removeImageFile(file) }
        images.remove(at: index)
        persistDraft()
    }

    func moveImage(from source: IndexSet, to destination: Int) {
        images.move(fromOffsets: source, toOffset: destination)
        persistDraft()
    }

    func toggleRegion(_ region: String) {
        if let idx = regions.firstIndex(of: region) { regions.remove(at: idx) } else { regions.append(region) }
    }

    var canSubmit: Bool {
        !busy && title.trimmingCharacters(in: .whitespaces).count >= 3 &&
        Double(price) != nil && !images.isEmpty && !regions.isEmpty
    }

    /// 上传新图并组装最终图片 URL 数组（保持当前排序）。
    /// 逐张上传：展示总体与单张进度，失败记录到 `imageUploadStates` 供重试。
    private func uploadedImageURLs() async throws -> [String] {
        var result: [String] = []
        let localEntries = images.compactMap { entry -> (String, ItemImageEntry)? in
            if let file = entry.localFile { return (file, entry) }; return nil
        }
        let total = Double(max(localEntries.count, 1))
        var done = 0.0
        uploadProgress = 0
        imageUploadStates = [:]
        for (_, entry) in localEntries {
            guard let file = entry.localFile else { continue }
            let id = entry.id
            imageUploadStates[id] = .uploading
            defer { done += 1; uploadProgress = done / total }
            do {
                guard let data = store.imageData(fileName: file) else {
                    imageUploadStates[id] = .failed("图片读取失败"); continue
                }
                let url = try await APIClient.shared.uploadSingle(data)
                imageUploadStates[id] = .done
                // 按当前排序把上传后的 URL 填回对应位置。
                result.append(url)
            } catch {
                imageUploadStates[id] = .failed(error.localizedDescription)
                result.append("")
            }
        }
        // 若存在失败项，则抛出以便上层保留草稿并提示重试。
        if imageUploadStates.values.contains(where: { $0.isFailed }) {
            throw APIError.server("部分图片上传失败，请重试。")
        }
        // 按 images 顺序重组（remote 直接保留，local 用上传结果）。
        var ordered: [String] = []
        var uploadCursor = 0
        for entry in images {
            switch entry {
            case .remote(let url): ordered.append(url)
            case .local:
                if uploadCursor < result.count { ordered.append(result[uploadCursor]); uploadCursor += 1 }
            }
        }
        return ordered
    }

    func payload() async throws -> ItemPayload {
        let urls = try await uploadedImageURLs()
        let p = Double(price) ?? 0
        return ItemPayload(
            title: title.trimmingCharacters(in: .whitespaces),
            price: p, currency: currency,
            rmbPrice: currency == "lungmen" ? Double(rmbPrice) : nil,
            regions: regions, kind: kind,
            images: urls, category: category, condition: condition,
            description: detail, status: editing ? status : nil,
            campusId: campusId.isEmpty ? nil : campusId)
    }
}

struct ItemFormView: View {
    @EnvironmentObject var session: SessionStore
    @Environment(\.dismiss) var dismiss
    @StateObject private var model = ItemFormModel()
    @State private var notice: String?
    @State private var showCamera = false
    @State private var cameraDenied = false
    var itemID: Int?

    init(itemID: Int? = nil) { self.itemID = itemID }

    var body: some View {
        Group {
            if session.user == nil {
                ContentUnavailableView { Label("登录后发布", systemImage: "person.crop.circle.badge.plus") } description: { Text("登录校园账号，发布你的闲置好物。") } actions: { Button("去登录") { session.showLogin = true }.buttonStyle(.borderedProminent).tint(Theme.ink) }
            } else if !session.isCampusUser {
                ContentUnavailableView("仅限校园用户", systemImage: "checkmark.shield", description: Text("请使用完成验证的 \(session.campusEmailHint) 邮箱账号。"))
            } else if model.loadingEdit {
                LoadingState()
            } else {
                form
            }
        }
        .navigationTitle(model.editing ? "编辑商品" : "发布闲置").navigationBarTitleDisplayMode(.inline)
        .onAppear { model.itemID = itemID; model.setup(userId: session.user?.id, session: session) }
        .alert("提示", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) { Button("知道了") {} } message: { Text(notice ?? "") }
        .confirmationDialog("清除草稿？", isPresented: $showClearDraftConfirm, titleVisibility: .visible) {
            Button("清除草稿", role: .destructive) { model.clearDraft(); resetLocalFields() }
            Button("取消", role: .cancel) {}
        } message: { Text("清除当前未提交的草稿内容。") }
        .sheet(isPresented: $showCamera) {
            CameraPicker { image in
                if let data = image.jpegData(compressionQuality: 0.85),
                   let name = model.store.persistImage(data) {
                    model.images.append(.local(name))
                    model.persistDraft()
                }
            }
            .ignoresSafeArea()
        }
        .alert("无法使用相机", isPresented: $cameraDenied) {
            Button("前往系统设置") { SystemCapability.shared.openSystemSettings() }
            Button("取消", role: .cancel) {}
        } message: { Text("相机权限未开启。请在系统设置中允许「校园闲置」使用相机。") }
        .toolbar {
            if hasDraft && !model.editing {
                ToolbarItem(placement: .topBarTrailing) { Button("清除草稿") { showClearDraftConfirm = true } }
            }
        }
    }

    @State private var showClearDraftConfirm = false
    private var hasDraft: Bool { DraftStore.shared.load(for: session.user?.id) != nil }

    @ViewBuilder private var form: some View {
        let campuses = session.campuses(forSchool: session.user?.schoolId)
        let photoPickerLabel = model.images.isEmpty ? "选择商品图片" : "追加图片"
        Form {
            if let error = model.error, !model.loadingEdit { Section { Text(error).foregroundStyle(.red) } }

            Section("图片（最多 9 张，可拖动排序）") {
                HStack(spacing: 12) {
                    PhotosPicker(selection: $model.picks, maxSelectionCount: 9, matching: .images) {
                        Label(photoPickerLabel, systemImage: "photo.on.rectangle.angled")
                    }.disabled(model.images.count >= 9)
                    .onChange(of: model.picks) { _, new in Task { await model.loadPhotos(new); model.picks = [] } }
                    Button {
                        Task {
                            if await SystemCapability.shared.requestCamera() { showCamera = true }
                            else { cameraDenied = true }
                        }
                    } label: { Label("拍摄", systemImage: "camera.fill") }.disabled(model.images.count >= 9 || !SystemCapability.shared.cameraAvailable)
                }
                Text("已选 \(model.images.count) 张 · 可用相册或相机拍摄 · 点击右上角编辑可删除和排序").font(.caption).foregroundStyle(.secondary)
                if (model.busy || hasUploadFailure) && model.images.contains(where: { $0.localFile != nil }) {
                    uploadProgressRow
                }
                imageEditor
            }

            Section("商品信息") {
                if !campuses.isEmpty {
                    Picker("发布校区", selection: $model.campusId) { ForEach(campuses, id: \.id) { Text($0.name).tag($0.id) } }
                }
                Picker("交易币种", selection: $model.currency) { Text("人民币").tag("cny"); Text("原石").tag("lungmen") }
                if model.currency == "lungmen" {
                    TextField("人民币参考价（可选）", text: $model.rmbPrice).keyboardType(.decimalPad)
                }
                TextField("标题（至少 3 个字）", text: $model.title)
                TextField("价格（\(model.currency == "lungmen" ? "正整数" : "元")）", text: $model.price).keyboardType(.decimalPad)
                Picker("分类", selection: $model.category) { ForEach(MarketData.categories, id: \.self) { Text($0) } }
                Picker("成色", selection: $model.condition) { ForEach(MarketData.conditions, id: \.self) { Text($0) } }
                Picker("发布性质", selection: $model.kind) { ForEach(MarketData.kinds, id: \.self) { Text($0) } }
                TextField("详细描述", text: $model.detail, axis: .vertical).lineLimit(4...10)
            }

            Section("商品区域（至少选一个）") {
                ForEach(MarketData.regions, id: \.self) { region in
                    let selected = model.regions.contains(region)
                    Button { model.toggleRegion(region) } label: {
                        HStack { Text(region).foregroundStyle(.primary); Spacer(); Image(systemName: selected ? "checkmark.circle.fill" : "circle").foregroundStyle(selected ? Theme.coral : .secondary) }
                    }.buttonStyle(.plain)
                }
            }

            if model.editing {
                Section("商品状态") {
                    Picker("状态", selection: $model.status) { ForEach(MarketData.itemStatuses, id: \.self) { Text($0) } }
                }
            }

            Section {
                Button(model.busy ? "提交中…" : (model.editing ? "保存修改" : "确认发布")) { Task { await submit() } }
                    .disabled(!model.canSubmit).frame(maxWidth: .infinity)
            } footer: {
                Text("发布失败后会保留草稿，可稍后重试。").font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder private var imageEditor: some View {
        if model.images.isEmpty {
            Text("还没有图片").font(.caption).foregroundStyle(.secondary)
        } else {
            // 网格预览：每张可单独删除。
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: 10)], spacing: 10) {
                ForEach(Array(model.images.enumerated()), id: \.element.id) { index, entry in
                    imageThumb(entry)
                        .overlay(alignment: .topTrailing) {
                            Button { model.removeImage(at: index) } label: {
                                Image(systemName: "xmark.circle.fill").font(.title3).foregroundStyle(.white, .black.opacity(0.65))
                            }.buttonStyle(.plain).accessibilityLabel("删除第 \(index + 1) 张图片")
                        }
                        .overlay(alignment: .bottomTrailing) {
                            Text("\(index + 1)").font(.caption2.bold()).padding(3).background(.black.opacity(0.55), in: Capsule()).foregroundStyle(.white)
                        }
                }
            }
            Text("拖动下方列表调整顺序，第一张为封面").font(.caption).foregroundStyle(.secondary).padding(.top, 4)
            // 拖动排序列表（原生 onMove）。
            List {
                ForEach(Array(model.images.enumerated()), id: \.element.id) { index, entry in
                    HStack { imageThumb(entry); Spacer(); Text("第 \(index + 1) 张").font(.caption).foregroundStyle(.secondary) }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("第 \(index + 1) 张图片")
                }
                .onMove(perform: model.moveImage)
            }
            .listStyle(.plain)
            .frame(height: CGFloat(max(model.images.count, 2) * 56))
            .environment(\.editMode, .constant(.active))
        }
    }

    @ViewBuilder private func imageThumb(_ entry: ItemImageEntry) -> some View {
        Group {
            switch entry {
            case .remote(let url):
                AsyncImage(url: URL(string: url)) { phase in
                    if let img = phase.image { img.resizable().scaledToFill() }
                    else { ZStack { Color.gray.opacity(0.12); Image(systemName: "photo") } }
                }
            case .local(let file):
                if let data = DraftStore.shared.imageData(fileName: file), let ui = UIImage(data: data) {
                    Image(uiImage: ui).resizable().scaledToFill()
                } else {
                    ZStack { Color.gray.opacity(0.12); Image(systemName: "photo") }
                }
            }
        }
        .frame(width: 72, height: 72).clipShape(RoundedRectangle(cornerRadius: 10))
    }

    /// 上传总体进度 + 单张状态（失败可重试）。
    private var hasUploadFailure: Bool {
        model.images.contains { model.imageUploadStates[$0.id]?.isFailed == true }
    }

    @ViewBuilder private var uploadProgressRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            ProgressView(value: model.uploadProgress) { Text("正在上传图片… \(Int(model.uploadProgress * 100))%").font(.caption) }
            let failed = model.images.filter { entry in
                entry.localFile != nil && model.imageUploadStates[entry.id]?.isFailed == true
            }
            if !failed.isEmpty {
                HStack(spacing: 8) {
                    Text("\(failed.count) 张上传失败").font(.caption).foregroundStyle(.red)
                    Button("重试") { Task { await retryUpload() } }.font(.caption.weight(.semibold)).foregroundStyle(Theme.coral)
                }
            }
        }
    }

    private func retryUpload() async {
        // 重试：清除失败状态后重新提交，复用 submit 的压缩+上传链路。
        for entry in model.images where model.imageUploadStates[entry.id]?.isFailed == true {
            model.imageUploadStates[entry.id] = .pending
        }
        await submit()
    }

    private func resetLocalFields() {
        model.title = ""; model.price = ""; model.rmbPrice = ""; model.detail = ""
        model.currency = "cny"; model.category = MarketData.categories[0]; model.condition = MarketData.conditions[1]
        model.kind = MarketData.kinds[0]; model.regions = []; model.images = []; model.status = "在售"
    }

    private func submit() async {
        model.busy = true; defer { model.busy = false }
        do {
            let payload = try await model.payload()
            if model.editing, let id = model.itemID {
                let _: OKResponse = try await APIClient.shared.request("/api/items/\(id)", method: "PATCH", body: payload)
                model.clearDraft()
                notice = "修改已保存。"
            } else {
                let _: IDResponse = try await APIClient.shared.request("/api/items", method: "POST", body: payload)
                model.clearDraft()
                notice = "发布成功，你的好物已经上架。"
            }
            dismiss()
        } catch {
            // 失败不丢草稿：先落盘，再提示。
            model.persistDraft()
            notice = "提交失败，内容已保存为草稿，可稍后重试。\n\(error.localizedDescription)"
        }
    }
}
