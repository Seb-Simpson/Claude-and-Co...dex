/**
 * Loading progress from real work only.
 *
 * - `bytes` tasks advance with every streamed chunk of a download, against the file sizes in the
 *   build manifests (or the response's Content-Length when it is trustworthy).
 * - `step` tasks are discrete milestones the application reports: renderer + physics boot, each
 *   game module's setup, shader compilation. They are 0 until done, then 1. A step that is in
 *   progress is shown as such (indeterminate) and never as a made-up fraction.
 *
 * The percentage is the weighted sum of completed work. Nothing is ever driven by a timer.
 */
export type TaskState = 'pending' | 'active' | 'done' | 'failed';

export interface LoadingTask {
  readonly id: string;
  readonly label: string;
  readonly kind: 'bytes' | 'step';
  readonly weight: number;
  readonly state: TaskState;
  /** bytes tasks only */
  readonly received: number;
  readonly total: number;
  /** Optional detail, e.g. why a step failed. */
  readonly note?: string;
}

export interface LoadingSnapshot {
  readonly tasks: readonly LoadingTask[];
  /** 0..1 */
  readonly fraction: number;
  readonly complete: boolean;
  /** The step currently running, for the status line. */
  readonly current: LoadingTask | null;
  readonly receivedBytes: number;
  readonly totalBytes: number;
}

interface MutableTask { id: string; label: string; kind: 'bytes' | 'step'; weight: number; state: TaskState; received: number; total: number; note?: string }

export class LoadingTracker {
  private readonly tasks: MutableTask[] = [];
  private readonly listeners = new Set<(s: LoadingSnapshot) => void>();

  addBytes(id: string, label: string, weight: number, total: number): this {
    this.tasks.push({ id, label, kind: 'bytes', weight, state: 'pending', received: 0, total: Math.max(1, total) });
    return this;
  }

  addStep(id: string, label: string, weight: number): this {
    this.tasks.push({ id, label, kind: 'step', weight, state: 'pending', received: 0, total: 1 });
    return this;
  }

  has(id: string): boolean { return this.tasks.some((t) => t.id === id); }

  bytes(id: string, received: number, total?: number, done = false): void {
    const task = this.find(id);
    if (!task || task.kind !== 'bytes' || task.state === 'done' || task.state === 'failed') return;
    if (total && total > 0) task.total = total;
    task.received = Math.min(Math.max(task.received, received), task.total);
    task.state = done ? 'done' : 'active';
    if (done) task.received = task.total;
    this.emit();
  }

  begin(id: string): void { this.set(id, 'active'); }
  finish(id: string): void { this.set(id, 'done'); }
  fail(id: string, note?: string): void { this.set(id, 'failed', note); }

  snapshot(): LoadingSnapshot {
    const weight = this.tasks.reduce((s, t) => s + t.weight, 0) || 1;
    let work = 0;
    for (const t of this.tasks) {
      // A failed task counts as finished work: its owner falls back (procedural content) and
      // loading carries on, so the bar must still be able to reach 100%.
      const fraction = t.state === 'done' || t.state === 'failed' ? 1 : t.kind === 'bytes' ? t.received / t.total : 0;
      work += t.weight * fraction;
    }
    const tasks = this.tasks.map((t) => ({ ...t }));
    const bytes = this.tasks.filter((t) => t.kind === 'bytes');
    return {
      tasks,
      fraction: Math.min(1, work / weight),
      complete: this.tasks.length > 0 && this.tasks.every((t) => t.state === 'done' || t.state === 'failed'),
      current: tasks.find((t) => t.state === 'active' && t.kind === 'step') ?? tasks.find((t) => t.state === 'active') ?? null,
      receivedBytes: bytes.reduce((s, t) => s + t.received, 0),
      totalBytes: bytes.reduce((s, t) => s + t.total, 0),
    };
  }

  subscribe(listener: (s: LoadingSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => { this.listeners.delete(listener); };
  }

  private find(id: string): MutableTask | undefined { return this.tasks.find((t) => t.id === id); }

  private set(id: string, state: TaskState, note?: string): void {
    const task = this.find(id);
    if (!task || task.state === 'done' || task.state === 'failed') return;
    task.state = state;
    if (note) task.note = note;
    this.emit();
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of [...this.listeners]) listener(snapshot);
  }
}
