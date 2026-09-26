package expo.modules.agriai

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.util.UUID

class AiPhotos(private val context: Context) {
  private val directory get() = File(context.noBackupFilesDir, "chat-images").apply { mkdirs() }
  fun prepare(uri: String): Map<String, Any> {
    val source = Uri.parse(uri)
    fun open() = context.contentResolver.openInputStream(source) ?: error("Unable to open this photo.")
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    open().use { BitmapFactory.decodeStream(it, null, bounds) }
    check(bounds.outWidth > 0 && bounds.outHeight > 0) { "This image could not be read. Choose another photo." }
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 1536) sample *= 2
    val decoded = open().use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
      ?: error("This photo could not be prepared.")
    val orientation = open().use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1) }
    val matrix = Matrix().apply {
      when (orientation) {
        2 -> setScale(-1f, 1f)
        3 -> setRotate(180f)
        4 -> { setRotate(180f); postScale(-1f, 1f) }
        5 -> { setRotate(90f); postScale(-1f, 1f) }
        6 -> setRotate(90f)
        7 -> { setRotate(-90f); postScale(-1f, 1f) }
        8 -> setRotate(-90f)
      }
    }
    val oriented = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
    if (oriented !== decoded) decoded.recycle()
    val scale = minOf(1f, 512f / maxOf(oriented.width, oriented.height))
    val normalized = Bitmap.createScaledBitmap(oriented, maxOf(1, (oriented.width * scale).toInt()), maxOf(1, (oriented.height * scale).toInt()), true)
    if (normalized !== oriented) oriented.recycle()
    val id = UUID.randomUUID().toString()
    val image = File(directory, "$id.jpg")
    val thumb = File(directory, "$id-thumb.jpg")
    try {
      image.outputStream().use { check(normalized.compress(Bitmap.CompressFormat.JPEG, 85, it)) }
      val ratio = minOf(1f, 192f / maxOf(normalized.width, normalized.height))
      val small = Bitmap.createScaledBitmap(normalized, maxOf(1, (normalized.width * ratio).toInt()), maxOf(1, (normalized.height * ratio).toInt()), true)
      try { thumb.outputStream().use { small.compress(Bitmap.CompressFormat.JPEG, 80, it) } }
      finally { if (small !== normalized) small.recycle() }
      return mapOf("id" to id, "uri" to Uri.fromFile(image).toString(), "thumbnailUri" to Uri.fromFile(thumb).toString(),
        "width" to normalized.width, "height" to normalized.height)
    } catch (error: Throwable) { image.delete(); thumb.delete(); throw error }
    finally { normalized.recycle() }
  }
  fun path(uri: String): String {
    val file = File(Uri.parse(uri).path ?: "").canonicalFile
    check(file.parentFile == directory.canonicalFile && file.isFile) { "The attached photo is unavailable. Attach it again." }
    return file.path
  }
  fun clean(keep: List<String>, minimumAge: Long = 0) {
    val names = keep.mapNotNull { Uri.parse(it).lastPathSegment }.toSet()
    directory.listFiles()?.filter { it.name !in names && System.currentTimeMillis() - it.lastModified() >= minimumAge }?.forEach { it.delete() }
  }
}
