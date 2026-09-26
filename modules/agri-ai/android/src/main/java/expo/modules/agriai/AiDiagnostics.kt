package expo.modules.agriai

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Process
import android.os.SystemClock
import org.json.JSONArray
import org.json.JSONObject

/** Bounded, local diagnostics. Never accepts prompts, image paths, or runtime error messages. */
internal class AiDiagnostics(context: Context) {
  private val prefs = context.getSharedPreferences("ai-diagnostics", Context.MODE_PRIVATE)
  private val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
  private val pending = prefs.getString("pending", null)?.let { runCatching { JSONObject(it) }.getOrNull() }
  @Volatile var recoveryRequired = pending != null
    private set
  private val previous = runCatching {
    manager.getHistoricalProcessExitReasons(context.packageName, 0, 16)
      .firstOrNull { it.pid == pending?.optInt("pid") && it.timestamp >= (pending?.optLong("time") ?: Long.MAX_VALUE) }
      ?.let { mapOf("reason" to when (it.reason) {
        ApplicationExitInfo.REASON_CRASH_NATIVE -> "native_crash"
        ApplicationExitInfo.REASON_LOW_MEMORY -> "low_memory"
        ApplicationExitInfo.REASON_CRASH -> "managed_crash"
        ApplicationExitInfo.REASON_ANR -> "anr"
        else -> "other"
      }, "timestamp" to it.timestamp, "pssKb" to it.pss, "rssKb" to it.rss) }
  }.getOrNull()
  private var started = 0L
  private var operation: String? = null
  private var step = "idle"
  @Synchronized fun begin(name: String) {
    check(!recoveryRequired) { "The previous AI operation was interrupted. Tap Retry to continue." }
    operation = name; started = SystemClock.elapsedRealtime(); mark("begin")
  }
  @Synchronized fun mark(phase: String) {
    step = phase
    val memory = ActivityManager.MemoryInfo().also { manager.getMemoryInfo(it) }
    val entry = JSONObject().put("pid", Process.myPid()).put("time", System.currentTimeMillis())
      .put("operation", operation).put("phase", phase).put("backend", "cpu_2_threads")
      .put("elapsedMs", if (operation == null) 0 else SystemClock.elapsedRealtime() - started)
      .put("availableBytes", memory.availMem).put("lowMemory", memory.lowMemory)
    val old = runCatching { JSONArray(prefs.getString("breadcrumbs", "[]")) }.getOrDefault(JSONArray())
    val entries = JSONArray()
    for (i in maxOf(0, old.length() - 47) until old.length()) entries.put(old.get(i))
    entries.put(entry)
    // Synchronous persistence must precede JNI: a native abort cannot run finally blocks.
    val edit = prefs.edit().putString("breadcrumbs", entries.toString())
    if (operation != null) edit.putString("pending", entry.toString())
    edit.commit()
  }
  @Synchronized fun finish() { mark("finished"); operation = null; prefs.edit().remove("pending").commit() }
  @Synchronized fun acknowledge() {
    check(operation == null) { "The assistant is still working. Please wait." }
    recoveryRequired = false; prefs.edit().remove("pending").commit()
  }
  @Synchronized fun status(): Map<String, Any?> = mapOf(
    "operationId" to operation, "operationPhase" to step,
    "elapsedMs" to if (operation == null) 0L else SystemClock.elapsedRealtime() - started,
    "recoverability" to if (recoveryRequired) "retry_required" else if (operation != null) "busy" else "retry_allowed",
    "previousExit" to previous, "interruptedPhase" to pending?.optString("phase"),
    "diagnosticBreadcrumbs" to prefs.getString("breadcrumbs", "[]"))
}
