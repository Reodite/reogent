/**
 * Quotes a string for a Meilisearch filter expression. Escapes single quotes
 * and drops backslashes, so the input cannot close the quoted value or escape
 * the closing quote.
 */
export function filterValue(value: string): string {
  return `'${value.replace(/\\/g, "").replace(/'/g, "\\'")}'`;
}
