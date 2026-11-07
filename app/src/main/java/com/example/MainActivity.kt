package com.example

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.JsResult
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.viewinterop.AndroidView
import java.io.File
import java.io.FileOutputStream

class MainActivity : ComponentActivity() {

  private var filePathCallback: ValueCallback<Array<Uri>>? = null
  private var pendingJsonSaveContent: String? = null

  private val pickPhotoLauncher =
    registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
      val callback = filePathCallback
      filePathCallback = null
      if (uri != null) {
        callback?.onReceiveValue(arrayOf(uri))
      } else {
        callback?.onReceiveValue(null)
      }
    }

  private val openDocumentLauncher =
    registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
      val callback = filePathCallback
      filePathCallback = null
      if (uri != null) {
        try {
          contentResolver.takePersistableUriPermission(
            uri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION
          )
        } catch (_: Exception) {}
        callback?.onReceiveValue(arrayOf(uri))
      } else {
        callback?.onReceiveValue(null)
      }
    }

  private val createJsonDocumentLauncher =
    registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri: Uri? ->
      val content = pendingJsonSaveContent
      pendingJsonSaveContent = null
      if (uri != null && content != null) {
        try {
          contentResolver.openOutputStream(uri)?.use { out ->
            out.write(content.toByteArray(Charsets.UTF_8))
            out.flush()
          }
          Toast.makeText(this, "Saved JSON file successfully", Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
          Toast.makeText(this, "Could not save file: ${e.message}", Toast.LENGTH_LONG).show()
        }
      }
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(android.graphics.Color.parseColor("#42A5F5")),
      navigationBarStyle = SystemBarStyle.light(
        android.graphics.Color.parseColor("#E3F2FD"),
        android.graphics.Color.parseColor("#1565C0")
      )
    )
    setContent {
      MemorialWebShell(
        onRequestFileChooser = { callback, acceptTypes ->
          filePathCallback?.onReceiveValue(null)
          filePathCallback = callback
          val wantsImageOnly =
            acceptTypes.any { it.contains("image", ignoreCase = true) } &&
              acceptTypes.none { it.contains("*/*") || it.contains("text") || it.contains("json") }
          try {
            if (wantsImageOnly) {
              pickPhotoLauncher.launch(
                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
              )
            } else {
              openDocumentLauncher.launch(arrayOf("*/*"))
            }
          } catch (_: Exception) {
            filePathCallback = null
            callback.onReceiveValue(null)
          }
        },
        onRequestSaveJsonWithPicker = { filename, jsonContent ->
          pendingJsonSaveContent = jsonContent
          val safeName =
            filename.takeIf { !it.isNullOrBlank() }?.let {
              if (it.endsWith(".json", ignoreCase = true)) it else "$it.json"
            } ?: "memorial-profiles.json"
          createJsonDocumentLauncher.launch(safeName)
        }
      )
    }
  }
}

private class AndroidNativeBridge(
  private val context: Context,
  private val onSaveJsonWithPicker: (String?, String?) -> Unit
) {
  @JavascriptInterface
  fun shareText(title: String?, text: String?, dialogTitle: String?) {
    val sendIntent =
      Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, title ?: "Memorial profiles")
        putExtra(Intent.EXTRA_TEXT, text ?: "")
      }
    val chooser =
      Intent.createChooser(sendIntent, dialogTitle ?: "Share Memorial profiles").apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
    context.startActivity(chooser)
  }

  @JavascriptInterface
  fun copyToClipboard(text: String?): Boolean {
    return try {
      val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      val clip = ClipData.newPlainText("Memorial profiles", text ?: "")
      clipboard.setPrimaryClip(clip)
      true
    } catch (_: Exception) {
      false
    }
  }

  @JavascriptInterface
  fun downloadJsonFile(filename: String?, jsonContent: String?): String {
    val content = jsonContent ?: ""
    val safeName =
      filename.takeIf { !it.isNullOrBlank() }?.let {
        if (it.endsWith(".json", ignoreCase = true)) it else "$it.json"
      } ?: "memorial-profiles.json"

    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val resolver = context.contentResolver
        val contentValues =
          ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, safeName)
            put(MediaStore.MediaColumns.MIME_TYPE, "application/json")
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
          }
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
          ?: return "ERROR:Could not create file in Downloads"
        resolver.openOutputStream(uri)?.use { out ->
          out.write(content.toByteArray(Charsets.UTF_8))
          out.flush()
        }
        safeName
      } else {
        val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.filesDir
        val outFile = File(dir, safeName)
        FileOutputStream(outFile).use { out ->
          out.write(content.toByteArray(Charsets.UTF_8))
          out.flush()
        }
        safeName
      }
    } catch (e: Exception) {
      "ERROR:${e.message ?: "Download failed"}"
    }
  }

  @JavascriptInterface
  fun saveJsonFileWithPicker(filename: String?, jsonContent: String?) {
    onSaveJsonWithPicker(filename, jsonContent)
  }
}

