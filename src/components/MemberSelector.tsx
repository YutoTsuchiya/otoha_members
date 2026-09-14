import type { Member } from "../types";

/** 次の色に進める（なし → colorOrder の順に1周して「なし」に戻る） */
function nextColor(color: string | null, order: string[]): string | null {
  const cycle: (string | null)[] = [null, ...order];
  const index = cycle.indexOf(color);
  return cycle[(index + 1) % cycle.length];
}

interface Props {
  members: Member[];
  selectedIds: Set<number>;
  onToggle: (memberId: number) => void;
  /** 色キーの並び（パート順）。指定時のみ色スウォッチを表示。 */
  colorOrder?: string[];
  /** メンバーごとの色キー。 */
  colors?: Record<number, string>;
  onColorChange?: (memberId: number, color: string | null) => void;
}

/**
 * 参加者を選ぶリスト。
 * 1列のセルで並べ、右端のチェックマークで参加を表す。
 * チェックした人は自動で上に集まるので、誰が参加するか一目で分かる。
 */
export default function MemberSelector({
  members,
  selectedIds,
  onToggle,
  colorOrder,
  colors,
  onColorChange,
}: Props) {
  const selected = members.filter((member) => selectedIds.has(member.id));
  const unselected = members.filter((member) => !selectedIds.has(member.id));

  return (
    <ul className="member-select">
      {[...selected, ...unselected].map((member) => {
        const isSelected = selectedIds.has(member.id);
        const color = colors?.[member.id] ?? null;
        return (
          <li key={member.id} className="member-option-row">
            <button
              type="button"
              className={isSelected ? "member-option selected" : "member-option"}
              aria-pressed={isSelected}
              onClick={() => onToggle(member.id)}
            >
              <span className="member-option-name">{member.name}</span>
              <span className="member-option-check" aria-hidden="true">
                {isSelected ? "✓" : ""}
              </span>
            </button>
            {onColorChange && colorOrder && (
              <button
                type="button"
                className={`member-color${color ? ` member-color-${color}` : ""}`}
                aria-label={`${member.name} の色を変更`}
                onClick={() => onColorChange(member.id, nextColor(color, colorOrder))}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
