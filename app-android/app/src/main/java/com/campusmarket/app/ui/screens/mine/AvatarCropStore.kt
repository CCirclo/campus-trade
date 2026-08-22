package com.campusmarket.app.ui.screens.mine

import android.graphics.Bitmap
import android.net.Uri

/** 头像裁剪流程的临时状态(选图 → 裁剪 → 上传)。 */
object AvatarCropStore {
    var pendingUri: Uri? = null
        private set
    var pendingBitmap: Bitmap? = null
        private set

    fun setUri(uri: Uri) {
        pendingUri = uri
        pendingBitmap = null
    }

    fun setResult(bitmap: Bitmap) {
        pendingBitmap = bitmap
        pendingUri = null
    }

    fun clear() {
        pendingUri = null
        pendingBitmap = null
    }
}
