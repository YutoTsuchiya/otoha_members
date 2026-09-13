import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { api, errorMessage } from "../api";
import {
  appendMember,
  distribute,
  findSlot,
  placeMember,
  removeMember,
  rowShiftUnits,
  sameLayout,
} from "../layout";
import { useAsyncAction } from "../useAsyncAction";
import type { Member, Song } from "../types";
import MemberSelector from "./MemberSelector";
import SortableSeat, { SeatCircle } from "./SortableSeat";

interface Props {
  eventId: number;
  songId: number;
  songName: string;
  onBack: () => void;
  /** 曲名を変えたとき（見出しを追従させる） */
  onRenamed: (name: string) => void;
  /** 曲を削除したとき */
  onDeleted: () => void;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

/** ドラッグ中に空ける隙間の場所 */
interface Gap {
  row: number;
  index: number;
}

/** ドラッグ開始時の行の形。隙間を空けても動かないので、判定の基準に使う。 */
interface RowGeometry {
  top: number;
  bottom: number;
  centers: number[];
  pitch: number;
}

/** 描画のあとで測る、席1つの様子 */
interface SeatSnapshot {
  /** いま見えている位置。動いている途中なら、その途中の位置 */
  shownX: number;
  shownY: number;
  /** 動きを除いた素の位置。いまの配置でこの席が着く所 */
  baseX: number;
  baseY: number;
  /** 前の配置からここへ向かって動いている最中か */
  running: boolean;
}

/** 落とした円が着地するまでの時間。DragOverlay の dropAnimation と合わせる。 */
const LANDING_MS = 200;

/**
 * いま掛かっている動き（transform）の大きさ。
 * 動いている席は、着く所からこの分だけずれた所に見えている。
 */
function transformOffset(element: HTMLElement): { x: number; y: number } {
  const transform = getComputedStyle(element).transform;
  if (transform === "none") return { x: 0, y: 0 };
  const matrix = new DOMMatrixReadOnly(transform);
  return { x: matrix.m41, y: matrix.m42 };
}

/** 1px 未満のずれは同じ位置とみなす */
function almostSame(a: number, b: number): boolean {
  return Math.abs(a - b) < 1;
}

/**
 * いま画面に出ている行の形を測る。
 * 持ち上げている席は行の流れから外れているので、数に入れない。
 */
function measureRows(grid: HTMLElement): RowGeometry[] {
  return [...grid.querySelectorAll<HTMLElement>(".seat-row")].map((row) => {
    const rect = row.getBoundingClientRect();
    // 動いている途中でも着く所を測れるように、動きの分を引いて素の位置にする
    const boxes = [...row.querySelectorAll<HTMLElement>("[data-seat-id]")]
      .filter((seat) => !seat.classList.contains("seat-lifted"))
      .map((seat) => {
        const box = seat.getBoundingClientRect();
        return { left: box.left - transformOffset(seat).x, width: box.width };
      });
    const centers = boxes.map((box) => box.left + box.width / 2);
    // 1人だけの行は間隔を測れないので、丸の幅と余白から見積もる
    const pitch = centers.length > 1 ? centers[1] - centers[0] : (boxes[0]?.width ?? 0) + 10;
    return { top: rect.top, bottom: rect.bottom, centers, pitch };
  });
}

function statusLabel(status: SaveStatus): string {
  switch (status) {
    case "saving":
      return "保存中…";
    case "saved":
      return "保存済み";
    case "error":
      return "保存に失敗しました";
    default:
      return "";
  }
}

export default function SeatingEditor({
  eventId,
  songId,
  songName,
  onBack,
  onRenamed,
  onDeleted,
}: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [layout, setLayout] = useState<number[][]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [activeId, setActiveId] = useState<number | null>(null);
  // 落としたあと、円が着地するまで隠しておく人（二重に見えないように）
  const [landingId, setLandingId] = useState<number | null>(null);
  const [gap, setGap] = useState<Gap | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [nameInput, setNameInput] = useState(songName);

  const gridRef = useRef<HTMLDivElement>(null);
  // 前回の配置での素の位置（白い四角を基準にした相対座標）。
  // 動いている席にとっては「行き先」でもある。
  const prevRects = useRef(new Map<number, { left: number; top: number }>());
  const geometry = useRef<RowGeometry[]>([]);
  const gapRef = useRef<Gap | null>(null);
  const landingTimer = useRef<number | null>(null);
  const saveSeq = useRef(0);
  const { error, setError, busy, run } = useAsyncAction();

  const load = useCallback(async () => {
    try {
      const [song, memberList] = await Promise.all([
        api<Song>(`/api/songs/${songId}`),
        api<Member[]>(`/api/events/${eventId}/members`),
      ]);
      setMembers(memberList);
      setLayout(song.rows);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [eventId, setError, songId]);

  useEffect(() => {
    void load();
  }, [load]);

  // パネルは Esc で閉じる
  useEffect(() => {
    if (!panelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanelOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [panelOpen]);

  // 配置が変わったとき、円がすっと移動して見えるようにする（FLIP）。
  // 前回の位置との差分を打ち消す位置から元の位置へ animate する。
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const seats = [...grid.querySelectorAll<HTMLElement>("[data-seat-id]")];

    // 動かす前に、いま見えている位置を控える。
    // 動いている席は、見えている位置（途中）と着く所（素の位置）がちがう。
    // 位置は白い四角を基準にした相対座標で持つ。ドラッグ中は横スクロールが
    // 起きるので、画面の座標のままだと前回の値と比べられなくなる。
    const gridRect = grid.getBoundingClientRect();
    const seen = new Map<number, SeatSnapshot>();
    for (const seat of seats) {
      if (seat.classList.contains("seat-hidden")) continue;
      const rect = seat.getBoundingClientRect();
      const offset = transformOffset(seat);
      seen.set(Number(seat.dataset.seatId), {
        shownX: rect.left - gridRect.left,
        shownY: rect.top - gridRect.top,
        baseX: rect.left - gridRect.left - offset.x,
        baseY: rect.top - gridRect.top - offset.y,
        running: seat.getAnimations().some((animation) => animation.playState === "running"),
      });
    }

    const next = new Map<number, { left: number; top: number }>();
    for (const seat of seats) {
      // 動いている席・着地待ちの席は overlay が描くので、
      // ここでは動かさないし、位置も記録しない（次に出てくるとき変な所から飛ばないように）
      if (seat.classList.contains("seat-hidden")) {
        seat.getAnimations().forEach((animation) => animation.cancel());
        continue;
      }

      const id = Number(seat.dataset.seatId);
      const now = seen.get(id);
      if (!now) continue;
      next.set(id, { left: now.baseX, top: now.baseY });

      const settled = prevRects.current.get(id);
      if (!settled) continue;

      // 同じ所へ向かっている途中なら、そのまま走らせておく。
      // 作り直すと、出ていた速さが消えていったん止まって見えてしまう。
      if (now.running && almostSame(settled.left, now.baseX) && almostSame(settled.top, now.baseY)) {
        continue;
      }

      // 動く前に見えていた位置は、前回の素の位置に「いま掛かっている動きの分」を足した所。
      // いまの見えている位置をそのまま使うと、配置がずれた分を見落として跳んでしまう
      // （席は transform で動くので、素の位置がずれるとその場で見えている位置もずれる）。
      const fromX = settled.left + (now.shownX - now.baseX);
      const fromY = settled.top + (now.shownY - now.baseY);
      const dx = fromX - now.baseX;
      const dy = fromY - now.baseY;
      if (almostSame(dx, 0) && almostSame(dy, 0)) continue;

      seat.getAnimations().forEach((animation) => animation.cancel());
      seat.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration: 220,
        easing: "ease",
      });
    }
    prevRects.current = next;
    // 配置や隙間が変わったときだけ動かす。
    // 保存状態の表示更新などで走らせると、動いている途中で止めてしまう。
  }, [layout, gap, activeId]);

  const nameById = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);
  const nameOf = (id: number) => nameById.get(id) ?? "?";

