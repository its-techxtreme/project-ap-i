import { describe, expect, it } from 'vitest'

import { isUnreadConversationLabel, orderConversationIndexes } from '../src/collector/conversationOrder'

describe('orderConversationIndexes', () => {
  it('puts unread chats ahead of a read priority chat', () => {
    const labels = ['Atharva~ Anime · 8m', 'Aarush Bariar 4 new messages · 3h', 'Advait_ 4+ new messages · 10h']
    expect(orderConversationIndexes(labels, 'Atharva')).toEqual([1, 2, 0])
  })

  it('puts the priority chat first when nothing is unread', () => {
    const labels = ['Notes', 'Atharva~ Anime · 8m', 'Requests']
    expect(orderConversationIndexes(labels, 'Atharva')).toEqual([1, 0, 2])
  })

  it('keeps list order when no priority name is set and nothing is unread', () => {
    expect(orderConversationIndexes(['a', 'b'], '')).toEqual([0, 1])
  })
})

describe('isUnreadConversationLabel', () => {
  it('detects Instagram new-message copy', () => {
    expect(isUnreadConversationLabel('Atharva~ 2 new messages · 3m Unread')).toBe(true)
    expect(isUnreadConversationLabel('Advait_ 4+ new messages · 10h')).toBe(true)
    expect(isUnreadConversationLabel('Atharva~ Anime · 8m')).toBe(false)
  })
})
