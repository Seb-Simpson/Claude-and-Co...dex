import type { PlayerInput } from './player';

export interface BrowserInput {
  readonly locked: boolean;
  read(): PlayerInput;
  dispose(): void;
}
export interface BrowserInputOptions {
  element: HTMLElement;
  onLook(deltaX: number, deltaY: number): void;
  onInteract(): void;
}

/** All input is scoped to this element's pointer lock. Importing allocates no listeners. */
export function createBrowserInput(options: BrowserInputOptions): BrowserInput {
  const { element } = options;
  const document = element.ownerDocument;
  const window = document.defaultView;
  if (!window) throw new Error('Browser input requires a document window');
  const pressed = new Set<string>();
  let crouchToggled = false;
  let disposed = false;
  const keys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyC', 'KeyE']);
  function locked(): boolean { return !disposed && !document.hidden && document.pointerLockElement === element; }
  function clear(): void { pressed.clear(); crouchToggled = false; }
  function onPointerLockChange(): void { if (!locked()) clear(); }
  function onVisibilityChange(): void { if (document.hidden) clear(); }
  function onMouseMove(event: MouseEvent): void {
    if (locked()) options.onLook(event.movementX, event.movementY);
  }
  function onKeyDown(event: KeyboardEvent): void {
    if (locked() && event.code === 'Escape') {
      clear();
      document.exitPointerLock();
      return;
    }
    if (!locked() || !keys.has(event.code)) return;
    event.preventDefault();
    if (event.repeat || pressed.has(event.code)) return;
    pressed.add(event.code);
    if (event.code === 'KeyC') crouchToggled = !crouchToggled;
    if (event.code === 'KeyE') options.onInteract();
  }
  function onKeyUp(event: KeyboardEvent): void {
    if (locked() && keys.has(event.code)) event.preventDefault();
    pressed.delete(event.code);
  }
  function onClick(): void {
    if (disposed || locked()) return;
    try {
      Promise.resolve(element.requestPointerLock()).then(() => {
        if (disposed && document.pointerLockElement === element) document.exitPointerLock();
      }).catch(clear);
    } catch { clear(); }
  }
  element.addEventListener('click', onClick);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('pointerlockerror', clear);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('blur', clear);
  return {
    get locked() { return locked(); },
    read() {
      if (!locked()) return { forward: 0, right: 0, sprint: false, crouch: false };
      return {
        forward: Number(pressed.has('KeyW')) - Number(pressed.has('KeyS')),
        right: Number(pressed.has('KeyD')) - Number(pressed.has('KeyA')),
        sprint: pressed.has('ShiftLeft') || pressed.has('ShiftRight'),
        crouch: crouchToggled || pressed.has('ControlLeft') || pressed.has('ControlRight'),
      };
    },
    dispose() {
      if (disposed) return;
      const wasLocked = locked();
      disposed = true;
      clear();
      element.removeEventListener('click', onClick);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('pointerlockerror', clear);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', clear);
      if (wasLocked) document.exitPointerLock();
    },
  };
}
