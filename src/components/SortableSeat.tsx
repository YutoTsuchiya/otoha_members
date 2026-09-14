import type { CSSProperties } from "react";
import { useDraggable } from "@dnd-kit/core";

/** 名前の長さに応じて文字サイズを落とし、円の大きさに応じて縮める */
function fontSizeFor(name: string): string {
  const ratio = name.length <= 8 ? 0.18 : name.length <= 14 ? 0.15 : 0.12;
  return `calc(var(--seat-size) * ${ratio})`;
}

export function SeatCircle({
  name,
  color,
  dragging = false,
}: {
  name: string;
  color?: string | null;
  dragging?: boolean;
}) {
  const className = ["seat-circle", dragging ? "dragging" : "", color ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={className} style={{ fontSize: fontSizeFor(name) }}>
      {name}
    </div>
  );
}

interface Props {
  memberId: number;
  name: string;
  /** 色分け。未割当は null。 */
  color?: string | null;
  /** 行の何番目か。持ち上げている間、元の位置に留めておくために使う */
  index: number;
  /** 動いている円は DragOverlay が描くので、元の席は隠しておく */
  hidden: boolean;
  onRemove: (memberId: number) => void;
}

/**
 * 座席の丸。ドラッグして動かせる。
 * どこに落ちるかは座席表側が円の中心どうしで判定するので、
 * ここはドラッグできることだけを担当する。
 */
export default function SortableSeat({ memberId, name, color, index, hidden, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: memberId });

  // 持ち上げている間は行の幅を取らないようにする（元の場所に穴が残らないように）。
  // 要素は残し、元あった位置に留める。dnd-kit がこの要素の位置を随時測り直すので、
  // ここが動くと「どこに落ちるか」の判定がずれてしまう。
  const className = isDragging
    ? "seat seat-hidden seat-lifted"
    : hidden
      ? "seat seat-hidden"
      : "seat";

  return (
    <div
      ref={setNodeRef}
      className={className}
      style={{ "--lift-index": index } as CSSProperties}
      data-seat-id={memberId}
      {...attributes}
      {...listeners}
    >
      <SeatCircle name={name} color={color} />
      <button
        type="button"
        className="seat-remove"
        aria-label={`${name} をこの曲から外す`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => onRemove(memberId)}
      >
        ×
      </button>
    </div>
  );
}
