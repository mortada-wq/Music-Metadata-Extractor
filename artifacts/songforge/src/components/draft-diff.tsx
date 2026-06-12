import { useState } from "react";
import { useCommitDraft } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetSongQueryKey, getListSongsQueryKey, getGetSongStatsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Check, X, ChevronDown, ChevronUp } from "lucide-react";
import type { Song, SongMetadata, ReanalyzeDraftResponse } from "@workspace/api-client-react";

interface DraftDiffProps {
  songId: number;
  response: ReanalyzeDraftResponse;
  onAccepted: (song: Song) => void;
  onDiscard: () => void;
}

type FieldChange =
  | { kind: "scalar"; label: string; oldVal: string; newVal: string; long: boolean }
  | { kind: "array"; label: string; removed: string[]; added: string[] }
  | { kind: "count"; label: string; oldCount: number; newCount: number };

function arrStr(a: string[] | null | undefined): string[] {
  return Array.isArray(a) ? a : [];
}

function diffStr(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim() !== (b ?? "").trim();
}

function diffArr(a: string[] | null | undefined, b: string[] | null | undefined): { removed: string[]; added: string[] } | null {
  const aSet = new Set(arrStr(a));
  const bSet = new Set(arrStr(b));
  const removed = arrStr(a).filter((x) => !bSet.has(x));
  const added = arrStr(b).filter((x) => !aSet.has(x));
  if (removed.length === 0 && added.length === 0) return null;
  return { removed, added };
}

function computeChanges(current: SongMetadata, draft: SongMetadata): FieldChange[] {
  const changes: FieldChange[] = [];

  const scalarFields: { key: keyof SongMetadata; label: string; long?: boolean }[] = [
    { key: "title", label: "Title" },
    { key: "singer", label: "Singer" },
    { key: "composer", label: "Composer" },
    { key: "era", label: "Era" },
    { key: "geography", label: "Geography" },
    { key: "dialect", label: "Dialect" },
    { key: "subject", label: "Subject" },
    { key: "history", label: "History", long: true },
    { key: "transcription", label: "Transcription", long: true },
    { key: "pronunciationNotes", label: "Pronunciation Notes", long: true },
    { key: "ornamentation", label: "Ornamentation", long: true },
  ];

  for (const { key, label, long } of scalarFields) {
    const oldVal = (current[key] as string | null | undefined) ?? "";
    const newVal = (draft[key] as string | null | undefined) ?? "";
    if (diffStr(oldVal, newVal)) {
      changes.push({ kind: "scalar", label, oldVal, newVal, long: !!long });
    }
  }

  const arrayFields: { key: keyof SongMetadata; label: string }[] = [
    { key: "instruments", label: "Instruments" },
    { key: "voices", label: "Voices" },
    { key: "relatedSubjects", label: "Related Subjects" },
    { key: "relatedWorks", label: "Related Works" },
    { key: "maqamat", label: "Maqamat" },
    { key: "iqaat", label: "Iqa'at" },
  ];

  for (const { key, label } of arrayFields) {
    const diff = diffArr(current[key] as string[], draft[key] as string[]);
    if (diff) {
      changes.push({ kind: "array", label, ...diff });
    }
  }

  const oldTrack = arrStr(current.track as unknown as string[]).length || (current.track?.length ?? 0);
  const newTrack = arrStr(draft.track as unknown as string[]).length || (draft.track?.length ?? 0);
  if (oldTrack !== newTrack) {
    changes.push({ kind: "count", label: "Track Segments", oldCount: oldTrack, newCount: newTrack });
  }

  return changes;
}

