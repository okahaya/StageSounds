# StageSounds

大学祭のステージ企画（ダンス・演出等）向けの、キーボード操作による低遅延ポン出し（サンプラー）アプリケーション。
React + TypeScript + Vite + Tailwind CSS + Web Audio API で構築されたブラウザ動作の Web アプリで、
実行委員間の設定・音源共有は `.stagepack`（実体はZIP）アーカイブの入出力で行う。

## 使い方（実行委員の方向け・これだけでOK）

開発環境のセットアップは不要です。以下からダウンロードするだけで使えます。

**👉 [最新版をダウンロード](https://github.com/okahaya/StageSounds/releases/latest)**

1. 上のリンクを開く
2. **Windows** の人は `StageSounds-Windows.exe` を、**Mac** の人は `StageSounds-macOS.zip` をクリックしてダウンロード
3. Windows: ダウンロードした `.exe` をダブルクリックで起動（インストール不要）
   Mac: ダウンロードした `.zip` を解凍し、中の `StageSounds.app` をダブルクリックで起動
   （「開発元が未確認」と表示されたら、アプリを右クリック→「開く」を選択）

これで完了です。以下はアプリを改造したい人（開発者）向けの説明です。

## セットアップ（開発者向け）

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

デスクトップアプリ化のための Tauri プロジェクトは `src-tauri/`（`tauri.conf.json`, `Cargo.toml`,
`src/main.rs` 等）に生成されている。詳細は後述の「デスクトップアプリ化 (Tauri)」を参照。

## 主な機能

- **低遅延再生**: 音源は割り当て時に `AudioBuffer` としてあらかじめデコードしメモリ保持。再生時は
  デコード待ちなしで `AudioBufferSourceNode` を即座に `start()` する。
- **排他制御（単一再生）**: `AudioManager` は常に高々ひとつの再生系統しか保持しない。別スロットの
  トリガーは直前の音声を即停止してから新しい音声を再生する。同じスロットの再押下はトグル停止。
- **フェードイン/アウト**: スロットごとに 0〜5.0 秒で指定。`GainNode.gain.linearRampToValueAtTime`
  で滑らかに音量変化させる。
- **ループ再生**: スロットごとに ON/OFF。
- **緊急停止 (PANIC STOP)**: Space / Esc キー、または画面下部の帯状 PANIC STOP バーで即座に無音化。
- **編集 / 編集完了**: 編集中のみスロット設定・ドラッグ&ドロップ割当・団体作成/削除が可能。誤操作を防止する。
- **団体プリセットの共有**: `.stagepack`（ZIP）として団体名・キー割当・フェード・ループ設定と音声実体
  をひとまとめに書き出し／読み込み。アーカイブ内は `manifest.json` + `audio/` の相対参照のみで完結する
  ため、Windows / macOS 間でファイルパス不一致が起きない。
- **ローカル永続化**: IndexedDB (`idb`) にブラウザリロード後も団体・音声を自動復元。

## キー配置

`KeyboardEvent.code`（物理キー位置）を基準にスロットを割り当てているため、キーボードの入力言語設定
（日本語/英語配列など）に左右されずに同じ物理キーで同じ音が鳴る。対象は数字列 `1`–`0` と `QWERTY` /
`ASDFGHJKL` / `ZXCVBNM` の各行。

## デスクトップアプリ化 (Tauri)

Vite の開発サーバー / `dist` ビルドと連携する形で Tauri (v2) を導入済み。ブラウザなしで動く
ネイティブウィンドウのデスクトップアプリとしてビルドできる（`src-tauri/tauri.conf.json` の
`build.devUrl` / `build.frontendDist` で連携設定）。

**通常はビルドを手動で行う必要はありません。** `main` ブランチを更新するたびに GitHub Actions
（[.github/workflows/release.yml](.github/workflows/release.yml)）が自動でWindows用 `.exe` と
macOS用 `.app` をビルドし、[Releases](https://github.com/okahaya/StageSounds/releases/latest)
ページに公開します。実行委員はそこからダウンロードするだけで済みます。

以下は自分の手元で直接ビルドしたい開発者向けの手順です。

### 事前準備（初回のみ）

- **共通**: Rust ツールチェイン（[rustup](https://rustup.rs/) でインストール）
- **Windows**: Visual Studio の「C++ によるデスクトップ開発」ワークロード（MSVC ビルドツール）
- **macOS**: Xcode Command Line Tools（`xcode-select --install`）

### 開発時の起動

```bash
npm run desktop:dev   # tauri dev — ネイティブウィンドウが Vite 開発サーバーを表示（HMR対応）
```

### ポータブル版のビルド

インストーラー（NSIS/MSI や dmg）は作らず、ダブルクリックでそのまま起動する単一ファイルを出力する。

```bash
# Windows: ポータブル単一 .exe
npm run desktop:build:win-portable
# -> src-tauri/target/release/stagesounds.exe

# macOS: .app バンドル（dmgインストーラーは作らない）
npm run desktop:build:mac-app
# -> src-tauri/target/release/bundle/macos/StageSounds.app
```

- `--no-bundle`（Windows用スクリプト）は Rust バイナリのコンパイルのみ行い、NSIS/MSI インストーラー
  作成をスキップする。生成される `stagesounds.exe` は単一ファイルで、USBメモリ等からそのまま
  ダブルクリック起動できる（Windows 10/11 標準搭載の WebView2 ランタイムを利用するため、追加インストール
  は基本的に不要）。
- `--bundles app`（macOS用スクリプト）は `.app` バンドルのみを生成し、`.dmg` インストーラー作成をスキップ
  する。`.app` はそのまま Dock やデスクトップに置いて起動できる、Mac標準の実行形式。
- 初回ビルドは Rust の依存クレートをすべてコンパイルするため数分〜十数分かかるが、2回目以降は
  差分コンパイルになり大幅に短縮される。
- 未署名バイナリのため、macOS では初回起動時に Gatekeeper の警告が出ることがある
  （右クリック→「開く」で回避可能）。学祭内利用のような限定配布では通常問題ない。
- ビルド成果物（`src-tauri/target/`）は `.gitignore` 対象。配布時はビルド後のファイルを直接
  USBメモリ等にコピーする。
