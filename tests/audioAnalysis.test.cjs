require("sucrase/register");

const test = require("node:test");
const assert = require("node:assert/strict");
const { writeMidi } = require("midi-file");
const { alignDetectedToTarget, summarizeRhythm } = require("../src/lib/audioAnalysis.ts");
const { parseMidiToTarget, parseMusicXmlToTarget, SCALE_TARGETS } = require("../src/lib/practiceTargets.ts");

function freq(noteLabel) {
  const match = noteLabel.match(/^([A-G])(#?)(-?\d)$/);
  assert.ok(match, `Invalid note label: ${noteLabel}`);

  const semitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const [, letter, sharp, octaveRaw] = match;
  const octave = Number(octaveRaw);
  const midi = (octave + 1) * 12 + semitones[letter] + (sharp ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

function detected(noteLabel, startMs, durationMs = 700) {
  return {
    noteLabel,
    startMs,
    durationMs,
    averagePitchHz: freq(noteLabel),
    averageCentsOffset: 0,
    confidence: 95
  };
}

function expected(noteLabel, startMs, subdivisionLabel = "downbeat", index = 0) {
  return {
    noteLabel,
    startMs,
    durationMs: 500,
    measureNumber: Math.floor(index / 4) + 1,
    beatIndex: index / 2,
    beatInMeasure: (index % 4) + 1,
    subdivisionLabel
  };
}

test("alignDetectedToTarget matches a clean A major scale", () => {
  const target = SCALE_TARGETS.find((item) => item.id === "a_major");
  const detectedNotes = target.expectedNotes.map((note) => detected(note.noteLabel, note.startMs, note.durationMs));

  const result = alignDetectedToTarget(detectedNotes, target.expectedNotes, 5600);

  assert.equal(result.targetComparisons.length, target.expectedNotes.length);
  assert.equal(result.targetComparisons.filter((comparison) => comparison.matched).length, target.expectedNotes.length);
  assert.ok(result.targetComparisons.every((comparison) => comparison.timingDeltaMs === 0));
});

test("alignDetectedToTarget marks omitted target notes as unmatched", () => {
  const expectedNotes = ["A4", "B4", "C#5", "D5"].map((noteLabel, index) =>
    expected(noteLabel, index * 500, "downbeat", index)
  );
  const detectedNotes = [detected("A4", 0, 500), detected("C#5", 1000, 500), detected("D5", 1500, 500)];

  const result = alignDetectedToTarget(detectedNotes, expectedNotes, 2000);
  const missing = result.targetComparisons.find((comparison) => comparison.playedNoteLabel === null);

  assert.ok(missing);
  assert.equal(result.targetComparisons.filter((comparison) => comparison.matched).length, 3);
});

test("alignDetectedToTarget distinguishes wrong pitch from correct timing", () => {
  const expectedNotes = [expected("B4", 500, "downbeat", 1)];
  const detectedNotes = [detected("C5", 500, 500)];

  const result = alignDetectedToTarget(detectedNotes, expectedNotes, 1000);
  const comparison = result.targetComparisons[0];

  assert.equal(comparison.expectedNoteLabel, "B4");
  assert.equal(comparison.playedNoteLabel, "C5");
  assert.equal(comparison.matched, false);
  assert.equal(comparison.timingDeltaMs, 0);
  assert.ok(Math.abs(comparison.centsFromTarget) > 80);
});

test("summarizeRhythm detects rushed offbeat subdivisions from target comparisons", () => {
  const expectedNotes = [
    expected("A4", 0, "downbeat", 0),
    expected("B4", 500, "and", 1),
    expected("C#5", 1000, "downbeat", 2),
    expected("D5", 1500, "and", 3),
    expected("E5", 2000, "downbeat", 4),
    expected("F#5", 2500, "and", 5)
  ];
  const detectedNotes = [
    detected("A4", 0, 500),
    detected("B4", 350, 500),
    detected("C#5", 1000, 500),
    detected("D5", 1340, 500),
    detected("E5", 2000, 500),
    detected("F#5", 2350, 500)
  ];
  const aligned = alignDetectedToTarget(detectedNotes, expectedNotes, 3000);
  const meterSeries = [0.1, 0.7, 0.12, 0.68, 0.12, 0.7, 0.1, 0.68, 0.12, 0.7, 0.1, 0.65];

  const result = summarizeRhythm(meterSeries, 250, aligned.targetComparisons);

  assert.equal(result.rhythmLabel, "Rushing eighth-note subdivisions");
  assert.ok(result.rhythmStability > 0);
});

test("parseMusicXmlToTarget preserves ties, chords, dynamics, articulations, and tempo durations", () => {
  const target = parseMusicXmlToTarget(
    `<?xml version="1.0" encoding="UTF-8"?>
    <score-partwise version="3.1">
      <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
      <part id="P1">
        <measure number="1">
          <attributes>
            <divisions>2</divisions>
            <key><fifths>3</fifths><mode>major</mode></key>
            <time><beats>4</beats><beat-type>4</beat-type></time>
          </attributes>
          <direction>
            <direction-type><dynamics><mf/></dynamics></direction-type>
            <sound tempo="120"/>
          </direction>
          <note>
            <pitch><step>A</step><octave>4</octave></pitch>
            <duration>2</duration>
            <tie type="start"/>
            <voice>1</voice>
            <notations><tied type="start"/><articulations><staccato/></articulations></notations>
          </note>
          <note>
            <chord/>
            <pitch><step>C</step><alter>1</alter><octave>5</octave></pitch>
            <duration>2</duration>
            <voice>1</voice>
          </note>
          <note>
            <pitch><step>A</step><octave>4</octave></pitch>
            <duration>2</duration>
            <tie type="stop"/>
            <voice>1</voice>
            <notations><tied type="stop"/></notations>
          </note>
        </measure>
      </part>
    </score-partwise>`,
    "phrase.musicxml"
  );

  assert.deepEqual(target.expectedNoteLabels, ["A4", "C#5"]);
  assert.equal(target.expectedNotes[0].durationMs, 1000);
  assert.equal(target.expectedNotes[0].dynamic, "mf");
  assert.equal(target.expectedNotes[0].keySignature, "+3 major");
  assert.equal(target.expectedNotes[0].timeSignature, "4/4");
  assert.equal(target.expectedNotes[0].tempoBpm, 120);
  assert.equal(target.expectedNotes[0].tied, true);
  assert.deepEqual(target.expectedNotes[0].articulations, ["staccato"]);
  assert.equal(target.expectedNotes[1].chordTone, true);
  assert.equal(target.expectedNotes[1].startMs, 0);
});

test("parseMidiToTarget keeps real note-off durations and filters to the primary channel", () => {
  const bytes = writeMidi({
    header: {
      format: 1,
      numTracks: 2,
      ticksPerBeat: 480
    },
    tracks: [
      [
        { deltaTime: 0, type: "setTempo", microsecondsPerBeat: 500000 },
        { deltaTime: 0, type: "programChange", channel: 0, programNumber: 40 },
        { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 69, velocity: 90 },
        { deltaTime: 960, type: "noteOff", channel: 0, noteNumber: 69, velocity: 0 },
        { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 71, velocity: 90 },
        { deltaTime: 480, type: "noteOff", channel: 0, noteNumber: 71, velocity: 0 },
        { deltaTime: 0, type: "endOfTrack" }
      ],
      [
        { deltaTime: 0, type: "programChange", channel: 1, programNumber: 0 },
        { deltaTime: 0, type: "noteOn", channel: 1, noteNumber: 48, velocity: 80 },
        { deltaTime: 240, type: "noteOff", channel: 1, noteNumber: 48, velocity: 0 },
        { deltaTime: 0, type: "endOfTrack" }
      ]
    ]
  });

  const target = parseMidiToTarget(Buffer.from(bytes), "two-channel.mid");

  assert.deepEqual(target.expectedNoteLabels, ["A4", "B4"]);
  assert.equal(target.expectedNotes[0].durationMs, 1000);
  assert.equal(target.expectedNotes[0].channel, 0);
  assert.equal(target.expectedNotes[0].instrument, 40);
});

test("parseMidiToTarget extends note duration while sustain pedal is held", () => {
  const bytes = writeMidi({
    header: {
      format: 1,
      numTracks: 1,
      ticksPerBeat: 480
    },
    tracks: [
      [
        { deltaTime: 0, type: "setTempo", microsecondsPerBeat: 500000 },
        { deltaTime: 0, type: "controller", channel: 0, controllerType: 64, value: 127 },
        { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 69, velocity: 90 },
        { deltaTime: 240, type: "noteOff", channel: 0, noteNumber: 69, velocity: 0 },
        { deltaTime: 240, type: "controller", channel: 0, controllerType: 64, value: 0 },
        { deltaTime: 0, type: "endOfTrack" }
      ]
    ]
  });

  const target = parseMidiToTarget(Buffer.from(bytes), "sustain.mid");

  assert.deepEqual(target.expectedNoteLabels, ["A4"]);
  assert.equal(target.expectedNotes[0].durationMs, 500);
});
