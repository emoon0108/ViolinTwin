# ViolinTwin

Futuristic Expo + React Native MVP for an AI violin practice teacher. The app now records real microphone input, stores session history on-device, estimates pulse and coarse pitch-center from each captured take, and adapts the dashboard and report screens over time.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start Expo:

```bash
npm start
```

3. Open in:

- iOS simulator with `i`
- Android emulator with `a`
- Web with `w`

## What is included

- Home Dashboard
- Practice Recording Screen
- Real-Time Analysis Screen with native live tuner and score follower
- Feedback Report Screen
- Digital Twin Profile Screen
- Studio Ops Screen for teacher/student operations
- Shared futuristic theme
- Real microphone recording with `expo-audio`
- Live metering waveform during capture
- Post-session PCM sampling for coarse pitch-center estimation
- Frame-by-frame pitch tracking from recorded audio playback samples
- Segmented note detection with per-note cents offsets
- Target-aware scale mode for A major, D major, and G major
- Import MusicXML and MIDI files as comparison targets
- Timeline-aware alignment between played notes and imported target notes
- Beat-aware and measure-aware rhythm comparison for imported targets
- Subdivision-aware rhythmic grading with bar-line recovery feedback
- Action-oriented `Fix Now` teacher flow with looped problem segments
- Repeated-error interruption that forces slower correction work
- Teacher-facing studio dashboard with student statuses, risk flags, and next actions
- QR-style report sharing for latest session summaries and assignments
- Lesson scheduling simulation with locally queued booking changes
- Teacher review queue for triaging submitted practice takes
- Studio analytics for retention, average score, practice minutes, and at-risk students
- Offline-first sync simulation for recordings, bookings, and reports
- Playback review with scrubber controls
- Note-by-note pitch graph for analyzed sessions
- Tempo and rhythm stability estimation from recorded energy onsets
- Local session history using AsyncStorage
- Native live tuner bridge with realtime event streaming in `modules/violin-twin-engine`
- Reusable glass cards, neon buttons, score cards, waveform, and bottom navigation

## Current technical limits

This MVP is more real than the original mockup, but it still has honest limits:

- It does record from the microphone and analyze the resulting session.
- It does estimate pulse, dynamic stability, pitch track, and note segments.
- It does persist past sessions and update the "digital twin" profile from real history.
- It does compare detected notes against built-in scale targets in Scale Practice mode.
- It does compare detected notes against imported MusicXML or MIDI targets using note identity, approximated onset timing, beat/measure placement, and subdivision-aware rhythm grading.
- It does turn the top detected issue into an immediate correction loop with slowed playback and rep tracking.
- It does interrupt repeated bad repetition and force a slower fix loop when the same issue keeps recurring.
- It does **not** yet compare detected notes against arbitrary sheet music or a known target passage outside those built-in targets.
- It does perform true low-latency live pitch tracking and note-by-note score-following in a custom dev build through the local native bridge.
- It does **not** yet perform that native live tuner path inside Expo Go, which still falls back to the JavaScript analysis path.
- It does **not** yet analyze posture from camera input.
- The new native `ViolinTwinEngine` bridge is scaffolded for iOS and Android, but Expo Go cannot load local native modules. In Expo Go, the app safely falls back to the current TypeScript analysis path.

The main Expo SDK 54 constraint is that Expo Go exposes live recorder metering, but raw PCM sampling is currently available from playback rather than from the active recorder stream. That is why pitch analysis is a post-session pass today instead of a true live tuner.

Source:
- [Expo Audio SDK 54 docs](https://docs.expo.dev/versions/v54.0.0/sdk/audio/)

## Future audio engine integration

The future C++ audio analysis engine should plug in around these areas:

- `src/screens/PracticeRecordingScreen.tsx`
  Replace Expo metering with raw audio frame streaming into a native engine bridge.
- `src/lib/audioAnalysis.ts`
  Swap the JavaScript heuristics for production-grade pitch, onset, vibrato, articulation, and bow-control analysis.
- `src/context/PracticeContext.tsx`
  Connect native analysis results to the shared app state and history model.
- `modules/violin-twin-engine`
  Replace the placeholder Swift/Kotlin pitch-analysis routines with a production DSP core and expose low-latency realtime chunk analysis through the Expo module bridge.
- `src/screens/DigitalTwinProfileScreen.tsx`
  Expand the twin from simple aggregates into a true longitudinal model of playing habits.

## Using the native bridge

The project now includes a local Expo module named `ViolinTwinEngine`. The live note-by-note tuner and score-following path uses this bridge, so use a custom dev build instead of Expo Go if you want the true realtime experience:

```bash
npx expo prebuild
npx expo run:ios
```

or:

```bash
npx expo run:android
```

After that, the app can call the local native module directly. The current bridge already exposes:

- `getCapabilities()`
- `analyzePitchFrames(...)`
- `analyzeRealtimeChunk(...)`
- `startRealtimeTracking(...)`
- `stopRealtimeTracking()`

## Importing targets

You can now import a target file from the Practice screen by tapping `Import MusicXML or MIDI`.

Current import support:

- `MusicXML` / `.musicxml` / `.xml`
  The parser extracts pitched notes plus approximate onset/duration timing, measure number, and beat placement from the score and ignores rests.
- `MIDI` / `.mid` / `.midi`
  The parser extracts `noteOn` events plus approximate onset/duration timing and beat placement from MIDI tick order.

Current limitations:

- The MusicXML parser uses simplified duration scaling rather than full notation semantics such as tuplets, ties, or expressive markings.
- The MIDI parser currently uses note-on ordering and basic timing conversion rather than channel/instrument filtering, pedal interpretation, or expressive timing interpretation.
- Rhythmic grading is beat-aware and subdivision-aware, but it is not yet a full symbolic score-following engine.
- The current `Fix Now` flow uses slowed looped playback plus rep completion tracking; it does not yet auto-verify each rep from a fresh re-recording.
- The repeated-error guard currently looks at the recent session issue history rather than auto-verifying every new repetition attempt from fresh audio.
