import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import {
  ref,
  readonly,
  computed,
  watch,
  watchEffect,
  onMounted,
  onUnmounted,
  reactive,
  toRef,
  toRefs,
  shallowRef,
  nextTick,
} from 'vue'

// Set up fake-indexeddb as globals
globalThis.indexedDB = new IDBFactory()
globalThis.IDBKeyRange = IDBKeyRange

// Nuxt auto-imports — make Vue Composition API available as globals
Object.assign(globalThis, {
  ref,
  readonly,
  computed,
  watch,
  watchEffect,
  onMounted,
  onUnmounted,
  reactive,
  toRef,
  toRefs,
  shallowRef,
  nextTick,
})

// Mock useRuntimeConfig (Nuxt auto-import)
;(globalThis as any).useRuntimeConfig = () => ({
  public: {
    apiBase: 'http://localhost:3001',
    signalingUrl: 'http://localhost:8787',
    tenantId: 'test-tenant',
  },
})

// Mock import.meta.client (Nuxt SSR guard)
;(import.meta as any).client = true
