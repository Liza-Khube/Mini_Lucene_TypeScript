import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { IDocumentInput } from '../../../../src/application/search-engine/public-api.js';

interface IInvalidTopKCase {
  readonly name: string;
  readonly topK: number;
}

interface ITempCorpus {
  readonly dirPath: string;
  cleanup(): Promise<void>;
}

export const README_CORPUS: readonly IDocumentInput[] = [
  {
    source: './docs/doc001.txt',
    rawText: 'soup and people eat warm soup',
  },
  {
    source: './docs/doc002.txt',
    rawText: 'warm soup for lunch',
  },
  {
    source: './docs/doc003.txt',
    rawText: 'many people gather and people share stories people love',
  },
  {
    source: './docs/doc004.txt',
    rawText: 'kind people live peacefully here now',
  },
];

export const RANKING_CORPUS: readonly IDocumentInput[] = Array.from({ length: 15 }, (_, index) => {
  const number = String(index + 1).padStart(2, '0');
  const catWords = Array.from({ length: index + 1 }, () => 'cat');
  const padWords = Array.from({ length: 15 - index }, () => 'pad');
  return {
    source: `doc${number}.txt`,
    rawText: [...catWords, ...padWords].join(' '),
  };
});

export const INVALID_TOP_K_CASES: readonly IInvalidTopKCase[] = [
  { name: 'negative', topK: -1 },
  { name: 'fractional', topK: 1.5 },
  { name: 'NaN', topK: Number.NaN },
  { name: 'positive Infinity', topK: Number.POSITIVE_INFINITY },
  { name: 'negative Infinity', topK: Number.NEGATIVE_INFINITY },
];

export async function createTempCorpus(files: Readonly<Record<string, string>>): Promise<ITempCorpus> {
  const dirPath = await mkdtemp(join(tmpdir(), 'mini-lucene-search-engine-'));

  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(dirPath, relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf8');
  }

  return {
    dirPath,
    cleanup: () => rm(dirPath, { recursive: true, force: true }),
  };
}
