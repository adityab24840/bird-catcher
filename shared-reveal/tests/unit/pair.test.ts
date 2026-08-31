import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'

// Inline schema — will be replaced by import from functions once Wave 1 ships (SEC-05)
const JoinPairSchema = z.object({
  inviteCode: z.string().length(6).regex(/^[A-F0-9]{6}$/),
})

describe('invite code generation', () => {
  it('generates a 6-char uppercase hex string (PAIR-01)', () => {
    const code = randomBytes(3).toString('hex').toUpperCase()
    expect(code).toMatch(/^[A-F0-9]{6}$/)
  })
})

describe('JoinPairSchema', () => {
  it('accepts valid 6-char uppercase hex code', () => {
    const result = JoinPairSchema.safeParse({ inviteCode: 'A1B2C3' })
    expect(result.success).toBe(true)
  })

  it('rejects lowercase code', () => {
    const result = JoinPairSchema.safeParse({ inviteCode: 'abc123' })
    expect(result.success).toBe(false)
  })

  it('rejects code that is too long', () => {
    const result = JoinPairSchema.safeParse({ inviteCode: 'TOOLONG7' })
    expect(result.success).toBe(false)
  })
})

describe('invite code expiry (PAIR-02)', () => {
  it.todo('rejects invite code older than 24 hours')
  it.todo('accepts invite code created within 24 hours')
})

describe('joinPair validation conditions — SEC-05', () => {
  it.todo('rejects expired code')
  it.todo('rejects already-used code (PAIR-05)')
  it.todo('rejects when pair already has 2 members (PAIR-04)')
  it.todo('rejects when requester is the creator')
  it.todo('rejects when requester already has pairId (PAIR-06)')
})

describe('createPair — PAIR-06', () => {
  it.todo('rejects when creator already has a pairId')
})
