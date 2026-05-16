import { XMLParser } from "fast-xml-parser";
import { parseMidi } from "midi-file";
import { ExpectedTargetNote, PracticeTarget, ScaleTargetId } from "../types/violin";

export const SCALE_TARGETS: ({ id: ScaleTargetId } & PracticeTarget)[] = [
  {
    id: "a_major",
    name: "A Major Scale",
    sourceType: "built-in-scale",
    expectedNoteLabels: ["A4", "B4", "C#5", "D5", "E5", "F#5", "G#5", "A5"],
    expectedNotes: buildUniformExpectedNotes(["A4", "B4", "C#5", "D5", "E5", "F#5", "G#5", "A5"])
  },
  {
    id: "d_major",
    name: "D Major Scale",
    sourceType: "built-in-scale",
    expectedNoteLabels: ["D4", "E4", "F#4", "G4", "A4", "B4", "C#5", "D5"],
    expectedNotes: buildUniformExpectedNotes(["D4", "E4", "F#4", "G4", "A4", "B4", "C#5", "D5"])
  },
  {
    id: "g_major",
    name: "G Major Scale",
    sourceType: "built-in-scale",
    expectedNoteLabels: ["G3", "A3", "B3", "C4", "D4", "E4", "F#4", "G4"],
    expectedNotes: buildUniformExpectedNotes(["G3", "A3", "B3", "C4", "D4", "E4", "F#4", "G4"])
  }
];

type XmlNode = Record<string, unknown>;
type MidiEvent = Record<string, unknown> & { deltaTime: number; type: string };

const MAX_IMPORTED_NOTES = 256;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseTagValue: true,
  trimValues: true
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function readNumber(value: unknown, fallback = 0) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function buildUniformExpectedNotes(noteLabels: string[], durationMs = 700): ExpectedTargetNote[] {
  return noteLabels.map((noteLabel, index) => ({
    noteLabel,
    startMs: index * durationMs,
    durationMs,
    measureNumber: Math.floor(index / 4) + 1,
    beatIndex: index,
    beatInMeasure: (index % 4) + 1,
    subdivisionLabel: "downbeat"
  }));
}

function subdivisionLabelFromBeatPosition(beatPosition: number) {
  const wholeBeat = Math.floor(beatPosition);
  const frac = beatPosition - wholeBeat;

  if (Math.abs(frac) < 0.125) {
    return "downbeat";
  }
  if (Math.abs(frac - 0.25) < 0.125) {
    return "e";
  }
  if (Math.abs(frac - 0.5) < 0.125) {
    return "and";
  }
  if (Math.abs(frac - 0.75) < 0.125) {
    return "a";
  }
  return "subdivision";
}

export function midiToNoteLabel(midi: number) {
  const labels = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(midi / 12) - 1;
  return `${labels[((midi % 12) + 12) % 12]}${octave}`;
}

function notePartsToMidi(step: string, alter: number, octave: number) {
  const semitoneMap: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11
  };

  return (octave + 1) * 12 + semitoneMap[step] + alter;
}

