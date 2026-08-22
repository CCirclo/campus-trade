package com.campusmarket.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// 品牌色:校园绿(与 Web 端主色一致)
val BrandGreen = Color(0xFF16A34A)
val BrandGreenDark = Color(0xFF15803D)
val BrandGreenContainer = Color(0xFFDCFCE7)
val WarningOrange = Color(0xFFF59E0B)
val DangerRed = Color(0xFFDC2626)

private val LightColors = lightColorScheme(
    primary = BrandGreen,
    onPrimary = Color.White,
    primaryContainer = BrandGreenContainer,
    onPrimaryContainer = Color(0xFF14532D),
    secondary = Color(0xFF64748B),
    surface = Color(0xFFFAFAF9),
    background = Color(0xFFF5F5F4),
    outlineVariant = Color(0xFFE7E5E4),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF4ADE80),
    onPrimary = Color(0xFF052E16),
    primaryContainer = Color(0xFF166534),
    onPrimaryContainer = Color(0xFFDCFCE7),
    secondary = Color(0xFF94A3B8),
    surface = Color(0xFF1C1917),
    background = Color(0xFF121110),
    outlineVariant = Color(0xFF44403C),
)

@Composable
fun CampusMarketTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = Typography(),
        content = content,
    )
}
