import { describe, it, expect } from 'vitest'
import { humanConfig } from '~/utils/human-config'

describe('human-config', () => {
  it('backend が wasm', () => {
    expect(humanConfig.backend).toBe('wasm')
  })

  it('face detection が有効', () => {
    expect(humanConfig.face?.enabled).toBe(true)
    expect(humanConfig.face?.detector?.enabled).toBe(true)
  })

  it('iris / emotion / body は無効', () => {
    expect(humanConfig.face?.iris?.enabled).toBe(false)
    expect(humanConfig.face?.emotion?.enabled).toBe(false)
    expect(humanConfig.body?.enabled).toBe(false)
  })

  it('flip が false (左右反転なし)', () => {
    expect(humanConfig.filter?.flip).toBe(false)
  })
})
