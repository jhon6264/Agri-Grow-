/**
 * Cleans assistant response text by stripping trailing redundant translation blocks
 * (e.g. "English Translation:", "Translation in English:", "(Translation: ...)", etc.)
 * to ensure authentic monolingual output across all supported languages.
 */
const TRANSLATION_HEADER_PATTERN = /(?:\r?\n){2,}(?:---|___|\*\*\*)?\s*(?:#+\s*|\*{1,2}|_{1,2}|\[|\()?\s*(?:(?:English|Bisaya|Tagalog|Cebuano|Filipino)\s+)?(?:Translation|Hubad|Paghubad|Bersyon sa Ingles|English Version|In English|In Tagalog|In Bisaya)(?:\s*(?:\:|\)|\-\-|\-|\*|_|\]))?[\s\S]*$/i;

export function cleanResponse(text: string): string {
  if (!text) return text;
  
  // If the text contains a trailing translation header after at least one paragraph of content
  const cleaned = text.replace(TRANSLATION_HEADER_PATTERN, '').trimEnd();
  
  // Only return cleaned if it didn't completely wipe out the content (sanity check)
  if (cleaned.trim().length > 0) {
    return cleaned;
  }
  return text;
}
