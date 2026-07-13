import { describe, it, expect } from 'vitest'
import { resolveModel, jsonModeConfig } from './llm'

describe('resolveModel', () => {
  it('passes through explicit gemini model ids', () => {
    expect(resolveModel('gemini-2.5-flash')).toBe('gemini-2.5-flash')
    expect(resolveModel('gemini-2.5-pro')).toBe('gemini-2.5-pro')
  })
  it('falls back to the default flash tier for anything unrecognised', () => {
    expect(resolveModel('some-unknown-model')).toBe('gemini-2.5-flash')
  })
})

describe('jsonModeConfig', () => {
  // Regression guard: gemini-2.5-pro returns 400 "Budget 0 is invalid — this
  // model only works in thinking mode" if given thinkingBudget:0. So we must
  // only disable thinking for flash-tier models. This bug 422'd every pro-based
  // JSON extraction (apply/parse-cv, candidates/parse-cv, matcher).
  it('forces JSON output for every model', () => {
    expect(jsonModeConfig('gemini-2.5-pro').responseMimeType).toBe('application/json')
    expect(jsonModeConfig('gemini-2.5-flash').responseMimeType).toBe('application/json')
  })

  it('disables thinking ONLY for flash (which supports it)', () => {
    expect(jsonModeConfig('gemini-2.5-flash').thinkingConfig).toEqual({ thinkingBudget: 0 })
  })

  it('leaves thinking ON for pro (which rejects thinkingBudget:0)', () => {
    expect(jsonModeConfig('gemini-2.5-pro').thinkingConfig).toBeUndefined()
  })
})
