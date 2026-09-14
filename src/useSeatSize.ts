import { useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

const MAX_SEAT_SIZE = 72;
const MIN_SEAT_SIZE = 24;
const SEAT_GAP = 10;

/**
 * 人数に応じて座席の丸のサイズ（px）を計算し、画面内に収める（スクロールさせない）。
 * 最広行の人数と行数、コンテナ幅・画面高さから `--seat-size` の値を決める。
 */
export function useSeatSize(layout: number[][]): {
  seatSize: number;
  scrollRef: RefObject<HTMLDivElement | null>;
} {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [seatSize, setSeatSize] = useState(MAX_SEAT_SIZE);

  useLayoutEffect(() => {
    const update = () => {
      const container = scrollRef.current;
      if (!container) return;
      const maxSeats = Math.max(...layout.map((row) => row.length), 1);
      const numRows = Math.max(layout.length, 1);
      const width = container.clientWidth;
      // 白い四角の左右パディング（.seat-grid の padding: 0 24px）を除いた幅に収める
      const horizontal = (width - 48 - (maxSeats - 1) * SEAT_GAP) / maxSeats;
      // 縦はヘッダー・ツールバーなどを差し引いた高さに収める
      const vertical = (window.innerHeight - 220 - (numRows - 1) * SEAT_GAP) / numRows;
      const size = Math.min(horizontal, vertical);
      setSeatSize(Math.max(MIN_SEAT_SIZE, Math.min(MAX_SEAT_SIZE, size)));
    };
    update();
    const observer = new ResizeObserver(update);
    if (scrollRef.current) observer.observe(scrollRef.current);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [layout]);

  return { seatSize, scrollRef };
}
