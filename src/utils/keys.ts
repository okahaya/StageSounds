import type { KeyCode } from "../types";

export interface KeyLayoutEntry {
  code: KeyCode;
  display: string;
}

/** パッドグリッドに表示するキーの並び（物理配列の見た目に合わせた行） */
export const KEY_ROWS: KeyLayoutEntry[][] = [
  [
    { code: "Digit1", display: "1" },
    { code: "Digit2", display: "2" },
    { code: "Digit3", display: "3" },
    { code: "Digit4", display: "4" },
    { code: "Digit5", display: "5" },
    { code: "Digit6", display: "6" },
    { code: "Digit7", display: "7" },
    { code: "Digit8", display: "8" },
    { code: "Digit9", display: "9" },
    { code: "Digit0", display: "0" },
  ],
  [
    { code: "KeyQ", display: "Q" },
    { code: "KeyW", display: "W" },
    { code: "KeyE", display: "E" },
    { code: "KeyR", display: "R" },
    { code: "KeyT", display: "T" },
    { code: "KeyY", display: "Y" },
    { code: "KeyU", display: "U" },
    { code: "KeyI", display: "I" },
    { code: "KeyO", display: "O" },
    { code: "KeyP", display: "P" },
  ],
  [
    { code: "KeyA", display: "A" },
    { code: "KeyS", display: "S" },
    { code: "KeyD", display: "D" },
    { code: "KeyF", display: "F" },
    { code: "KeyG", display: "G" },
    { code: "KeyH", display: "H" },
    { code: "KeyJ", display: "J" },
    { code: "KeyK", display: "K" },
    { code: "KeyL", display: "L" },
  ],
  [
    { code: "KeyZ", display: "Z" },
    { code: "KeyX", display: "X" },
    { code: "KeyC", display: "C" },
    { code: "KeyV", display: "V" },
    { code: "KeyB", display: "B" },
    { code: "KeyN", display: "N" },
    { code: "KeyM", display: "M" },
  ],
];

export const ALL_KEYS: KeyLayoutEntry[] = KEY_ROWS.flat();

export function keyDisplayFor(code: KeyCode): string {
  return ALL_KEYS.find((k) => k.code === code)?.display ?? code;
}

export function createDefaultSlots() {
  return ALL_KEYS.map((k) => ({
    key: k.code,
    label: "未設定",
    fileName: null,
    fadeIn: 0,
    fadeOut: 0,
    loop: false,
  }));
}
