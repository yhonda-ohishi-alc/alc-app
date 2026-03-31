import { createApp } from 'vue'

/**
 * composable をコンポーネントコンテキスト内で実行するヘルパー。
 * onMounted / onUnmounted が正しく発火する。
 *
 * Usage:
 *   const [result, app] = withSetup(() => useMyComposable())
 *   // ... assertions ...
 *   app.unmount() // cleanup (onUnmounted が発火)
 */
export function withSetup<T>(composable: () => T): [T, ReturnType<typeof createApp>] {
  let result!: T

  const app = createApp({
    setup() {
      result = composable()
      return () => {}
    },
  })

  app.mount(document.createElement('div'))

  return [result, app]
}
