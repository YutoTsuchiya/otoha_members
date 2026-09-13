/** 行数の既定値: max(人数÷5 の切り上げ, 4) */
function defaultRowCount(count: number): number {
  return Math.max(Math.ceil(count / 5), 4);
}

/**
 * 指定された行数に、できるだけ均等に振り分ける。
 * 例: 12人を5行 → [3,3,2,2,2]
 */
export function distribute<T>(items: T[], rowCount: number): T[][] {
  if (items.length === 0) return [];

  const rows = Math.min(Math.max(rowCount, 1), items.length);
  const base = Math.floor(items.length / rows);
  let extra = items.length % rows;

  const layout: T[][] = [];
  let index = 0;
  for (let i = 0; i < rows; i++) {
    const size = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    layout.push(items.slice(index, index + size));
    index += size;
  }
  return layout;
}

/** 既定の行数で振り分ける */
export function defaultLayout<T>(items: T[]): T[][] {
  return distribute(items, defaultRowCount(items.length));
}

/**
 * 1人を指定した場所へ移す。
 * 動かす人と、移動先の行以外は一切変更しない（行の人数は固定ではない）。
 */
export function placeMember(
  rows: number[][],
  memberId: number,
  target: { row: number; index: number },
): number[][] {
  const from = findSlot(rows, memberId);
  if (!from) return rows;

  const next = rows.map((row) => [...row]);
  next[from.row].splice(from.index, 1);
  // 隙間を描いた位置にそのまま入れる
  next[target.row].splice(target.index, 0, memberId);

  // 空になった行は残さない
  return next.filter((row) => row.length > 0);
}

/**
 * 行ごとの横方向のずれを「半人分」を1とした単位で返す。
 *
 * 行は中央寄せなので、隣り合う行の人数が1人違うと、
 * 中央寄せで生まれる半人分のずれとジグザグ用のずれが打ち消し合い、
 * 後ろの列が前の列と重なって見えなくなる。
 * それを打ち消して、隣り合う行が必ず半人分ずれるようにする。
 */
export function rowShiftUnits(rowSizes: number[]): number[] {
  const units: number[] = [];
  let unit = 0;

  rowSizes.forEach((size, index) => {
    if (index > 0) {
      // 半人分ずらしつつ、中央寄せで生じたずれ（人数差 × 半人分）を戻す
      unit += 1 - (rowSizes[index - 1] - size);
      // 半ピッチ（2単位）ごとに同じ見え方なので、±1単位に収める
      const wrapped = ((unit % 2) + 2) % 2;
      unit = wrapped > 1 ? wrapped - 2 : wrapped;
    }
    units.push(unit);
  });

  // 丸の並び全体が白い四角の中央に来るようにずらす。
  // 半ピッチ単位では行の幅の半分＝人数なので、人数だけで計算できる。
  // （全行から同じ値を引くだけなので、隣り合う行のずれ＝ジグザグは変わらない）
  let left = Infinity;
  let right = -Infinity;
  rowSizes.forEach((size, index) => {
    left = Math.min(left, units[index] - size);
    right = Math.max(right, units[index] + size);
  });
  const center = (left + right) / 2;
  return units.map((value) => value - center);
}

/** 配置が同じかどうか（同じなら再描画で作り直さない） */
export function sameLayout(a: number[][], b: number[][]): boolean {
  return (
    a.length === b.length &&
    a.every((row, i) => row.length === b[i].length && row.every((id, j) => id === b[i][j]))
  );
}

/** 1人を末尾の行に足す */
export function appendMember(rows: number[][], memberId: number): number[][] {
  if (rows.length === 0) return [[memberId]];
  return [...rows.slice(0, -1), [...rows[rows.length - 1], memberId]];
}

/** 1人を取り除く（空になった行は残さない） */
export function removeMember(rows: number[][], memberId: number): number[][] {
  return rows.map((row) => row.filter((id) => id !== memberId)).filter((row) => row.length > 0);
}

export function findSlot(rows: number[][], memberId: number): { row: number; index: number } | null {
  for (let row = 0; row < rows.length; row++) {
    const index = rows[row].indexOf(memberId);
    if (index >= 0) return { row, index };
  }
  return null;
}
