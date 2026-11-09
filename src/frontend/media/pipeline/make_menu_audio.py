"""NIGHT WARD title-screen audio, synthesised from code (original; no samples, no third-party sound).

    python3 make_menu_audio.py <out_dir>        (needs numpy, scipy and ffmpeg with libopus + aac)

Writes, for each sound, <name>.webm (Opus) and <name>.m4a (AAC, for browsers without Opus):

    bed        48 s seamless loop (+2 s overlap; loop from 1 s to 49 s): sub drone, a slowly breathing bowed cluster on D, ventilation,
               mains hum with fluorescent-ballast buzz, all in a long dark corridor reverb.
               Every component is periodic in 48 s and the reverb is a circular convolution, so
               the loop point cannot be heard.
    metal_1-3  distant pipe and trolley resonances (modal synthesis, heavy reverb)
    door       a heavy fire door closing somewhere far off
    motif      the NIGHT WARD motif: D5 A4 F4 E4 ... B-flat4, settling on an A that is a
               quarter-tone flat; a glass-celesta voice with tape wow
    motif_low  a fragment of the motif an octave down on a felt-piano voice, more detuned
    presence   a reversed swell into a low thud, for the figure at the end of the corridor

The browser schedules the one-shots irregularly over the bed (src/frontend/menuAudio.ts), so
the soundscape never repeats as a loop.
"""
import os
import subprocess
import sys

import numpy as np
from scipy import signal

SR = 48000
LOOP = 48.0
N = int(SR * LOOP)
rng = np.random.default_rng(1969)
t = np.arange(N) / SR


def periodic(freq):
    """Snap a frequency to the loop grid so it completes whole cycles in LOOP seconds."""
    return round(freq * LOOP) / LOOP


def lfo(rate, phase=0.0):
    return 0.5 + 0.5 * np.sin(2 * np.pi * periodic(rate) * t + phase)


