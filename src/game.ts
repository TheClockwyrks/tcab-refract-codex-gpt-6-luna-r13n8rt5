import type { Game, InitApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import {
  ACTIONS,
  BACK_LABEL,
  BINDINGS,
  BOARD_CX,
  BOARD_CY,
  CAMPAIGN_LENGTH,
  CHANNELS,
  CELL_PITCH,
  CUES,
  HUD_SOLVED_LABEL,
  HUD_TIER_LABEL,
  MAX_TIER,
  NODE_HIT_R,
  NODE_R,
  REFRACT_DEBUG_VERSION,
  SET_LABELS,
  SOLVED_ITEMS,
  SOLVED_TITLE_TEXT,
  STAGE_CX,
  TARGET_MIN_H,
  TARGET_MIN_W,
  TITLE_ITEMS,
  TITLE_TEXT,
  TAGLINE_TEXT,
  TIERS,
  TIER_ADVANCE,
} from "./constants";

export type Screen =
  "title" | "howto" | "select" | "playing" | "solved" | "complete";
export type Mode = "campaign" | "cascade";
export type Channel = "triangle" | "square" | "diamond";
export type NodeKind = "emitter" | "lens" | "crystal";
export interface Cell {
  readonly col: number;
  readonly row: number;
}
export interface NodeState {
  readonly col: number;
  readonly row: number;
  readonly kind: NodeKind;
  readonly channel: Channel | null;
  readonly charges: number | null;
}
export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly nodes: readonly NodeState[];
}
export interface BeamState {
  readonly channel: Channel;
  readonly cells: readonly Cell[];
}
export interface TraceState {
  readonly channel: Channel;
}
export type PointerDevice = "mouse" | "pen" | "touch";
export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}
export interface RefractState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly board: BoardState;
  readonly beams: readonly BeamState[];
  readonly tracing: TraceState | null;
  readonly boardIndex: number;
  readonly solvedBoards: readonly number[];
  readonly unlockedCount: number;
  readonly selectIndex: number;
  readonly solvedCount: number;
  readonly tier: number;
  readonly pointer: PointerState;
  readonly armedTarget: string | null;
  readonly simTime: number;
  readonly muted: boolean;
}

const boards = [
  [".Tt", "ttT", ".tt"],
  [".tt", "TtT", "tt."],
  ["tTtt", "ttTt", "ttt."],
  ["Tt.t", "tTtt", ".ttt"],
  [".tTt", ".ttt", "ttTt", "tttt"],
  ["tttT", "ttt.", "t.tt", "ttTt"],
  ["STtt", "sstt", "ssTt", "Sss."],
  ["Sst..", "stTtt", "ssttt", "SsstT"],
  ["tSss", "2tss", "Ttss", "tTS."],
  ["Tt.T.", "ttt..", "t2sSs", "tSsss"],
  ["..t.s", "ttT2s", "ttS2S", "t.Tss"],
  ["Tttt.", "ttsSt", ".22t.", "ssST."],
  [".Ddd", "tTdD", "t22.", "tsSs", "T.S."],
  ["..tT.", "t2dD.", "T2t.s", "d2sss", "DSssS"],
  [".T.2t", "sDttt", "sS2Td", "ss22D", ".S.d."],
  ["..ttt", ".S2tt", "DsTsT", "d22d.", "SddD."],
  ["...ttd", "S2Ttdd", "t32Ddd", "Tss2d.", "sS.dD."],
  ["T.....", "ttDsss", "dd3222", ".dt3Ss", "DddTSs"],
  [".Dttt", ".dd3t", ".d2TT", "S2s2D", ".sSss"],
  [".S.tT.", "s2ttDd", "s2T2.d", "s22d3.", "ssSddD"],
  ["S2D..T", "d2ssts", ".D3S3s", ".dT32t", ".d2tt."],
  [".tt2d.", ".t2t2d", "t1DdSd", "2.S3dD", "TT2sd.", ".ssss."],
  ["s2SST..", "2232.t.", "stTsttt", "..t.t.t", "d22ttdD", "dD2dddd"],
  ["ssdd.d.", "2S.dd2d", "ssD..d.", "t2ttTdd", ".t323Dd", "ttT2sS."],
] as const;
const color: Record<Channel, string> = {
  triangle: "#ff6b8a",
  square: "#4de0c1",
  diamond: "#a88bff",
};
const centerX = (col: number, cols: number) =>
  BOARD_CX - ((cols - 1) * CELL_PITCH) / 2 + col * CELL_PITCH;
const centerY = (row: number, rows: number) =>
  BOARD_CY - ((rows - 1) * CELL_PITCH) / 2 + row * CELL_PITCH;
const parseBoard = (rows: readonly string[]): BoardState => {
  if (
    !rows.length ||
    rows[0].length < 1 ||
    rows.some((r) => r.length !== rows[0].length) ||
    rows[0].length > 7 ||
    rows.length > 6
  )
    throw new Error("Invalid board dimensions");
  const map: Record<string, Channel> = {
    T: "triangle",
    t: "triangle",
    S: "square",
    s: "square",
    D: "diamond",
    d: "diamond",
  };
  const nodes: NodeState[] = [];
  rows.forEach((line, row) =>
    [...line].forEach((ch, col) => {
      if (ch === ".") return;
      if ("TtSDsd".includes(ch))
        nodes.push({
          col,
          row,
          kind: ch === ch.toUpperCase() ? "emitter" : "lens",
          channel: map[ch],
          charges: null,
        });
      else if ("123".includes(ch))
        nodes.push({
          col,
          row,
          kind: "crystal",
          channel: null,
          charges: Number(ch),
        });
      else throw new Error(`Invalid board character: ${ch}`);
    }),
  );
  return { cols: rows[0].length, rows: rows.length, nodes };
};
const blankBoard = (): BoardState => ({ cols: 0, rows: 0, nodes: [] });
const beamsFor = (b: BoardState): BeamState[] =>
  CHANNELS.filter((c) => b.nodes.some((n) => n.channel === c)).map(
    (channel) => ({ channel, cells: [] }),
  );
