import { describe, it, expect } from 'vitest'
import { Fc1200WasmSession, create_session } from './fc1200-wasm'
import init from './fc1200-wasm'

describe('fc1200-wasm mock', () => {
  it('Fc1200WasmSession: all methods return expected defaults', () => {
    const session = new Fc1200WasmSession()

    expect(session.state()).toBe('idle')
    expect(session.feed(new Uint8Array([0x01, 0x02]))).toEqual([])
    expect(session.get_response()).toBeUndefined()
    expect(session.start_measurement()).toBeNull()
    expect(session.start_memory_read()).toBeNull()
    expect(session.complete_memory_read()).toBeNull()
    expect(session.check_sensor_lifetime()).toBeNull()
    expect(session.update_date('2026-01-01T00:00:00')).toBeNull()
    expect(session.reset()).toBeNull()
  })

  it('free() does not throw', () => {
    const session = new Fc1200WasmSession()
    expect(() => session.free()).not.toThrow()
  })

  it('Symbol.dispose calls free()', () => {
    const session = new Fc1200WasmSession()
    expect(() => session[Symbol.dispose]()).not.toThrow()
  })

  it('create_session returns a Fc1200WasmSession instance', () => {
    const session = create_session()
    expect(session).toBeInstanceOf(Fc1200WasmSession)
    expect(session.state()).toBe('idle')
  })

  it('init() resolves with a memory object', async () => {
    const result = await init()
    expect(result).toHaveProperty('memory')
    expect(result.memory).toBeDefined()
  })

  it('feed with empty array returns empty array', () => {
    const session = new Fc1200WasmSession()
    expect(session.feed(new Uint8Array())).toEqual([])
  })

  it('feed with various data returns empty array', () => {
    const session = new Fc1200WasmSession()
    expect(session.feed(new Uint8Array([0xFF, 0x00, 0x55]))).toEqual([])
  })
})
