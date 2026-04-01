// Vitest setup: save Node.js native APIs BEFORE happy-dom overrides them.
// This file MUST be listed FIRST in vitest.config.ts setupFiles.
// upload テストで happy-dom の FormData/Blob が Node.js fetch と非互換なため。

;(globalThis as any).__nativeFormData = globalThis.FormData
;(globalThis as any).__nativeBlob = globalThis.Blob
;(globalThis as any).__nativeURL = globalThis.URL
console.log('[save-native] FormData:', globalThis.FormData?.toString().slice(0, 40), 'Blob:', globalThis.Blob?.toString().slice(0, 40))
