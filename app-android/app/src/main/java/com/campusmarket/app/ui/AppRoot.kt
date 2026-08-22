package com.campusmarket.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material.icons.filled.Person
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.NavType
import com.campusmarket.app.data.ApiClient
import com.campusmarket.app.data.SessionManager
import com.campusmarket.app.ui.screens.auth.ChangePasswordScreen
import com.campusmarket.app.ui.screens.auth.LoginScreen
import com.campusmarket.app.ui.screens.auth.ResetPasswordScreen
import com.campusmarket.app.ui.screens.chat.ChatScreen
import com.campusmarket.app.ui.screens.chat.MessagesScreen
import com.campusmarket.app.ui.screens.home.HomeScreen
import com.campusmarket.app.ui.screens.home.ItemDetailScreen
import com.campusmarket.app.ui.screens.home.UserProfileScreen
import com.campusmarket.app.ui.screens.mine.CollectionScreen
import com.campusmarket.app.ui.screens.mine.CropScreen
import com.campusmarket.app.ui.screens.mine.EditProfileScreen
import com.campusmarket.app.ui.screens.mine.FeedbackScreen
import com.campusmarket.app.ui.screens.mine.MineScreen
import com.campusmarket.app.ui.screens.mine.WalletScreen
import com.campusmarket.app.ui.screens.publish.PublishScreen
import com.campusmarket.app.ui.screens.safety.SafetyScreen
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

object Routes {
    const val LOGIN = "login"
    const val RESET_PASSWORD = "reset-password"
    const val CHANGE_PASSWORD = "change-password"
    const val HOME = "home"
    const val PUBLISH = "publish"
    const val MESSAGES = "messages"
    const val MINE = "mine"
    const val ITEM = "item/{itemId}"
    const val USER = "user/{userId}"
    const val CHAT = "chat/{conversationId}"
    const val COLLECTION = "collection/{kind}"
    const val EDIT_PROFILE = "edit-profile"
    const val CROP = "crop"
    const val WALLET = "wallet"
    const val FEEDBACK = "feedback"
    const val SAFETY = "safety"

    fun item(itemId: Long) = "item/$itemId"
    fun user(userId: Long) = "user/$userId"
    fun chat(conversationId: Long) = "chat/$conversationId"
    fun collection(kind: String) = "collection/$kind"
}

/** 底部导航 4 个顶层目的地(与 Web 端 bottom-nav 对齐)。 */
private data class TabItem(val route: String, val label: String, val icon: ImageVector)

private val tabs = listOf(
    TabItem(Routes.HOME, "首页", Icons.Filled.Home),
    TabItem(Routes.PUBLISH, "发布", Icons.Filled.AddCircle),
    TabItem(Routes.MESSAGES, "消息", Icons.Filled.MailOutline),
    TabItem(Routes.MINE, "我的", Icons.Filled.Person),
)

/** 不显示底部导航的全屏页面。 */
private val fullScreenRoutes = setOf(Routes.LOGIN, Routes.CROP)