  const seated = useMemo(() => layout.flat(), [layout]);
  const rowCount = layout.length;
  // 1行1人まで。行数が人数を超えることはない。
  const maxRows = Math.max(seated.length, 1);
  const selectedIds = useMemo(() => new Set(seated), [seated]);
  const shifts = useMemo(() => rowShiftUnits(layout.map((row) => row.length)), [layout]);

  const updateGap = (next: Gap | null) => {
    gapRef.current = next;
    setGap(next);
  };

  const save = useCallback(
    async (next: number[][]) => {
      const seq = ++saveSeq.current;
      setStatus("saving");
      try {
        const res = await api<{ rows: number[][] }>(`/api/songs/${songId}/seats`, {
          method: "PUT",
          body: { rows: next },
        });
        if (seq !== saveSeq.current) return;
        // 同じ内容なら状態を作り直さない（アニメーションが途中で止まってしまうため）
        setLayout((current) => (sameLayout(current, res.rows) ? current : res.rows));
        setStatus("saved");
        setError(null);
      } catch (err) {
        if (seq !== saveSeq.current) return;
        setStatus("error");
        setError(errorMessage(err));
        await load();
      }
    },
    [load, setError, songId],
  );

  const renameSong = () =>
    run(async () => {
      const name = nameInput.trim();
      if (!name || name === songName) return;
      const updated = await api<Song>(`/api/songs/${songId}`, { method: "PATCH", body: { name } });
      onRenamed(updated.name);
    });

