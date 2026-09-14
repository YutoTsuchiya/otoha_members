import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Song } from "../types";

interface Props {
  song: Song;
  onOpen: () => void;
}

/**
 * 曲一覧の1行。行全体をドラッグして並び替えられ、クリックで曲を開く。
 * クリックとドラッグは dnd-kit が距離（5px）で区別し、ドラッグ後のクリックは抑制される。
 */
export default function SortableSong({ song, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: song.id,
  });

  return (
    <li
      ref={setNodeRef}
      className={`list-item${isDragging ? " song-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      <button type="button" className="item-main song-row" onClick={onOpen}>
        <span className="item-name">{song.name}</span>
        <span className="event-count">{song.rows.flat().length}人</span>
      </button>
    </li>
  );
}
