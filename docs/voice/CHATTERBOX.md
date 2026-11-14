# Local temporary voices with Chatterbox (NW-R03)

**Every file this produces is TEMPORARY.** It isn't final performance, and the game labels it "(temp voice)" in subtitles. The engine's `recordingStatus: 'temporary'` keeps production playback from accepting it (production mode returns `refused`).

| | |
|---|---|
| Tool | [Chatterbox](https://github.com/resemble-ai/chatterbox), open source (MIT) |
| Package | `chatterbox-tts` 0.1.7 |
| Model | `ResembleAI/chatterbox` |
| Cost | None. No paid API, no account. |
| Generator | `tools/voice/chatterbox_generate.py` |
| Line manifests | `tools/voice/*.lines.json` |
| Reference registry | `tools/voice/references.json` (consent required) |
| Output | `public/voice-temp/` (git-ignored) |

## 1. Requirements: measured in the NW-R03 session

| Item | Measured |
|---|---|
| Hardware | 4 CPU cores, 15 GB RAM, **no GPU**. CPU works. |
| Python | 3.11, in its own virtual environment. 3.13 isn't used: the pins below target 3.11. |
| Python environment | 1.6 GB, with CPU-only PyTorch 2.6.0 from the PyTorch CPU index |
| Model download | 3.0 GB, cached in `~/.cache/huggingface` |
| Load time | About 10 s |
| Generation speed (CPU) | About 4–7× slower than real time. For example, a 5.4 s line took 36 s; a 2.2 s line took 13 s. |

**Network hosts the setup needs:**

| Host | Used for |
|---|---|
| `pypi.org` | Python packages |
| `download.pytorch.org`, `download-r2.pytorch.org` | CPU PyTorch |
| `huggingface.co`, `cas-server.xethub.hf.co`, `cas-bridge.xethub.hf.co`, `us.aws.cdn.hf.co` | Model weights |

In the cloud session these weren't allowed by default. They were added in a personal environment, "night-ward (voice pipeline)". On your own machine they're normally reachable already.

## 2. Setup (one time)

```bash
uv venv -p 3.11 .venv-voice && . .venv-voice/bin/activate
uv pip install --index-url https://download.pytorch.org/whl/cpu torch==2.6.0 torchaudio==2.6.0
uv pip install chatterbox-tts==0.1.7 "setuptools<81"
```

`setuptools<81` is required. Chatterbox's watermarker (`resemble-perth` 1.0.1) imports `pkg_resources`. Without it the model fails to load (`'NoneType' object is not callable`) rather than generating unwatermarked audio.

## 3. Generate

```bash
python tools/voice/chatterbox_generate.py tools/voice/r03-audition.lines.json          # all lines
python tools/voice/chatterbox_generate.py tools/voice/r03-audition.lines.json --only shaw.r03.fear
```

Each line produces two files:

| File | Contents |
|---|---|
| `public/voice-temp/<id>.temp.wav` | 24 kHz mono WAV. The browser decodes WAV directly. A shipping build would convert to `.m4a`/Opus. |
| `public/voice-temp/<id>.temp.json` | The provenance record (below) |

**Provenance record fields:**
- id, `status: "temporary"`, text, stage, presentation;
- the voice settings and the **seed**;
- voice source, model repository and revision, package and torch versions, device;
- watermark, SHA-256, duration, generation time, host, timestamp, manifest.

**How the game uses it:** the game reads the provenance record to build the cue (exact duration for the subtitle timing). If the files are missing, the same line runs **subtitle-only**. Line IDs never change when audio is regenerated, so dialogue references don't break.

## 4. Rules

1. **No cloning without consent.** By default the generator uses Chatterbox's **built-in default voice** (`conds.pt` shipped with the model).
   - A line may name a `reference` only if that reference is registered in `tools/voice/references.json` with `consent.granted: true`.
   - Anything else is refused.
   - The registry is empty: no reference recordings are cleared.
2. **No paid services.**
3. **Audio stays out of git.** I couldn't find vendor documentation of who the built-in default voice's speaker is or what they consented to, so the provenance isn't clear enough to commit the audio. The manifests, the script and this document are committed.
4. **Watermark.** Chatterbox embeds Resemble's imperceptible PerTh watermark in every output.
5. **Temporary only.** Nothing generated here may be marked `approved`. That requires the blind audition in NW-R02B §8.5, by people.

## 5. The R03 audition set

The set covers five contrasting Shaw states (`tools/voice/r03-audition.lines.json`). It was generated once on CPU with seed 1987 and analysed **objectively**. Nobody on this project has listened to it yet: I can't hear audio, and these numbers are not a quality judgement.

| Line | State | Duration | Speaking rate | Median pitch (10–90%) | Integrated loudness | Peak |
|---|---|---|---|---|---|---|
| `shaw.r03.calm` | Calm instruction (intercom) | 5.40 s | 2.8 words/s | 112 Hz (81–199) | −18.6 LUFS | 0.92 |
| `shaw.r03.suspicious` | Suspicion | 2.36 s | 4.2 words/s | 102 Hz (87–133) | −19.0 LUFS | 0.95 |
| `shaw.r03.pleading` | Pleading | 4.16 s | 4.1 words/s | 125 Hz (91–247) | −18.9 LUFS | 0.72 |
| `shaw.r03.shouting` | Shouting | 2.24 s | 3.6 words/s | 144 Hz (118–185) | −16.3 LUFS | 0.87 |
| `shaw.r03.fear` | Quiet fear | 4.08 s | 3.7 words/s | 126 Hz (104–185) | −17.7 LUFS | 0.88 |

**What the numbers already show, before any listening test:**

1. **The built-in voice is almost certainly not usable for Sister Shaw.** Median pitch is 102–144 Hz on every line. That's typical of an adult male speaker; adult female speech typically centres around 165–255 Hz. Shaw is a 58-year-old woman.
   - Chatterbox can only produce a different speaker from a **reference recording**.
   - We have no consented female British reference.
   - **This is the blocker for a meaningful Shaw audition.**
2. **Delivery doesn't follow the direction.**
   - "Quiet fear" is no quieter than the others (−17.7 LUFS) and is fast (3.7 words/s, where the direction calls for slow).
   - "Pleading" runs at 4.1 words/s, where the direction calls for broken and halting.
   - Unverified by ear. The lines used different `exaggeration` values, but there's no controlled comparison yet.
3. **The accent is unverified.** Nothing here can confirm a British accent; the default voice is not documented as British.
4. **The pipeline itself works:** provenance, watermark, decoding in the game, the intercom chain, the subtitle label.
   - **Reproducible:** regenerating `shaw.r03.calm` with the same seed on the same machine gave a byte-identical WAV.
   - Other machines or library versions may differ; the provenance records model revision `5bb1f6ee58e5…`, the package and the torch version.

## 6. To make a real Shaw audition possible

1. **Obtain a consented reference recording.** About 10–20 s of a British woman of the right age reading neutral text, with **written consent** for synthetic use in NIGHT WARD. A paid actor's consented session, or a willing team member, would do.
2. **Register it** in `tools/voice/references.json`:
   ```json
   { "id": "shaw-ref-1", "path": "voice-refs/shaw-ref-1.wav",
     "consent": { "granted": true, "by": "…", "date": "…", "scope": "NIGHT WARD synthetic voice, game and marketing" } }
   ```
   Keep the audio file out of git unless the consent covers redistribution.
3. Add `"reference": "shaw-ref-1"` to the lines and regenerate.
4. Run the **blind, in-engine** evaluation in R02B §8.5. Mark lines `approved` only if they pass, and only by a human decision.
