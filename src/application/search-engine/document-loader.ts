import type { Dirent, Stats } from 'node:fs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { IndexDirectoryError } from './errors.js';
import type { IDocumentInput, ISkippedFile } from './types.js';

const SUPPORTED_EXTENSION = '.txt';
const UNSUPPORTED_FILE_FORMAT_REASON =
  'Unsupported file format (only .txt files are supported)';

export interface ILoadedDirectory {
  readonly documents: readonly IDocumentInput[];
  readonly skippedFiles: readonly ISkippedFile[];
}

interface IDiscoveredFile {
  readonly fsPath: string;
  readonly source: string;
  readonly sortKey: string;
}

interface ISkippedEntry {
  readonly path: string;
  readonly reason: string;
  readonly sortKey: string;
}

interface IDirectoryFrame {
  readonly fsPath: string;
  readonly relativeSegments: readonly string[];
}

interface ITraversalContext {
  readonly rootDir: string;
  readonly visitedRealDirs: Set<string>;
  readonly stack: IDirectoryFrame[];
  readonly discoveredFiles: IDiscoveredFile[];
  readonly skipped: ISkippedEntry[];
}

export function compareCodePoints(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function isSupportedTextFile(fileName: string): boolean {
  return extname(fileName).toLowerCase() === SUPPORTED_EXTENSION;
}

function trimTrailingSeparators(rootPath: string): string {
  let end = rootPath.length;
  while (end > 1) {
    const lastChar = rootPath[end - 1];
    if (lastChar !== '/' && lastChar !== '\\') {
      break;
    }
    if (end === 3 && rootPath[1] === ':') {
      break;
    }
    end -= 1;
  }
  return rootPath.slice(0, end);
}

function formatDocumentSource(
  rootPath: string,
  relativeSegments: readonly string[],
): string {
  const separator = rootPath.includes('\\') && !rootPath.includes('/') ? '\\' : '/';
  const base = trimTrailingSeparators(rootPath);
  if (relativeSegments.length === 0) {
    return base;
  }

  const relativePath = relativeSegments.join(separator);
  if (base === '') {
    return relativePath;
  }
  if (base.endsWith('/') || base.endsWith('\\')) {
    return `${base}${relativePath}`;
  }
  return `${base}${separator}${relativePath}`;
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { readonly code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function toDirectoryError(
  rootDir: string,
  targetPath: string,
  error: unknown,
): IndexDirectoryError {
  const code = getErrorCode(error);
  if (code === 'ENOENT') {
    const label = targetPath === rootDir ? 'Directory' : 'File';
    return new IndexDirectoryError(rootDir, `${label} "${targetPath}" does not exist`, {
      cause: error,
    });
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return new IndexDirectoryError(rootDir, `Permission denied reading "${targetPath}"`, {
      cause: error,
    });
  }

  const detail = error instanceof Error ? error.message : String(error);
  return new IndexDirectoryError(rootDir, `Failed to read "${targetPath}": ${detail}`, {
    cause: error,
  });
}

async function safeStat(rootDir: string, targetPath: string): Promise<Stats> {
  try {
    return await stat(targetPath);
  } catch (error: unknown) {
    throw toDirectoryError(rootDir, targetPath, error);
  }
}

async function safeRealpath(rootDir: string, targetPath: string): Promise<string> {
  try {
    return await realpath(targetPath);
  } catch (error: unknown) {
    throw toDirectoryError(rootDir, targetPath, error);
  }
}

async function safeReadDir(rootDir: string, dirPath: string): Promise<Dirent[]> {
  try {
    return await readdir(dirPath, { withFileTypes: true });
  } catch (error: unknown) {
    throw toDirectoryError(rootDir, dirPath, error);
  }
}

async function safeReadUtf8(rootDir: string, filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    throw toDirectoryError(rootDir, filePath, error);
  }
}

function classifyRegularFile(
  fileName: string,
  fsPath: string,
  source: string,
  sortKey: string,
  context: ITraversalContext,
): void {
  if (isSupportedTextFile(fileName)) {
    context.discoveredFiles.push({ fsPath, source, sortKey });
    return;
  }

  context.skipped.push({
    path: source,
    reason: UNSUPPORTED_FILE_FORMAT_REASON,
    sortKey,
  });
}

async function enqueueDirectory(
  fsPath: string,
  relativeSegments: readonly string[],
  context: ITraversalContext,
): Promise<void> {
  const realDirPath = await safeRealpath(context.rootDir, fsPath);
  if (context.visitedRealDirs.has(realDirPath)) {
    return;
  }

  context.visitedRealDirs.add(realDirPath);
  context.stack.push({ fsPath, relativeSegments });
}

async function processSymbolicLink(
  entry: Dirent,
  entryFsPath: string,
  entrySegments: readonly string[],
  source: string,
  sortKey: string,
  context: ITraversalContext,
): Promise<void> {
  let targetStats: Stats;
  try {
    targetStats = await stat(entryFsPath);
  } catch (error: unknown) {
    if (getErrorCode(error) === 'ENOENT') {
      context.skipped.push({
        path: source,
        reason: 'Broken symbolic link',
        sortKey,
      });
      return;
    }
    throw toDirectoryError(context.rootDir, entryFsPath, error);
  }

  if (targetStats.isDirectory()) {
    await enqueueDirectory(entryFsPath, entrySegments, context);
    return;
  }

  if (targetStats.isFile()) {
    classifyRegularFile(entry.name, entryFsPath, source, sortKey, context);
    return;
  }

  context.skipped.push({
    path: source,
    reason: 'Unsupported entry type',
    sortKey,
  });
}

async function processEntry(
  entry: Dirent,
  parentSegments: readonly string[],
  parentFsPath: string,
  context: ITraversalContext,
): Promise<void> {
  const entryFsPath = join(parentFsPath, entry.name);
  const entrySegments = [...parentSegments, entry.name];
  const source = formatDocumentSource(context.rootDir, entrySegments);
  const sortKey = entrySegments.join('/');

  if (entry.isDirectory()) {
    await enqueueDirectory(entryFsPath, entrySegments, context);
    return;
  }

  if (entry.isFile()) {
    classifyRegularFile(entry.name, entryFsPath, source, sortKey, context);
    return;
  }

  if (entry.isSymbolicLink()) {
    await processSymbolicLink(entry, entryFsPath, entrySegments, source, sortKey, context);
    return;
  }

  context.skipped.push({
    path: source,
    reason: 'Unsupported entry type',
    sortKey,
  });
}

export async function loadDocumentsFromDirectory(directoryPath: string): Promise<ILoadedDirectory> {
  if (directoryPath.trim() === '') {
    throw new IndexDirectoryError(directoryPath, 'Directory path must not be empty');
  }

  const rootStats = await safeStat(directoryPath, directoryPath);
  if (!rootStats.isDirectory()) {
    throw new IndexDirectoryError(directoryPath, `Path "${directoryPath}" is not a directory`);
  }

  const rootRealPath = await safeRealpath(directoryPath, directoryPath);
  const context: ITraversalContext = {
    rootDir: directoryPath,
    visitedRealDirs: new Set<string>([rootRealPath]),
    stack: [{ fsPath: directoryPath, relativeSegments: [] }],
    discoveredFiles: [],
    skipped: [],
  };

  while (context.stack.length > 0) {
    const current = context.stack.pop()!;
    const entries = await safeReadDir(directoryPath, current.fsPath);
    entries.sort((a, b) => compareCodePoints(a.name, b.name));

    for (const entry of entries) {
      await processEntry(entry, current.relativeSegments, current.fsPath, context);
    }
  }

  context.discoveredFiles.sort((a, b) => compareCodePoints(a.sortKey, b.sortKey));
  context.skipped.sort((a, b) => compareCodePoints(a.sortKey, b.sortKey));

  const documents: IDocumentInput[] = [];
  for (const file of context.discoveredFiles) {
    const rawText = await safeReadUtf8(directoryPath, file.fsPath);
    documents.push({ source: file.source, rawText });
  }

  const skippedFiles: ISkippedFile[] = context.skipped.map(({ path, reason }) => ({
    path,
    reason,
  }));

  return { documents, skippedFiles };
}
