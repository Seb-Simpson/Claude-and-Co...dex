"""Minimal MakeHuman 1.x data reader (no MakeHuman code; CC0 assets only).

Reads the base mesh (OBJ with groups and UVs), `.target` morph files, the default skeleton
(`default.mhskel`: bones defined by joint-vertex centroids) and its weights (`default_weights.mhw`).
Coordinates are MakeHuman units (decimetres, +Y up, +Z forward).
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field

import numpy as np


@dataclass
class BaseMesh:
    verts: np.ndarray                     # (N, 3) float64
    uvs: np.ndarray                       # (M, 2)
    faces: list = field(default_factory=list)   # [(group, [(v, vt), ...]), ...]

    def group_faces(self, group: str):
        return [f for g, f in self.faces if g == group]


def load_obj(path: str) -> BaseMesh:
    verts, uvs, faces = [], [], []
    group = 'default'
    with open(path) as fh:
        for line in fh:
            if line.startswith('v '):
                verts.append([float(x) for x in line.split()[1:4]])
            elif line.startswith('vt '):
                uvs.append([float(x) for x in line.split()[1:3]])
            elif line.startswith('g '):
                group = line.split(maxsplit=1)[1].strip()
            elif line.startswith('f '):
                corners = []
                for token in line.split()[1:]:
                    parts = token.split('/')
                    corners.append((int(parts[0]) - 1, int(parts[1]) - 1 if len(parts) > 1 and parts[1] else -1))
                faces.append((group, corners))
    return BaseMesh(np.array(verts, dtype=np.float64), np.array(uvs, dtype=np.float64), faces)


def load_target(path: str) -> tuple[np.ndarray, np.ndarray]:
    idx, delta = [], []
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            parts = line.split()
            idx.append(int(parts[0]))
            delta.append([float(parts[1]), float(parts[2]), float(parts[3])])
    return np.array(idx, dtype=np.int64), np.array(delta, dtype=np.float64)


def apply_targets(verts: np.ndarray, data_dir: str, weights: dict[str, float]) -> np.ndarray:
    out = verts.copy()
    for rel, w in weights.items():
        if abs(w) < 1e-6:
            continue
        idx, delta = load_target(os.path.join(data_dir, 'targets', rel))
        out[idx] += w * delta
    return out


def macro_weights(age_value: float, muscle_value: float, weight_value: float, height_value: float, proportion_value: float) -> dict[str, float]:
    """MakeHuman's macro blending for a female (gender 0): age 0.5 = 25 y, 1.0 = 90 y; muscle, weight,
    height and proportions in 0..1 with 0.5 average."""
    ages = {'young': 1.0 - (age_value - 0.5) / 0.5, 'old': (age_value - 0.5) / 0.5} if age_value >= 0.5 else {'young': 1.0}
    def tri(value: float, lo: str, mid: str, hi: str) -> dict[str, float]:
        return {lo: 1 - value / 0.5, mid: value / 0.5} if value < 0.5 else {mid: 1 - (value - 0.5) / 0.5, hi: (value - 0.5) / 0.5}
    muscles = tri(muscle_value, 'minmuscle', 'averagemuscle', 'maxmuscle')
    weights_ = tri(weight_value, 'minweight', 'averageweight', 'maxweight')
    out: dict[str, float] = {}
    for a, wa in ages.items():
        for m, wm in muscles.items():
            for w, ww in weights_.items():
                base = wa * wm * ww
                if base < 1e-6:
                    continue
                out[f'macrodetails/universal-female-{a}-{m}-{w}.target'] = out.get(f'macrodetails/universal-female-{a}-{m}-{w}.target', 0) + base
                out[f'macrodetails/caucasian-female-{a}.target'] = out.get(f'macrodetails/caucasian-female-{a}.target', 0) + base
                if height_value > 0.5:
                    out[f'macrodetails/height/female-{a}-{m}-{w}-maxheight.target'] = base * (height_value - 0.5) / 0.5
                elif height_value < 0.5:
                    out[f'macrodetails/height/female-{a}-{m}-{w}-minheight.target'] = base * (0.5 - height_value) / 0.5
                if proportion_value > 0.5:
                    out[f'macrodetails/proportions/female-{a}-{m}-{w}-idealproportions.target'] = base * (proportion_value - 0.5) / 0.5
                elif proportion_value < 0.5:
                    out[f'macrodetails/proportions/female-{a}-{m}-{w}-uncommonproportions.target'] = base * (0.5 - proportion_value) / 0.5
    # The race target is applied once in total (weights summed above already equal the age split).
    for a, wa in ages.items():
        out[f'macrodetails/caucasian-female-{a}.target'] = wa
    return out


def load_skeleton(data_dir: str) -> dict:
    with open(os.path.join(data_dir, 'rigs', 'default.mhskel')) as fh:
        return json.load(fh)


def load_weights(data_dir: str) -> dict:
    with open(os.path.join(data_dir, 'rigs', 'default_weights.mhw')) as fh:
        return json.load(fh)['weights']


def joint_positions(skeleton: dict, verts: np.ndarray) -> dict[str, np.ndarray]:
    return {name: verts[np.array(idx)].mean(axis=0) for name, idx in skeleton['joints'].items()}
