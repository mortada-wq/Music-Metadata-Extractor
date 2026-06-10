import { openai } from "@workspace/integrations-openai-ai-server";
import { GetSongResponse } from "@workspace/api-zod";
import type { SongMetadata } from "@workspace/db";
import { buildRealDataContext, type ExtractedSongData } from "./audioExtraction";

const SongMetadataSchema = GetSongResponse.shape.metadata;

const YOUTUBE_RE =
  /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)/i;

export function classifyInput(input: string): "youtube" | "name" {
  return YOUTUBE_RE.test(input) ? "youtube" : "name";
}

const SYSTEM_PROMPT = `You are an expert ethnomusicologist, musicologist, and linguist. You build a richly detailed knowledge base of songs to be used as RAG context for AI music generation systems — helping them produce accurate lyrics, melodies, dialects, and pronunciation.

You are given VERIFIED REAL DATA extracted from the actual recording before this call: source metadata from yt-dlp and a real, timestamped transcription (from captions or from transcribing the audio itself). This real data is GROUND TRUTH.

Strict rules:
- Treat the provided metadata (title, uploader/channel, duration, upload date) and the real timestamped transcription as factual. Do NOT contradict, override, or replace them with guesses.
- The "transcription" field MUST be the real lyrics from the provided transcription (preserve the original language and line structure). Do not substitute lyrics from memory when a real transcription is provided.
- The "track" breakdown MUST be built from the REAL timestamps and lyric segments provided. Group the real segments into musical sections (intro, verses, choruses, bridges, instrumental passages, outro). Each segment's "timestamp" must come from the real data; cover the song through to its real duration. Never invent timings that are not grounded in the provided data.
- Do NOT fabricate factual audio measurements. No stem separation was performed, so "instruments" and "voices" are your INFORMED INFERENCE from genre, era, tradition, and what is audible in the transcription context — keep them plausible, and do not present them as precise measurements.
- Your real job is INTERPRETATION and CULTURAL/MUSICOLOGICAL ANALYSIS: history, subject, dialect, pronunciation guidance, related subjects/works, and the interpretive musical notes per section.

Be specific and substantive:
- "history": several sentences on the cultural and historical background.
- "pronunciationNotes": concrete phonetic guidance for a non-native performer — how to pronounce tricky words/phonemes in the song's dialect, grounded in the real lyrics.
- "notes" within each track segment: key, tempo, mode, melodic motion, dynamics (interpretive).
- Arrays (relatedSubjects, instruments, voices, relatedWorks) should each contain multiple meaningful entries.
- Always return every field. If the transcription was unavailable, follow the instruction in the provided context and clearly avoid inventing exact timings.`;

function buildSchema() {
  const trackSegment = {
    type: "object",
    additionalProperties: false,
    properties: {
      timestamp: { type: "string" },
      label: { type: "string" },
      instruments: { type: "array", items: { type: "string" } },
      vocals: { type: "string" },
      notes: { type: "string" },
    },
    required: ["timestamp", "label", "instruments", "vocals", "notes"],
  };

  const stringArray = { type: "array", items: { type: "string" } };

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      singer: { type: "string" },
      composer: { type: "string" },
      era: { type: "string" },
      geography: { type: "string" },
      history: { type: "string" },
      subject: { type: "string" },
      relatedSubjects: stringArray,
      dialect: { type: "string" },
      instruments: stringArray,
      voices: stringArray,
      relatedWorks: stringArray,
      transcription: { type: "string" },
      pronunciationNotes: { type: "string" },
      track: { type: "array", items: trackSegment },
    },
    required: [
      "title",
      "singer",
      "composer",
      "era",
      "geography",
      "history",
      "subject",
      "relatedSubjects",
      "dialect",
      "instruments",
      "voices",
      "relatedWorks",
      "transcription",
      "pronunciationNotes",
      "track",
    ],
  };
}

export async function generateSongMetadata(
  input: string,
  inputType: "youtube" | "name",
  realData: ExtractedSongData,
): Promise<SongMetadata> {
  const identity =
    inputType === "youtube"
      ? `the song at this YouTube link: ${input}`
      : `the song the user named: "${input}"`;

  const userPrompt = `Produce the full musicological dossier for ${identity}.

Use the verified real data below as ground truth. Build the transcription and the interval-by-interval track breakdown from the real timestamped lyrics. Apply your expertise only for interpretation and cultural/musicological analysis.

${buildRealDataContext(realData)}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 8192,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "song_metadata",
        strict: true,
        schema: buildSchema(),
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from model");
  }

  return SongMetadataSchema.parse(JSON.parse(content)) as SongMetadata;
}
