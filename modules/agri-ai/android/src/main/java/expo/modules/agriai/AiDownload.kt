package expo.modules.agriai

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import java.io.File
import java.security.MessageDigest

/** All calls are serialized by the module; DownloadManager owns the background transfer. */
class AiDownload(private val context: Context) {
  companion object {
    const val SIZE = 2588147712L
    const val HASH = "181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c"
    const val URL = "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm"
  }
  private val prefs = context.getSharedPreferences("offline-ai", Context.MODE_PRIVATE)
  private val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
  val file: File get() = File(context.getExternalFilesDir(null), "offline-ai/assistant.litertlm")
  var accepted: Boolean
    get() = prefs.getBoolean("accepted", false)
    set(value) { prefs.edit().putBoolean("accepted", value).apply() }
  private var id: Long
    get() = prefs.getLong("download", -1)
    set(value) { prefs.edit().putLong("download", value).commit() }
  fun verified() = prefs.getBoolean("verified", false) && file.isFile && file.length() == SIZE
  fun status(): Map<String, Any> {
    if (verified()) return mapOf("stage" to "installed", "bytes" to SIZE, "total" to SIZE, "accepted" to accepted)
    if (id == -1L) return mapOf("stage" to "missing", "bytes" to 0, "total" to SIZE, "accepted" to false)
    manager.query(DownloadManager.Query().setFilterById(id)).use { cursor ->
      if (!cursor.moveToFirst()) { id = -1; return status() }
      val state = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
      val bytes = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
      val reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
      val stage = when (state) {
        DownloadManager.STATUS_SUCCESSFUL -> "verifying"
        DownloadManager.STATUS_FAILED -> "failed"
        DownloadManager.STATUS_PAUSED, DownloadManager.STATUS_PENDING -> "waiting"
        else -> "downloading"
      }
      return mapOf("stage" to stage, "bytes" to bytes.coerceAtLeast(0), "total" to SIZE, "accepted" to false,
        "error" to if (reason == DownloadManager.ERROR_INSUFFICIENT_SPACE) "Not enough storage. Free some space and retry."
          else if (stage == "failed") "The download could not finish. Check your connection and retry." else "")
    }
  }
  fun start(): Map<String, Any> {
    if (status()["stage"] in listOf("downloading", "waiting", "verifying", "installed")) return status()
    cancel()
    file.parentFile!!.mkdirs()
    if (file.parentFile!!.usableSpace < SIZE + 512L * 1024 * 1024) throw AiFailure("Not enough storage. Free at least 3.1 GB and retry.")
    id = manager.enqueue(DownloadManager.Request(Uri.parse(URL))
      .setTitle("Downloading offline AI").setDescription("Your farming assistant")
      .setAllowedOverMetered(true).setAllowedOverRoaming(true)
      .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
      .setDestinationUri(Uri.fromFile(file)))
    return status()
  }
  fun cancel() {
    val previous = id
    id = -1
    if (previous != -1L) manager.remove(previous)
    file.delete()
    prefs.edit().putBoolean("verified", false).putBoolean("accepted", false).commit()
  }
  fun verify() {
    if (verified()) return
    if (!file.isFile || file.length() != SIZE) throw AiFailure("The download is incomplete. Please retry.")
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().buffered().use { input ->
      val buffer = ByteArray(256 * 1024)
      while (true) { val count = input.read(buffer); if (count < 0) break; digest.update(buffer, 0, count) }
    }
    if (digest.digest().joinToString("") { "%02x".format(it) } != HASH) {
      cancel()
      throw AiFailure("The downloaded file is damaged. Please download it again.")
    }
    prefs.edit().putBoolean("verified", true).commit()
  }
}
