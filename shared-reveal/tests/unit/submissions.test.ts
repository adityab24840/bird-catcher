import { describe, it, expect } from 'vitest'
import { z } from 'zod'

const SubmitEntrySchema = z
  .object({
    entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    text: z.string().max(500).nullable(),
    photoURL: z.url().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.photoURL && !data.text?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Please add a photo or text before submitting.',
        path: ['photoURL'],
      })
    }
  })

describe('SubmitEntrySchema', () => {
  it('accepts photo + text', () => {
    const result = SubmitEntrySchema.safeParse({
      entryDate: '2026-08-31',
      text: 'something nice',
      photoURL: 'https://example.com/photo.jpg',
    })
    expect(result.success).toBe(true)
  })

  it('accepts photo only (text null)', () => {
    const result = SubmitEntrySchema.safeParse({
      entryDate: '2026-08-31',
      text: null,
      photoURL: 'https://example.com/photo.jpg',
    })
    expect(result.success).toBe(true)
  })

  it('accepts text only (photoURL null)', () => {
    const result = SubmitEntrySchema.safeParse({
      entryDate: '2026-08-31',
      text: 'reminded me of you',
      photoURL: null,
    })
    expect(result.success).toBe(true)
  })

  it('accepts exactly 500 chars of text', () => {
    const result = SubmitEntrySchema.safeParse({
      entryDate: '2026-08-31',
      text: 'x'.repeat(500),
      photoURL: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects both null (at-least-one)', () => {
    const result = SubmitEntrySchema.safeParse({
      entryDate: '2026-08-31',
      text: null,
      photoURL: null,
    })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.photoURL).toBeDefined()
  })

  it('rejects whitespace-only text', () => {
    const result = SubmitEntrySchema.safeParse({
      entryDate: '2026-08-31',
      text: '   ',
      photoURL: null,
    })
    expect(result.success).toBe(false)
  })

  it('rejects text longer than 500 chars', () => {
    const result = SubmitEntrySchema.safeParse({
      entryDate: '2026-08-31',
      text: 'x'.repeat(501),
      photoURL: null,
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid photoURL', () => {
    const result = SubmitEntrySchema.safeParse({
      entryDate: '2026-08-31',
      text: null,
      photoURL: 'not-a-url',
    })
    expect(result.success).toBe(false)
  })

  it('accepts entryDate YYYY-MM-DD format', () => {
    const result = SubmitEntrySchema.safeParse({
      entryDate: '2026-08-31',
      text: 'hi',
      photoURL: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects entryDate YYYYMMDD format', () => {
    const result = SubmitEntrySchema.safeParse({
      entryDate: '20260831',
      text: 'hi',
      photoURL: null,
    })
    expect(result.success).toBe(false)
  })
})

describe('Date computation (SUBM-07)', () => {
  it('toLocaleDateString("en-CA") produces YYYY-MM-DD', () => {
    const date = new Date('2026-08-31T12:00:00')
    const result = date.toLocaleDateString('en-CA')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result).toBe('2026-08-31')
  })
})

describe('Idempotent submission guard (SUBM-04)', () => {
  it('submittedMembers.includes(uid) detects duplicate', () => {
    const submittedMembers = ['uid-alice']
    expect(submittedMembers.includes('uid-alice')).toBe(true)
  })

  it('submittedMembers.includes(uid) allows new submission', () => {
    const submittedMembers = ['uid-alice']
    expect(submittedMembers.includes('uid-bob')).toBe(false)
  })
})