function LongField({ label, oldVal, newVal }: { label: string; oldVal: string; newVal: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-border/40 overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">changed</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </button>
      {expanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/30">
          <div className="p-3 bg-red-500/5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-red-500/70 mb-1.5">Current</p>
            <p className="text-xs text-foreground/70 whitespace-pre-wrap leading-relaxed">{oldVal || "(empty)"}</p>
          </div>
          <div className="p-3 bg-green-500/5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-green-500/70 mb-1.5">Draft</p>
            <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{newVal || "(empty)"}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function DraftDiff({ songId, response, onAccepted, onDiscard }: DraftDiffProps) {
  const { current, draft, generationNote } = response;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const changes = computeChanges(current.metadata, draft);

  const commitDraft = useCommitDraft({
    mutation: {
      onSuccess: (song) => {
        queryClient.setQueryData(getGetSongQueryKey(songId), song);
        queryClient.invalidateQueries({ queryKey: getListSongsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSongStatsQueryKey() });
        toast({ title: "Draft accepted — dossier updated." });
        onAccepted(song);
      },
      onError: () => {
        toast({ title: "Failed to save the draft. Please try again.", variant: "destructive" });
      },
    },
  });

  function handleAccept() {
    commitDraft.mutate({
      id: songId,
      data: { metadata: draft, ...(generationNote ? { generationNote } : {}) },
    });
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 bg-amber-500/10 border-b border-amber-500/20">
        <div>
          <h3 className="font-semibold text-foreground text-sm">Draft ready for review</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {changes.length === 0
              ? "The new analysis is identical to the current dossier."
              : `${changes.length} field${changes.length === 1 ? "" : "s"} changed — review before accepting.`}
          </p>
          {generationNote && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{generationNote}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={onDiscard}
            disabled={commitDraft.isPending}
            className="rounded-full border-border/60 text-muted-foreground hover:text-foreground"
            data-testid="button-discard-draft"
          >
            <X className="w-3.5 h-3.5 mr-1.5" />
            Discard
          </Button>
          <Button
            size="sm"
            onClick={handleAccept}
            disabled={commitDraft.isPending}
            className="rounded-full bg-brand-blue hover:bg-brand-blue/90 text-white"
            data-testid="button-accept-draft"
          >
            <Check className="w-3.5 h-3.5 mr-1.5" />
            {commitDraft.isPending ? "Saving..." : "Accept"}
          </Button>
        </div>
      </div>

      {/* Diff body */}
      {changes.length > 0 && (
        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {changes.map((change) => {
            if (change.kind === "scalar" && change.long) {
              return (
                <LongField
                  key={change.label}
                  label={change.label}
                  oldVal={change.oldVal}
                  newVal={change.newVal}
                />
              );
            }

            if (change.kind === "scalar") {
              return (
                <div key={change.label} className="flex flex-col sm:flex-row sm:items-start gap-2 py-2 border-b border-border/20 last:border-0">
                  <span className="text-xs font-semibold text-muted-foreground w-28 shrink-0 pt-0.5">{change.label}</span>
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <span className="text-xs text-foreground/50 line-through break-words">{change.oldVal || "(empty)"}</span>
                    <span className="text-muted-foreground shrink-0">→</span>
                    <span className="text-xs text-foreground font-medium break-words">{change.newVal || "(empty)"}</span>
                  </div>
                </div>
              );
            }

            if (change.kind === "array") {
              return (
                <div key={change.label} className="flex flex-col sm:flex-row sm:items-start gap-2 py-2 border-b border-border/20 last:border-0">
                  <span className="text-xs font-semibold text-muted-foreground w-28 shrink-0 pt-0.5">{change.label}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {change.removed.map((item) => (
                      <span key={item} className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-500/80 dark:text-red-400 line-through">
                        {item}
                      </span>
                    ))}
                    {change.added.map((item) => (
                      <span key={item} className="text-xs px-2 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 font-medium">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              );
            }

            if (change.kind === "count") {
              return (
                <div key={change.label} className="flex flex-col sm:flex-row sm:items-start gap-2 py-2 border-b border-border/20 last:border-0">
                  <span className="text-xs font-semibold text-muted-foreground w-28 shrink-0">{change.label}</span>
                  <span className="text-xs text-foreground">
                    <span className="line-through text-foreground/50">{change.oldCount} segments</span>
                    {" → "}
                    <span className="font-medium">{change.newCount} segments</span>
                  </span>
                </div>
              );
            }

            return null;
          })}
        </div>
      )}

      {changes.length === 0 && (
        <div className="px-5 py-4 text-sm text-muted-foreground">
          The draft is identical to the current dossier. You can discard it or accept anyway.
        </div>
      )}
    </div>
  );
}