const nodeAt = (b: BoardState, c: Cell) =>
  b.nodes.find((n) => n.col === c.col && n.row === c.row);
const same = (a: Cell, b: Cell) => a.col === b.col && a.row === b.row;
const seg = (a: Cell, b: Cell) => `${a.col},${a.row}:${b.col},${b.row}`;
const spent = (s: DeepReadonly<RefractState>, n: NodeState) =>
  s.beams.reduce(
    (v, b) =>
      v + b.cells.filter((c) => c.col === n.col && c.row === n.row).length,
    0,
  );
const beamComplete = (
  s: DeepReadonly<RefractState>,
  beam: BeamState,
): boolean => {
  const ns = s.board.nodes.filter((n) => n.channel === beam.channel),
    ends = ns.filter((n) => n.kind === "emitter"),
    lenses = ns.filter((n) => n.kind === "lens");
  return (
    ends.length === 2 &&
    beam.cells.length > 1 &&
    ends.every(
      (e) =>
        beam.cells.filter((c) => c.col === e.col && c.row === e.row).length ===
        1,
    ) &&
    lenses.every(
      (l) =>
        beam.cells.filter((c) => c.col === l.col && c.row === l.row).length ===
        2,
    )
  );
};
const solved = (s: DeepReadonly<RefractState>) =>
  s.beams.length > 0 &&
  s.beams.every((b) => beamComplete(s, b)) &&
  s.board.nodes
    .filter((n) => n.kind === "crystal")
    .every((n) => spent(s, n) === (n.charges ?? 0));
