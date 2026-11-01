import { describe, expect, it } from 'vitest'
import { normalizeCode } from '../../src/lib/rooms/api'
import { errorText } from '../../src/lib/i18n'
import { shuffle, seededRng, uuid } from '../../src/utils/random'

describe('رمز الغرفة', () => {
  it('يطبّع الإدخال: أحرف صغيرة، مسافات، شرطات، أرقام عربية', () => {
    expect(normalizeCode(' abc-23x ')).toBe('ABC23X')
    expect(normalizeCode('ab٢٣cd')).toBe('AB23CD')
    expect(normalizeCode('ABCDEFGH')).toBe('ABCDEF')
  })
})

describe('رسائل الخطأ', () => {
  it('كل رموز أخطاء الخادم لها رسالة عربية', () => {
    for (const code of ['not_found', 'full', 'expired', 'not_member', 'not_host', 'rate_limited', 'too_long', 'stale', 'not_your_turn', 'too_late', 'anon_disabled']) {
      const msg = errorText(code)
      expect(msg).not.toBe(errorText('???'))
      expect(/[؀-ۿ]/.test(msg)).toBe(true)
    }
  })
})

describe('أدوات', () => {
  it('الخلط قابل للتكرار ولا يفقد عناصر', () => {
    const a = shuffle([1, 2, 3, 4, 5, 6], seededRng(9))
    const b = shuffle([1, 2, 3, 4, 5, 6], seededRng(9))
    expect(a).toEqual(b)
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6])
  })
  it('uuid بصيغة صحيحة', () => {
    expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