function getMeasureNumber(measure: XmlNode, fallback: number) {
  const numberValue = readNumber(measure.number, Number.NaN);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function getTempoFromDirection(measure: XmlNode) {
  const directions = asArray(measure.direction as XmlNode | XmlNode[]);
  for (const direction of directions) {
    const sound = direction.sound as XmlNode | undefined;
    const tempo = readNumber(sound?.tempo, Number.NaN);
    if (Number.isFinite(tempo) && tempo > 0) {
      return tempo;
    }
  }

  return null;
}

function extractArticulations(note: XmlNode) {
  const notations = note.notations as XmlNode | undefined;
  const articulationNode = notations?.articulations as XmlNode | undefined;
  if (!articulationNode) {
    return [];
  }

  return Object.keys(articulationNode);
}

function extractOrnaments(note: XmlNode) {
  const notations = note.notations as XmlNode | undefined;
  const ornamentNode = notations?.ornaments as XmlNode | undefined;
  if (!ornamentNode) {
    return [];
  }

  return Object.keys(ornamentNode);
}

function hasNotation(note: XmlNode, key: string) {
  const notations = note.notations as XmlNode | undefined;
  return Boolean(notations?.[key]);
}

function tieTypes(note: XmlNode) {
  return asArray(note.tie as XmlNode | XmlNode[])
    .map((tie) => readString(tie.type))
    .filter((type): type is string => type !== null);
}

function mergeTiedNotes(notes: ExpectedTargetNote[]) {
  const merged: ExpectedTargetNote[] = [];
  const activeTieByVoice = new Map<string, ExpectedTargetNote>();

  notes.forEach((note) => {
    const tieKey = `${note.voice ?? "voice"}:${note.noteLabel}`;
    const active = activeTieByVoice.get(tieKey);

    if (active && note.tied) {
      active.durationMs = Math.max(active.durationMs, note.startMs + note.durationMs - active.startMs);
      active.tied = true;
      active.articulations = Array.from(new Set([...(active.articulations ?? []), ...(note.articulations ?? [])]));
    } else {
      merged.push(note);
    }

    if (note.tied) {
      activeTieByVoice.set(tieKey, active ?? note);
    } else {
      activeTieByVoice.delete(tieKey);
    }
  });

  return merged;
}

export function parseMusicXmlToTarget(xmlText: string, fallbackName: string): PracticeTarget {
  const parsed = xmlParser.parse(xmlText) as XmlNode;
  const score = (parsed["score-partwise"] ?? parsed["score-timewise"] ?? parsed.opus) as XmlNode | undefined;
  const parts = score ? asArray(score.part as XmlNode | XmlNode[]) : [];
  const expectedNotes: ExpectedTargetNote[] = [];
  let divisions = 1;
  let beatsPerMeasure = 4;
  let beatUnit = 4;
  let tempoBpm = 100;
  let keySignature: string | null = null;
  let timeSignature = "4/4";

  parts.forEach((partEntry) => {
    let currentMs = 0;
    let beatIndex = 0;
    let currentDynamic: string | null = null;
    const measures = asArray(partEntry.measure as XmlNode | XmlNode[]);

    measures.forEach((measure, measureIndex) => {
      const attributes = measure.attributes as XmlNode | undefined;
      const nextDivisions = readNumber(attributes?.divisions, Number.NaN);
      if (Number.isFinite(nextDivisions) && nextDivisions > 0) {
        divisions = nextDivisions;
      }

      const time = attributes?.time as XmlNode | undefined;
      const beatsValue = readNumber(time?.beats, Number.NaN);
      const beatTypeValue = readNumber(time?.["beat-type"], Number.NaN);
      if (Number.isFinite(beatsValue) && beatsValue > 0) {
        beatsPerMeasure = beatsValue;
      }
      if (Number.isFinite(beatTypeValue) && beatTypeValue > 0) {
        beatUnit = beatTypeValue;
      }
      if (Number.isFinite(beatsValue) && Number.isFinite(beatTypeValue) && beatsValue > 0 && beatTypeValue > 0) {
        timeSignature = `${beatsValue}/${beatTypeValue}`;
      }

      const key = attributes?.key as XmlNode | undefined;
      const fifths = readNumber(key?.fifths, Number.NaN);
      const mode = readString(key?.mode);
      if (Number.isFinite(fifths)) {
        keySignature = `${fifths >= 0 ? "+" : ""}${fifths}${mode ? ` ${mode}` : ""}`;
      }

      const directedTempo = getTempoFromDirection(measure);
      if (directedTempo) {
        tempoBpm = directedTempo;
      }

      asArray(measure.direction as XmlNode | XmlNode[]).forEach((direction) => {
        const directionType = direction["direction-type"] as XmlNode | undefined;
        const dynamics = directionType?.dynamics as XmlNode | undefined;
        const dynamicName = dynamics ? Object.keys(dynamics)[0] : null;
        if (dynamicName) {
          currentDynamic = dynamicName;
        }
      });

      const measureNumber = getMeasureNumber(measure, measureIndex + 1);
      const notes = asArray(measure.note as XmlNode | XmlNode[]);

      notes.forEach((note) => {
        const durationValue = readNumber(note.duration, 1);
        const durationBeats = durationValue / divisions * (beatUnit / 4);
        const durationMs = Math.max(80, Math.round(durationBeats * (60000 / tempoBpm)));
        const isChordTone = Object.prototype.hasOwnProperty.call(note, "chord");
        const noteStartMs = isChordTone ? currentMs - durationMs : currentMs;
        const noteBeatIndex = isChordTone ? beatIndex - durationBeats : beatIndex;
        const beatInMeasure = (noteBeatIndex % beatsPerMeasure) + 1;

        if (Object.prototype.hasOwnProperty.call(note, "backup")) {
          currentMs = Math.max(0, currentMs - durationMs);
          beatIndex = Math.max(0, beatIndex - durationBeats);
          return;
        }

        if (Object.prototype.hasOwnProperty.call(note, "forward")) {
          currentMs += durationMs;
          beatIndex += durationBeats;
          return;
        }

        if (Object.prototype.hasOwnProperty.call(note, "rest")) {
          currentMs += durationMs;
          beatIndex += durationBeats;
          return;
        }

        const pitch = note.pitch as XmlNode | undefined;
        const step = readString(pitch?.step);
        const octave = readNumber(pitch?.octave, Number.NaN);
        const alter = readNumber(pitch?.alter, 0);
        if (!step || !Number.isFinite(octave)) {
          if (!isChordTone) {
            currentMs += durationMs;
            beatIndex += durationBeats;
          }
          return;
        }

        const noteLabel = midiToNoteLabel(notePartsToMidi(step, alter, octave));
        const ties = tieTypes(note);
        expectedNotes.push({
          noteLabel,
          startMs: Math.max(0, noteStartMs),
          durationMs,
          measureNumber,
          beatIndex: Math.max(0, noteBeatIndex),
          beatInMeasure,
          subdivisionLabel: subdivisionLabelFromBeatPosition(noteBeatIndex % beatsPerMeasure),
          voice: readString(note.voice),
          staff: readString(note.staff),
          dynamic: currentDynamic,
          keySignature,
          timeSignature,
          tempoBpm,
          articulations: extractArticulations(note),
          ornaments: extractOrnaments(note),
          tied: ties.includes("start") || ties.includes("stop"),
          slurred: hasNotation(note, "slur"),
          chordTone: isChordTone
        });

        if (!isChordTone) {
          currentMs += durationMs;
          beatIndex += durationBeats;
        }
      });
    });
  });

  const mergedNotes = mergeTiedNotes(expectedNotes)
    .sort((a, b) => a.startMs - b.startMs || a.noteLabel.localeCompare(b.noteLabel))
    .slice(0, MAX_IMPORTED_NOTES);

  return {
    id: `musicxml-${Date.now()}`,
    name: fallbackName.replace(/\.(musicxml|xml)$/i, ""),
    sourceType: "musicxml",
    expectedNoteLabels: mergedNotes.map((note) => note.noteLabel),
    expectedNotes: mergedNotes
  };
}

function getMidiTrackEvents(track: unknown[]) {
  let ticks = 0;
  return track.map((event) => {
    const midiEvent = event as MidiEvent;
    ticks += readNumber(midiEvent.deltaTime, 0);
    return { event: midiEvent, ticks };
  });
}

function pickPrimaryMidiChannel(noteEvents: { channel: number | null; durationTicks: number }[]) {
  const scores = new Map<number, number>();
  noteEvents.forEach((event) => {
    if (event.channel === null) {
      return;
    }

    scores.set(event.channel, (scores.get(event.channel) ?? 0) + Math.max(1, event.durationTicks));
  });

  return Array.from(scores.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function parseMidiToTarget(bytes: Uint8Array, fallbackName: string): PracticeTarget {
  const parsed = parseMidi(bytes);
  const ticksPerBeat = parsed.header.ticksPerBeat ?? 480;
  const tempoEvents: { ticks: number; microsecondsPerBeat: number }[] = [{ ticks: 0, microsecondsPerBeat: 500000 }];
  const noteEvents: {
    startTicks: number;
    durationTicks: number;
    midi: number;
    channel: number | null;
    instrument: number | null;
  }[] = [];
  const currentInstrumentByChannel = new Map<number, number>();

  parsed.tracks.forEach((track) => {
    const activeNotes = new Map<string, { startTicks: number; midi: number; channel: number | null; instrument: number | null }>();
    const heldBySustain = new Map<string, { startTicks: number; midi: number; channel: number | null; instrument: number | null }>();
    const sustainDownByChannel = new Map<number, boolean>();

    getMidiTrackEvents(track).forEach(({ event, ticks }) => {
      if (event.type === "setTempo") {
        tempoEvents.push({
          ticks,
          microsecondsPerBeat: readNumber(event.microsecondsPerBeat, 500000)
        });
        return;
      }

      const channel = Number.isFinite(readNumber(event.channel, Number.NaN)) ? readNumber(event.channel) : null;
      if (event.type === "programChange" && channel !== null) {
        currentInstrumentByChannel.set(channel, readNumber(event.programNumber, 0));
        return;
      }

      if (event.type === "controller" && channel !== null && readNumber(event.controllerType, -1) === 64) {
        const sustainDown = readNumber(event.value, 0) >= 64;
        sustainDownByChannel.set(channel, sustainDown);
        if (!sustainDown) {
          Array.from(heldBySustain.entries()).forEach(([key, held]) => {
            if (held.channel !== channel) {
              return;
            }
            noteEvents.push({
              startTicks: held.startTicks,
              durationTicks: Math.max(1, ticks - held.startTicks),
              midi: held.midi,
              channel: held.channel,
              instrument: held.instrument
            });
            heldBySustain.delete(key);
          });
        }
        return;
      }

      const noteNumber = readNumber(event.noteNumber, Number.NaN);
      if (!Number.isFinite(noteNumber)) {
        return;
      }

      const key = `${channel ?? "track"}:${noteNumber}`;
      const velocity = readNumber(event.velocity, 0);
      if (event.type === "noteOn" && velocity > 0) {
        activeNotes.set(key, {
          startTicks: ticks,
          midi: noteNumber,
          channel,
          instrument: channel === null ? null : currentInstrumentByChannel.get(channel) ?? null
        });
        return;
      }

      if (event.type === "noteOff" || (event.type === "noteOn" && velocity === 0)) {
        const active = activeNotes.get(key);
        if (!active) {
          return;
        }
        activeNotes.delete(key);

        if (channel !== null && sustainDownByChannel.get(channel)) {
          heldBySustain.set(key, active);
          return;
        }

        noteEvents.push({
          startTicks: active.startTicks,
          durationTicks: Math.max(1, ticks - active.startTicks),
          midi: active.midi,
          channel: active.channel,
          instrument: active.instrument
        });
      }
    });
  });

  const primaryChannel = pickPrimaryMidiChannel(noteEvents);
  const filteredEvents = (primaryChannel === null ? noteEvents : noteEvents.filter((event) => event.channel === primaryChannel))
    .sort((a, b) => a.startTicks - b.startTicks || a.midi - b.midi)
    .slice(0, MAX_IMPORTED_NOTES);
  tempoEvents.sort((a, b) => a.ticks - b.ticks);

  function ticksToMs(ticks: number) {
    let elapsedMs = 0;
    let previousTicks = 0;
    let tempo = tempoEvents[0]!.microsecondsPerBeat;

    for (const event of tempoEvents.slice(1)) {
      if (event.ticks >= ticks) {
        break;
      }

      elapsedMs += (event.ticks - previousTicks) * tempo / ticksPerBeat / 1000;
      previousTicks = event.ticks;
      tempo = event.microsecondsPerBeat;
    }

    return Math.round(elapsedMs + (ticks - previousTicks) * tempo / ticksPerBeat / 1000);
  }

  const expectedNotes = filteredEvents.map((event) => {
    const startMs = ticksToMs(event.startTicks);
    const endMs = ticksToMs(event.startTicks + event.durationTicks);
    const beatIndex = event.startTicks / ticksPerBeat;
    return {
      noteLabel: midiToNoteLabel(event.midi),
      startMs,
      durationMs: Math.max(80, endMs - startMs),
      measureNumber: Math.floor(beatIndex / 4) + 1,
      beatIndex,
      beatInMeasure: Math.floor(beatIndex % 4) + 1,
      subdivisionLabel: subdivisionLabelFromBeatPosition(beatIndex % 4),
      channel: event.channel,
      instrument: event.instrument,
      chordTone: filteredEvents.some(
        (other) => other !== event && Math.abs(other.startTicks - event.startTicks) <= Math.max(1, ticksPerBeat * 0.03)
      )
    } satisfies ExpectedTargetNote;
  });

  return {
    id: `midi-${Date.now()}`,
    name: fallbackName.replace(/\.(mid|midi)$/i, ""),
    sourceType: "midi",
    expectedNoteLabels: expectedNotes.map((note) => note.noteLabel),
    expectedNotes
  };
}