interface Target {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
const targets = (s: DeepReadonly<RefractState>): Target[] => {
  const menu = (items: number, y = 390) =>
    Array.from({ length: items }, (_, i) => ({
      id: `menu-${i}`,
      x: STAGE_CX - 190,
      y: y + i * 76,
      w: 380,
      h: TARGET_MIN_H,
    }));
  if (s.screen === "title") return menu(TITLE_ITEMS.length, 426);
  if (s.screen === "howto")
    return [{ id: "back", x: 64, y: 620, w: 150, h: TARGET_MIN_H }];
  if (s.screen === "select")
    return [
      ...Array.from({ length: 24 }, (_, i) => ({
        id: `board-${i + 1}`,
        x: 385 + (i % 6) * 101,
        y: 216 + Math.floor(i / 6) * 78,
        w: TARGET_MIN_W,
        h: TARGET_MIN_H,
      })),
      { id: "back", x: 64, y: 620, w: 150, h: TARGET_MIN_H },
    ];
  if (s.screen === "playing")
    return [
      { id: "clear", x: 64, y: 620, w: 150, h: TARGET_MIN_H },
      { id: "back", x: 1066, y: 620, w: 150, h: TARGET_MIN_H },
    ];
  if (s.screen === "solved")
    return menu(s.mode === "cascade" ? 2 : s.boardIndex < 23 ? 3 : 2, 450);
  return menu(2, 510);
};
const initial = (muted = false): RefractState => ({
  screen: "title",
  mode: "campaign",
  menuIndex: 0,
  board: blankBoard(),
  beams: [],
  tracing: null,
  boardIndex: 0,
  solvedBoards: [],
  unlockedCount: 1,
  selectIndex: 0,
  solvedCount: 0,
  tier: 1,
  pointer: { x: 0, y: 0, down: false, device: "mouse" },
  armedTarget: null,
  simTime: 0,
  muted,
});
const setBoard = (s: RefractState, b: BoardState): RefractState => ({
  ...s,
  board: b,
  beams: beamsFor(b),
  tracing: null,
  screen: "playing",
  menuIndex: 0,
  armedTarget: null,
});
const randomBoard = (tier: number): BoardState => {
  if (!Number.isInteger(tier) || tier < 1 || tier > MAX_TIER)
    throw new Error("Invalid cascade tier");
  const spec = TIERS[tier - 1];
  const candidates = boards.map(parseBoard).filter((board) => {
    const crystals = board.nodes.filter((node) => node.kind === "crystal");
    const channelCount = beamsFor(board).length;
    const emptyCount = board.cols * board.rows - board.nodes.length;
    return (
      board.cols >= spec.minCols &&
      board.cols <= spec.maxCols &&
      board.rows >= spec.minRows &&
      board.rows <= spec.maxRows &&
      channelCount === spec.channels &&
      crystals.length >= spec.minCrystals &&
      crystals.length <= spec.maxCrystals &&
      crystals.every(
        (node) =>
          (node.charges ?? 0) >= spec.minCharges &&
          (node.charges ?? 0) <= spec.maxCharges,
      ) &&
      emptyCount <= spec.maxEmptyCells
    );
  });
  if (candidates.length === 0)
    throw new Error(`No cascade boards available for tier ${tier}`);
  return candidates[Math.floor(Math.random() * candidates.length)];
};
const prepareCampaign = (s: RefractState, index: number): RefractState => ({
  ...setBoard(s, parseBoard(boards[index] ?? boards[0])),
  boardIndex: index,
  selectIndex: index,
});
const BACKGROUND = "#080d18";
export { BACKGROUND };

export interface RefractSnapshot {
  version: number;
  screen: Screen;
  mode: Mode;
  menuIndex: number;
  boardIndex: number;
  solvedBoards: number[];
  unlockedCount: number;
  selectIndex: number;
  solvedCount: number;
  tier: number;
  board: {
    cols: number;
    rows: number;
    nodes: {
      col: number;
      row: number;
      x: number;
      y: number;
      kind: NodeKind;
      channel: Channel | null;
      charges: number | null;
      spent: number | null;
    }[];
  };
  beams: Record<string, { cells: Cell[]; complete: boolean }>;
  solved: boolean;
  tracing: { channel: string; live: Cell } | null;
  pointer: PointerState;
  targets: Target[];
  muted: boolean;
  simTime: number;
}
export interface RefractDebugApi {
  version: number;
  reset(s: DeepReadonly<RefractState>): RefractState;
  snapshot(s: DeepReadonly<RefractState>): RefractSnapshot;
  reconcile(s: DeepReadonly<RefractState>): RefractState;
  setMode(s: DeepReadonly<RefractState>, mode: Mode): RefractState;
  setScreen(s: DeepReadonly<RefractState>, screen: Screen): RefractState;
  setMenuIndex(s: DeepReadonly<RefractState>, index: number): RefractState;
  setSolvedCount(s: DeepReadonly<RefractState>, count: number): RefractState;
  setTier(s: DeepReadonly<RefractState>, tier: number): RefractState;
  generateBoard(s: DeepReadonly<RefractState>, tier: number): RefractState;
  loadBoard(
    s: DeepReadonly<RefractState>,
    board: readonly string[],
  ): RefractState;
  pointerDown(
    s: DeepReadonly<RefractState>,
    x: number,
    y: number,
    device?: PointerDevice,
  ): RefractState;
  pointerMove(
    s: DeepReadonly<RefractState>,
    x: number,
    y: number,
    device?: PointerDevice,
  ): RefractState;
  pointerUp(
    s: DeepReadonly<RefractState>,
    device?: PointerDevice,
  ): RefractState;
  clear(s: DeepReadonly<RefractState>): RefractState;
}
export const game: Game<RefractState, RefractDebugApi> = {
  initialize(api: InitApi<RefractState>) {
    ACTIONS.forEach((a) => api.input.register(a, { keys: [...BINDINGS[a]] }));
    [
      CUES.connect,
      CUES.retract,
      CUES.channelComplete,
      CUES.solved,
      CUES.clear,
    ].forEach((c, i) =>
      api.audio.define(c, {
        wave: i % 2 ? "triangle" : "sine",
        freq: 300 + i * 110,
        freqTo: 520 + i * 90,
        gain: 0.1,
        durationMs: 100,
      }),
    );
    const diag: Record<
      string,
      (s: DeepReadonly<RefractState>) => string | number | boolean
    > = {
      screen: (s) => s.screen,
      mode: (s) => s.mode,
      board: (s) => `${s.board.cols}×${s.board.rows}`,
      solved: (s) => solved(s),
      pointer: (s) =>
        `${Math.round(s.pointer.x)},${Math.round(s.pointer.y)} ${s.pointer.device}`,
    };
    CHANNELS.forEach((c) => {
      diag[`${c} beam`] = (s) => {
        const b = s.beams.find((x) => x.channel === c);
        return b ? b.cells.length : 0;
      };
      diag[`${c} complete`] = (s) => {
        const b = s.beams.find((x) => x.channel === c);
        return b ? beamComplete(s, b) : false;
      };
    });
    diag.crystals = (s) =>
      s.board.nodes
        .filter((n) => n.kind === "crystal")
        .map((n) => `${spent(s, n)}/${n.charges}`)
        .join(" ") || "none";
    Object.entries(diag).forEach(([name, source]) =>
      api.diagnostics.register(name, source),
    );
    const debug: RefractDebugApi = {
      version: REFRACT_DEBUG_VERSION,
      reset: (s) => ({ ...initial(s.muted) }),
      snapshot: (s) => ({
        version: 2,
        screen: s.screen,
        mode: s.mode,
        menuIndex: s.menuIndex,
        boardIndex: s.boardIndex,
        solvedBoards: [...s.solvedBoards],
        unlockedCount: s.unlockedCount,
        selectIndex: s.selectIndex,
        solvedCount: s.solvedCount,
        tier: s.tier,
        board: {
          cols: s.board.cols,
          rows: s.board.rows,
          nodes: s.board.nodes.map((n) => ({
            ...n,
            x: centerX(n.col, s.board.cols),
            y: centerY(n.row, s.board.rows),
            spent: n.kind === "crystal" ? spent(s, n) : null,
          })),
        },
        beams: Object.fromEntries(
          s.beams.map((b) => [
            b.channel,
            {
              cells: b.cells.map((c) => ({ ...c })),
              complete: beamComplete(s, b),
            },
          ]),
        ),
        solved: solved(s),
        tracing: s.tracing
          ? {
              channel: s.tracing.channel,
              live: {
                ...s.beams
                  .find((b) => b.channel === s.tracing?.channel)!
                  .cells.slice(-1)[0],
              },
            }
          : null,
        pointer: { ...s.pointer },
        targets: targets(s),
        muted: s.muted,
        simTime: s.simTime,
      }),
      reconcile: (s) => ({ ...s }),
      setMode: (s, mode) => ({ ...s, mode }),
      setScreen: (s, screen) => ({ ...s, screen, armedTarget: null }),
      setMenuIndex: (s, menuIndex) => ({ ...s, menuIndex }),
      setSolvedCount: (s, solvedCount) => {
        if (!Number.isInteger(solvedCount) || solvedCount < 0)
          throw new Error("Invalid solved count");
        return { ...s, solvedCount };
      },
      setTier: (s, tier) => {
        if (!Number.isInteger(tier) || tier < 1 || tier > MAX_TIER)
          throw new Error("Invalid cascade tier");
        return { ...s, tier };
      },
      generateBoard: (s, tier) => setBoard({ ...s }, randomBoard(tier)),
      loadBoard: (s, b) => setBoard({ ...s }, parseBoard(b)),
      pointerDown: (s, x, y, device = "mouse") =>
        pointerEvent({ ...s }, "down", x, y, device),
      pointerMove: (s, x, y, device = "mouse") =>
        pointerEvent({ ...s }, "move", x, y, device),
      pointerUp: (s, device = "mouse") =>
        pointerEvent({ ...s }, "up", s.pointer.x, s.pointer.y, device),
      clear: (s) => ({
        ...s,
        beams: s.beams.map((b) => ({ ...b, cells: [] })),
        tracing: null,
      }),
    };
    return [initial(), debug];
  },
  update(state, api, dt) {
    let s = { ...state, simTime: state.simTime + dt };
    const actions = (a: string) => api.input.pressed(a);
    if (actions("mute")) {
      s = { ...s, muted: !api.audio.muted() };
      api.audio.setMuted(s.muted);
    } else s = { ...s, muted: api.audio.muted() };
    if (
      actions("clear") &&
      s.screen === "playing" &&
      s.beams.some((b) => b.cells.length > 1)
    ) {
      s = {
        ...s,
        beams: s.beams.map((b) => ({ ...b, cells: [] })),
        tracing: null,
      };
      api.audio.play(CUES.clear);
    }
    const move = (delta: number) => {
      if (s.screen === "select") {
        let row = Math.floor(s.selectIndex / 6),
          col = s.selectIndex % 6;
        if (delta === -1) col = (col + 5) % 6;
        if (delta === 1) col = (col + 1) % 6;
        if (delta === -6) row = (row + 3) % 4;
        if (delta === 6) row = (row + 1) % 4;
        s = { ...s, selectIndex: row * 6 + col };
      } else {
        const count =
          s.screen === "title"
            ? 3
            : s.screen === "solved"
              ? s.mode === "cascade"
                ? 2
                : s.boardIndex < 23
                  ? 3
                  : 2
              : s.screen === "complete"
                ? 2
                : 1;
        s = { ...s, menuIndex: (s.menuIndex + delta + count) % count };
      }
    };
    if (actions("up")) move(s.screen === "select" ? -6 : -1);
    if (actions("down")) move(s.screen === "select" ? 6 : 1);
    if (actions("left") && s.screen === "select") move(-1);
    if (actions("right") && s.screen === "select") move(1);
    const back = () => {
      if (s.screen === "playing")
        s = {
          ...s,
          screen: s.mode === "campaign" ? "select" : "title",
          menuIndex: s.mode === "campaign" ? 0 : 1,
          beams:
            s.mode === "campaign"
              ? s.beams.map((b) => ({ ...b, cells: [] }))
              : s.beams,
          tracing: null,
        };
      else if (s.screen === "howto")
        s = { ...s, screen: "title", menuIndex: 2 };
      else if (
        s.screen === "select" ||
        s.screen === "solved" ||
        s.screen === "complete"
      )
        s = {
          ...s,
          screen: "select",
          menuIndex: 0,
          tracing: null,
        };
    };
    if (actions("back")) back();
    if (actions("confirm")) {
      if (s.screen === "title") {
        if (s.menuIndex === 0) s = { ...s, mode: "campaign", screen: "select" };
        else if (s.menuIndex === 1)
          s = setBoard(
            { ...s, mode: "cascade", solvedCount: 0, tier: 1 },
            randomBoard(1),
          );
        else s = { ...s, screen: "howto", menuIndex: 0 };
      } else if (s.screen === "select") {
        if (s.selectIndex < s.unlockedCount)
          s = prepareCampaign(s, s.selectIndex);
      } else if (s.screen === "solved") {
        if (s.mode === "cascade") {
          if (s.menuIndex === 0) s = setBoard(s, randomBoard(s.tier));
          else s = setBoard({ ...s, solvedCount: 0, tier: 1 }, randomBoard(1));
        } else if (s.menuIndex === 0 && s.boardIndex < 23)
          s = prepareCampaign(s, s.boardIndex + 1);
        else if (s.menuIndex === (s.boardIndex < 23 ? 1 : 0))
          s = prepareCampaign(s, s.boardIndex);
        else s = { ...s, screen: "select", selectIndex: s.boardIndex };
      } else if (s.screen === "complete")
        s = {
          ...s,
          screen: s.menuIndex === 0 ? "select" : "title",
          menuIndex: 0,
        };
    }
    const beamsBeforeInput = s.beams;
    const boardBeforeInput = s.board;
    let pointerCleared = false;
    for (const p of api.input.pointerSamples()) {
      if (!p.primary) continue;
      if (
        p.type === "up" &&
        s.armedTarget === "clear" &&
        beamsBeforeInput.some((beam) => beam.cells.length > 1)
      ) {
        pointerCleared = targets(s).some(
          (target) =>
            target.id === "clear" &&
            p.x >= target.x &&
            p.x <= target.x + target.w &&
            p.y >= target.y &&
            p.y <= target.y + target.h,
        );
      }
      if (p.type === "down") s = pointerEvent(s, "down", p.x, p.y, p.device);
      else if (p.type === "move")
        s = pointerEvent(s, "move", p.x, p.y, p.device);
      else if (p.type === "up" || p.type === "cancel")
        s = pointerEvent(s, "up", p.x, p.y, p.device);
    }
    const snap = api.input.pointer();
    s = {
      ...s,
      pointer: { x: snap.x, y: snap.y, down: snap.down, device: snap.device },
    };
    const grew = s.beams.some(
      (beam) =>
        beam.cells.length >
        (beamsBeforeInput.find((previous) => previous.channel === beam.channel)
          ?.cells.length ?? 0),
    );
    const shrank = s.beams.some(
      (beam) =>
        beam.cells.length <
        (beamsBeforeInput.find((previous) => previous.channel === beam.channel)
          ?.cells.length ?? 0),
    );
    const samePlayingBoard =
      s.screen === "playing" && s.board === boardBeforeInput;
    if (samePlayingBoard && grew) api.audio.play(CUES.connect);
    if (pointerCleared) api.audio.play(CUES.clear);
    else if (samePlayingBoard && shrank) api.audio.play(CUES.retract);
    if (
      samePlayingBoard &&
      s.beams.some((beam) => {
        const previous = beamsBeforeInput.find(
          (candidate) => candidate.channel === beam.channel,
        );
        return (
          previous !== undefined &&
          !beamComplete({ ...s, beams: beamsBeforeInput }, previous) &&
          beamComplete(s, beam)
        );
      })
    )
      api.audio.play(CUES.channelComplete);
    if (s.screen === "playing" && solved(s)) {
      const before = state.solvedBoards.includes(s.boardIndex);
      if (s.mode === "campaign") {
        const solvedBoards = before
          ? s.solvedBoards
          : [...s.solvedBoards, s.boardIndex].sort((a, b) => a - b);
        const unlockedCount = Math.min(
          CAMPAIGN_LENGTH,
          Math.max(s.unlockedCount, s.boardIndex + 2),
        );
        s = {
          ...s,
          solvedBoards,
          unlockedCount,
          screen:
            solvedBoards.length === CAMPAIGN_LENGTH ? "complete" : "solved",
          menuIndex: 0,
          tracing: null,
        };
      } else {
        s = {
          ...s,
          solvedCount: s.solvedCount + 1,
          tier: Math.min(
            Math.floor((s.solvedCount + 1) / TIER_ADVANCE) + 1,
            MAX_TIER,
          ),
          screen: "solved",
          menuIndex: 0,
          tracing: null,
        };
      }
      api.audio.play(CUES.solved);
    }
    return s;
  },
  render(state, api) {
    draw(state, api.ctx);
  },
};

function pointerEvent(
  s: RefractState,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice,
): RefractState {
  const ptr = {
    x,
    y,
    down: type === "down" ? true : type === "up" ? false : s.pointer.down,
    device,
  };
  let n = { ...s, pointer: ptr };
  const target = targets(s).find(
    (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
  );
  if (type === "move" && !s.pointer.down && target) {
    const idx = Number(target.id.split("-")[1]);
    if (target.id.startsWith("board-")) n = { ...n, selectIndex: idx - 1 };
    else if (target.id.startsWith("menu-")) n = { ...n, menuIndex: idx };
    return n;
  }
  if (type === "down") {
    if (target) {
      const idx = Number(target.id.split("-")[1]);
      n = { ...n, armedTarget: target.id };
      if (target.id.startsWith("board-")) n = { ...n, selectIndex: idx - 1 };
      else if (target.id.startsWith("menu-")) n = { ...n, menuIndex: idx };
      return n;
    }
    if (s.screen !== "playing") return n;
    const cell = s.board.nodes.find(
      (q) =>
        Math.hypot(
          centerX(q.col, s.board.cols) - x,
          centerY(q.row, s.board.rows) - y,
        ) <= NODE_HIT_R,
    );
    if (!cell || (!cell.channel && cell.kind !== "crystal")) return n;
    const beam = cell.channel
      ? s.beams.find((b) => b.channel === cell.channel)
      : undefined;
    if (cell.kind === "emitter" && beam?.cells.length === 0) {
      n = {
        ...n,
        beams: s.beams.map((b) =>
          b === beam ? { ...b, cells: [{ col: cell.col, row: cell.row }] } : b,
        ),
        tracing: { channel: beam.channel },
      };
      return n;
    }
    if (
      beam &&
      beam.cells.length &&
      [beam.cells[0], beam.cells[beam.cells.length - 1]].some((c) =>
        same(c, cell),
      )
    ) {
      const cells = [...beam.cells];
      if (same(cells[0], cell)) cells.reverse();
      n = {
        ...n,
        beams: s.beams.map((b) => (b === beam ? { ...b, cells } : b)),
        tracing: { channel: beam.channel },
      };
      return n;
    }
    const pass = s.beams.filter((b) => b.cells.some((c) => same(c, cell)));
    if (pass.length === 1) {
      const b = pass[0],
        i = b.cells.map((c) => same(c, cell)).lastIndexOf(true),
        cells = b.cells.slice(0, i + 1);
      n = {
        ...n,
        beams: s.beams.map((q) => (q === b ? { ...q, cells } : q)),
        tracing: { channel: b.channel },
      };
    }
    return n;
  }
  if (type === "up") {
    if (s.armedTarget && target?.id === s.armedTarget)
      n = takeTarget(n, target.id);
    else if (s.tracing) {
      const b = s.beams.find((q) => q.channel === s.tracing?.channel);
      if (b && b.cells.length < 2)
        n = {
          ...n,
          beams: s.beams.map((q) => (q === b ? { ...q, cells: [] } : q)),
        };
      n = { ...n, tracing: null };
    }
    n = { ...n, armedTarget: null };
    return n;
  }
  if (type === "move" && s.tracing) {
    const beam = s.beams.find((b) => b.channel === s.tracing?.channel)!;
    const end = beam.cells[beam.cells.length - 1];
    const cell = s.board.nodes.find(
      (q) =>
        Math.hypot(
          centerX(q.col, s.board.cols) - x,
          centerY(q.row, s.board.rows) - y,
        ) <= NODE_HIT_R,
    );
    if (!cell) return n;
    const prev = beam.cells[beam.cells.length - 2];
    if (prev && same(prev, cell)) {
      n = {
        ...n,
        beams: s.beams.map((b) =>
          b === beam ? { ...b, cells: b.cells.slice(0, -1) } : b,
        ),
      };
      return n;
    }
    if (cell.col === end.col && cell.row === end.row) return n;
    const dc = Math.abs(cell.col - end.col),
      dr = Math.abs(cell.row - end.row);
    if (dc > 1 || dr > 1) return n;
    const dest = nodeAt(s.board, cell);
    if (!dest) return n;
    if (dest.channel && dest.channel !== beam.channel) return n;
    const edge = seg(end, cell),
      reverse = seg(cell, end);
    if (
      s.beams.some((b) =>
        b.cells
          .slice(1)
          .some(
            (c, i) =>
              seg(b.cells[i], c) === edge || seg(b.cells[i], c) === reverse,
          ),
      )
    )
      return n;
    if (
      dest.kind === "emitter" &&
      (beam.cells.length > 1 || beam.cells.some((c) => same(c, cell)))
    )
      return n;
    if (dest.kind === "crystal" && spent(s, dest) >= (dest.charges ?? 0))
      return n;
    if (
      dest.kind === "lens" &&
      beam.cells.filter((c) => same(c, cell)).length >= 2
    )
      return n;
    if (nodeAt(s.board, end)?.kind === "emitter" && beam.cells.length > 1)
      return n;
    const diag = (a: Cell, b: Cell) =>
      Math.abs(a.col - b.col) === 1 && Math.abs(a.row - b.row) === 1;
    if (diag(end, cell)) {
      for (const b of s.beams)
        for (let i = 1; i < b.cells.length; i++) {
          const a = b.cells[i - 1],
            z = b.cells[i];
          if (
            diag(a, z) &&
            Math.min(a.col, z.col) === Math.min(end.col, cell.col) &&
            Math.min(a.row, z.row) === Math.min(end.row, cell.row) &&
            seg(a, z) !== edge &&
            seg(a, z) !== reverse
          )
            return n;
        }
    }
    n = {
      ...n,
      beams: s.beams.map((b) =>
        b === beam
          ? { ...b, cells: [...b.cells, { col: cell.col, row: cell.row }] }
          : b,
      ),
    };
    return n;
  }
  return n;
}

function takeTarget(s: RefractState, id: string): RefractState {
  if (id === "clear")
    return {
      ...s,
      beams: s.beams.map((b) => ({ ...b, cells: [] })),
      tracing: null,
    };
  if (id === "back") {
    if (s.screen === "playing")
      return {
        ...s,
        screen: s.mode === "campaign" ? "select" : "title",
        menuIndex: s.mode === "campaign" ? 0 : 1,
        beams:
          s.mode === "campaign"
            ? s.beams.map((b) => ({ ...b, cells: [] }))
            : s.beams,
        tracing: null,
      };
    return {
      ...s,
      screen: s.screen === "howto" ? "title" : "select",
      menuIndex: s.screen === "howto" ? 2 : 0,
    };
  }
  const index = Number(id.split("-")[1]);
  if (s.screen === "select") {
    const boardIndex = index - 1;
    return boardIndex < s.unlockedCount
      ? prepareCampaign({ ...s, selectIndex: boardIndex }, boardIndex)
      : { ...s, selectIndex: boardIndex };
  }
  if (s.screen === "title") {
    if (index === 0)
      return {
        ...s,
        mode: "campaign",
        screen: "select",
        menuIndex: 0,
      };
    if (index === 1)
      return setBoard(
        { ...s, mode: "cascade", solvedCount: 0, tier: 1 },
        randomBoard(1),
      );
    return { ...s, screen: "howto", menuIndex: 0 };
  }
  if (s.screen === "solved") {
    if (s.mode === "cascade")
      return index === 0
        ? setBoard(s, randomBoard(s.tier))
        : setBoard({ ...s, solvedCount: 0, tier: 1 }, randomBoard(1));
    if (index === 0 && s.boardIndex < 23)
      return prepareCampaign(s, s.boardIndex + 1);
    if (index === (s.boardIndex < 23 ? 1 : 0))
      return prepareCampaign(s, s.boardIndex);
    return { ...s, screen: "select", selectIndex: s.boardIndex };
  }
  if (s.screen === "complete")
    return { ...s, screen: index === 0 ? "select" : "title", menuIndex: 0 };
  return { ...s, menuIndex: index };
}

function draw(
  s: DeepReadonly<RefractState>,
  ctx: CanvasRenderingContext2D,
): void {
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, 1280, 720);
  const g = ctx.createRadialGradient(STAGE_CX, 350, 80, STAGE_CX, 350, 650);
  g.addColorStop(0, "#15253b");
  g.addColorStop(1, BACKGROUND);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1280, 720);
  ctx.strokeStyle = "rgba(125,180,220,.07)";
  ctx.lineWidth = 1;
  for (let x = 0; x < 1280; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 720);
    ctx.stroke();
  }
  for (let y = 0; y < 720; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1280, y);
    ctx.stroke();
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (s.board.cols) {
    ctx.strokeStyle = "rgba(120,170,210,.18)";
    ctx.lineWidth = 1;
    for (let r = 0; r < s.board.rows; r++)
      for (let c = 0; c < s.board.cols; c++) {
        const x = centerX(c, s.board.cols),
          y = centerY(r, s.board.rows);
        ctx.beginPath();
        ctx.arc(x, y, 34, 0, Math.PI * 2);
        ctx.stroke();
      }
    for (const b of s.beams) {
      const hue = color[b.channel];
      for (let i = 1; i < b.cells.length; i++) {
        const a = b.cells[i - 1],
          z = b.cells[i];
        ctx.beginPath();
        ctx.moveTo(centerX(a.col, s.board.cols), centerY(a.row, s.board.rows));
        ctx.lineTo(centerX(z.col, s.board.cols), centerY(z.row, s.board.rows));
        ctx.strokeStyle = hue;
        ctx.globalAlpha = 0.24;
        ctx.lineWidth = 18;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 7;
        ctx.strokeStyle = hue;
        ctx.stroke();
      }
    }
    for (const n of s.board.nodes) {
      const x = centerX(n.col, s.board.cols),
        y = centerY(n.row, s.board.rows);
      ctx.save();
      ctx.shadowBlur = 18;
      ctx.shadowColor = n.channel ? color[n.channel] : "#ffc76a";
      ctx.lineWidth = 4;
      if (n.kind === "crystal") {
        const radius = NODE_R;
        ctx.beginPath();
        ctx.moveTo(x, y - radius);
        ctx.lineTo(x + radius * 0.76, y);
        ctx.lineTo(x, y + radius);
        ctx.lineTo(x - radius * 0.76, y);
        ctx.closePath();
        ctx.fillStyle = "#372c29";
        ctx.fill();
        ctx.strokeStyle = "#ffc76a";
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#fff2d2";
        ctx.font = "700 15px system-ui";
        ctx.fillText(`${spent(s, n)}/${n.charges}`, x, y + 1);
      } else {
        const col = color[n.channel!];
        ctx.beginPath();
        if (n.channel === "triangle") {
          ctx.moveTo(x, y - NODE_R);
          ctx.lineTo(x + NODE_R * 0.88, y + NODE_R * 0.62);
          ctx.lineTo(x - NODE_R * 0.88, y + NODE_R * 0.62);
          ctx.closePath();
        } else if (n.channel === "square")
          ctx.rect(
            x - NODE_R * 0.72,
            y - NODE_R * 0.72,
            NODE_R * 1.44,
            NODE_R * 1.44,
          );
        else {
          ctx.moveTo(x, y - NODE_R);
          ctx.lineTo(x + NODE_R, y);
          ctx.lineTo(x, y + NODE_R);
          ctx.lineTo(x - NODE_R, y);
          ctx.closePath();
        }
        ctx.fillStyle = col;
        ctx.strokeStyle = col;
        if (n.kind === "lens") ctx.fill();
        else {
          ctx.fillStyle = "#0c1422";
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fillStyle = col;
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }
  if (s.screen === "title") {
    ctx.fillStyle = "#dceeff";
    ctx.font = "800 76px system-ui";
    ctx.fillText(TITLE_TEXT, STAGE_CX, 205);
    ctx.fillStyle = "#76a9c9";
    ctx.font = "600 18px system-ui";
    ctx.letterSpacing = "8px";
    ctx.fillText(TAGLINE_TEXT, STAGE_CX, 270);
    ctx.letterSpacing = "0px";
    menu(ctx, TITLE_ITEMS, s.menuIndex, 426);
  }
  if (s.screen === "howto") {
    heading(ctx, "TRACE THE ROUTE");
    ctx.textAlign = "left";
    ctx.fillStyle = "#b8c9d9";
    ctx.font = "18px system-ui";
    [
      "Press an emitter and drag node to node to draw its beam.",
      "Thread every lens of that shape, then finish at its other emitter.",
      "Any beam can cross crystals; spend every charge exactly once.",
      "Only adjacent nodes connect. A forbidden move simply holds.",
      "Each segment is unique, and crossing diagonals cannot both be drawn.",
      "Release to keep a route. Press a beam end or middle to edit it.",
      "R clears the board · M toggles sound · Esc goes back.",
    ].forEach((line, i) => ctx.fillText(line, 310, 300 + i * 42));
    button(ctx, 64, 620, BACK_LABEL);
  }
  if (s.screen === "playing") {
    if (s.mode === "cascade") {
      ctx.textAlign = "left";
      ctx.fillStyle = "#90a9c0";
      ctx.font = "13px system-ui";
      ctx.fillText(`${HUD_SOLVED_LABEL}  ${s.solvedCount}`, 52, 57);
      ctx.fillText(`${HUD_TIER_LABEL}  ${s.tier}`, 52, 80);
    } else {
      ctx.textAlign = "left";
      ctx.fillStyle = "#90a9c0";
      ctx.font = "13px system-ui";
      ctx.fillText(`BOARD ${s.boardIndex + 1} / 24`, 52, 58);
    }
    s.beams.forEach((b, i) => {
      ctx.textAlign = "center";
      ctx.fillStyle = color[b.channel];
      ctx.font = "600 13px system-ui";
      ctx.fillText(
        `${b.channel.toUpperCase()}  ${beamComplete(s, b) ? "LINKED" : "OPEN"}`,
        450 + i * 180,
        74,
      );
    });
    button(ctx, 64, 620, "CLEAR · R");
    button(ctx, 1066, 620, BACK_LABEL);
  }
  if (s.screen === "select") {
    heading(ctx, "CHOOSE A BOARD");
    SET_LABELS.forEach((l, r) => {
      ctx.textAlign = "left";
      ctx.fillStyle = "#7594ad";
      ctx.font = "600 12px system-ui";
      ctx.fillText(l, 220, 282 + r * 78);
    });
    for (let i = 0; i < 24; i++) {
      const x = 433 + (i % 6) * 101,
        y = 252 + Math.floor(i / 6) * 78,
        open = i < s.unlockedCount,
        done = s.solvedBoards.includes(i),
        active = i === s.selectIndex;
      ctx.fillStyle = active
        ? "#d9f5ff"
        : done
          ? "#153e40"
          : open
            ? "#172b41"
            : "#101722";
      ctx.strokeStyle = active
        ? "#65dcec"
        : done
          ? "#55cfad"
          : open
            ? "#39536a"
            : "#202a35";
      ctx.lineWidth = active ? 3 : 1;
      ctx.beginPath();
      ctx.roundRect(x - 35, y - 26, 70, 52, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = active ? "#0d2634" : open ? "#d5e3ec" : "#526171";
      ctx.textAlign = "center";
      ctx.font = "700 17px system-ui";
      ctx.fillText(`${i + 1}${done ? " ✓" : open ? "" : " ·"}`, x, y);
    }
    button(ctx, 64, 620, BACK_LABEL);
  }
  if (s.screen === "solved") {
    shade(ctx);
    heading(ctx, SOLVED_TITLE_TEXT);
    ctx.fillStyle = "#93adc3";
    ctx.font = "18px system-ui";
    ctx.fillText(
      s.mode === "cascade"
        ? `Boards solved · ${s.solvedCount}`
        : `Board ${s.boardIndex + 1} complete`,
      STAGE_CX,
      454,
    );
    const labels =
      s.mode === "cascade"
        ? SOLVED_ITEMS
        : s.boardIndex < 23
          ? ["NEXT BOARD", "REPLAY", "BACK TO SELECT"]
          : ["REPLAY", "BACK TO SELECT"];
    menu(ctx, labels, s.menuIndex, 505);
  }
  if (s.screen === "complete") {
    shade(ctx);
    heading(ctx, "COURSE COMPLETE");
    ctx.fillStyle = "#a9c0d2";
    ctx.font = "18px system-ui";
    ctx.fillText("All 24 boards solved. The light is yours.", STAGE_CX, 450);
    menu(ctx, ["BACK TO SELECT", "TITLE MENU"], s.menuIndex, 510);
  }
}
function heading(ctx: CanvasRenderingContext2D, text: string) {
  ctx.textAlign = "center";
  ctx.fillStyle = "#dceeff";
  ctx.font = "700 36px system-ui";
  ctx.fillText(text, STAGE_CX, 176);
}
function menu(
  ctx: CanvasRenderingContext2D,
  items: readonly string[],
  active: number,
  y: number,
) {
  items.forEach((item, i) => {
    const yy = y + i * 76;
    ctx.fillStyle = i === active ? "#d8f6ff" : "#8ba1b5";
    ctx.font = i === active ? "700 20px system-ui" : "500 18px system-ui";
    ctx.textAlign = "center";
    if (i === active) {
      ctx.fillStyle = "rgba(80,206,226,.12)";
      ctx.beginPath();
      ctx.roundRect(STAGE_CX - 190, yy - 27, 380, 54, 12);
      ctx.fill();
      ctx.fillStyle = "#d8f6ff";
    }
    ctx.fillText(
      `${i === active ? "›  " : ""}${item}${i === active ? "  ‹" : ""}`,
      STAGE_CX,
      yy,
    );
  });
}
function button(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
) {
  ctx.fillStyle = "#15283a";
  ctx.strokeStyle = "#3a6075";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, 150, TARGET_MIN_H, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#bdd2df";
  ctx.textAlign = "center";
  ctx.font = "600 13px system-ui";
  ctx.fillText(text, x + 75, y + 36);
}
function shade(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "rgba(5,10,18,.78)";
  ctx.fillRect(0, 0, 1280, 720);
}