private const val NATIVE_BRIDGE_INIT_JS = """
(function() {
  window.Capacitor = window.Capacitor || {
    Plugins: {
      Share: {
        share: function(opts) {
          return new Promise(function(resolve) {
            if (window.AndroidNativeBridge) {
              window.AndroidNativeBridge.shareText(
                (opts && opts.title) || "Memorial profiles",
                (opts && opts.text) || "",
                (opts && opts.dialogTitle) || "Share Memorial profiles"
              );
            }
            resolve();
          });
        }
      }
    }
  };
  if (!navigator.clipboard) {
    navigator.clipboard = {};
  }
  navigator.clipboard.writeText = function(text) {
    return new Promise(function(resolve, reject) {
      if (window.AndroidNativeBridge && window.AndroidNativeBridge.copyToClipboard(String(text || ""))) {
        resolve();
      } else {
        reject(new Error("Clipboard unavailable"));
      }
    });
  };
})();
"""

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MemorialWebShell(
  onRequestFileChooser: (ValueCallback<Array<Uri>>, Array<String>) -> Unit,
  onRequestSaveJsonWithPicker: (String?, String?) -> Unit
) {
  val context = LocalContext.current
  val webView = remember {
    WebView(context).apply {
      layoutParams =
        ViewGroup.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.MATCH_PARENT
        )
      settings.apply {
        javaScriptEnabled = true
        domStorageEnabled = true
        databaseEnabled = true
        allowFileAccess = true
        allowContentAccess = true
        @Suppress("DEPRECATION")
        allowFileAccessFromFileURLs = true
        @Suppress("DEPRECATION")
        allowUniversalAccessFromFileURLs = true
        mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        cacheMode = WebSettings.LOAD_DEFAULT
      }
      addJavascriptInterface(
        AndroidNativeBridge(context, onRequestSaveJsonWithPicker),
        "AndroidNativeBridge"
      )
      webViewClient =
        object : WebViewClient() {
          override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
            super.onPageStarted(view, url, favicon)
            view?.evaluateJavascript(NATIVE_BRIDGE_INIT_JS, null)
          }

          override fun onPageFinished(view: WebView?, url: String?) {
            super.onPageFinished(view, url)
            view?.evaluateJavascript(NATIVE_BRIDGE_INIT_JS, null)
          }
        }
      webChromeClient =
        object : WebChromeClient() {
          override fun onShowFileChooser(
            webView: WebView?,
            filePathCallback: ValueCallback<Array<Uri>>?,
            fileChooserParams: FileChooserParams?
          ): Boolean {
            if (filePathCallback == null) return false
            val acceptTypes = fileChooserParams?.acceptTypes ?: emptyArray()
            onRequestFileChooser(filePathCallback, acceptTypes)
            return true
          }

          override fun onJsAlert(
            view: WebView?,
            url: String?,
            message: String?,
            result: JsResult?
          ): Boolean {
            AlertDialog.Builder(context)
              .setTitle("Memorial")
              .setMessage(message ?: "")
              .setPositiveButton("OK") { _, _ -> result?.confirm() }
              .setOnCancelListener { result?.cancel() }
              .show()
            return true
          }

          override fun onJsConfirm(
            view: WebView?,
            url: String?,
            message: String?,
            result: JsResult?
          ): Boolean {
            AlertDialog.Builder(context)
              .setTitle("Memorial")
              .setMessage(message ?: "")
              .setPositiveButton("OK") { _, _ -> result?.confirm() }
              .setNegativeButton("Cancel") { _, _ -> result?.cancel() }
              .setOnCancelListener { result?.cancel() }
              .show()
            return true
          }
        }
      loadUrl("file:///android_asset/public/index.html")
    }
  }

  DisposableEffect(webView) {
    onDispose {
      webView.destroy()
    }
  }

  BackHandler(enabled = true) {
    webView.evaluateJavascript(
      """
      (function() {
        var pop = document.getElementById('anniv-popup') || document.getElementById('share-panel');
        var ov = document.getElementById('anniv-overlay') || document.getElementById('share-overlay');
        if (pop || ov) {
          if (pop) pop.remove();
          if (ov) ov.remove();
          return 'handled';
        }
        var menu = document.getElementById('side-menu');
        var menuOv = document.getElementById('menu-overlay');
        if (menu && menu.classList.contains('open')) {
          menu.classList.remove('open');
          if (menuOv) menuOv.classList.remove('show');
          return 'handled';
        }
        var home = document.getElementById('view-home');
        if (home && !home.classList.contains('active')) {
          var backBtn = document.querySelector('.view.active header .icon-btn');
          if (backBtn) {
            backBtn.click();
            return 'handled';
          }
        }
        return 'exit';
      })();
      """.trimIndent()
    ) { res ->
      if (res != "\"handled\"") {
        (context as? ComponentActivity)?.finish()
      }
    }
  }

  Box(
    modifier =
      Modifier.fillMaxSize()
        .background(Color(0xFF42A5F5))
        .windowInsetsPadding(WindowInsets.safeDrawing)
        .testTag("memorial_webview_container")
  ) {
    AndroidView(
      factory = { webView },
      modifier = Modifier.fillMaxSize().testTag("memorial_webview")
    )
  }
}
