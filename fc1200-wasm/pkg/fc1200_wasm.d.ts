/* tslint:disable */
/* eslint-disable */

export class Fc1200WasmSession {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Request sensor lifetime check.
     */
    check_sensor_lifetime(): any;
    /**
     * Acknowledge memory read completion (sends DDOK, clears device memory).
     */
    complete_memory_read(): any;
    /**
     * Feed raw bytes received from WebSerial.
     * Returns a JSON array of events: [{"type": "state_changed", ...}, ...]
     */
    feed(data: Uint8Array): any;
    /**
     * Get the next bytes to send to the FC-1200 via WebSerial.
     * Returns null if no response is pending.
     */
    get_response(): Uint8Array | undefined;
    /**
     * Reset session to initial idle state.
     */
    reset(): any;
    /**
     * Start a measurement cycle.
     */
    start_measurement(): any;
    /**
     * Start memory read mode (sends RQDD to device).
     */
    start_memory_read(): any;
    /**
     * Get the current measurement state as a string.
     */
    state(): string;
    /**
     * Update device date/time. Format: "YYMMDDHHMM"
     */
    update_date(datetime: string): any;
}

/**
 * Create a new FC-1200 protocol session.
 */
export function create_session(): Fc1200WasmSession;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_fc1200wasmsession_free: (a: number, b: number) => void;
    readonly create_session: () => number;
    readonly fc1200wasmsession_check_sensor_lifetime: (a: number) => any;
    readonly fc1200wasmsession_complete_memory_read: (a: number) => any;
    readonly fc1200wasmsession_feed: (a: number, b: number, c: number) => any;
    readonly fc1200wasmsession_get_response: (a: number) => [number, number];
    readonly fc1200wasmsession_reset: (a: number) => any;
    readonly fc1200wasmsession_start_measurement: (a: number) => any;
    readonly fc1200wasmsession_start_memory_read: (a: number) => any;
    readonly fc1200wasmsession_state: (a: number) => [number, number];
    readonly fc1200wasmsession_update_date: (a: number, b: number, c: number) => any;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
