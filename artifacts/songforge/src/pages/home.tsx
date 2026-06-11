import { useState } from "react";
import { useGetSongStats, useListSongs, useGetPublicProjects } from "@workspace/api-client-react";
import { GenerateForm } from "@/components/generate-form";
import { SongCard } from "@/components/song-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Library, Activity, FolderOpen, Globe, Download, X } from "lucide-react";
import { Link } from "wouter";

type FilterState = { kind: "maqam" | "iqa"; value: string } | null;

function extractMaqamName(entry: string): string {
  return (entry.split(" — ")[0] || entry).trim();
}

function songMatchesFilter(song: { metadata: { maqamat?: string[]; iqaat?: string[] } }, filter: FilterState): boolean {
  if (!filter) return true;
  if (filter.kind === "maqam") {
    return (song.metadata.maqamat ?? []).some(
      (m) => extractMaqamName(m) === filter.value
    );
  }
  return (song.metadata.iqaat ?? []).includes(filter.value);
}

export function Home() {
  const { data: stats, isLoading: statsLoading } = useGetSongStats();
  const { data: songs, isLoading: songsLoading } = useListSongs();
  const [filter, setFilter] = useState<FilterState>(null);

  function handleFilterClick(kind: "maqam" | "iqa", value: string) {
    setFilter((prev) =>
      prev && prev.kind === kind && prev.value === value ? null : { kind, value }
    );
  }

  const filteredSongs = songs
    ? songs.filter((s) => songMatchesFilter(s, filter))
    : [];

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col gap-8 min-w-0">
        <GenerateForm />

        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-border/50 pb-2">
            <h2 className="text-xl font-serif font-bold text-foreground flex items-center gap-2">
              <Library className="w-5 h-5 text-brand-blue" />
              Archive Library
            </h2>
            <div className="flex items-center gap-3">
              {filter && (
                <button
                  onClick={() => setFilter(null)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-3 h-3" />
                  Clear filter
                </button>
              )}
              <div className="text-sm font-medium text-muted-foreground">
                {songsLoading ? (
                  <Skeleton className="w-16 h-5" />
                ) : filter ? (
                  `${filteredSongs.length} of ${songs?.length || 0}`
                ) : (
                  `${songs?.length || 0} Entries`
                )}
              </div>
            </div>
          </div>

          {filter && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Filtered by:</span>
              <span className="inline-flex items-center gap-1.5 bg-brand-blue/10 text-brand-blue border border-brand-blue/30 rounded-full px-3 py-0.5 text-xs font-medium">
                {filter.kind === "maqam" ? "Maqam" : "Iqa'"}: {filter.value}
                <button onClick={() => setFilter(null)} className="hover:opacity-70 transition-opacity ml-0.5">
                  <X className="w-3 h-3" />
                </button>
              </span>
            </div>
          )}

          {songsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          ) : filteredSongs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredSongs.map((song, i) => (
                <SongCard
                  key={song.id}
                  song={song}
                  style={{ animationDelay: `${i * 50}ms` }}
                  className="animate-in-stagger"
                />
              ))}
            </div>
          ) : songs && songs.length > 0 ? (
            <div className="text-center py-20 px-4 border border-dashed border-border/60 rounded-xl bg-card/50">
              <p className="text-muted-foreground">No songs match this filter.</p>
              <button
                onClick={() => setFilter(null)}
                className="mt-3 text-sm text-brand-blue hover:underline"
              >
                Clear filter
              </button>
            </div>
          ) : (
            <div className="text-center py-20 px-4 border border-dashed border-border/60 rounded-xl bg-card/50">
              <p className="text-muted-foreground">The archive is empty. Begin by cataloging a song above.</p>
            </div>
          )}
        </div>
      </div>

      {/* Public Project Gallery */}
      <PublicGallery />

      {/* Sidebar Area */}
      <div className="lg:w-80 shrink-0 space-y-6">
        <div className="bg-card rounded-xl border border-border/60 p-6 shadow-sm sticky top-24">
          <h3 className="font-serif text-lg font-bold border-b border-border/40 pb-3 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand-blue" />
            Archive Stats
          </h3>

          {statsLoading ? (
            <div className="space-y-6">
              <Skeleton className="w-full h-16" />
              <Skeleton className="w-full h-16" />
              <Skeleton className="w-full h-16" />
            </div>
          ) : stats ? (
            <div className="space-y-6">
              <StatSection title="By Era" data={stats.byEra} />
              <StatSection title="By Geography" data={stats.byGeography} />
              <StatSection title="By Dialect" data={stats.byDialect} />
              {stats.byMaqam.length > 0 && (
                <FilterChipSection
                  title="Top Maqamat"
                  data={stats.byMaqam}
                  activeValue={filter?.kind === "maqam" ? filter.value : null}
                  onSelect={(value) => handleFilterClick("maqam", value)}
                />
              )}
              {stats.byIqa.length > 0 && (
                <FilterChipSection
                  title="Top Iqa'at"
                  data={stats.byIqa}
                  activeValue={filter?.kind === "iqa" ? filter.value : null}
                  onSelect={(value) => handleFilterClick("iqa", value)}
                />
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PublicGallery() {
  const { data: projects, isLoading } = useGetPublicProjects();
  if (isLoading) return null;
  if (!projects || projects.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-border/50 pb-2">
        <h2 className="text-xl font-serif font-bold text-foreground flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-brand-blue" />
          Public Projects
        </h2>
        <Link href="/projects">
          <span className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            My projects
          </span>
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {projects.map((project) => (
          <div
            key={project.id}
            className="rounded-xl border border-border bg-card p-4 space-y-2 hover:bg-secondary/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-foreground truncate">{project.title}</p>
              <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="capitalize">{project.category.replace("-", " ")}</span>
              <span>·</span>
              <span>{project.entryCount} entries</span>
            </div>
            {project.summary && (
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{project.summary}</p>
            )}
            <a
              href={`/api/projects/${project.id}/export`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-[11px] text-brand-blue hover:underline mt-1"
            >
              <Download className="w-3 h-3" />
              Export JSON
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatSection({ title, data }: { title: string; data: { label: string; count: number }[] }) {
  if (!data || data.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h4>
      <div className="space-y-2">
        {data.map((item) => (
          <div key={item.label} className="flex items-center justify-between text-sm">
            <span className="text-foreground truncate pr-2">{item.label}</span>
            <span className="bg-muted px-2 py-0.5 rounded-full text-xs font-medium text-muted-foreground">
              {item.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterChipSection({
  title,
  data,
  activeValue,
  onSelect,
}: {
  title: string;
  data: { label: string; count: number }[];
  activeValue: string | null;
  onSelect: (value: string) => void;
}) {
  if (!data || data.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h4>
      <div className="flex flex-wrap gap-1.5">
        {data.map((item) => {
          const isActive = activeValue === item.label;
          return (
            <button
              key={item.label}
              onClick={() => onSelect(item.label)}
              className={[
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors",
                isActive
                  ? "bg-brand-blue text-white border-brand-blue"
                  : "bg-muted text-muted-foreground border-transparent hover:border-brand-blue/40 hover:text-foreground",
              ].join(" ")}
            >
              {item.label}
              <span
                className={[
                  "rounded-full px-1 text-[10px]",
                  isActive ? "bg-white/20 text-white" : "bg-background text-muted-foreground",
                ].join(" ")}
              >
                {item.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
