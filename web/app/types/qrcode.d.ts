declare module 'qrcode' {
  export function toDataURL(text: string, options?: Record<string, unknown>): Promise<string>
  export function toCanvas(canvas: HTMLCanvasElement, text: string, options?: Record<string, unknown>): Promise<void>
  export function toString(text: string, options?: Record<string, unknown>): Promise<string>
  const QRCode: {
    toDataURL: typeof toDataURL
    toCanvas: typeof toCanvas
    toString: typeof toString
  }
  export default QRCode
}
