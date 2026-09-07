# StageSounds

大学祭のステージ企画（ダンス・演出等）向けの、キーボード操作による低遅延ポン出し（サンプラー）アプリケーション。
React + TypeScript + Vite + Tailwind CSS + Web Audio API で構築されたブラウザ動作の Web アプリで、
実行委員間の設定・音源共有は `.stagepack`（実体はZIP）アーカイブの入出力で行う。

## セットアップ

```bash
npm install
npm run dev       # 開発サーバ起動 (http://localhost:5173)
npm run build     # 型チェック + 本番ビルド (dist/ に出力)
npm run preview   # ビルド成果物のローカルプレビュー
```

Node.js 18 以上を推奨。ビルド後の `dist/` は静的ファイル一式なので、USBメモリ内のフォルダや
社内サーバ、GitHub Pages 等どこにでも配置してそのまま配布・実行できる（`vite.config.ts` で
`base: "./"` を指定し相対パス参照にしているため）。

## ディレクトリ構成

```text
StageSounds/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json / tsconfig.node.json
├── tailwind.config.js / postcss.config.js
└── src/
    ├── main.tsx                     # エントリポイント
    ├── App.tsx                      # 状態管理・画面統合（団体/スロット/再生の配線）
    ├── index.css                    # Tailwind エントリ
    ├── types.ts                     # ドメイン型定義（GroupProfile, SlotConfig, ManifestV1 等）
    ├── audio/
    │   └── AudioManager.ts          # Web Audio API による排他再生・フェード制御エンジン
    ├── storage/
    │   ├── db.ts                    # idb (IndexedDB) ラッパー。団体・スロット・音声Blobの永続化
    │   └── PresetStorageService.ts  # JSZip による .stagepack の書き出し/読み込み
    ├── components/
    │   ├── Header.tsx               # 団体切替・編集/プレイモード切替・書き出し/読み込み・PANIC STOP
    │   ├── SlotGrid.tsx              # キーボード配列に模したパッドグリッド
    │   ├── SlotTile.tsx              # 個々のパッド（状態表示・クリック・ドラッグ&ドロップ）
    │   └── SlotEditorModal.tsx       # スロット設定（トラック名・音源・フェード・ループ）編集モーダル
    ├── hooks/
    │   └── useKeyboard.ts           # グローバルキー入力の監視とトリガー配線
    └── utils/
        └── keys.ts                  # キーレイアウト定義（KeyboardEvent.code ベース）
```

## 主な機能

- **低遅延再生**: 音源は割り当て時に `AudioBuffer` としてあらかじめデコードしメモリ保持。再生時は
  デコード待ちなしで `AudioBufferSourceNode` を即座に `start()` する。
- **排他制御（単一再生）**: `AudioManager` は常に高々ひとつの再生系統しか保持しない。別スロットの
  トリガーは直前の音声を即停止してから新しい音声を再生する。同じスロットの再押下はトグル停止。
- **フェードイン/アウト**: スロットごとに 0〜5.0 秒で指定。`GainNode.gain.linearRampToValueAtTime`
  で滑らかに音量変化させる。
- **ループ再生**: スロットごとに ON/OFF。
- **緊急停止 (PANIC STOP)**: Space / Esc キー、または画面右上のボタンで即座に無音化。
- **編集モード / プレイモード**: 編集モードでのみスロット設定・ドラッグ&ドロップ割当・団体作成/削除が
  可能。誤操作を防止する。
- **団体プリセットの共有**: `.stagepack`（ZIP）として団体名・キー割当・フェード・ループ設定と音声実体
  をひとまとめに書き出し／読み込み。アーカイブ内は `manifest.json` + `audio/` の相対参照のみで完結する
  ため、Windows / macOS 間でファイルパス不一致が起きない。
- **ローカル永続化**: IndexedDB (`idb`) にブラウザリロード後も団体・音声を自動復元。

## キー配置

`KeyboardEvent.code`（物理キー位置）を基準にスロットを割り当てているため、キーボードの入力言語設定
（日本語/英語配列など）に左右されずに同じ物理キーで同じ音が鳴る。対象は数字列 `1`–`0` と `QWERTY` /
`ASDFGHJKL` / `ZXCVBNM` の各行。
