# Room 104 dialogue and audio direction

**Status: temporary synthetic speech, not final voice acting.** Two original local WAVs were made with the already installed FFmpeg Flite SLT synthesizer. The stand-ins have a synthetic US accent and do not meet the intended British performance. No external voice service, paid API, new runtime dependency or cloned real person's voice is involved. Replace these before release. Flite and its bundled CMU voices are distributed under their permissive Carnegie Mellon licences; see the local source notices in the audio asset folder.

| Cue | Exact script | Context and final direction |
|---|---|---|
| `nw005.voice.shaw.return-to-bed` | Patient one-zero-four. Please return to your bed. | First locked Room104 door attempt. Ordinary British hospital nurse: calm, professional, matter-of-fact. Patient number is a routine address, not a threat. A small natural pause after the number; no whispering or horror effects in the performance. |
| `nw005.voice.shaw.not-authorised` | Patient one-zero-four. You have not been authorised to leave. | Successful card-reader unlock. Slightly firmer, controlled, concerned about a patient breaking ward rules. No theatrical villain delivery or shouting. |

There are no other Room104 intercom lines and no protagonist narration. Each cue plays once per attempt/state. Rapid card use queues the second line behind the first rather than interrupting it. The room-state owner controls narrative one-shots; this audio session additionally deduplicates queued IDs.

## Playback and replacement

`createOpeningAudio(audio, subtitle)` uses the existing lazy engine AudioService, chapter DialoguePlayer and settings-controlled SFX/master mixer. Two small local WAVs are fetched once at setup and decoded after the user unlocks audio. Speech is band limited (320–3200 Hz), with native AudioContext timing driving subtitles. Sources resume at their audible offset; pause/menu/disposal cannot leave a stale voice or subtitle. Audio never creates its own context, RAF, timers or DOM listeners. All controls, including master/SFX mute, apply through the existing mixer.

Replace WAV URLs and exact measured durations in `OPENING_VOICES`, subtitle segments if needed, and the asset manifest. Mark the replacement `approved` only after direction/listening approval. The current transport deliberately uses dialogue **preview** mode for `temporary` assets; the production dialogue transport already rejects unapproved performances. Do not label the current recordings approved.

Locked handle/latch, card handling, denial/acceptance, distant steps and awakening monitor/air sounds are original restrained Web Audio synthesis. Existing world ambience remains responsible for the room bed. Sources are bounded and disconnected on completion; repeated reader interactions cannot create an unbounded collection. Brief SFX are cancelled on pause rather than replaying stale impacts after resume.

## Reproduction

The WAVs were generated with installed FFmpeg, without downloading a model:

```
ffmpeg -f lavfi -i "flite=text='Patient one zero four. Please return to your bed.':voice=slt" -af 'adelay=160,apad=pad_dur=0.25' -ar 22050 -ac 1 shaw-return-to-bed.temporary.wav
ffmpeg -f lavfi -i "flite=text='Patient one zero four. You have not been authorised to leave.':voice=slt" -af 'adelay=160,apad=pad_dur=0.25' -ar 22050 -ac 1 shaw-not-authorised.temporary.wav
```

The synthetic reading of “one zero four” implements the subtitle spelling “one-zero-four”. The actual audible lengths are 3.48 s and 3.8300226757 s, including lead-in and tail silence. Final performance timing must be measured again.
