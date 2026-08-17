const UNREAD_RE = /\bunread\b|\bnew messages?\b|\d+\+\s*new\b|\d+\s*new\b/i

export function isUnreadConversationLabel(label: string): boolean {
  return UNREAD_RE.test(label)
}

/**
 * Open unread chats first (all new reels), then the optional priority name, then the rest.
 */
export function orderConversationIndexes(labels: string[], priorityChat: string): number[] {
  const needle = priorityChat.trim().toLowerCase()
  return labels.map((_, i) => i).sort((a, b) => {
    const unreadA = isUnreadConversationLabel(labels[a]!) ? 0 : 1
    const unreadB = isUnreadConversationLabel(labels[b]!) ? 0 : 1
    if (unreadA !== unreadB) return unreadA - unreadB
    if (needle) {
      const priA = labels[a]!.toLowerCase().includes(needle) ? 0 : 1
      const priB = labels[b]!.toLowerCase().includes(needle) ? 0 : 1
      if (priA !== priB) return priA - priB
    }
    return a - b
  })
}
