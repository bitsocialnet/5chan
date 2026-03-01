/**
 * Format a user ID for display.
 * - If ID contains a dot (domain), show full ID but truncate with "..." if exceeds maxLength
 * - Otherwise, shorten to 8 characters
 * @param userID - The user ID to format
 * @param maxDomainLength - Maximum length for domain IDs before truncating with "..."
 * @returns Formatted user ID
 */
export function formatUserIDForDisplay(userID: string | undefined, maxDomainLength: number = 40): string {
  if (!userID) return '';

  // If ID contains a dot, it's a domain - show fully but truncate if too long
  if (userID.includes('.')) {
    if (userID.length > maxDomainLength) {
      return `${userID.slice(0, maxDomainLength - 3)}...`;
    }
    return userID;
  }

  // Otherwise, shorten to 8 characters
  return userID.slice(0, 8);
}

/**
 * Truncate a string with "..." in the middle when it exceeds maxLength.
 * Preserves the start and end of the string for readability (e.g. URLs, filenames).
 */
export function truncateWithEllipsisInMiddle(str: string, maxLength: number = 50): string {
  if (!str || str.length <= maxLength) return str;
  const ellipsis = '...';
  const half = Math.floor((maxLength - ellipsis.length) / 2);
  return str.slice(0, half) + ellipsis + str.slice(-half);
}
