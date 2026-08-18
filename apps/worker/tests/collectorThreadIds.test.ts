import { describe, expect, it } from 'vitest'

import { parseCollectorThreadIds } from '../src/collector/collectorThreadIds'

describe('parseCollectorThreadIds', () => {
  it('keeps numeric Instagram thread ids', () => {
    expect(parseCollectorThreadIds('17842064415169224, 17843991641264774')).toEqual([
      '17842064415169224',
      '17843991641264774',
    ])
  })

  it('ignores junk and duplicates', () => {
    expect(parseCollectorThreadIds('abc,17842064415169224,17842064415169224')).toEqual([
      '17842064415169224',
    ])
  })
})
