package com.campusmarket.app.ui.screens.safety

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.campusmarket.app.ui.components.AppTopBar

private val tips = listOf(
    "线下交易" to "尽量选择校内公共场所(图书馆、食堂、教学楼大厅)当面交易,避免前往偏僻地点。",
    "核实身份" to "优先与校园认证用户交易;交易前可要求对方出示校园卡或学生证信息。",
    "验货付款" to "先验货后付款。二手商品当面检查外观、功能,确认无误后再转账。",
    "资金安全" to "拒绝任何形式的「先交押金/定金再发货」要求,不扫描来源不明的二维码。",
    "保护隐私" to "不向陌生人透露宿舍号、学号、身份证号等个人信息,站内聊天即可完成沟通。",
    "警惕低价" to "明显低于市场价的商品多为诈骗,谨防「低价引流、诱导转账」套路。",
    "及时举报" to "发现虚假信息、诈骗行为请使用举报功能,我们会尽快处理并封禁相关账号。",
)

/** 安全交易指南(静态内容,与 Web 端 SafetyPage 对齐)。 */
@Composable
fun SafetyScreen(onBack: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        AppTopBar("安全交易指南", onBack = onBack)
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
        ) {
            Text("线下交易,安全第一", style = MaterialTheme.typography.titleLarge)
            Text(
                "本平台仅提供信息撮合,交易由买卖双方线下完成。请务必遵守以下安全建议:",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.secondary,
                modifier = Modifier.padding(top = 6.dp, bottom = 16.dp),
            )
            tips.forEach { (title, body) ->
                Column(Modifier.padding(vertical = 8.dp)) {
                    Text(title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
                    Text(body, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 2.dp))
                }
            }
            Text(
                "如遇可疑行为,请立即停止交易并通过举报功能或意见反馈联系我们。",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 16.dp, bottom = 32.dp),
            )
        }
    }
}
