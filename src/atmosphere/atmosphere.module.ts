import { Color, FogExp2, Vector3, type Fog } from 'three';
import type { GameModule } from '../contracts';
import type { EntityBehaviourState } from '../contracts';
import { getHospitalExtras, roomAt } from '../world/extras';
import { Ambience } from './ambience';
import { LightRig } from './lightRig';
import { TensionScore, tensionFrom } from './score';
import { zoneMood } from './zones';

const FOG_COLOR = 0x06080b;

/**
 * Hospital atmosphere: pooled fluorescent lighting with flicker and disturbances, fog, and the
 * procedural soundscape. Listens to `atmosphere:lighting` / `atmosphere:sound` and chase events.
 * Presentation only; it never changes gameplay state or tells entities anything.
 */
export default {
  id: 'nw:atmosphere:hospital',
  kind: 'atmosphere',
  setup(context) {
    const extras = getHospitalExtras(context.world);
    if (!extras || !context.world) return { dispose() { /* no hospital, nothing to drive */ } };
    const { scene, camera, audio } = context.engine;
    const world = context.world;

    const previousFog = scene.fog as Fog | FogExp2 | null;
    const previousBackground = scene.background;
    scene.fog = new FogExp2(FOG_COLOR, 0.052);
    scene.background = new Color(0x020304);

    // Until a gameplay module owns the camera, frame the player spawn so the ward is visible.
    if (!context.player) {
      const s = world.playerSpawn;
      camera.position.set(s.position.x, s.position.y + 1.62, s.position.z);
      camera.rotation.set(0, s.yaw, 0, 'YXZ');
      camera.updateMatrixWorld();
    }

    let rig: LightRig | null = null;
    let ambience: Ambience | null = null;
    let score: TensionScore | null = null;
    try {
      rig = new LightRig(scene, extras);
      ambience = new Ambience(() => audio.context, extras.soundEmitters);
      score = new TensionScore(() => audio.context);
    } catch (error) {
      ambience?.dispose();
      rig?.dispose();
      scene.fog = previousFog;
      scene.background = previousBackground;
      throw error;
    }
    const lights = rig;
    const sound = ambience;
    const music = score;
    const fog = scene.fog as FogExp2;
    const behaviours = new Map<string, EntityBehaviourState>();
    let activeChases = 0;
    const retune = (): void => music.setLevel(tensionFrom(behaviours.values(), activeChases));
    context.events.on('entity:state', (event) => { behaviours.set(event.entityId, event.current); retune(); });

    const offRig = lights.on((event) => {
      if (event.type === 'pop') sound.play('nw:light-pop', { position: event.position, volume: 0.7 });
      if (event.type === 'brownout') sound.play('nw:brownout', { duration: 3 });
    });

    context.events.on('atmosphere:lighting', (event) => { lights.apply(event); });
    context.events.on('atmosphere:sound', (event) => {
      const key = `${event.cueId}@${event.position ? `${event.position.x},${event.position.z}` : 'global'}`;
      if (event.action === 'stop') { sound.stopLoop(key); return; }
      // Mix control cues from the horror presentation.
      if (event.cueId === 'nw:mix:duck') { sound.duck(event.volume, 3.5); return; }
      if (event.cueId === 'nw:mix:silence') { sound.silence(6); music.cut(6); return; }
      const options = { position: event.position, volume: event.volume };
      if (event.loop) sound.loop(key, event.cueId, options);
      else sound.play(event.cueId, options);
    });
    context.events.on('chase:started', (event) => {
      activeChases++;
      retune();
      lights.setChaseIntensity(1);
      lights.flickerNear(new Vector3(event.position.x, event.position.y, event.position.z), 9, 1.6);
    });
    context.events.on('chase:ended', (event) => {
      activeChases = Math.max(0, activeChases - 1);
      behaviours.set(event.entityId, 'lost-target');
      if (activeChases === 0) {
        lights.setChaseIntensity(0);
        // The chase music stops dead, whatever the outcome.
        music.cut(6);
        sound.hush(12);
      }
      retune();
    });
    context.events.on('horror:scare', (event) => {
      if (event.position) lights.flickerNear(new Vector3(event.position.x, event.position.y, event.position.z), 6 * Math.max(0.3, event.intensity), 0.6 + event.intensity);
      sound.hush(8);
    });

    const position = new Vector3();
    const forward = new Vector3();
    const up = new Vector3();
    let density = fog.density;
    return {
      update(frame) {
        camera.getWorldPosition(position);
        lights.update(frame.deltaSeconds, frame.elapsedSeconds, position);
        // Darkness transitions: each kind of space has its own depth of shadow, eased as you move.
        const mood = zoneMood(roomAt(extras, position)?.tags ?? []);
        const ease = Math.min(1, frame.deltaSeconds * 0.8);
        density += (mood.fog * (1 + lights.darkness * 0.35) - density) * ease;
        fog.density = density;
        lights.ambient.intensity += (mood.ambient * (1 - lights.darkness * 0.35) - lights.ambient.intensity) * ease;
        music.update();
        camera.getWorldDirection(forward);
        up.set(0, 1, 0).applyQuaternion(camera.quaternion);
        const buzzing = lights.nearestBuzzing(position);
        sound.update(
          { position, forward, up },
          buzzing ? { position: buzzing.fixture.position, brightness: buzzing.brightness, flickering: buzzing.fixture.state !== 'buzz' } : null,
        );
      },
      dispose() {
        offRig();
        sound.dispose();
        music.dispose();
        lights.dispose();
        scene.fog = previousFog;
        scene.background = previousBackground;
      },
    };
  },
} satisfies GameModule;
