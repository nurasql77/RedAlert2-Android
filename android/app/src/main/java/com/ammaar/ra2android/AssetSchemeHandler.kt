package com.ammaar.ra2android

import android.content.Context
import android.net.Uri
import android.util.Log
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.io.InputStream

class AssetSchemeHandler(private val context: Context) {

    fun shouldInterceptRequest(uri: Uri): WebResourceResponse? {
        val host = uri.host ?: return null
        if (host != DOMAIN && host != FALLBACK_DOMAIN) {
            return null
        }

        var path = uri.path ?: "/"
        if (path.isEmpty() || path == "/") {
            path = "/index.html"
        }

        // Clean query parameters and leading slash
        val cleanPath = path.removePrefix("/")

        // Guard against directory traversal
        if (cleanPath.split("/").contains("..")) {
            return createErrorResponse(403, "Forbidden", "text/plain")
        }

        val assetPath = if (cleanPath.startsWith("gameres/")) {
            "GameRes/" + cleanPath.removePrefix("gameres/")
        } else {
            "WebDist/$cleanPath"
        }

        return try {
            val stream: InputStream = context.assets.open(assetPath)
            val mime = getMimeType(cleanPath)
            val headers = mutableMapOf(
                "Access-Control-Allow-Origin" to "*",
                "Cache-Control" to "no-cache",
                "Content-Type" to mime
            )
            WebResourceResponse(mime, "utf-8", 200, "OK", headers, stream)
        } catch (e: Exception) {
            Log.d(TAG, "Asset not found: $assetPath (URI: $uri)")
            createErrorResponse(404, "Not Found: $cleanPath", "text/plain")
        }
    }

    private fun createErrorResponse(statusCode: Int, message: String, mime: String): WebResourceResponse {
        val data = message.toByteArray(Charsets.UTF_8)
        val stream = ByteArrayInputStream(data)
        val headers = mutableMapOf(
            "Access-Control-Allow-Origin" to "*",
            "Cache-Control" to "no-cache",
            "Content-Type" to mime
        )
        return WebResourceResponse(mime, "utf-8", statusCode, message, headers, stream)
    }

    companion object {
        const val DOMAIN = "ra2.android.local"
        const val FALLBACK_DOMAIN = "appassets.androidplatform.net"
        const val BASE_URL = "https://$DOMAIN/index.html"
        private const val TAG = "RA2_AssetHandler"

        fun getMimeType(path: String): String {
            val ext = path.substringAfterLast('.', "").lowercase()
            return when (ext) {
                "html" -> "text/html"
                "js", "mjs" -> "text/javascript"
                "css" -> "text/css"
                "json" -> "application/json"
                "wasm" -> "application/wasm"
                "png" -> "image/png"
                "jpg", "jpeg" -> "image/jpeg"
                "gif" -> "image/gif"
                "svg" -> "image/svg+xml"
                "ico" -> "image/x-icon"
                "mp3" -> "audio/mpeg"
                "wav" -> "audio/wav"
                "webm" -> "video/webm"
                "mp4" -> "video/mp4"
                "woff" -> "font/woff"
                "woff2" -> "font/woff2"
                "ttf" -> "font/ttf"
                "ini", "csf", "mix", "map", "mpr", "mmx", "yro" -> "application/octet-stream"
                else -> "application/octet-stream"
            }
        }
    }
}