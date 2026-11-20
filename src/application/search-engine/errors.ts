export class IndexNotInitializedError extends Error {
  constructor() {
    super('Index is not initialized. Index a directory or document collection first.');
    this.name = 'IndexNotInitializedError';
  }
}

export class IndexDirectoryError extends Error {
  readonly directoryPath: string;

  constructor(directoryPath: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'IndexDirectoryError';
    this.directoryPath = directoryPath;
  }
}