def shaped_noise(n, lo, hi, tilt=0.0, circular=True, seed=None):
    """Band-limited noise made in the frequency domain (periodic when circular)."""
    r = np.random.default_rng(seed) if seed is not None else rng
    spec = np.fft.rfft(r.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    gain = np.zeros_like(f)
    band = (f >= lo) & (f <= hi)
    gain[band] = 1.0
    # soft edges
    gain = np.convolve(gain, np.hanning(401) / np.hanning(401).sum(), mode='same')
    with np.errstate(divide='ignore'):
        gain *= np.where(f > 0, (np.maximum(f, 1) / 200.0) ** tilt, 0)
    out = np.fft.irfft(spec * gain, n)
    return out / (np.abs(out).max() + 1e-9)


def impulse(seconds, rt60, damp_hz, seed, predelay=0.03):
    n = int(SR * seconds)
    r = np.random.default_rng(seed)
    tt = np.arange(n) / SR
    ir = np.zeros((n, 2))
    for ch in range(2):
        x = r.standard_normal(n) * np.exp(-6.9 * tt / rt60)
        # darker as it decays: blend a lowpassed copy in over time
        b, a = signal.butter(2, damp_hz / (SR / 2))
        lp = signal.lfilter(b, a, x)
        w = np.clip(tt / (rt60 * 0.5), 0, 1)
        ir[:, ch] = x * (1 - w) * 0.35 + lp * (0.65 + 0.35 * w)
    pd = int(predelay * SR)
    ir = np.vstack([np.zeros((pd, 2)), ir])
    return ir / np.sqrt((ir ** 2).sum(axis=0))


def fft_filter(x, lo, hi):
    """Circular band-pass (keeps a periodic signal periodic)."""
    n = x.shape[0]
    f = np.fft.rfftfreq(n, 1 / SR)
    gain = 1.0 / np.sqrt(1 + (f / hi) ** 4)
    if lo > 0:
        with np.errstate(divide='ignore'):
            gain *= 1.0 / np.sqrt(1 + (lo / np.maximum(f, 1e-6)) ** 4)
    return np.fft.irfft(np.fft.rfft(x, axis=0) * (gain[:, None] if x.ndim == 2 else gain), n, axis=0)


def reverb_circular(x, ir):
    """Circular convolution: the reverb tail wraps into the loop start."""
    n = x.shape[0]
    out = np.zeros((n, 2))
    pad = np.zeros((n, 2))
    pad[: ir.shape[0]] = ir[:n]
    for ch in range(2):
        src = x[:, ch] if x.ndim == 2 else x
        out[:, ch] = np.fft.irfft(np.fft.rfft(src) * np.fft.rfft(pad[:, ch]), n)
    return out


def reverb(x, ir, wet):
    dry = np.stack([x, x], 1) if x.ndim == 1 else x
    w = np.stack([signal.fftconvolve(dry[:, ch], ir[:, ch]) for ch in range(2)], 1)
    dry = np.vstack([dry, np.zeros((w.shape[0] - dry.shape[0], 2))])
    return dry * (1 - wet) + w * wet


def to_stereo(x, width=0.0, seed=0):
    if x.ndim == 2:
        return x
    return np.stack([x, x], 1)


# The bed -----------------------------------------------------------------------------------

def bed():
    out = np.zeros((N, 2))
    D1 = periodic(36.708)
    # Sub: D1 with a slow beating partner and an A1 that swells in and out.
    sub = 0.55 * np.sin(2 * np.pi * D1 * t) + 0.35 * np.sin(2 * np.pi * periodic(D1 + 3 / LOOP) * t + 1.1)
    sub += 0.22 * np.sin(2 * np.pi * periodic(55.0) * t) * lfo(1 / 24, 0.4)
    sub *= 0.55 + 0.45 * lfo(1 / 16, 2.0)
    out += to_stereo(sub * 0.17)

    # Bowed cluster: D2, A2, F3 and a faint B-flat2 (minor with a flat sixth: dread, not melody),
    # each a stack of partials whose levels drift independently.
    voices = [(73.42, 0.8), (110.0, 0.5), (146.83, 0.75), (174.61, 0.4), (220.0, 0.45), (233.08, 0.12), (349.23, 0.18)]
    for i, (f0, level) in enumerate(voices):
        for side in range(2):
            v = np.zeros(N)
            det = periodic(f0 * (1 + (side - 0.5) * 0.0016))
            for n in range(1, 22):
                f = periodic(det * n)
                if f > 5000:
                    break
                amp = level / n ** 1.15
                drift = lfo(rng.uniform(1 / 48, 4 / 48), rng.uniform(0, 6.28)) ** 2
                v += amp * drift * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28))
            out[:, side] += v * 0.11
    # The cluster breathes: brighter and darker over 24 s.
    breath = 0.6 + 0.4 * lfo(1 / 24, 0.0)
    out *= breath[:, None]

    # Ventilation: a duct rumble and an airy band, decorrelated left/right, gently fluttering.
    for side in range(2):
        rumble = shaped_noise(N, 28, 180, tilt=-1.0, seed=10 + side)
        air = shaped_noise(N, 250, 1800, tilt=-0.8, seed=20 + side)
        hiss = shaped_noise(N, 3000, 9000, tilt=-0.5, seed=30 + side)
        flutter = 0.75 + 0.25 * lfo(23 / 48, side * 1.3) * lfo(7 / 48, 0.3)
        out[:, side] += rumble * 0.055 + air * 0.24 * flutter + hiss * 0.02

    # Mains hum (50 Hz) and the ballast buzz of failing tubes: 100 Hz rich in odd harmonics.
    hum = sum(np.sin(2 * np.pi * 50 * k * t + k) / k ** 1.6 for k in (1, 2, 3, 4, 6))
    buzz = signal.sawtooth(2 * np.pi * 100 * t, 0.5)
    buzz = fft_filter(buzz, 900, 3200) * (0.4 + 0.6 * lfo(3 / 48, 1.0))
    out += to_stereo(hum * 0.02 + buzz * 0.016)

    # Corridor reverb (circular so the loop is seamless).
    ir = impulse(4.2, 3.4, 1800, seed=7)
    wet = reverb_circular(out, ir)
    mixed = out * 0.62 + wet * 0.75
    # Gentle high-cut: everything is behind walls.
    return fft_filter(mixed, 18, 7000)


# One-shots ----------------------------------------------------------------------------------

def modal(seconds, modes, strike=0.004, seed=0):
    n = int(seconds * SR)
    tt = np.arange(n) / SR
    r = np.random.default_rng(seed)
    x = np.zeros(n)
    for f, amp, decay in modes:
        x += amp * np.sin(2 * np.pi * f * tt + r.uniform(0, 6.28)) * np.exp(-tt / decay)
    click = r.standard_normal(int(strike * SR)) * np.hanning(int(strike * SR))
    x[: click.size] += click * 0.4
    return x


def distance(x, cutoff):
    b, a = signal.butter(2, cutoff / (SR / 2))
    return signal.lfilter(b, a, x)


