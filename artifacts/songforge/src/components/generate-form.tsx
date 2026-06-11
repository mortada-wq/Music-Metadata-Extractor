import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGenerateSong, getListSongsQueryKey, getGetSongStatsQueryKey, ApiError } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Loader2, Music4, Link, Upload, Search, ImageIcon, FileText, Plus, X } from "lucide-react";
import { useLocation } from "wouter";

const LOADING_MESSAGES = [
  "Waking up the archivist...",
  "Analyzing audio frequencies...",
  "Extracting instrumental layers...",
  "Transcribing lyrics...",
  "Identifying dialect and pronunciation...",
  "Drafting historical context...",
  "Structuring metadata...",
  "Finalizing dossier...",
];

type InputKind = "text" | "url" | "file" | "textarea";

type SubOption = {
  id: string;
  label: string;
  icon: React.ReactNode;
  inputKind: InputKind;
  placeholder?: string;
  accept?: string;
};

type BuiltInMainTab = {
  kind: "builtin";
  id: "music" | "image" | "writing";
  label: string;
  icon: React.ReactNode;
  subOptions: SubOption[];
  live: boolean;
};

type CustomMainTab = {
  kind: "custom";
  id: string;
  label: string;
  inputKind: InputKind;
  outputDescription: string;
};

type MainTab = BuiltInMainTab | CustomMainTab;

const BUILTIN_TABS: BuiltInMainTab[] = [
  {
    kind: "builtin",
    id: "music",
    label: "Music",
    icon: <Music4 className="w-4 h-4" />,
    live: true,
    subOptions: [
      { id: "name", label: "Song Name", icon: <Search className="w-4 h-4" />, inputKind: "text", placeholder: "e.g. Enta Omri - Umm Kulthum" },
      { id: "link", label: "YouTube Link", icon: <Link className="w-4 h-4" />, inputKind: "url", placeholder: "https://youtube.com/watch?v=..." },
      { id: "upload", label: "Upload File", icon: <Upload className="w-4 h-4" />, inputKind: "file", accept: "audio/*,video/*,.mp3,.mp4,.m4a,.wav,.flac,.ogg,.aac,.mkv,.webm" },
    ],
  },
  {
    kind: "builtin",
    id: "image",
    label: "Image",
    icon: <ImageIcon className="w-4 h-4" />,
    live: false,
    subOptions: [
      { id: "upload-img", label: "Upload Image", icon: <Upload className="w-4 h-4" />, inputKind: "file", accept: "image/*" },
      { id: "img-url", label: "Image URL", icon: <Link className="w-4 h-4" />, inputKind: "url", placeholder: "https://..." },
      { id: "img-desc", label: "Describe", icon: <FileText className="w-4 h-4" />, inputKind: "textarea", placeholder: "Describe the image or artwork you want analyzed..." },
    ],
  },
  {
    kind: "builtin",
    id: "writing",
    label: "Writing",
    icon: <FileText className="w-4 h-4" />,
    live: false,
    subOptions: [
      { id: "paste-text", label: "Paste Text", icon: <FileText className="w-4 h-4" />, inputKind: "textarea", placeholder: "Paste the text, poem, or lyrics here..." },
      { id: "upload-doc", label: "Upload Document", icon: <Upload className="w-4 h-4" />, inputKind: "file", accept: ".txt,.pdf,.doc,.docx" },
      { id: "by-title", label: "By Title", icon: <Search className="w-4 h-4" />, inputKind: "text", placeholder: "e.g. The Waste Land - T.S. Eliot" },
    ],
  },
];

const CUSTOM_TABS_KEY = "damma_custom_tabs";

function loadCustomTabs(): CustomMainTab[] {
  try {
    const raw = localStorage.getItem(CUSTOM_TABS_KEY);
    return raw ? (JSON.parse(raw) as CustomMainTab[]) : [];
  } catch {
    return [];
  }
}

function saveCustomTabs(tabs: CustomMainTab[]) {
  localStorage.setItem(CUSTOM_TABS_KEY, JSON.stringify(tabs));
}

const INPUT_KIND_LABELS: Record<InputKind, string> = {
  text: "Short text",
  url: "URL / link",
  file: "File upload",
  textarea: "Long text",
};

