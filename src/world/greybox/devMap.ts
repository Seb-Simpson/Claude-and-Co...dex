/**
 * Developer map: a 2D overlay drawn from the same layout data that builds the greybox geometry.
 * Shows rooms (zone colour, required/optional), generated walls/lintels/sills, doors and their live
 * state (open/closed/locked/needs a flag), hatches, encounter areas, checkpoints, controls, hiding
 * spots, markers, walkthrough steps and the player. Checkpoint labels are clickable (dev teleport).
 */
import type { DoorState } from '../../contracts';
import type { GreyboxControl } from './build';
import { doorIdsOf } from './build';
import type { GreyboxLayout } from './grid';
import { CHECKPOINTS, CONNECTIONS, ENCOUNTERS, FEATURES, WALKTHROUGH, ZONES } from './level';
import type { TelemetrySnapshot } from './telemetry';

export interface DevMapSources {
  readonly layout: GreyboxLayout;
  readonly controls: readonly GreyboxControl[];
  readonly hidingPoints: readonly { x: number; z: number }[];
  doorState(id: string): DoorState | undefined;
  has(flag: string): boolean;
  player(): { x: number; z: number; yaw: number } | null;
  telemetry(): TelemetrySnapshot;
  onCheckpoint(id: string): void;
}

export interface DevMap {
  readonly element: HTMLElement;
  toggle(force?: boolean): boolean;
  readonly visible: boolean;
  draw(): void;
  dispose(): void;
}

const CATEGORY_COLOR: Record<string, string> = {
  story: '#7fd17f', placeholder: '#f0c020', approach: '#d070f0', encounter: '#ff5040', mirror: '#60c0ff', guidance: '#40e080',
};

export function bounds(layout: GreyboxLayout): { minX: number; maxX: number; minZ: number; maxZ: number } {
  return { minX: layout.x0, maxX: layout.x0 + layout.nx * layout.res, minZ: layout.z0, maxZ: layout.z0 + layout.nz * layout.res };
}