  const deleteSong = () => {
    if (!confirm(`「${songName}」を削除しますか？\nこの曲の座席表も削除されます。`)) return;
    void run(async () => {
      await api(`/api/songs/${songId}`, { method: "DELETE" });
      onDeleted();
    });
  };

  const sensors = useSensors(
    // 5px 動かすまではクリック扱い（×ボタンなどを誤ってドラッグしない）
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const id = Number(event.active.id);
    // 持ち上げる前（まだ全員が行に並んでいる）の席の位置を測っておく。
    // この位置はドラッグ中も変わらないので、落とし先の判定の基準にできる。
    const grid = gridRef.current;
    if (grid) geometry.current = measureRows(grid);

    setActiveId(id);
    // 持ち上げた席の元の位置に隙間を開く。ここを開かずに行を左へ詰めると、
    // 右隣の円が持ち上げた席の位置へ移動して「入れ替わった」ように見えてしまう。
    const slot = findSlot(layout, id);
    if (slot) updateGap(slot);
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const rect = event.active.rect.current.translated;
    // 形を測る前（まだドラッグが始まっていない）は判定しない
    if (!rect || geometry.current.length === 0) return;

    // ドラッグしている円の中心で判定する
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    // 縦にいちばん近い行
    let row = -1;
    let nearest = Infinity;
    geometry.current.forEach((line, index) => {
      const distance = y < line.top ? line.top - y : y > line.bottom ? y - line.bottom : 0;
      if (distance < nearest) {
        nearest = distance;
        row = index;
      }
    });
    if (row < 0) return;

    // 横は「円と円の中間点」で数える。落とし先は全員分の席の位置のどこかで、
    // その中間点を越えたら隣の席へ移る。中間点を閾値にすれば半ピッチ分の
    // 遊びができ、左右どちらへ動かしても対称に入れ替わる。
    const { centers, pitch } = geometry.current[row];

    let index = 0;
    for (let i = 0; i < centers.length - 1; i++) {
      if (centers[i] + pitch / 2 < x) index = i + 1;
    }

    const current = gapRef.current;
    if (!current || current.row !== row || current.index !== index) {
      updateGap({ row, index });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const target = gapRef.current;
    const movedId = Number(event.active.id);
    setActiveId(null);
    updateGap(null);
    if (!target) return;

    // 動かした人以外の配置は変えない
    const next = placeMember(layout, movedId, target);
    // 元の位置のまま離した（実質変わらない）場合は何もしない
    if (sameLayout(next, layout)) return;

    // 着地するまで元の席を隠しておく（overlay と二重に見えないように）
    setLandingId(movedId);
    if (landingTimer.current !== null) window.clearTimeout(landingTimer.current);
    landingTimer.current = window.setTimeout(() => setLandingId(null), LANDING_MS);

    setLayout(next);
    void save(next);
  };

  const removeSeat = (memberId: number) => {
    const next = removeMember(layout, memberId);
    setLayout(next);
    void save(next);
  };

  const addSeat = (memberId: number) => {
    const next = appendMember(layout, memberId);
    setLayout(next);
    void save(next);
  };

  const toggleSeat = (memberId: number) => {
    if (seated.includes(memberId)) removeSeat(memberId);
    else addSeat(memberId);
  };

  // 行数の変更は、全員をその行数に振り分け直す
  const changeRowCount = (delta: number) => {
    const next = Math.min(Math.max(rowCount + delta, 1), maxRows);
    if (next === rowCount) return;
    const relaid = distribute(seated, next);
    setLayout(relaid);
    void save(relaid);
  };

  return (
    <div className="page">
      <div className="page-head">
        <button type="button" className="button-sub" onClick={onBack}>
          ← イベントへ
        </button>
        <h2 className="page-title">{songName} の座席表</h2>
        <button
          type="button"
          className="hamburger head-actions"
          aria-label="曲の設定を開く"
          aria-expanded={panelOpen}
          onClick={() => {
            setNameInput(songName);
            setPanelOpen((open) => !open);
          }}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted">読み込み中…</p>}

      <div className="seat-toolbar">
        <div className="seat-toolbar-group">
          <span className="muted">行数</span>
          <button
            type="button"
            className="button-sub"
            onClick={() => changeRowCount(-1)}
            disabled={rowCount <= 1}
          >
            −
          </button>
          <span className="cols-value">{rowCount}</span>
          <button
            type="button"
            className="button-sub"
            onClick={() => changeRowCount(1)}
            disabled={rowCount >= maxRows}
          >
            ＋
          </button>
        </div>
        <span className={`save-status ${status}`}>{statusLabel(status)}</span>
      </div>

      {seated.length === 0 ? (
        <p className="muted">
          この曲にはまだ誰も割り当てられていません。右上の ☰ から参加する人を選んでください。
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setActiveId(null);
            updateGap(null);
          }}
        >
          <div className="seat-grid-scroll">
            {/* この白い四角の中だけが配る範囲 */}
            <div className="seat-grid" ref={gridRef}>
              {layout.map((row, rowIndex) => {
                // 持ち上げている人は行の流れから外れるので、その分を詰めて数える
                const liftedIndex = activeId === null ? -1 : row.indexOf(activeId);
                const lastIndex = row.length - (liftedIndex >= 0 ? 1 : 0);
                const opened = gap?.row === rowIndex && activeId !== null;
                // 隙間の分だけ行が広がり、持ち上げた分だけ狭くなる。
                // どちらも中央寄せで行が横にずれるので、その分を打ち消す
                // （結果、隙間より前の円は動かず、後ろの円だけ1つ分ずれる）
                const shift = shifts[rowIndex] + (opened ? 1 : 0) - (liftedIndex >= 0 ? 1 : 0);
                return (
                  <div
                    className="seat-row"
                    key={rowIndex}
                    style={{ "--row-shift": shift } as CSSProperties}
                  >
                    {row.map((memberId, index) => {
                      // 持ち上げている本人は行にいないので、隙間の位置は数えない
                      const at =
                        memberId === activeId
                          ? null
                          : liftedIndex >= 0 && index > liftedIndex
                            ? index - 1
                            : index;
                      return (
                        <Fragment key={memberId}>
                          {opened && at !== null && gap.index === at && (
                            <span className="seat-placeholder" aria-hidden="true" />
                          )}
                          <SortableSeat
                            memberId={memberId}
                            name={nameOf(memberId)}
                            index={index}
                            hidden={memberId === landingId}
                            onRemove={removeSeat}
                          />
                        </Fragment>
                      );
                    })}
                    {/* 行の右端にも置けるようにする */}
                    {opened && gap.index === lastIndex && (
                      <span className="seat-placeholder" aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <DragOverlay dropAnimation={{ duration: LANDING_MS, easing: "ease" }}>
            {activeId !== null ? <SeatCircle name={nameOf(activeId)} dragging /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {panelOpen && (
        <>
          <div className="panel-backdrop" onClick={() => setPanelOpen(false)} />
          <aside className="side-panel" aria-label="曲の設定">
            <div className="side-panel-head">
              <h3 className="side-panel-title">曲の設定</h3>
              <button
                type="button"
                className="panel-close"
                aria-label="閉じる"
                onClick={() => setPanelOpen(false)}
              >
                ×
              </button>
            </div>

            <section className="panel-section">
              <h4 className="panel-section-title">曲のタイトル</h4>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void renameSong();
                }}
              >
                <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
                <button
                  type="submit"
                  className="button-primary"
                  disabled={busy || !nameInput.trim() || nameInput.trim() === songName}
                >
                  保存
                </button>
              </form>
            </section>

            <section className="panel-section panel-section-fill">
              <h4 className="panel-section-title">参加する人（{seated.length}人）</h4>
              {members.length === 0 ? (
                <p className="muted">このイベントにはまだ参加者がいません。</p>
              ) : (
                <MemberSelector members={members} selectedIds={selectedIds} onToggle={toggleSeat} />
              )}
            </section>

            <section className="panel-section">
              <button type="button" className="button-danger panel-delete" onClick={deleteSong}>
                この曲を削除
              </button>
            </section>
          </aside>
        </>
      )}
    </div>
  );
}
