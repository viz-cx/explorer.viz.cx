import { describe, it, expect } from 'vitest'
import { notificationsReducer, initialNotifState, type NotifItem } from './notifications'

const item = (id: string, read = false): NotifItem =>
  ({ id, account: 'bob', op_type: 'transfer', body: {}, timestamp: '', read })

describe('notificationsReducer', () => {
  it('sets unread count', () => {
    const s = notificationsReducer(initialNotifState, { type: 'setCount', unread: 3 })
    expect(s.unread).toBe(3)
  })

  it('replaces items on load', () => {
    const s = notificationsReducer(initialNotifState, { type: 'setItems', items: [item('1'), item('2')] })
    expect(s.items.map((i) => i.id)).toEqual(['1', '2'])
  })

  it('appends items on loadMore without duplicates', () => {
    let s = notificationsReducer(initialNotifState, { type: 'setItems', items: [item('1')] })
    s = notificationsReducer(s, { type: 'appendItems', items: [item('1'), item('2')] })
    expect(s.items.map((i) => i.id)).toEqual(['1', '2'])
  })

  it('marks all read and zeroes unread', () => {
    let s = notificationsReducer(initialNotifState, { type: 'setItems', items: [item('1'), item('2')] })
    s = notificationsReducer({ ...s, unread: 2 }, { type: 'markAllRead' })
    expect(s.unread).toBe(0)
    expect(s.items.every((i) => i.read)).toBe(true)
  })

  it('sets the watched list', () => {
    const s = notificationsReducer(initialNotifState, { type: 'setWatched', watched: ['bob', 'carol'] })
    expect(s.watched).toEqual(['bob', 'carol'])
  })
})
