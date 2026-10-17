import { describe, expect, it } from 'vitest';

import { isAcceptablePassword, passwordStrength } from './password';

const level = (pw: string) => passwordStrength(pw).level;

describe('passwordStrength', () => {
  it('is empty with no input', () => {
    expect(level('')).toBe('empty');
    expect(isAcceptablePassword('')).toBe(false);
  });

  it('rejects short passwords', () => {
    expect(level('Ab1!')).toBe('weak');
    expect(passwordStrength('abc').hint).toContain('3/8');
  });

  it('rejects common and repeated passwords', () => {
    for (const pw of ['password', 'Password', '12345678', 'qwerty123', 'aaaaaaaaaa']) {
      expect(level(pw)).toBe('weak');
    }
  });

  it('rejects a single character class', () => {
    expect(level('tashkentcity')).toBe('weak');
    expect(level('90817263')).toBe('weak');
  });

  it('accepts mixed passwords as medium', () => {
    expect(level('tosh2026')).toBe('medium');
    expect(level('Samarkand')).toBe('medium');
    expect(isAcceptablePassword('tosh2026')).toBe(true);
  });

  it('rates long, varied passwords as strong', () => {
    expect(level('MyFemate#2026x')).toBe('strong');
    expect(level('Tosh!2026a')).toBe('strong');
    expect(level('tashkent2026city')).toBe('medium');
    expect(level('Tashkent2026city')).toBe('strong');
  });
});