def metal(seed):
    r = np.random.default_rng(100 + seed)
    base = r.uniform(140, 310)
    ratios = [1.0, 2.76, 5.40, 8.93, 13.34] if seed != 2 else [1.0, 1.59, 2.14, 2.30, 2.65, 2.92]
    modes = [(base * q * r.uniform(0.99, 1.01), 1 / (1 + i * 0.7), r.uniform(0.6, 2.2) / (1 + i * 0.3)) for i, q in enumerate(ratios)]
    x = modal(3.0, modes, seed=seed)
    if seed == 1:  # two knocks, like something settling in a pipe
        x = x + np.concatenate([np.zeros(int(0.42 * SR)), x[: -int(0.42 * SR)] * 0.55])
    x = distance(x, r.uniform(1400, 2600))
    return reverb(x / np.abs(x).max(), impulse(5.0, 4.0, 1400, seed=40 + seed), 0.78)


def door():
    n = int(1.2 * SR)
    tt = np.arange(n) / SR
    thump = (0.6 * np.sin(2 * np.pi * 52 * tt) * np.exp(-tt / 0.18) + 0.5 * np.sin(2 * np.pi * 118 * tt) * np.exp(-tt / 0.12)
             + 0.9 * shaped_noise(n, 80, 900, circular=False, seed=55) * np.exp(-tt / 0.06))
    latch = np.zeros(n)
    k = int(0.12 * SR)
    latch[k:k + 600] = modal(600 / SR, [(2400, 1, 0.02), (3900, 0.6, 0.015)], seed=3)[:600]
    x = distance(thump + latch * 0.6, 1800)
    return reverb(x / np.abs(x).max(), impulse(5.5, 4.5, 900, seed=60), 0.82)


NOTE = {'D5': 587.33, 'A4': 440.0, 'F4': 349.23, 'E4': 329.63, 'Bb4': 466.16, 'A4q': 440.0 * 2 ** (-0.5 / 12),
        'D4': 293.66, 'A3': 220.0, 'F3': 174.61}


def celesta(f, seconds, seed):
    n = int(seconds * SR)
    tt = np.arange(n) / SR
    r = np.random.default_rng(seed)
    wow = 1 + 0.0035 * np.sin(2 * np.pi * 0.7 * tt + r.uniform(0, 6)) + 0.0015 * np.sin(2 * np.pi * 5.1 * tt)
    phase = 2 * np.pi * f * np.cumsum(wow) / SR
    x = (np.sin(phase) + 0.32 * np.sin(2 * phase) * np.exp(-tt / 0.6) + 0.12 * np.sin(4.17 * phase) * np.exp(-tt / 0.25)
         + 0.05 * np.sin(6.9 * phase) * np.exp(-tt / 0.12))
    env = (1 - np.exp(-tt / 0.004)) * np.exp(-tt / 1.6)
    return x * env


def felt_piano(f, seconds, seed):
    n = int(seconds * SR)
    tt = np.arange(n) / SR
    r = np.random.default_rng(seed)
    x = np.zeros(n)
    for k in range(1, 9):
        fk = f * k * np.sqrt(1 + 0.0004 * k * k) * (1 + r.uniform(-0.002, 0.002))
        x += np.sin(2 * np.pi * fk * tt) / k ** 1.8 * np.exp(-tt * (0.6 + 0.5 * k))
    hammer = shaped_noise(int(0.03 * SR), 200, 1500, circular=False, seed=seed) * np.hanning(int(0.03 * SR))
    x[: hammer.size] += hammer * 0.05
    return distance(x * (1 - np.exp(-tt / 0.01)), 2200)


def phrase(notes, voice, total, seed):
    n = int(total * SR)
    out = np.zeros(n)
    for i, (name, at, level, cents) in enumerate(notes):
        f = NOTE[name] * 2 ** (cents / 1200)
        x = voice(f, total - at, seed + i)
        k = int(at * SR)
        out[k:k + x.size] += x[: n - k] * level
    return out


def motif():
    notes = [('D5', 0.0, 0.9, 0), ('A4', 0.85, 0.75, -4), ('F4', 1.7, 0.7, 3), ('E4', 2.55, 0.65, -6),
             ('Bb4', 4.1, 0.6, 0), ('A4q', 5.3, 0.55, 0)]
    x = phrase(notes, celesta, 9.0, 300)
    x = distance(x, 5200)
    return reverb(x / np.abs(x).max(), impulse(6.0, 5.2, 2600, seed=70), 0.6)


