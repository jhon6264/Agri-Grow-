package expo.modules.agriai

import android.content.ComponentCallbacks2
import android.content.res.Configuration
import com.google.ai.edge.litertlm.*
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.atomic.AtomicBoolean

internal class AiFailure(message: String) : IllegalStateException(message)

class AgriAiModule : Module(), ComponentCallbacks2 {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val downloadLock = Mutex()
  private val engineLock = Mutex()
  private val context get() = requireNotNull(appContext.reactContext)
  private val download by lazy { AiDownload(context) }
  private val photos by lazy { AiPhotos(context) }
  private val diagnostics by lazy { AiDiagnostics(context) }
  @Volatile private var initializationPhase = "idle"
  @Volatile private var sessionReady = false
  private val stopRevision = java.util.concurrent.atomic.AtomicLong(0)
  private var engine: Engine? = null
  @Volatile private var conversation: Conversation? = null
  @Volatile private var foreground = true
  @Volatile private var preparedId: String? = null
  private var preparedContent: Contents? = null
  private var vision = false
  private val generating = AtomicBoolean(false)
  private val stopped = AtomicBoolean(false)
  private val instruction = """
    You are Agri Grow AI, an intelligent, helpful, and versatile AI assistant.
    You possess broad knowledge across agriculture, technology, coding, science, and practical problem-solving.
    Answer the user directly, accurately, and thoughtfully.
    Adapt naturally to the user's language (English, Tagalog, or Bisaya).
    Do not give canned greetings, repetitive apologies, or unsolicited deflections.
  """.trimIndent()
  private val scheduleInstruction = """
    You classify calendar intent or extract schedule fields for an offline farming calendar. Follow the user's request exactly.
    Return a single valid JSON object only, with no prose, Markdown, code fence, or tool call.
    Do not invent a missing date or time. Use the supplied Philippine date and time for relative dates.
    Preserve unchanged fields when the user corrects an existing proposal. Do not claim to save anything.
  """.trimIndent().replace("\n", " ")