export function GenerateForm() {
  const [activeMainId, setActiveMainId] = useState<string>("music");
  const [activeSubId, setActiveSubId] = useState<string>("name");
  const [textInput, setTextInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [customTabs, setCustomTabs] = useState<CustomMainTab[]>(loadCustomTabs);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [newTabInputKind, setNewTabInputKind] = useState<InputKind>("text");
  const [newTabOutput, setNewTabOutput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const allTabs: MainTab[] = [...BUILTIN_TABS, ...customTabs];
  const activeTab = allTabs.find((t) => t.id === activeMainId) ?? BUILTIN_TABS[0];

  const generateSong = useGenerateSong({
    mutation: {
      onSuccess: (song) => {
        queryClient.invalidateQueries({ queryKey: getListSongsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSongStatsQueryKey() });
        toast({
          title: "Dossier generated",
          description: song.generationNote
            ? song.generationNote
            : `Successfully cataloged "${song.title}".`,
        });
        setLocation(`/song/${song.id}`);
      },
      onError: (err) => {
        const serverMessage = (err as ApiError<{ error?: string }>).data?.error;
        toast({
          title: "Generation failed",
          description: serverMessage ?? "Could not process the song. Please verify the input and try again.",
          variant: "destructive",
        });
      },
    },
  });

  const isPending = generateSong.isPending || isUploading;

  useEffect(() => {
    if (!isPending) { setLoadingMsgIdx(0); return; }
    const interval = setInterval(() => {
      setLoadingMsgIdx((p) => Math.min(p + 1, LOADING_MESSAGES.length - 1));
    }, 4000);
    return () => clearInterval(interval);
  }, [isPending]);

  const switchMain = (id: string) => {
    setActiveMainId(id);
    setTextInput("");
    setFile(null);
    const tab = allTabs.find((t) => t.id === id);
    if (tab?.kind === "builtin") setActiveSubId(tab.subOptions[0].id);
    else setActiveSubId("custom");
  };

  const switchSub = (id: string) => {
    setActiveSubId(id);
    setTextInput("");
    setFile(null);
  };

  const currentSubOption = (): SubOption | null => {
    if (activeTab.kind !== "builtin") return null;
    return activeTab.subOptions.find((s) => s.id === activeSubId) ?? activeTab.subOptions[0];
  };

  const currentInputKind = (): InputKind => {
    if (activeTab.kind === "custom") return activeTab.inputKind;
    return currentSubOption()?.inputKind ?? "text";
  };

  const canSubmit = () => {
    if (isPending) return false;
    if (currentInputKind() === "file") return file !== null;
    return textInput.trim().length > 0;
  };

  const handleUploadMusic = async () => {
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/songs/upload", { method: "POST", body: formData });
      const data = await res.json() as { id?: number; title?: string; error?: string };
      if (!res.ok) {
        toast({ title: "Generation failed", description: data.error ?? "Could not process the file.", variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: getListSongsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetSongStatsQueryKey() });
      toast({ title: "Dossier generated", description: `Successfully cataloged "${data.title}".` });
      setLocation(`/song/${data.id}`);
    } catch {
      toast({ title: "Upload failed", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit()) return;
    if (activeTab.kind === "builtin" && activeTab.id === "music") {
      if (currentInputKind() === "file") handleUploadMusic();
      else generateSong.mutate({ data: { input: textInput.trim() } });
    } else {
      toast({ title: "Coming soon", description: `${activeTab.label} analysis is not yet available.` });
    }
  };

  const handleAddTab = () => {
    if (!newTabName.trim()) return;
    const tab: CustomMainTab = {
      kind: "custom",
      id: `custom_${Date.now()}`,
      label: newTabName.trim(),
      inputKind: newTabInputKind,
      outputDescription: newTabOutput.trim() || "Text analysis",
    };
    const updated = [...customTabs, tab];
    setCustomTabs(updated);
    saveCustomTabs(updated);
    setAddDialogOpen(false);
    setNewTabName("");
    setNewTabInputKind("text");
    setNewTabOutput("");
    switchMain(tab.id);
  };

  const handleDeleteCustomTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customTabs.filter((t) => t.id !== id);
    setCustomTabs(updated);
    saveCustomTabs(updated);
    if (activeMainId === id) switchMain("music");
  };

  const sub = currentSubOption();
  const inputKind = currentInputKind();
  const isLive = activeTab.kind === "builtin" ? activeTab.live : false;

  const descriptionText = () => {
    if (activeTab.kind === "custom") return `${activeTab.outputDescription} — powered by AI`;
    if (activeTab.id === "music") return "Search by name, paste a YouTube link, or upload an audio or video file.";
    if (activeTab.id === "image") return "Upload an image, paste a URL, or describe what you want analyzed.";
    return "Paste text, upload a document, or search by title.";
  };

  return (
    <>
      <div className="bg-card border border-border rounded-xl p-8 shadow-sm relative">
        <div className="relative z-10 max-w-2xl mx-auto">
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold text-foreground mb-2 tracking-tight">
              Catalog a New Work
            </h2>
            <p className="text-muted-foreground text-sm">{descriptionText()}</p>
          </div>

          {/* Main type tabs */}
          <div className="flex gap-1 p-1 bg-secondary rounded-lg mb-4">
            {allTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => switchMain(tab.id)}
                disabled={isPending}
                className={`relative flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all duration-150 min-w-0 ${
                  activeMainId === tab.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.kind === "builtin" ? tab.icon : <FileText className="w-4 h-4 shrink-0" />}
                <span className="truncate">{tab.label}</span>
                {tab.kind === "custom" && (
                  <span
                    role="button"
                    onClick={(e) => handleDeleteCustomTab(tab.id, e)}
                    className="ml-1 shrink-0 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive text-muted-foreground transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </span>
                )}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAddDialogOpen(true)}
              disabled={isPending}
              className="flex items-center justify-center w-9 shrink-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/60 transition-all duration-150"
              title="Add custom section"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Sub-option tabs (built-in tabs only) */}
          {activeTab.kind === "builtin" && (
            <div className="flex gap-2 mb-4">
              {activeTab.subOptions.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => switchSub(sub.id)}
                  disabled={isPending}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 ${
                    activeSubId === sub.id
                      ? "border-brand-blue/60 bg-brand-blue/10 text-brand-blue"
                      : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  {sub.icon}
                  {sub.label}
                </button>
              ))}
            </div>
          )}

          {/* Input area */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {inputKind === "file" ? (
              <div
                className="prompt-glow relative bg-secondary rounded-[15px] border border-dashed border-border cursor-pointer hover:border-brand-blue/50 transition-colors"
                onClick={() => !isPending && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={sub?.accept ?? "*"}
                  className="hidden"
                  disabled={isPending}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 text-center">
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  {file ? (
                    <>
                      <span className="text-sm font-medium text-foreground">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {(file.size / (1024 * 1024)).toFixed(1)} MB — click to change
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-medium text-foreground">Click to select a file</span>
                      <span className="text-xs text-muted-foreground">
                        {activeMainId === "music"
                          ? "MP3, MP4, M4A, WAV, FLAC, OGG, AAC — up to 200 MB"
                          : activeMainId === "image"
                          ? "JPG, PNG, WebP, GIF — any size"
                          : "TXT, PDF, DOC, DOCX"}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ) : inputKind === "textarea" ? (
              <div className="prompt-glow relative bg-secondary rounded-[15px]">
                <Textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder={sub?.placeholder ?? (activeTab.kind === "custom" ? `Enter ${activeTab.label.toLowerCase()} content...` : "Enter text...")}
                  className="min-h-[120px] px-4 py-4 text-base bg-transparent border-transparent rounded-[15px] focus-visible:ring-0 focus-visible:ring-offset-0 resize-none"
                  disabled={isPending}
                />
              </div>
            ) : (
              <div className="prompt-glow relative bg-secondary">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none z-10">
                  {inputKind === "url"
                    ? <Link className="h-5 w-5 text-muted-foreground" />
                    : <Search className="h-5 w-5 text-muted-foreground" />}
                </div>
                <Input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder={sub?.placeholder ?? (activeTab.kind === "custom" ? `Enter ${activeTab.label.toLowerCase()}...` : "Enter text...")}
                  className="pl-12 pr-4 py-6 text-base bg-transparent border-transparent rounded-[15px] focus-visible:ring-0 focus-visible:ring-offset-0"
                  disabled={isPending}
                  data-testid="input-song-generate"
                />
              </div>
            )}

            {isPending ? (
              <div className="h-12 flex items-center justify-center gap-3 text-brand-blue animate-pulse-slow">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="font-medium text-sm">{LOADING_MESSAGES[loadingMsgIdx]}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Button
                  type="submit"
                  size="lg"
                  className="w-full sm:w-auto self-center px-8 transition-transform duration-150 ease-out active:scale-[0.98]"
                  disabled={!canSubmit()}
                  data-testid="button-generate"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Dossier
                </Button>
                {!isLive && activeTab.kind !== "custom" && (
                  <p className="text-xs text-muted-foreground/60">
                    {activeTab.label} analysis — coming soon
                  </p>
                )}
                {activeTab.kind === "custom" && (
                  <p className="text-xs text-muted-foreground/60">
                    Custom module — coming soon
                  </p>
                )}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Add custom tab dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add custom section</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Section name</label>
              <Input
                value={newTabName}
                onChange={(e) => setNewTabName(e.target.value)}
                placeholder="e.g. Poetry, Film, Architecture..."
                onKeyDown={(e) => e.key === "Enter" && handleAddTab()}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Input type</label>
              <Select value={newTabInputKind} onValueChange={(v) => setNewTabInputKind(v as InputKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(INPUT_KIND_LABELS) as [InputKind, string][]).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Output description <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Input
                value={newTabOutput}
                onChange={(e) => setNewTabOutput(e.target.value)}
                placeholder="e.g. Historical analysis, lyric transcription..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddTab} disabled={!newTabName.trim()}>Add section</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
