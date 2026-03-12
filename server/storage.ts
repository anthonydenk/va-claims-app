// Storage is handled in-memory within routes.ts for this app
// since sessions are transient and don't need persistence

export interface IStorage {}

export class MemStorage implements IStorage {
  constructor() {}
}

export const storage = new MemStorage();