  private fun ensure(condition: Boolean, message: () -> String) { if (!condition) throw AiFailure(message()) }
  private fun task(promise: Promise, block: suspend () -> Any?) {
    scope.launch {
      try { promise.resolve(block()) }
      catch (error: Throwable) {
        promise.reject("AI_UNAVAILABLE", if (error is AiFailure) error.message ?: "The assistant could not complete this action."
          else "The assistant could not complete this action. Please retry.", null)
      }
    }
  }
  override fun definition() = ModuleDefinition {
    Name("AgriAi")
    Events("generation", "startup")
    OnCreate { context.registerComponentCallbacks(this@AgriAiModule); diagnostics.status() }
    OnDestroy {
      context.unregisterComponentCallbacks(this@AgriAiModule)
      stop()
      scope.launch { engineLock.withLock { operation("release", true) { release() } }; scope.cancel() }
    }
    OnActivityEntersBackground { foreground = false; stop(); scope.launch { engineLock.withLock { operation("release", true) { release() } } } }
    OnActivityEntersForeground { foreground = true }
    AsyncFunction("status") { promise: Promise -> task(promise) {
      downloadLock.withLock { download.status() + diagnostics.status() + mapOf("ready" to sessionReady, "initializationPhase" to initializationPhase) }
    } }
    AsyncFunction("download") { promise: Promise -> task(promise) { downloadLock.withLock { download.start() } } }
    AsyncFunction("cancelDownload") { promise: Promise -> task(promise) { downloadLock.withLock { download.cancel() }; null } }
    AsyncFunction("verify") { promise: Promise -> task(promise) { downloadLock.withLock { download.verify() }; null } }
    AsyncFunction("initialize") { promise: Promise -> task(promise) {
      engineLock.withLock { operation("initialize") {
        ensure(foreground) { "Return to Chat to prepare your assistant." }
        publishStartup("engine")
        initialize(true)
        if (!sessionReady) {
          publishStartup("session")
          diagnostics.mark("startup_session_create")
          conversation = engine!!.createConversation(config(emptyList(), false))
          ensure(foreground) { "Return to Chat to prepare your assistant." }
          sessionReady = true
        }
        publishStartup("ready")
      } }; null
    } }
    AsyncFunction("acknowledgeRecovery") { promise: Promise -> task(promise) {
      ensure(!engineLock.isLocked) { "The assistant is still working. Please wait." }; diagnostics.acknowledge(); null
    } }
    AsyncFunction("accept") { promise: Promise -> task(promise) { download.accepted = true; null } }
    AsyncFunction("release") { promise: Promise -> stop(); task(promise) { engineLock.withLock { operation("release", true) { release() } }; null } }
    Function("stop") { stop() }
    AsyncFunction("preparePhoto") { uri: String, promise: Promise -> task(promise) { photos.prepare(uri) } }
    AsyncFunction("cleanPhotos") { keep: List<String>, minimumAge: Double, promise: Promise -> task(promise) { photos.clean(keep, minimumAge.toLong()); null } }
    AsyncFunction("prepare") { requestId: String, history: List<Map<String, String>>, prompt: String, image: String?, mode: String, promise: Promise -> task(promise) {
      engineLock.withLock { operation("prepare:$requestId") {
        val revision = stopRevision.get()
        stopped.set(false)
        ensure(!generating.get() && foreground) { "Please wait for the assistant to finish." }
        closeConversation(); preparedId = null
        val rows = history.toMutableList()
        // Remove incomplete turns before constructing a bounded conversation.
        while (rows.firstOrNull()?.get("role") == "assistant") rows.removeAt(0)
        // Memory-safe fast history bounds without allocating a throwaway conversation session
        while (rows.isNotEmpty() && rows.sumOf { (it["content"] ?: "").length } > 4000) {
          rows.removeAt(0)
          while (rows.firstOrNull()?.get("role") == "assistant") rows.removeAt(0)
        }
        initialize(image != null)
        val messages = rows.map { row ->
          val contents = Contents.of(row["content"] ?: "")
          if (row["role"] == "assistant") Message.model(contents) else Message.user(contents)
        }
        val content = if (image != null) Contents.of(Content.ImageFile(photos.path(image)), Content.Text(prompt)) else Contents.of(prompt)
        ensure(foreground && revision == stopRevision.get()) { "Message preparation stopped. Your draft has been kept." }
        diagnostics.mark("reply_session_create")
        conversation = engine!!.createConversation(config(messages, false, mode))
        preparedContent = content; preparedId = requestId
        sessionReady = true; initializationPhase = "ready"
      } }
      null
    } }
    AsyncFunction("generate") { requestId: String, conversationId: String, promise: Promise -> task(promise) {
      engineLock.withLock { operation("generate:$requestId") {
        ensure(!stopped.get() && preparedId == requestId && foreground && generating.compareAndSet(false, true)) { "Please prepare your message again." }
        stopped.set(false)
        sendEvent("generation", mapOf("requestId" to requestId, "conversationId" to conversationId, "kind" to "phase", "text" to "Thinking..."))
        var terminal = "complete"
        try {
          diagnostics.mark("generation_start")
          conversation!!.sendMessageAsync(preparedContent!!).collect { message ->
            val delta = message.contents.toString()
            if (delta.isNotEmpty()) sendEvent("generation", mapOf("requestId" to requestId, "conversationId" to conversationId, "kind" to "delta", "text" to delta))
          }
        } catch (error: Throwable) { terminal = if (stopped.get()) "stopped" else "failed" }
        finally {
          if (stopped.get()) terminal = "stopped"
          try { closeConversation() } finally { generating.set(false) }
          sendEvent("generation", mapOf("requestId" to requestId, "conversationId" to conversationId, "kind" to terminal,
            "text" to if (terminal == "failed") "The assistant could not finish. Please retry." else ""))
        }
      } }
      null
    } }
  }
  private suspend fun <T> operation(name: String, cleanup: Boolean = false, block: suspend () -> T): T {
    if (cleanup && diagnostics.recoveryRequired) return block()
    diagnostics.begin(name)
    try { return block() }
    catch (error: Throwable) {
      diagnostics.mark("failed_${error.javaClass.simpleName}")
      if (name == "initialize") publishStartup("failed")
      throw error
    } finally { diagnostics.finish() }
  }
  private fun publishStartup(phase: String) {
    initializationPhase = phase
    sendEvent("startup", mapOf("phase" to phase, "ready" to (phase == "ready" && sessionReady)))
  }
  private fun closeConversation() {
    conversation?.let {
      diagnostics.mark("session_close_start"); it.close(); diagnostics.mark("session_close_done")
    }
    conversation = null; preparedId = null; preparedContent = null
  }
  private fun config(history: List<Message>, prefill: Boolean, mode: String = "chat") = ConversationConfig(
    systemInstruction = Contents.of(if (mode == "schedule") scheduleInstruction else instruction), initialMessages = history,
    samplerConfig = SamplerConfig(topK = 40, topP = 0.90, temperature = if (mode == "schedule") 0.1 else 0.60),
    automaticToolCalling = false, maxOutputToken = 1024,
    thinkingConfig = ThinkingConfig(enableThinking = false),
    prefillPrefaceOnInit = prefill)
  private fun initialize(withVision: Boolean) {
    ensure(download.verified()) { "Download the assistant first." }
    if (engine?.isInitialized() == true && (!withVision || vision)) return
    release()
    initializationPhase = "engine"
    for (backend in listOf(Backend.CPU(threadCount = 4))) {
      diagnostics.mark("engine_create")
      val candidate = Engine(EngineConfig(download.file.absolutePath, backend = backend,
        visionBackend = if (withVision) backend else null, maxNumTokens = 3072, maxNumImages = 1,
        cacheDir = context.cacheDir.absolutePath))
      try {
        diagnostics.mark("engine_initialize_start")
        candidate.initialize()
        diagnostics.mark("engine_initialize_done")
        if (!foreground) { candidate.close(); throw AiFailure("Return to Chat to prepare your assistant.") }
        engine = candidate; vision = withVision; return
      } catch (error: Throwable) { if (candidate.isInitialized()) candidate.close() }
    }
    throw AiFailure(if (withVision) "Image analysis could not start on this device. Your photo has been kept. Close other apps and retry."
      else "The assistant could not start. Close other apps and retry.")
  }
  private fun stop() { stopRevision.incrementAndGet(); stopped.set(true); runCatching { conversation?.cancelProcess() } }
  private fun release() {
    sessionReady = false; initializationPhase = "idle"
    closeConversation()
    engine?.let { if (it.isInitialized()) { diagnostics.mark("engine_close_start"); it.close(); diagnostics.mark("engine_close_done") } }; engine = null; vision = false
  }
  override fun onTrimMemory(level: Int) { if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) { stop(); scope.launch { engineLock.withLock { operation("release", true) { release() } } } } }
  override fun onLowMemory() { stop(); scope.launch { engineLock.withLock { operation("release", true) { release() } } } }
  override fun onConfigurationChanged(newConfig: Configuration) {}
}
