import { describe, expect, it } from 'vitest'
import { deriveDurationMinutes, swissRounds, type ScheduleInfo } from './schedule'

// Spec: data_model_plan.md — Swiss bucket table 4–8→3, 9–16→4, 17–32→5 (30-cap makes higher
// buckets unreachable, but they exist: 33–64→6, 65–128→7, 129–256→8).
describe('swissRounds', () => {
  it.each([
    [4, 3],
    [8, 3],
    [9, 4],
    [16, 4],
    [17, 5],
    [30, 5],
    [32, 5],
    [33, 6],
    [128, 7],
    [256, 8],
  ])('%i players → %i rounds', (players, rounds) => {
    expect(swissRounds(players)).toBe(rounds)
  })

  // Spec change per back_end_review.md BE-2 (Eugene informed): minPlayers is template
  // DATA — a 4th game may sanction below 4 (e.g. a 2-player board-game night), so
  // sub-4 counts clamp into the smallest bucket instead of throwing. The old test
  // asserting a throw encoded the bucket-table floor, contradicting the data model.
  it('clamps player counts below 4 into the smallest bucket (3 rounds)', () => {
    expect(swissRounds(3)).toBe(3)
    expect(swissRounds(2)).toBe(3)
    expect(swissRounds(1)).toBe(3)
  })

  it('rejects zero/negative, non-integer, and out-of-table counts', () => {
    expect(() => swissRounds(0)).toThrow()
    expect(() => swissRounds(-2)).toThrow()
    expect(() => swissRounds(4.5)).toThrow()
    expect(() => swissRounds(257)).toThrow()
  })
})

describe('deriveDurationMinutes', () => {
  const swissParams = {
    roundTimerMinutes: 50,
    overtimeSlackMinutes: 10,
    preEventTimeMinutes: 15,
    breakTimeMinutes: 0,
  }
  const swiss: ScheduleInfo = { type: 'SWISS', swiss: swissParams }

  it('SWISS: preEvent + rounds × (timer + slack) + break', () => {
    // 8 players → 3 rounds: 15 + 3×60 = 195
    expect(deriveDurationMinutes(swiss, 8)).toBe(195)
    // 9 players → 4 rounds: 15 + 4×60 = 255
    expect(deriveDurationMinutes(swiss, 9)).toBe(255)
  })

  it('SWISS: breakTime is a flat add-on', () => {
    const withBreak: ScheduleInfo = {
      type: 'SWISS',
      swiss: { ...swissParams, breakTimeMinutes: 30 },
    }
    expect(deriveDurationMinutes(withBreak, 8)).toBe(225)
  })

  it('CUSTOM: fixed time, independent of player count', () => {
    const custom: ScheduleInfo = { type: 'CUSTOM', timeInMinutes: 180 }
    expect(deriveDurationMinutes(custom, 4)).toBe(180)
    expect(deriveDurationMinutes(custom, 30)).toBe(180)
  })
})
