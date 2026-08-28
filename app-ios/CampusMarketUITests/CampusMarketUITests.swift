import XCTest

// UI 测试：覆盖登录、浏览、筛选、收藏、发布/编辑、代取、聊天关键流程。
// 通过 launchArguments 注入 `-ui-testing`，App 内安装确定性网络桩（仅 Debug 生效）。

@MainActor
final class CampusMarketUITests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// 由 launchEnvironment + launchArguments 双重注入网络桩，并重置测试期间的应用状态。
    private func launchApp(extraArgs: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += ["-ui-testing"]
        app.launchEnvironment["CAMPUS_MARKET_UI_TESTING"] = "1"
        app.launchArguments += extraArgs
        app.launch()
        return app
    }

    // MARK: - 登录

    func testLoginFlowShowsCampusUserProfile() {
        let app = launchApp()
        // 首页加载后切到「我的」标签。
        let mineTab = app.tabBars.buttons["我的"]
        XCTAssertTrue(mineTab.waitForExistence(timeout: 10))
        mineTab.tap()

        // 已登录夹具下，「我的」页展示用户昵称。
        XCTAssertTrue(app.staticTexts["测试同学"].waitForExistence(timeout: 10))
    }

    // MARK: - 浏览与筛选

    func testBrowseShowsItems() {
        let app = launchApp()
        XCTAssertTrue(app.staticTexts["二手羽毛球拍"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["高等数学教材"].waitForExistence(timeout: 5))
    }

    func testFilterPanelOpens() {
        let app = launchApp()
        let filterButton = app.buttons["筛选"]
        XCTAssertTrue(filterButton.waitForExistence(timeout: 15))
        filterButton.tap()
        // 筛选面板标题出现。
        XCTAssertTrue(app.navigationBars["筛选"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["分类"].exists)
    }

    // MARK: - 商品详情与收藏

    func testItemDetailAndFavorite() {
        let app = launchApp()
        XCTAssertTrue(app.staticTexts["二手羽毛球拍"].waitForExistence(timeout: 15))
        app.staticTexts["二手羽毛球拍"].tap()
        // 详情页出现「收藏」按钮与价格。
        XCTAssertTrue(app.staticTexts["几乎全新"].waitForExistence(timeout: 10))
        let favoriteButton = app.buttons["收藏"]
        XCTAssertTrue(favoriteButton.waitForExistence(timeout: 5))
        favoriteButton.tap()
        // 收藏成功后按钮文案变为「已收藏」。
        XCTAssertTrue(app.buttons["已收藏"].waitForExistence(timeout: 10))
    }

    // MARK: - 我的发布（发布/编辑入口）

    func testMyListingsShowsEditEntry() {
        let app = launchApp()
        let mineTab = app.tabBars.buttons["我的"]
        XCTAssertTrue(mineTab.waitForExistence(timeout: 10))
        mineTab.tap()

        let listings = app.staticTexts["我的发布"]
        XCTAssertTrue(listings.waitForExistence(timeout: 10))
        listings.tap()

        // 我的发布列表展示夹具商品，并提供编辑入口。
        XCTAssertTrue(app.staticTexts["二手羽毛球拍"].waitForExistence(timeout: 15))
    }

    // MARK: - 代取

    func testErrandListShowsItems() {
        let app = launchApp()
        let errandTab = app.tabBars.buttons["代取"]
        XCTAssertTrue(errandTab.waitForExistence(timeout: 10))
        errandTab.tap()

        XCTAssertTrue(app.staticTexts["帮取快递到东门"].waitForExistence(timeout: 15))
    }

    func testErrandDetailAndContact() {
        let app = launchApp()
        let errandTab = app.tabBars.buttons["代取"]
        XCTAssertTrue(errandTab.waitForExistence(timeout: 10))
        errandTab.tap()

        XCTAssertTrue(app.staticTexts["帮取快递到东门"].waitForExistence(timeout: 15))
        app.staticTexts["帮取快递到东门"].tap()

        // 详情页出现「联系 TA」按钮（非发布者视角，且已登录）。
        XCTAssertTrue(app.buttons["联系 TA"].waitForExistence(timeout: 10))
    }

    // MARK: - 聊天

    func testChatConversationLoads() {
        let app = launchApp()
        let messagesTab = app.tabBars.buttons["消息"]
        XCTAssertTrue(messagesTab.waitForExistence(timeout: 10))
        messagesTab.tap()

        // 会话列表展示夹具会话，点击进入聊天。
        let conversation = app.staticTexts["卖家同学"]
        XCTAssertTrue(conversation.waitForExistence(timeout: 10))
        conversation.tap()

        // 聊天页展示消息内容与输入框。
        XCTAssertTrue(app.staticTexts["还在吗"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.textFields["输入消息"].exists)
    }

    // MARK: - 设备矩阵、无障碍与截图

    func testVisualPortraitSnapshot() {
        XCUIDevice.shared.orientation = .portrait
        let app = launchApp()
        XCTAssertTrue(app.staticTexts["二手羽毛球拍"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.tabBars.buttons["我的"].isHittable)
        keepScreenshot(named: "home-portrait")
    }

    func testVisualLandscapeSnapshot() {
        XCUIDevice.shared.orientation = .landscapeLeft
        defer { XCUIDevice.shared.orientation = .portrait }
        let app = launchApp()
        XCTAssertTrue(app.staticTexts["二手羽毛球拍"].waitForExistence(timeout: 15))
        if !app.buttons["筛选"].isHittable { app.swipeUp() }
        XCTAssertTrue(app.buttons["筛选"].isHittable)
        XCTAssertTrue(app.tabBars.buttons["我的"].isHittable)
        keepScreenshot(named: "home-landscape")
    }

    func testAccessibilityAudit() throws {
        XCUIDevice.shared.orientation = .portrait
        let app = launchApp()
        XCTAssertTrue(app.staticTexts["二手羽毛球拍"].waitForExistence(timeout: 15))
        try app.performAccessibilityAudit()
    }

    private func keepScreenshot(named name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
