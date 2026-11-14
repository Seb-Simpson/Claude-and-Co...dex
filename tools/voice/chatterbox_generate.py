#!/usr/bin/env python3
"""NIGHT WARD - offline TEMPORARY voice generation with Chatterbox (Resemble AI, MIT).

Reads a line manifest (tools/voice/*.lines.json), generates one WAV per line with a fixed seed,
and writes a provenance record next to the audio. Every output is labelled TEMPORARY.

Rules enforced here:
  * No paid API. Chatterbox runs locally (CPU or CUDA).
  * No cloning: only the model's built-in default voice, or a reference listed in
    tools/voice/references.json with recorded consent. Unlisted reference files are refused.
  * Output goes to public/voice-temp/ (git-ignored): the built-in voice's speaker and consent
    terms are not documented by the vendor, so provenance is not clear enough to commit audio.

Usage:
  python tools/voice/chatterbox_generate.py tools/voice/r03-audition.lines.json [--only ID] [--out DIR]
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import platform
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REFERENCES = ROOT / "tools" / "voice" / "references.json"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def consented_reference(name: str | None) -> Path | None:
    if not name:
        return None
    registry = json.loads(REFERENCES.read_text()) if REFERENCES.exists() else {"references": []}
    entry = next((r for r in registry["references"] if r.get("id") == name), None)
    if not entry or not entry.get("consent", {}).get("granted"):
        sys.exit(f"Refusing reference '{name}': no recorded consent in {REFERENCES.relative_to(ROOT)}")
    return ROOT / entry["path"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--only", action="append", default=[])
    parser.add_argument("--out", type=Path, default=ROOT / "public" / "voice-temp")
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()

    import torch
    import torchaudio
    import chatterbox
    from chatterbox.tts import ChatterboxTTS, REPO_ID
    from importlib.metadata import version

    manifest = json.loads(args.manifest.read_text())
    lines = [l for l in manifest["lines"] if not args.only or l["id"] in args.only]
    args.out.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    model = ChatterboxTTS.from_pretrained(device=args.device)
    from huggingface_hub import try_to_load_from_cache
    cached = try_to_load_from_cache(REPO_ID, "conds.pt")
    revision = Path(cached).parent.name if isinstance(cached, str) else "unknown"
    load_seconds = time.time() - t0
    torch.set_num_threads(max(1, torch.get_num_threads()))

    for line in lines:
        s = line["settings"]
        reference = consented_reference(line.get("reference"))
        torch.manual_seed(int(s["seed"]))
        started = time.time()
        wav = model.generate(
            line["text"],
            audio_prompt_path=str(reference) if reference else None,
            exaggeration=float(s["exaggeration"]),
            cfg_weight=float(s["cfg_weight"]),
            temperature=float(s["temperature"]),
        )
        gen_seconds = time.time() - started
        path = args.out / f"{line['id']}.temp.wav"
        torchaudio.save(str(path), wav, model.sr)
        duration = wav.shape[-1] / model.sr
        provenance = {
            "id": line["id"],
            "status": "temporary",
            "speaker": line["speaker"],
            "stage": line.get("stage"),
            "presentation": line.get("presentation"),
            "text": line["text"],
            "settings": s,
            "voice": "chatterbox built-in default voice (conds.pt)" if not reference else f"consented reference {line['reference']}",
            "model": {"repo": REPO_ID, "revision": revision, "package": f"chatterbox-tts {version('chatterbox-tts')}", "torch": torch.__version__, "device": args.device},
            "watermark": "Resemble PerTh implicit watermark (applied by Chatterbox)",
            "file": path.name,
            "sha256": sha256(path),
            "sampleRate": model.sr,
            "durationSeconds": round(duration, 4),
            "generationSeconds": round(gen_seconds, 1),
            "modelLoadSeconds": round(load_seconds, 1),
            "host": platform.platform(),
            "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "manifest": str(args.manifest.relative_to(ROOT)) if args.manifest.is_absolute() else str(args.manifest),
        }
        (args.out / f"{line['id']}.temp.json").write_text(json.dumps(provenance, indent=1) + "\n")
        print(f"{line['id']}: {duration:.2f}s audio in {gen_seconds:.1f}s", flush=True)


if __name__ == "__main__":
    main()
