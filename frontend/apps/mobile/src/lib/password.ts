// Password strength for sign-up. Registration needs at least "medium".
export type PasswordLevel = 'empty' | 'weak' | 'medium' | 'strong';

const COMMON = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  'qwerty',
  'qwerty123',
  'qwertyuiop',
  'abc12345',
  'abcd1234',
  'iloveyou',
  'admin123',
  'welcome1',
  'letmein1',
  '11111111',
  '12345678',
  '123456789',
  '1234567890',
  '87654321',
  '00000000',
  '1q2w3e4r',
  '1qaz2wsx',
  'femate123',
]);

const MIN_LENGTH = 8;

function charClasses(pw: string) {
  return [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((re) => re.test(pw)).length;
}

export function passwordStrength(pw: string): { level: PasswordLevel; hint: string } {
  if (pw.length === 0) return { level: 'empty', hint: '' };
  if (pw.length < MIN_LENGTH) return { level: 'weak', hint: `Use at least ${MIN_LENGTH} characters (${pw.length}/${MIN_LENGTH}).` };
  if (COMMON.has(pw.toLowerCase()) || /^(.)\1+$/.test(pw)) return { level: 'weak', hint: 'This password is too easy to guess.' };

  const classes = charClasses(pw);
  if (classes < 2) return { level: 'weak', hint: 'Mix letters with numbers or symbols.' };
  if ((pw.length >= 12 && classes >= 3) || (pw.length >= 10 && classes === 4)) return { level: 'strong', hint: 'Strong password.' };

  const missing = [pw.length < 12 ? 'make it 12+ characters' : null, classes < 3 ? 'add a capital letter or symbol' : null].filter(Boolean);
  return { level: 'medium', hint: `Good. For a strong one, ${missing.join(' and ')}.` };
}

export const isAcceptablePassword = (pw: string) => {
  const { level } = passwordStrength(pw);
  return level === 'medium' || level === 'strong';
};
