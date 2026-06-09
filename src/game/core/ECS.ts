// ──────────────────────────────────────────────
//  Minimal ECS – entities, components, systems
// ──────────────────────────────────────────────

export type EntityId = number;

let _nextId = 1;
export const createEntityId = (): EntityId => _nextId++;
export const resetEntityIds = (start = 1): void => { _nextId = start; };

// ── Component store ──────────────────────────────────────────────────────────

type ComponentMap<T> = Map<EntityId, T>;

export class ComponentStore<T> {
  private store: ComponentMap<T> = new Map();

  set(id: EntityId, component: T): void { this.store.set(id, component); }
  get(id: EntityId): T | undefined { return this.store.get(id); }
  has(id: EntityId): boolean { return this.store.has(id); }
  delete(id: EntityId): void { this.store.delete(id); }
  entries(): IterableIterator<[EntityId, T]> { return this.store.entries(); }
  forEach(fn: (comp: T, id: EntityId) => void): void { this.store.forEach(fn); }
  clear(): void { this.store.clear(); }
  get size(): number { return this.store.size; }
  toArray(): Array<[EntityId, T]> { return [...this.store.entries()]; }
}

// ── World ────────────────────────────────────────────────────────────────────

export class World {
  entities: Set<EntityId> = new Set();

  createEntity(): EntityId {
    const id = createEntityId();
    this.entities.add(id);
    return id;
  }

  destroyEntity(id: EntityId, stores: ComponentStore<unknown>[]): void {
    this.entities.delete(id);
    stores.forEach((s) => s.delete(id));
  }

  clear(): void {
    this.entities.clear();
  }
}