@Composable
fun AppRoot() {
    val navController = rememberNavController()
    val user by SessionManager.user.collectAsStateWithLifecycle()
    val ready by SessionManager.ready.collectAsStateWithLifecycle()

    // 会话失效(401/退出登录)→ 回到登录页
    LaunchedEffect(ready, user) {
        if (ready && user == null) {
            navController.navigate(Routes.LOGIN) {
                popUpTo(0) { inclusive = true }
                launchSingleTop = true
            }
        }
    }

    if (!ready) {
        Splash()
        return
    }

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route

    Scaffold(
        bottomBar = {
            if (currentRoute !in fullScreenRoutes) {
                BottomBar(navController, currentRoute)
            }
        },
    ) { padding ->
    NavHost(
        navController = navController,
        startDestination = if (user == null) Routes.LOGIN else Routes.HOME,
        modifier = Modifier.padding(padding),
    ) {
        composable(Routes.LOGIN) {
            LoginScreen(
                onLoggedIn = { navController.goHome() },
                onForgotPassword = { navController.navigate(Routes.RESET_PASSWORD) },
            )
        }
        composable(Routes.RESET_PASSWORD) { ResetPasswordScreen(onBack = { navController.popBackStack() }) }
        composable(Routes.HOME) { HomeScreen(onOpenItem = { navController.navigate(Routes.item(it)) }, onOpenUser = { navController.navigate(Routes.user(it)) }) }
        composable(Routes.PUBLISH, arguments = listOf(navArgument("itemId") { type = NavType.LongType; defaultValue = -1L })) { PublishScreen(itemId = it.arguments?.getLong("itemId") ?: -1L, onDone = { id -> navController.navigate(Routes.item(id)) { popUpTo(Routes.HOME) } }, onBack = { navController.popBackStack() }) }
        composable(Routes.MESSAGES) { MessagesScreen(onOpenChat = { navController.navigate(Routes.chat(it)) }) }
        composable(Routes.MINE) { MineScreen(onOpen = { route -> navController.navigate(route) }) }
        composable(Routes.ITEM, arguments = listOf(navArgument("itemId") { type = NavType.LongType })) { backStack ->
            ItemDetailScreen(
                itemId = backStack.arguments?.getLong("itemId") ?: 0L,
                onBack = { navController.popBackStack() },
                onOpenUser = { navController.navigate(Routes.user(it)) },
                onChat = { id -> navController.navigate(Routes.chat(id)) },
            )
        }
        composable(Routes.USER, arguments = listOf(navArgument("userId") { type = NavType.LongType })) { backStack ->
            UserProfileScreen(
                userId = backStack.arguments?.getLong("userId") ?: 0L,
                onBack = { navController.popBackStack() },
                onOpenItem = { navController.navigate(Routes.item(it)) },
            )
        }
        composable(Routes.CHAT, arguments = listOf(navArgument("conversationId") { type = NavType.LongType })) { backStack ->
            ChatScreen(
                conversationId = backStack.arguments?.getLong("conversationId") ?: 0L,
                onBack = { navController.popBackStack() },
                onOpenItem = { navController.navigate(Routes.item(it)) },
            )
        }
        composable(Routes.COLLECTION, arguments = listOf(navArgument("kind") { type = NavType.StringType })) { backStack ->
            CollectionScreen(
                kind = backStack.arguments?.getString("kind") ?: "mine",
                onBack = { navController.popBackStack() },
                onOpenItem = { navController.navigate(Routes.item(it)) },
                onEditItem = { navController.navigate("publish?itemId=$it") },
            )
        }
        composable(Routes.EDIT_PROFILE) {
            EditProfileScreen(
                onBack = { navController.popBackStack() },
                onCrop = { navController.navigate(Routes.CROP) },
            )
        }
        composable(Routes.CROP) {
            CropScreen(
                onCancel = { navController.popBackStack() },
                onDone = { navController.popBackStack() },
            )
        }
        composable(Routes.WALLET) { WalletScreen(onBack = { navController.popBackStack() }) }
        composable(Routes.FEEDBACK) { FeedbackScreen(onBack = { navController.popBackStack() }) }
        composable(Routes.CHANGE_PASSWORD) { ChangePasswordScreen(onBack = { navController.popBackStack() }) }
        composable(Routes.SAFETY) { SafetyScreen(onBack = { navController.popBackStack() }) }
        }
    }
}

private fun NavHostController.goHome() {
    navigate(Routes.HOME) {
        popUpTo(0) { inclusive = true }
        launchSingleTop = true
    }
}

@Composable
private fun Splash() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
    }
}

/** 底部导航栏:消息页带未读角标(10 秒轮询,与 Web 端一致)。 */
@Composable
private fun BottomBar(navController: NavHostController, currentRoute: String?) {
    var unread by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        while (isActive) {
            runCatching { unread = ApiClient.api.unreadCount().count }
            delay(10_000)
        }
    }
    NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
        tabs.forEach { tab ->
            val selected = currentRoute == tab.route
            NavigationBarItem(
                selected = selected,
                onClick = {
                    navController.navigate(tab.route) {
                        popUpTo(navController.graph.startDestinationId) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                icon = {
                    if (tab.route == Routes.MESSAGES) {
                        BadgedBox(badge = {
                            if (unread > 0) {
                                Badge { Text(if (unread > 99) "99+" else "$unread") }
                            }
                        }) {
                            Icon(tab.icon, contentDescription = tab.label)
                        }
                    } else {
                        Icon(tab.icon, contentDescription = tab.label)
                    }
                },
                label = { Text(tab.label) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = MaterialTheme.colorScheme.primary,
                    selectedTextColor = MaterialTheme.colorScheme.primary,
                    indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                ),
            )
        }
    }
}
