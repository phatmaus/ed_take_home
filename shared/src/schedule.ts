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
const SWISS_ROUND_BUCKETS: Array<[maxPlayers: number, rounds: number]> = [
  [8, 3],
  [16, 4],
  [32, 5],
  [64, 6],
  [128, 7],
  [256, 8],
]

export const MIN_SWISS_PLAYERS = 4

export function swissRounds(players: number): number {
  if (!Number.isInteger(players) || players < MIN_SWISS_PLAYERS) {
    throw new RangeError(`Swiss requires an integer player count >= ${MIN_SWISS_PLAYERS}, got ${players}`)
  }
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
