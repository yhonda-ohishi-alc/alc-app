/* fc1200-wasm stub type definitions for CI (where the local wasm pkg is unavailable) */
export class Fc1200WasmSession {
  private constructor();
  free(): void;
  check_sensor_lifetime(): any;
  complete_memory_read(): any;
  feed(data: Uint8Array): any;
  get_response(): Uint8Array | undefined;
  reset(): any;
  start_measurement(): any;
  start_memory_read(): any;
  state(): string;
  update_date(datetime: string): any;
}
export function create_session(): Fc1200WasmSession;
export default function init(): Promise<any>;
