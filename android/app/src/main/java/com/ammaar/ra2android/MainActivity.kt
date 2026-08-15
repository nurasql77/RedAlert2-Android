package com.ammaar.ra2android

import android.annotation.SuppressLint
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import kotlin.math.min
import kotlin.math.pow

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var assetHandler: AssetSchemeHandler
    private lateinit var thermalMonitor: ThermalMonitor
    private val mainHandler = Handler(Looper.getMainLooper())

    private var contentProcessCrashCount = 0
    private var lastCrashTime = 0L
    private var crashNoticeView: View? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Lock to landscape & keep screen awake
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setupFullscreen()

        assetHandler = AssetSchemeHandler(applicationContext)

        val isDebuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        if (isDebuggable) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        webView = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                mediaPlaybackRequiresUserGesture = false
                allowFileAccess = false
                allowContentAccess = false
                loadsImagesAutomatically = true
                useWideViewPort = true
                loadWithOverviewMode = true
                setSupportZoom(false)
                displayZoomControls = false
                cacheMode = WebSettings.LOAD_NO_CACHE
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            }
        }

        thermalMonitor = ThermalMonitor(applicationContext) { thermal, lowPower ->
            pushThermalState(thermal, lowPower)
        }
        thermalMonitor.start()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val url = request?.url ?: return null
                return assetHandler.shouldInterceptRequest(url)
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                injectBootstrap()
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                pushThermalState(thermalMonitor.currentThermalState, thermalMonitor.isLowPowerMode)
            }

            override fun onRenderProcessGone(view: WebView?, detail: android.webkit.RenderProcessGoneDetail?): Boolean {
                val didCrash = detail?.didCrash() == true
                val rendererPriority = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    detail?.rendererPriorityAtExit().toString()
                } else "unknown"
                Log.e(TAG, "WebView render process gone (crashed=$didCrash, priority=$rendererPriority)")

                val now = System.currentTimeMillis()
                if (now - lastCrashTime > CRASH_LOOP_WINDOW_MS) {
                    contentProcessCrashCount = 0
                }
                lastCrashTime = now
                contentProcessCrashCount++

                if (contentProcessCrashCount > MAX_AUTO_RECOVERIES) {
                    Log.e(TAG, "Giving up after $contentProcessCrashCount consecutive terminations")
                    showUnrecoverableNotice()
                    return true
                }

                val delay = (2.0.pow(contentProcessCrashCount - 1) * 1000).toLong()
                Log.w(TAG, "Recovering from content process termination in ${delay}ms (count=$contentProcessCrashCount)")
                mainHandler.postDelayed({
                    loadApp(crashed = true)
                }, delay)
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                if (consoleMessage != null) {
                    val msg = "[JS ${consoleMessage.messageLevel()}] ${consoleMessage.message()} -- From line ${consoleMessage.lineNumber()} of ${consoleMessage.sourceId()}"
                    when (consoleMessage.messageLevel()) {
                        ConsoleMessage.MessageLevel.ERROR -> Log.e(TAG, msg)
                        ConsoleMessage.MessageLevel.WARNING -> Log.w(TAG, msg)
                        else -> Log.d(TAG, msg)
                    }
                }
                return true
            }
        }

        setContentView(
            webView,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )

        loadApp()
    }

    private fun setupFullscreen() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            setupFullscreen()
        }
    }

    private fun injectBootstrap() {
        val thermal = thermalMonitor.currentThermalState
        val js = """
            (function() {
                window.__RA2_SHELL__ = {
                    platform: 'android',
                    version: '0.1.0',
                    thermalState: '$thermal'
                };
            })();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }

    private fun pushThermalState(thermal: String, lowPower: Boolean) {
        val js = """
            (function() {
                if (window.__RA2_SHELL__) {
                    window.__RA2_SHELL__.thermalState = '$thermal';
                }
                if (typeof window.__RA2_POWER__ === 'function') {
                    window.__RA2_POWER__({ thermal: '$thermal', lowPower: $lowPower });
                }
            })();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }

    private fun loadApp(crashed: Boolean = false) {
        var url = AssetSchemeHandler.BASE_URL
        if (crashed) {
            url += "?crashRecovery=$contentProcessCrashCount"
        }
        Log.i(TAG, "Loading URL: $url")
        webView.loadUrl(url)
    }

    private fun showUnrecoverableNotice() {
        if (crashNoticeView != null) return
        val rootLayout = findViewById<ViewGroup>(android.R.id.content)
        val frame = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            val tv = TextView(this@MainActivity).apply {
                setTextColor(Color.WHITE)
                textSize = 16f
                text = "Red Alert 2 ran out of memory and could not recover.\n\nClose other applications and restart the game."
                textAlignment = View.TEXT_ALIGNMENT_CENTER
            }
            val params = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                android.view.Gravity.CENTER
            )
            addView(tv, params)
        }
        rootLayout.addView(
            frame,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        crashNoticeView = frame
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        setupFullscreen()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onDestroy() {
        thermalMonitor.stop()
        mainHandler.removeCallbacksAndMessages(null)
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "RA2_Android"
        private const val MAX_AUTO_RECOVERIES = 3
        private const val CRASH_LOOP_WINDOW_MS = 300_000L
    }
}