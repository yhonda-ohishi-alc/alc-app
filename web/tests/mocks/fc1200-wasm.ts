// Mock for fc1200-wasm WASM module (CI does not have wasm-pack)
export class Fc1200WasmSession {
  state() { return 'idle' }
  feed(_data: Uint8Array) { return [] }
  get_response() { return undefined }
  start_measurement() { return null }
  start_memory_read() { return null }
  complete_memory_read() { return null }
  check_sensor_lifetime() { return null }
  update_date(_datetime: string) { return null }
  reset() { return null }
  free() {}
  [Symbol.dispose]() { this.free() }
}

export function create_session() {
  return new Fc1200WasmSession()
}

export default function init() {
  return Promise.resolve({
    memory: {} as WebAssembly.Memory,
  })
}
