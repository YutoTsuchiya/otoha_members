/** 色分けに使う色のパレット。追加ボタンでこの順番に色が増える。 */
export const COLOR_PALETTE = [
  "red",
  "blue",
  "green",
  "yellow",
  "purple",
  "orange",
  "cyan",
  "pink",
] as const;

/** パレットに含まれる色キー。 */
export type ColorKey = (typeof COLOR_PALETTE)[number];
