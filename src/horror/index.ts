/**
 * NIGHT WARD horror presentation API (NW-002B). Everything here is presentation: it accepts
 * transforms and behaviour from gameplay and never moves entities or decides AI outcomes.
 */
export { createEntityVisual } from './entities/visual';
export type { BodiedEntityType, CreateEntityVisualOptions, EntityVisual, EntityVisualInput } from './entities/visual';
export { resolveVisualState, VISUAL_STATES } from './entities/animator';
export type { FootstepEvent, StateResolution, VisualState } from './entities/animator';
export { EntityPresenter, sceneEntityNodes } from './entities/presenter';
export type { EntityNodeRecord, EntityNodeSource, EntityPresenterOptions, PresentedEntity } from './entities/presenter';
export { ReflectionPresenter } from './entities/reflection';
export type { ReflectionState } from './entities/reflection';
export { FootprintTrail } from './entities/footprints';
export { CinematicDirector, CINEMATIC_KINDS } from './scares/cinematics';
export type { CinematicKind, CinematicRequest, CinematicServices } from './scares/cinematics';
export { ScreenOverlay } from './scares/overlay';
export type { OverlayPulse } from './scares/overlay';
export { SilhouetteMirage } from './scares/mirage';
export { EntityAudio } from './audio/entityAudio';
export type { EntityAudioFrame } from './audio/entityAudio';
