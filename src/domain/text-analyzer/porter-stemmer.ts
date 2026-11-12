type SuffixRule = readonly [suffix: string, replacement: string];

const VOWELS: ReadonlySet<string> = new Set(['a', 'e', 'i', 'o', 'u']);

const STEP2_RULES: readonly SuffixRule[] = byLongestSuffix([
  ['ational', 'ate'],
  ['tional', 'tion'],
  ['enci', 'ence'],
  ['anci', 'ance'],
  ['izer', 'ize'],
  ['bli', 'ble'],
  ['alli', 'al'],
  ['entli', 'ent'],
  ['eli', 'e'],
  ['ousli', 'ous'],
  ['ization', 'ize'],
  ['ation', 'ate'],
  ['ator', 'ate'],
  ['alism', 'al'],
  ['iveness', 'ive'],
  ['fulness', 'ful'],
  ['ousness', 'ous'],
  ['aliti', 'al'],
  ['iviti', 'ive'],
  ['biliti', 'ble'],
  ['logi', 'log'],
]);

const STEP3_RULES: readonly SuffixRule[] = byLongestSuffix([
  ['icate', 'ic'],
  ['ative', ''],
  ['alize', 'al'],
  ['iciti', 'ic'],
  ['ical', 'ic'],
  ['ful', ''],
  ['ness', ''],
]);

const STEP4_RULES: readonly SuffixRule[] = byLongestSuffix(
  [
    'al',
    'ance',
    'ence',
    'er',
    'ic',
    'able',
    'ible',
    'ant',
    'ement',
    'ment',
    'ent',
    'ion',
    'ou',
    'ism',
    'ate',
    'iti',
    'ous',
    'ive',
    'ize',
  ].map((suffix): SuffixRule => [suffix, '']),
);

export function stem(word: string): string {
  if (word.length <= 2) return word;

  let result = step1a(word);
  result = step1b(result);
  result = step1c(result);
  result = applyFirstMatchingRule(result, STEP2_RULES, 0);
  result = applyFirstMatchingRule(result, STEP3_RULES, 0);
  result = step4(result);
  result = step5a(result);
  result = step5b(result);
  return result;
}

/** sses → ss, ies → i, ss → ss, s → ''. */
function step1a(word: string): string {
  if (word.endsWith('sses')) return word.slice(0, -2);
  if (word.endsWith('ies')) return word.slice(0, -2);
  if (word.endsWith('ss')) return word;
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

/** (m > 0) eed → ee; (*v*) ed → '', (*v*) ing → '' */
function step1b(word: string): string {
  if (word.endsWith('eed')) {
    const base = word.slice(0, -3);
    return measure(base) > 0 ? `${base}ee` : word;
  }

  for (const suffix of ['ed', 'ing']) {
    if (!word.endsWith(suffix)) continue;
    const base = word.slice(0, -suffix.length);
    return hasVowel(base) ? restoreEnding(base) : word;
  }

  return word;
}

/** at → ate, bl → ble, iz → ize, undouble, or add e. */
function restoreEnding(base: string): string {
  if (base.endsWith('at') || base.endsWith('bl') || base.endsWith('iz')) return `${base}e`;

  if (endsWithDoubleConsonant(base) && !/[lsz]$/.test(base)) return base.slice(0, -1);

  if (measure(base) === 1 && endsWithCvc(base)) return `${base}e`;

  return base;
}

/** (*v*) y → i. */
function step1c(word: string): string {
  if (word.endsWith('y') && hasVowel(word.slice(0, -1))) return `${word.slice(0, -1)}i`;
  return word;
}

/** (m > 1) removes a suffix; -ion only after s or t. */
function step4(word: string): string {
  for (const [suffix] of STEP4_RULES) {
    if (!word.endsWith(suffix)) continue;
    const base = word.slice(0, -suffix.length);
    if (suffix === 'ion' && !/[st]$/.test(base)) continue;
    return measure(base) > 1 ? base : word;
  }
  return word;
}

/** (m > 1) e → ''; (m = 1 and not *o) e → ''. */
function step5a(word: string): string {
  if (!word.endsWith('e')) return word;
  const base = word.slice(0, -1);
  const m = measure(base);
  return m > 1 || (m === 1 && !endsWithCvc(base)) ? base : word;
}

/** (m > 1 and *d and *L) ll → l. */
function step5b(word: string): string {
  if (word.endsWith('ll') && measure(word) > 1) return word.slice(0, -1);
  return word;
}

function applyFirstMatchingRule(
  word: string,
  rules: readonly SuffixRule[],
  minMeasure: number,
): string {
  for (const [suffix, replacement] of rules) {
    if (!word.endsWith(suffix)) continue;
    const base = word.slice(0, -suffix.length);
    return measure(base) > minMeasure ? base + replacement : word;
  }
  return word;
}

function byLongestSuffix(rules: readonly SuffixRule[]): readonly SuffixRule[] {
  return [...rules].sort((a, b) => b[0].length - a[0].length);
}

function consonantMask(word: string): boolean[] {
  const mask: boolean[] = [];
  for (let i = 0; i < word.length; i++) {
    const letter = word[i]!;
    if (VOWELS.has(letter)) mask.push(false);
    else if (letter === 'y') mask.push(i === 0 || !mask[i - 1]);
    else mask.push(true);
  }
  return mask;
}

function measure(word: string): number {
  const mask = consonantMask(word);
  let m = 0;
  for (let i = 1; i < mask.length; i++) {
    if (!mask[i - 1] && mask[i]) m++;
  }
  return m;
}

function hasVowel(word: string): boolean {
  return consonantMask(word).includes(false);
}

function endsWithDoubleConsonant(word: string): boolean {
  const n = word.length;
  return n >= 2 && word[n - 1] === word[n - 2] && consonantMask(word)[n - 1] === true;
}

function endsWithCvc(word: string): boolean {
  const n = word.length;
  if (n < 3) return false;
  const mask = consonantMask(word);
  return (
    mask[n - 3] === true && mask[n - 2] === false && mask[n - 1] === true && !/[wxy]$/.test(word)
  );
}