/** Draws the map into any 2D context (also used headless for the report image). */
export function drawMap(ctx: CanvasRenderingContext2D, width: number, height: number, sources: DevMapSources, options: { labels?: boolean; legend?: boolean } = {}): (x: number, z: number) => [number, number] {
  const { layout } = sources;
  const b = bounds(layout);
  const margin = 24;
  const scale = Math.min((width - margin * 2) / (b.maxX - b.minX), (height - margin * 2 - 30) / (b.maxZ - b.minZ));
  const ox = margin + ((width - margin * 2) - (b.maxX - b.minX) * scale) / 2;
  const oz = margin + 30;
  const P = (x: number, z: number): [number, number] => [ox + (x - b.minX) * scale, oz + (z - b.minZ) * scale];
  ctx.fillStyle = '#101214';
  ctx.fillRect(0, 0, width, height);

  // Spaces.
  for (const space of layout.spaces) {
    const zone = ZONES.find((z) => z.id === space.zone)!;
    ctx.fillStyle = zone.color;
    ctx.globalAlpha = space.required ? 0.62 : 0.3;
    for (const [x0, x1, z0, z1] of space.rects) {
      const [px, pz] = P(x0, z0);
      ctx.fillRect(px, pz, (x1 - x0) * scale, (z1 - z0) * scale);
    }
    if (space.ceiling < 1.8) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#000';
      for (const [x0, x1, z0, z1] of space.rects) {
        for (let x = x0; x < x1; x += 0.6) { const [ax, az] = P(x, z0); const [bx, bz] = P(Math.min(x1, x + (z1 - z0)), Math.min(z1, z0 + (x1 - x))); ctx.beginPath(); ctx.moveTo(ax, az); ctx.lineTo(bx, bz); ctx.stroke(); }
      }
    }
  }
  ctx.globalAlpha = 1;

  // Encounter areas.
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.5;
  for (const encounter of ENCOUNTERS) {
    const [x0, x1, z0, z1] = encounter.rect;
    const [px, pz] = P(x0, z0);
    ctx.strokeStyle = '#ff4030';
    ctx.strokeRect(px - 2, pz - 2, (x1 - x0) * scale + 4, (z1 - z0) * scale + 4);
    ctx.fillStyle = '#ff6050';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(encounter.label, px, pz - 5);
  }
  ctx.setLineDash([]);

  // Generated walls.
  for (const wall of layout.walls) {
    const [ax, az] = wall.axis === 'z' ? P(wall.at, wall.from) : P(wall.from, wall.at);
    const [bx, bz] = wall.axis === 'z' ? P(wall.at, wall.to) : P(wall.to, wall.at);
    ctx.strokeStyle = wall.kind === 'wall' ? '#e8e8e0' : wall.kind === 'sill' ? '#60c0ff' : 'rgba(0,0,0,0)';
    ctx.lineWidth = wall.kind === 'wall' ? Math.max(1.2, scale * 0.15) : 2;
    if (wall.kind === 'lintel') continue;
    ctx.beginPath(); ctx.moveTo(ax, az); ctx.lineTo(bx, bz); ctx.stroke();
  }

  // Connections.
  for (const connection of CONNECTIONS) {
    const span = layout.openings.get(connection.id)!;
    const half = connection.width / 2;
    const [ax, az] = connection.axis === 'z' ? P(connection.at, connection.center - half) : P(connection.center - half, connection.at);
    const [bx, bz] = connection.axis === 'z' ? P(connection.at, connection.center + half) : P(connection.center + half, connection.at);
    let color = '#80ff80';
    if (connection.kind === 'door' && connection.door) {
      const states = doorIdsOf(connection.id).map((id) => sources.doorState(id));
      const locked = states.some((s) => s === 'locked');
      const gated = connection.door.requires && !sources.has(connection.door.requires);
      const open = states.every((s) => s === 'open' || s === 'opening');
      color = locked ? '#ff3030' : gated ? '#ff9a20' : open ? '#40e070' : '#ffffff';
    } else if (connection.kind === 'hatch') color = '#ffe040';
    else if (connection.kind === 'window') color = '#60c0ff';
    else if (span.top < 1.8) color = '#c080ff';
    ctx.strokeStyle = color;
    ctx.lineWidth = connection.kind === 'open' ? 2 : 4;
    ctx.beginPath(); ctx.moveTo(ax, az); ctx.lineTo(bx, bz); ctx.stroke();
  }

  // Walkthrough route.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  WALKTHROUGH.forEach((step, index) => { const [px, pz] = P(step.x, step.z); if (index === 0) ctx.moveTo(px, pz); else ctx.lineTo(px, pz); });
  ctx.stroke();
  ctx.setLineDash([]);
  for (const step of WALKTHROUGH) {
    const [px, pz] = P(step.x, step.z);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(px, pz, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(step.step), px, pz + 3);
    ctx.textAlign = 'left';
  }

  // Hiding, markers, controls.
  for (const point of sources.hidingPoints) {
    const [px, pz] = P(point.x, point.z);
    ctx.fillStyle = '#40d0ff';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('H', px - 3, pz + 4);
  }
  for (const feature of FEATURES) {
    if (feature.kind !== 'marker') continue;
    const [px, pz] = P(feature.x, feature.z);
    ctx.fillStyle = CATEGORY_COLOR[feature.category] ?? '#fff';
    ctx.beginPath(); ctx.arc(px, pz, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  for (const control of sources.controls) {
    const [px, pz] = P(control.position.x, control.position.z);
    const done = sources.has(control.sets);
    ctx.fillStyle = done ? '#40e070' : '#f0d020';
    ctx.fillRect(px - 4, pz - 4, 8, 8);
    if (options.labels !== false) {
      ctx.font = '10px monospace';
      ctx.fillText(control.sets, px + 6, pz + 3);
    }
  }

  // Checkpoints.
  for (const checkpoint of CHECKPOINTS) {
    const [px, pz] = P(checkpoint.x, checkpoint.z);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, pz, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(checkpoint.id, px + 10, pz - 6);
  }

  // Space labels.
  if (options.labels !== false) {
    ctx.font = `${Math.max(8, Math.min(11, scale * 0.9))}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    for (const space of layout.spaces) {
      const [x0, x1, z0, z1] = space.rects[0]!;
      const [px, pz] = P((x0 + x1) / 2, (z0 + z1) / 2);
      ctx.textAlign = 'center';
      ctx.fillText(space.id, px, pz + 3);
      ctx.textAlign = 'left';
    }
  }

  // Player.
  const player = sources.player();
  if (player) {
    const [px, pz] = P(player.x, player.z);
    ctx.fillStyle = '#ff2080';
    ctx.beginPath(); ctx.arc(px, pz, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ff2080';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, pz); ctx.lineTo(px - Math.sin(player.yaw) * 16, pz - Math.cos(player.yaw) * 16); ctx.stroke();
  }

  // Header + legend.
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('NW-R02 CHAPTER 1 GREYBOX — DEVELOPER MAP (built from level geometry) · M to close · click a CP to teleport', margin, 20);
  if (options.legend !== false) {
    const legend: [string, string][] = [
      ['#40e070', 'door open'], ['#ffffff', 'door closed'], ['#ff9a20', 'needs flag'], ['#ff3030', 'locked/blocked'],
      ['#ffe040', 'hatch (crouch)'], ['#c080ff', 'low opening'], ['#60c0ff', 'window/sill'], ['#f0d020', 'dev control'],
      ['#ff4030', 'encounter area'], ['#40d0ff', 'H hiding'],
    ];
    ctx.font = '11px monospace';
    legend.forEach(([color, label], index) => {
      const y = height - 14 - (legend.length - 1 - index) * 15;
      ctx.fillStyle = color; ctx.fillRect(margin, y - 9, 10, 10);
      ctx.fillStyle = '#ddd'; ctx.fillText(label, margin + 16, y);
    });
    const t = sources.telemetry();
    const lines = [
      `time ${t.totalSeconds.toFixed(1)} s · moving ${t.movingSeconds.toFixed(1)} s · idle ${t.idleSeconds.toFixed(1)} s`,
      `distance ${t.distance.toFixed(1)} m (crouched ${t.crouchedDistance.toFixed(1)} m) · exploring ${t.exploringSeconds.toFixed(1)} s · at controls ${t.controlSeconds.toFixed(1)} s`,
      `space ${t.currentSpace ?? '—'} · zone ${t.currentZone ?? '—'} · steps ${t.steps.length}/${WALKTHROUGH.length} · teleports ${t.teleports}`,
    ];
    ctx.fillStyle = '#ddd';
    lines.forEach((line, index) => ctx.fillText(line, width - 640, height - 44 + index * 15));
  }
  return P;
}

export function createDevMap(sources: DevMapSources): DevMap {
  const element = document.createElement('div');
  element.id = 'nw-greybox-map';
  element.style.cssText = 'position:fixed;inset:0;z-index:50;display:none;background:#101214;';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;cursor:crosshair;';
  element.appendChild(canvas);
  document.body.appendChild(element);
  let visible = false;
  let project: ((x: number, z: number) => [number, number]) | null = null;
  const draw = (): void => {
    if (!visible) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    if (canvas.width !== Math.round(w * ratio)) { canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio); }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    project = drawMap(ctx, w, h, sources);
  };
  const onClick = (event: MouseEvent): void => {
    if (!project) return;
    for (const checkpoint of CHECKPOINTS) {
      const [px, pz] = project(checkpoint.x, checkpoint.z);
      if (Math.hypot(event.clientX - px, event.clientY - pz) < 14) { sources.onCheckpoint(checkpoint.id); return; }
    }
  };
  canvas.addEventListener('click', onClick);
  return {
    element,
    get visible() { return visible; },
    toggle(force) {
      visible = force ?? !visible;
      element.style.display = visible ? 'block' : 'none';
      if (visible) { if (document.pointerLockElement) document.exitPointerLock(); draw(); }
      return visible;
    },
    draw,
    dispose() { canvas.removeEventListener('click', onClick); element.remove(); },
  };
}
