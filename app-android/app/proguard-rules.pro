# 项目混淆规则(当前 release 未启用 minify,保留作为后续优化占位)。

# Retrofit / kotlinx-serialization 序列化模型
-keepattributes *Annotation*, InnerClasses, Signature
-keepclassmembers class com.campusmarket.app.data.model.** { *; }

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
