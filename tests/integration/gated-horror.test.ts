import { expect, it, vi } from 'vitest';
import { gateHorrorModule } from '../../src/integration/gatedHorror';
import type { GameModule, ModuleContext } from '../../src/contracts';
it('preserves the original module and activates only after authored permission, with exact cleanup', async () => {
  let enabled = false; const dispose = vi.fn(), update = vi.fn(), setup = vi.fn(() => ({ update, dispose }));
  const original: GameModule = { id: 'horror', kind: 'horror', setup };
  const gated = await gateHorrorModule(original, () => enabled).setup({} as ModuleContext);
  const frame = { deltaSeconds: 1/60, elapsedSeconds: 1 };
  gated.update?.(frame); expect(setup).not.toHaveBeenCalled();
  enabled = true; gated.update?.(frame); await Promise.resolve(); await Promise.resolve();
  gated.update?.(frame); expect(setup).toHaveBeenCalledOnce(); expect(update).toHaveBeenCalledOnce();
  await gated.dispose(); expect(dispose).toHaveBeenCalledOnce();
});
it('prepares listeners during safe station onboarding before allowing any threat update', async () => {
  let enabled = false, prepare = false; const ready = vi.fn(), update = vi.fn();
  const setup = vi.fn(() => ({ update, dispose() {} }));
  const gated = await gateHorrorModule({ id:'horror', kind:'horror', setup }, () => enabled, () => prepare, ready).setup({} as ModuleContext);
  const frame = {deltaSeconds:1/60,elapsedSeconds:0};
  gated.update?.(frame); expect(setup).not.toHaveBeenCalled();
  prepare = true; gated.update?.(frame); await Promise.resolve(); await Promise.resolve();
  expect(ready).toHaveBeenCalledOnce(); expect(update).not.toHaveBeenCalled();
  enabled = true; gated.update?.(frame); expect(update).toHaveBeenCalledOnce(); await gated.dispose();
});
