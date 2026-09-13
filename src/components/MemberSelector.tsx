import type { Member } from "../types";

interface Props {
  members: Member[];
  selectedIds: Set<number>;
  onToggle: (memberId: number) => void;
}

/**
 * 参加者を選ぶリスト。
 * 1列のセルで並べ、右端のチェックマークで参加を表す。
 * チェックした人は自動で上に集まるので、誰が参加するか一目で分かる。
 */
export default function MemberSelector({ members, selectedIds, onToggle }: Props) {
  const selected = members.filter((member) => selectedIds.has(member.id));
  const unselected = members.filter((member) => !selectedIds.has(member.id));

  return (
    <ul className="member-select">
      {[...selected, ...unselected].map((member) => {
        const isSelected = selectedIds.has(member.id);
        return (
          <li key={member.id}>
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
          </li>
        );
      })}
    </ul>
  );
}
