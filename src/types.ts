/** キーボードの物理キー識別子。KeyboardEvent.code の値（例: "KeyQ", "Digit1"）をそのまま使う。
 *  レイアウト非依存（QWERTY/AZERTY等)でも団体間の設定共有時に位置がずれないようにするため。 */
export type KeyCode = string;

export type PlaybackState = "idle" | "playing" | "fading-out";

export interface SlotConfig {
  key: KeyCode;
  label: string;
  fileName: string | null;
  fadeIn: number;
  fadeOut: number;
  loop: boolean;
}

export interface GroupProfile {
  id: string;
  groupName: string;
  updatedAt: string;
  slots: SlotConfig[];
}

/** manifest.json のスキーマ（.stagepack / .zip アーカイブ内） */
export interface ManifestV1 {
  version: "1.0";
  groupName: string;
  updatedAt: string;
  slots: Array<{
    key: KeyCode;
    label: string;
    fileName: string | null;
    fadeIn: number;
    fadeOut: number;
    loop: boolean;
  }>;
}

export interface SlotRuntimeState {
  state: PlaybackState;
  hasAudio: boolean;
  isDecoding: boolean;
}
