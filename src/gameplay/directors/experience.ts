/** One attempt owns this coordinator. Leases are never serialized or shared across retries. */
export type ExperienceResource = 'camera' | 'nurse' | 'dialogue' | 'environment';
export interface ExperienceLease {
  readonly owner: string;
  readonly signal: AbortSignal;
  release(): void;
}
export interface ExperienceCoordinator {
  acquire(owner: string, resources: readonly ExperienceResource[]): ExperienceLease | null;
  cancel(owner?: string): void;
  snapshot(): readonly {owner: string; resources: readonly ExperienceResource[]}[];
  dispose(): void;
}
export function createExperienceCoordinator(): ExperienceCoordinator {
  const leases = new Map<ExperienceLease, {controller: AbortController; resources: ExperienceResource[]}>();
  let disposed = false,cancelling=false;
  return {
    acquire(owner, resources) {
      if (disposed || cancelling || !owner.trim() || !resources.length || new Set(resources).size !== resources.length) return null;
      if ([...leases.values()].some(l => l.resources.some(r => resources.includes(r)))) return null;
      const controller = new AbortController();
      const lease: ExperienceLease = {owner, signal: controller.signal, release() {
        if (!leases.delete(lease)) return;
        controller.abort();
      }};
      leases.set(lease, {controller, resources:[...resources]});
      return lease;
    },
    cancel(owner) {cancelling=true;try{for(const lease of [...leases.keys()])if(!owner||lease.owner===owner)lease.release();}finally{cancelling=false;}},
    snapshot: () => [...leases].map(([lease,value])=>({owner:lease.owner,resources:[...value.resources]})),
    dispose() { if (disposed) return; disposed = true; for (const lease of [...leases.keys()]) lease.release(); },
  };
}
