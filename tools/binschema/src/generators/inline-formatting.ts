/**
 * Inline formatting for documentation text
 *
 * Supports:
 * - **bold** -> <strong>bold</strong>
 * - *italic* -> <em>italic</em>
 * - _italic_ -> <em>italic</em> (only at word boundaries)
 */

/**
 * Escape HTML entities to prevent XSS
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Format inline markup (bold and italic)
 *
 * Parse order:
 * 1. Escape HTML entities first (security)
 * 2. Parse **bold** (must be before *italic* to avoid conflicts)
 * 3. Parse *italic*
 * 4. Parse _italic_ (only at word boundaries to avoid my_variable_name)
 *
 * Safety measures:
 * - Non-greedy matching (so **a** **b** works correctly)
 * - Requires matching pairs (unclosed markers are left as-is)
 * - Empty content is not formatted (** becomes **)
 * - Exact marker matching (*** doesn't trigger formatting)
 * - Validates markers aren't part of longer sequences
 */
export function formatInlineMarkup(text: string): string {
  // First escape HTML to prevent XSS
  let result = escapeHtml(text);

  // Parse **bold** first (before *italic* to avoid conflicts)
  // Use lookbehind/lookahead to ensure markers aren't part of longer sequences
  // (?<![*]) = not preceded by asterisk
  // (?!\*) = not followed by asterisk
  result = result.replace(
    /(?<!\*)\*\*(?!\*)(.+?)\*\*(?!\*)(?!\*)/g,
    (match, content, offset) => {
      // Don't format if content is empty or just whitespace
      if (!content.trim()) return match;
      // Don't format if content contains unmatched markers (prevents nesting issues)
      // Check if content has unbalanced ** or overlapping markers
      const asteriskCount = (content.match(/\*/g) || []).length;
      if (asteriskCount % 2 !== 0) return match; // Odd number of * means mismatched
      return `<strong>${content}</strong>`;
    }
  );

  // Parse *italic* (single asterisk only)
  // Must not be part of ** (already handled) or *** (malformed)
  result = result.replace(
    /(?<!\*)\*(?!\*)(.+?)\*(?!\*)(?!\*)/g,
    (match, content) => {
      // Don't format if content is empty or just whitespace
      if (!content.trim()) return match;
      // Don't format if it looks like multiplication or wildcard (single char with spaces)
      if (content.length === 1 && /\s/.test(match)) return match;
      // Don't format if content contains any asterisks (suggests overlapping/mismatched markers)
      if (content.includes('*') || content.includes('&lt;strong&gt;') || content.includes('&lt;/strong&gt;')) return match;
      return `<em>${content}</em>`;
    }
  );

  // Parse _italic_ (underscore)
  // Only at word boundaries to avoid formatting variable_names_like_this
  // Match _ either at start of string or after whitespace
  result = result.replace(
    /(^|(?<=\s))_([^_]+?)_(?=\s|$|[.,!?;:])/g,
    (match, prefix, content) => {
      if (!content.trim()) return match;
      return `${prefix}<em>${content}</em>`;
    }
  );

  return result;
}
