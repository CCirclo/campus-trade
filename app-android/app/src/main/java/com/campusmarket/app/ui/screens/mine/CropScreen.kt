package com.campusmarket.app.ui.screens.mine

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.campusmarket.app.ui.components.AppTopBar
import kotlin.math.min

/**
 * 头像裁剪页:单指拖动 + 双指缩放,中心正方形裁剪框,
 * 输出 512×512 JPEG(≤2MB,压缩在 EditProfile 上传时兜底)。
 */
@Composable
fun CropScreen(onCancel: () -> Unit, onDone: () -> Unit) {
    val context = LocalContext.current
    var bitmap by remember { mutableStateOf<Bitmap?>(null) }
    var error by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        val uri = AvatarCropStore.pendingUri
        if (uri == null) {
            error = "未选择图片"
        } else {
            bitmap = decodeUriBitmap(context, uri)
            if (bitmap == null) error = "无法读取所选图片"
        }
    }

    Column(Modifier.fillMaxSize().background(Color.Black)) {
        AppTopBar("裁剪头像", onBack = onCancel)
        when {
            error.isNotBlank() -> Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Text(error, color = Color.White)
            }
            bitmap == null -> Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Text("加载中…", color = Color.White)
            }
            else -> {
                val source = bitmap!!
                var scale by remember { mutableFloatStateOf(1f) }
                var offset by remember { mutableStateOf(Offset.Zero) }
                val density = LocalDensity.current.density

                BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
                    val boxW = maxWidth.value * density
                    val boxH = maxHeight.value * density
                    val center = Offset(boxW / 2f, boxH / 2f)
                    val containerPx = min(boxW, boxH)
                    val side = containerPx * 0.9f
                    val bmpW = source.width.toFloat()
                    val bmpH = source.height.toFloat()
                    val fitScale = min(containerPx / bmpW, containerPx / bmpH)
                    val dispW = bmpW * fitScale
                    val dispH = bmpH * fitScale
                    val maxX = ((dispW * scale - containerPx) / 2f).coerceAtLeast(0f)
                    val maxY = ((dispH * scale - containerPx) / 2f).coerceAtLeast(0f)

                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .graphicsLayer {
                                scaleX = scale
                                scaleY = scale
                                translationX = offset.x
                                translationY = offset.y
                            }
                            .pointerInput(Unit) {
                                detectTransformGestures { _, pan, zoom, _ ->
                                    scale = (scale * zoom).coerceIn(1f, 4f)
                                    offset = Offset(
                                        x = (offset.x + pan.x).coerceIn(-maxX, maxX),
                                        y = (offset.y + pan.y).coerceIn(-maxY, maxY),
                                    )
                                }
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Image(
                            bitmap = source.asImageBitmap(),
                            contentDescription = "待裁剪图片",
                            contentScale = ContentScale.FillBounds,
                            modifier = Modifier.size(width = (dispW / density).dp, height = (dispH / density).dp),
                        )
                    }

                    // 遮罩:中心正方形外半透明,边框高亮
                    Canvas(Modifier.fillMaxSize()) {
                        val left = center.x - side / 2f
                        val top = center.y - side / 2f
                        val right = center.x + side / 2f
                        val bottom = center.y + side / 2f
                        drawRect(Color.Black.copy(alpha = 0.55f))
                        drawRect(
                            color = Color.Transparent,
                            topLeft = Offset(left, top),
                            size = androidx.compose.ui.geometry.Size(side, side),
                            blendMode = androidx.compose.ui.graphics.BlendMode.Clear,
                        )
                        drawRect(
                            color = Color.White,
                            topLeft = Offset(left, top),
                            size = androidx.compose.ui.geometry.Size(side, side),
                            style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2f),
                        )
                    }

                    // 确认按钮
                    Row(
                        Modifier
                            .align(Alignment.BottomCenter)
                            .padding(24.dp),
                    ) {
                        OutlinedButton(onClick = onCancel, modifier = Modifier.weight(1f).padding(end = 8.dp)) {
                            Text("取消")
                        }
                        Button(
                            onClick = {
                                cropSquare(source, center, containerPx, scale, offset, side)?.let {
                                    AvatarCropStore.setResult(it)
                                    onDone()
                                }
                            },
                            modifier = Modifier.weight(1f).padding(start = 8.dp),
                        ) {
                            Text("使用")
                        }
                    }
                }
            }
        }
    }
}

/** 按当前缩放/偏移计算源图中对应正方形区域,输出 512×512。 */
private fun cropSquare(
    source: Bitmap,
    center: Offset,
    containerPx: Float,
    scale: Float,
    offset: Offset,
    side: Float,
): Bitmap? {
    val bw = source.width.toFloat()
    val bh = source.height.toFloat()
    val fitScale = min(containerPx / bw, containerPx / bh)
    val dispW = bw * fitScale
    val dispH = bh * fitScale
    // 图片显示中心(容器中心 + 平移)
    val centerX = center.x + offset.x
    val centerY = center.y + offset.y
    // 裁剪框左上角(固定于容器中心)
    val cropLeft = center.x - side / 2f
    val cropTop = center.y - side / 2f
    // 映射回源图坐标
    val srcLeft = ((cropLeft - centerX) / (dispW * scale)) * bw + bw / 2f
    val srcTop = ((cropTop - centerY) / (dispH * scale)) * bh + bh / 2f
    val srcSide = (side / (dispW * scale)) * bw
    if (srcSide <= 1f) return null
    val x = srcLeft.coerceIn(0f, bw - srcSide).toInt()
    val y = srcTop.coerceIn(0f, bh - srcSide * (bh / bw)).toInt()
    val w = srcSide.toInt().coerceIn(1, bw.toInt() - x)
    val h = ((srcSide * (bh / bw))).toInt().coerceIn(1, bh.toInt() - y)
    val cropped = Bitmap.createBitmap(source, x, y, w, h)
    return Bitmap.createScaledBitmap(cropped, 512, 512, true)
}
