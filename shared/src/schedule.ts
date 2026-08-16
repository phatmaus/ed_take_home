export interface SwissParams {
  roundTimerMinutes: number
  overtimeSlackMinutes: number
  preEventTimeMinutes: number
  breakTimeMinutes: number
}

export type ScheduleInfo =
  | { type: 'SWISS'; swiss: SwissParams }
  | { type: 'CUSTOM'; timeInMinutes: number }

// "The rules of Swiss" — part of the SWISS interpreter, deliberately a code constant,
// not per-format data (see data_model_plan.md). Buckets: max players → rounds.
//
// This compresses to `Math.max(3, Math.ceil(Math.log2(players)))` — every bucket is a
// power of two — but it stays a table on purpose:
// - It is a transcription of the official round-count tables (MTG Tournament Rules
//   Appendix E; Konami Tournament Policy) and can be diffed against them line by line.
//   The formula has to be *derived* to match, including the non-obvious floor of 3
//   (pure ceil(log2) would give 2 rounds for 4 players; no sanctioned table does).
// - Real tables are only *mostly* log2: e.g. Play! Pokémon runs 5 rounds from 13
//   players. If per-game fidelity ever matters, the table moves into SwissSchedule as
//   data and a row edit absorbs any deviation; a formula would need special cases.
// - The table bounds the domain explicitly (>256 is an error, not an extrapolation).
// With the app's 30-player capacity ceiling only the first three rows are reachable.
const SWISS_ROUND_BUCKETS: Array<[maxPlayers: number, rounds: number]> = [
  [8, 3],
  [16, 4],
  [32, 5],
  [64, 6],
  [128, 7],
  [256, 8],
]

export function swissRounds(players: number): number {
  if (!Number.isInteger(players) || players < 1) {
    throw new RangeError(`Swiss requires a positive integer player count, got ${players}`)
  }
  // minPlayers is template data: a game may sanction below the classic TCG floor of 4
  // (e.g. a 2-player board-game night), so sub-4 counts clamp into the smallest bucket.
  const bucket = SWISS_ROUND_BUCKETS.find(([max]) => players <= max)
  if (!bucket) {
    throw new RangeError(`No Swiss round bucket for ${players} players`)
  }
  return bucket[1]
}

export function deriveDurationMinutes(schedule: ScheduleInfo, players: number): number {
  switch (schedule.type) {
    case 'SWISS': {
      const s = schedule.swiss
      return (
        s.preEventTimeMinutes +
        swissRounds(players) * (s.roundTimerMinutes + s.overtimeSlackMinutes) +
        s.breakTimeMinutes
      )
    }
    case 'CUSTOM':
      return schedule.timeInMinutes
  }
}
