export class UnknownQueryNodeError extends Error {
  constructor(nodeType: unknown) {
    super(`Unknown query node type: "${String(nodeType)}"`);
    this.name = 'UnknownQueryNodeError';
  }
}
