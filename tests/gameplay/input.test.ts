import { describe, expect, it, vi } from 'vitest';
import { createBrowserInput } from '../../src/gameplay/input';

function inputFixture() {
  const document = Object.assign(new EventTarget(), {
    pointerLockElement: null as EventTarget | null,
    hidden: false,
    defaultView: new EventTarget(),
    exitPointerLock: vi.fn(),
  });
  const element = Object.assign(new EventTarget(), {
    ownerDocument: document,
    requestPointerLock: vi.fn((): Promise<void> => {
      document.pointerLockElement = element;
      document.dispatchEvent(new Event('pointerlockchange'));
      return Promise.resolve();
    }),
  });
  document.exitPointerLock.mockImplementation(() => {
    document.pointerLockElement = null;
    document.dispatchEvent(new Event('pointerlockchange'));
  });
  const onLook = vi.fn();
  const onInteract = vi.fn();
  const input = createBrowserInput({ element: element as unknown as HTMLElement, onLook, onInteract });
  const key = (type: string, code: string, repeat = false) => {
    const event = Object.assign(new Event(type, { cancelable: true }), { code, repeat });
    document.dispatchEvent(event);
    return event;
  };
  return { document, element, input, key, onLook, onInteract };
}

describe('pointer-locked first-person input', () => {
  it('ignores controls until this canvas acquires pointer lock', () => {
    const f = inputFixture();
    f.key('keydown', 'KeyW');
    expect(f.input.read().forward).toBe(0);
    expect(f.input.locked).toBe(false);
    f.element.dispatchEvent(new Event('click'));
    expect(f.element.requestPointerLock).toHaveBeenCalledOnce();
    expect(f.input.locked).toBe(true);
    expect(f.key('keydown', 'KeyW').defaultPrevented).toBe(true);
    f.key('keydown', 'KeyD');
    f.key('keydown', 'ShiftLeft');
    expect(f.input.read()).toEqual({ forward: 1, right: 1, sprint: true, crouch: false });
    f.input.dispose();
  });

  it('uses Ctrl held or C toggle and fires E only once per press', () => {
    const f = inputFixture();
    f.element.dispatchEvent(new Event('click'));
    f.key('keydown', 'ControlLeft');
    expect(f.input.read().crouch).toBe(true);
    f.key('keyup', 'ControlLeft');
    expect(f.input.read().crouch).toBe(false);
    f.key('keydown', 'KeyC');
    f.key('keyup', 'KeyC');
    expect(f.input.read().crouch).toBe(true);
    f.key('keydown', 'KeyC');
    f.key('keydown', 'KeyC', true);
    f.key('keyup', 'KeyC');
    expect(f.input.read().crouch).toBe(false);
    f.key('keydown', 'KeyE');
    f.key('keydown', 'KeyE', true);
    f.key('keydown', 'KeyE');
    expect(f.onInteract).toHaveBeenCalledOnce();
    f.key('keyup', 'KeyE');
    f.key('keydown', 'KeyE');
    expect(f.onInteract).toHaveBeenCalledTimes(2);
    f.input.dispose();
  });

  it('clears held/toggled input on blur, visibility change and unlock', () => {
    const f = inputFixture();
    f.element.dispatchEvent(new Event('click'));
    f.key('keydown', 'KeyW');
    f.key('keydown', 'KeyC');
    f.document.defaultView.dispatchEvent(new Event('blur'));
    expect(f.input.read()).toEqual({ forward: 0, right: 0, sprint: false, crouch: false });
    f.key('keydown', 'KeyD');
    f.document.hidden = true;
    f.document.dispatchEvent(new Event('visibilitychange'));
    expect(f.input.read().right).toBe(0);
    f.key('keydown', 'KeyW');
    f.document.exitPointerLock();
    expect(f.input.locked).toBe(false);
    f.element.dispatchEvent(new Event('click'));
    expect(f.input.read().forward).toBe(0);
    f.input.dispose();
  });

  it('explicitly releases pointer lock and clears controls on Escape', () => {
    const f = inputFixture();
    f.element.dispatchEvent(new Event('click'));
    f.key('keydown', 'KeyW');
    f.key('keydown', 'KeyC');
    f.key('keydown', 'Escape');
    expect(f.document.exitPointerLock).toHaveBeenCalledOnce();
    expect(f.input.locked).toBe(false);
    f.element.dispatchEvent(new Event('click'));
    expect(f.input.read()).toEqual({ forward: 0, right: 0, sprint: false, crouch: false });
    f.input.dispose();
  });

  it('forwards mouse motion only while locked and removes listeners on disposal', () => {
    const f = inputFixture();
    const mouse = () => Object.assign(new Event('mousemove'), { movementX: 8, movementY: -4 });
    f.document.dispatchEvent(mouse());
    expect(f.onLook).not.toHaveBeenCalled();
    f.element.dispatchEvent(new Event('click'));
    f.document.dispatchEvent(mouse());
    expect(f.onLook).toHaveBeenCalledWith(8, -4);
    f.input.dispose();
    f.input.dispose();
    expect(f.document.exitPointerLock).toHaveBeenCalledOnce();
    f.element.dispatchEvent(new Event('click'));
    f.document.dispatchEvent(mouse());
    expect(f.element.requestPointerLock).toHaveBeenCalledOnce();
    expect(f.onLook).toHaveBeenCalledOnce();
  });

  it('handles pointer-lock rejection and releases a lock granted after disposal', async () => {
    const f = inputFixture();
    f.element.requestPointerLock.mockRejectedValueOnce(new Error('permission denied'));
    f.element.dispatchEvent(new Event('click'));
    await Promise.resolve();
    await Promise.resolve();
    expect(f.input.locked).toBe(false);
    let grant: (() => void) | undefined;
    f.element.requestPointerLock.mockImplementationOnce(() => new Promise<void>((resolve) => {
      grant = () => { f.document.pointerLockElement = f.element; resolve(); };
    }));
    f.element.dispatchEvent(new Event('click'));
    f.input.dispose();
    grant?.();
    await Promise.resolve();
    expect(f.document.pointerLockElement).toBeNull();
  });
});
