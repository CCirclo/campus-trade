package com.campusmarket.app.util

import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

private val shanghai: ZoneId = ZoneId.of("Asia/Shanghai")

private fun parse(value: String?): ZonedDateTime? {
    if (value.isNullOrBlank()) return null
    return try {
        ZonedDateTime.ofInstant(Instant.parse(value), shanghai)
    } catch (_: Exception) {
        try {
            // 兼容无时区的 MySQL 时间格式
            val local = java.time.LocalDateTime.parse(value)
            local.atZone(shanghai)
        } catch (_: Exception) {
            null
        }
    }
}

/** 与 Web 端 `time.ts` 对齐的相对时间展示。 */
fun formatTimestamp(value: String?, now: Long = System.currentTimeMillis()): String {
    val date = parse(value) ?: return "时间未知"
    val diff = (now - date.toInstant().toEpochMilli()).coerceAtLeast(0)
    if (diff < 60_000) return "刚刚"
    if (diff < 3_600_000) return "${diff / 60_000} 分钟前"
    val today = ZonedDateTime.ofInstant(Instant.ofEpochMilli(now), shanghai)
    val clock = "%02d:%02d".format(date.hour, date.minute)
    return when {
        today.toLocalDate() == date.toLocalDate() -> "今天 $clock"
        today.toLocalDate().minusDays(1) == date.toLocalDate() -> "昨天 $clock"
        today.year == date.year -> "${date.monthValue}月${date.dayOfMonth}日"
        else -> "${date.year}年${date.monthValue}月${date.dayOfMonth}日"
    }
}

private val clockFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")

/** 完整时间(用于详情页等场景)。 */
fun formatFullTimestamp(value: String?): String {
    val date = parse(value) ?: return "时间未知"
    return clockFormatter.format(date)
}
