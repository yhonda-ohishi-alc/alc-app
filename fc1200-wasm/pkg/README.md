# fc1200-wasm

タニタ FC-1200 (ALBLO) の RS232C 通信プロトコルを Rust で実装し、WASM にコンパイルしてソースを秘匿する。
ブラウザが WebSerial API でシリアルポートに接続し、この WASM モジュール経由でプロトコル処理を行う。

## 技術スタック

- Rust
- `wasm-pack` - WASM ビルド
- `wasm-bindgen` - JS / WASM バインディング

## ビルド

```bash
wasm-pack build --target web
```

`pkg/` に npm パッケージが出力され、`web/` から参照する。

## 通信設定

- ボーレート: 9600bps
- データビット: 8
- パリティ: なし
- ストップビット: 1
- フロー制御: なし
