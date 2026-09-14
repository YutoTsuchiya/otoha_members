import { useMemo } from "react";
import type { CSSProperties } from "react";
import { rowShiftUnits } from "../layout";
import { useSeatSize } from "../useSeatSize";
import type { Member, Part } from "../types";
import { SeatCircle } from "./SortableSeat";

interface Props {
  layout: number[][];
  members: Member[];
  colors: Record<number, string>;
  parts: Part[];
}

/** 読み取り専用の座席表。ドラッグや編集はできない。 */
export default function SeatChartView({ layout, members, colors, parts }: Props) {
  const { seatSize, scrollRef } = useSeatSize(layout);

  const nameById = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);
  const nameOf = (id: number) => nameById.get(id) ?? "?";
  const colorOf = (id: number) => colors[id] ?? null;
  const shifts = useMemo(() => rowShiftUnits(layout.map((row) => row.length)), [layout]);

  return (
    <div className="seat-grid-scroll" ref={scrollRef}>
      <div className="seat-grid" style={{ "--seat-size": `${seatSize}px` } as CSSProperties}>
        <div className="seat-audience" aria-hidden="true">
          <span>客席</span>
          <span className="seat-audience-line" />
        </div>

        <div className="seat-stage" aria-hidden="true">
          <span>上手</span>
          <span>下手</span>
        </div>

        {layout.map((row, rowIndex) => (
          <div
            className="seat-row"
            key={rowIndex}
            style={{ "--row-shift": shifts[rowIndex] } as CSSProperties}
          >
            {row.map((memberId) => (
              <div className="seat" key={memberId}>
                <SeatCircle name={nameOf(memberId)} color={colorOf(memberId)} />
              </div>
            ))}
          </div>
        ))}

        {parts.some((p) => p.name) && (
          <div className="seat-legend">
            {parts.filter((p) => p.name).map((part) => (
              <span key={part.color} className="legend-item">
                <span className={`legend-dot legend-dot-${part.color}`} aria-hidden="true" />
                {part.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
