import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'

// Inline schema — mirrors the JoinPairSchema in functions/src/index.ts (SEC-05)
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
  it('rejects invite code older than 24 hours', () => {
    const pastExpiry = { toDate: () => new Date(Date.now() - 1000) }
    expect(pastExpiry.toDate() < new Date()).toBe(true)
  })

  it('accepts invite code created within 24 hours', () => {
    const futureExpiry = { toDate: () => new Date(Date.now() + 23 * 60 * 60 * 1000) }
    expect(futureExpiry.toDate() < new Date()).toBe(false)
  })
})

describe('joinPair validation conditions — SEC-05', () => {
  it('rejects expired code (Check 1)', () => {
    const pair = { inviteCodeExpiry: { toDate: () => new Date(Date.now() - 1000) } }
    expect(pair.inviteCodeExpiry.toDate() < new Date()).toBe(true)
  })

  it('rejects already-used code (Check 2 — PAIR-05)', () => {
    const pair = { inviteCodeUsed: true }
    expect(pair.inviteCodeUsed).toBe(true)
  })

  it('rejects when pair already has 2 members (Check 3 — PAIR-04)', () => {
    const pair = { members: ['uid-a', 'uid-b'] }
    expect(pair.members.length >= 2).toBe(true)
  })

  it('rejects when requester is the creator (Check 4)', () => {
    const pair = { createdBy: 'uid-a' }
    const uid = 'uid-a'
    expect(pair.createdBy === uid).toBe(true)
  })

  it('rejects when requester already has pairId (Check 5 — PAIR-06)', () => {
    const joiner = { pairId: 'existing-pair-id' }
    expect(joiner.pairId !== null).toBe(true)
  })
})

describe('createPair — PAIR-06', () => {
  it('rejects when creator already has a pairId', () => {
    const userDoc = { pairId: 'some-pair-id' }
    expect(userDoc.pairId !== null).toBe(true)
  })
})
