/** Small reusable synchronous FSM: transitions reset state age and emit once. */
export interface StateMachine<State extends string> {
  readonly state: State;
  readonly ageSeconds: number;
  advance(deltaSeconds: number): void;
  transition(next: State): boolean;
}

export function createStateMachine<State extends string>(
  initial: State,
  onTransition?: (previous: State, current: State) => void,
): StateMachine<State> {
  let state = initial;
  let ageSeconds = 0;
  return {
    get state() { return state; },
    get ageSeconds() { return ageSeconds; },
    advance(deltaSeconds) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error('Invalid state delta');
      ageSeconds += deltaSeconds;
    },
    transition(next) {
      if (state === next) return false;
      const previous = state;
      state = next;
      ageSeconds = 0;
      onTransition?.(previous, next);
      return true;
    },
  };
}
