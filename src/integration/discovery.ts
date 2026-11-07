import type { GameModule } from '../contracts';

/** Add a default-exported GameModule to an owned *.module.ts file; main.ts stays unchanged. */
export function discoverModules(): GameModule[] {
  const modules = import.meta.glob<{ default: GameModule }>([
    '../world/**/*.module.ts',
    '../atmosphere/**/*.module.ts',
    '../horror/**/*.module.ts',
    '../gameplay/**/*.module.ts',
    '../entities/**/*.module.ts',
    '../physics/**/*.module.ts',
  ], { eager: true });
  return Object.keys(modules).sort().map((path) => {
    const module = modules[path]?.default;
    if (!module) throw new Error(`Module file "${path}" must default-export a GameModule.`);
    return module;
  });
}