def motif_low():
    notes = [('D4', 0.0, 0.9, -8), ('A3', 1.1, 0.75, -14), ('F3', 2.2, 0.7, -20)]
    x = phrase(notes, felt_piano, 7.0, 400)
    return reverb(x / np.abs(x).max(), impulse(6.0, 5.0, 1500, seed=80), 0.55)


def presence():
    n = int(2.6 * SR)
    tt = np.arange(n) / SR
    cluster = sum(np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(4 * np.pi * f * tt) for f in (293.66, 311.13, 440.0 * 2 ** (-0.4 / 12), 146.83)) / 4
    swell = cluster * np.exp(-tt / 0.9) + 0.4 * shaped_noise(n, 200, 3000, circular=False, seed=90) * np.exp(-tt / 0.5)
    wet = reverb(swell / np.abs(swell).max(), impulse(4.0, 3.5, 2000, seed=91), 1.0)
    rev = wet[::-1][-int(2.4 * SR):]  # reversed tail: it arrives rather than departs
    thud_n = int(2.5 * SR)
    tt2 = np.arange(thud_n) / SR
    thud = (np.sin(2 * np.pi * 41 * tt2) + 0.6 * np.sin(2 * np.pi * 96 * tt2) + 0.25 * np.sin(2 * np.pi * 182 * tt2)) * np.exp(-tt2 / 0.45) * (1 - np.exp(-tt2 / 0.008))
    thud = reverb(thud, impulse(3.0, 2.6, 600, seed=92), 0.5)
    out = np.vstack([rev, np.zeros((thud.shape[0], 2))])
    out[rev.shape[0] - int(0.05 * SR): rev.shape[0] - int(0.05 * SR) + thud.shape[0]] += thud * 0.9
    return out


def looped(x):
    """48 s of periodic audio plus 2 s of its own start. The browser loops 1 s -> 49 s, which is
    seamless whatever priming or padding the codec adds at either end."""
    return np.vstack([x, x[: 2 * SR]])


# Output -------------------------------------------------------------------------------------

def finish(x, peak_db, fade_tail=True):
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    if fade_tail:
        k = min(int(0.4 * SR), x.shape[0] // 4)
        x[-k:] *= np.linspace(1, 0, k)[:, None] ** 2
        # trim silence
        level = np.abs(x).max(axis=1)
        last = np.nonzero(level > 10 ** (-70 / 20) * np.abs(x).max())[0][-1]
        x = x[: last + 1]
    return x / (np.abs(x).max() + 1e-9) * 10 ** (peak_db / 20)


def write(out_dir, name, x, mono=False, opus_kbps=48, aac_kbps=80):
    import wave
    wav = os.path.join(out_dir, f'{name}.wav')
    data = x.mean(axis=1, keepdims=True) if mono else x
    pcm = np.clip(data * 32767, -32768, 32767).astype('<i2')
    with wave.open(wav, 'wb') as w:
        w.setnchannels(pcm.shape[1])
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    for ext, args in (('webm', ['-c:a', 'libopus', '-b:a', f'{opus_kbps}k', '-vbr', 'on', '-application', 'audio']),
                      ('m4a', ['-c:a', 'aac', '-b:a', f'{aac_kbps}k', '-movflags', '+faststart'])):
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, *args, os.path.join(out_dir, f'{name}.{ext}')], check=True)
    os.remove(wav)
    sizes = {ext: os.path.getsize(os.path.join(out_dir, f'{name}.{ext}')) for ext in ('webm', 'm4a')}
    print('NW_AUDIO', name, f'{x.shape[0] / SR:.1f}s', sizes, flush=True)


if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    only = sys.argv[2:]
    jobs = {
        'bed': lambda: (finish(looped(bed()), -9.0, fade_tail=False), False, 56, 96),
        'metal_1': lambda: (finish(metal(0), -10.0), True, 40, 64),
        'metal_2': lambda: (finish(metal(1), -11.0), True, 40, 64),
        'metal_3': lambda: (finish(metal(2), -12.0), True, 40, 64),
        'door': lambda: (finish(door(), -9.0), True, 40, 64),
        'motif': lambda: (finish(motif(), -8.0), False, 48, 80),
        'motif_low': lambda: (finish(motif_low(), -9.0), False, 48, 80),
        'presence': lambda: (finish(presence(), -7.0), False, 48, 80),
    }
    for name, job in jobs.items():
        if only and name not in only:
            continue
        x, mono, ok, ak = job()
        write(out, name, x, mono, ok, ak)
