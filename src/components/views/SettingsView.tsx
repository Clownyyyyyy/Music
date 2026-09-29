"use client";

/**
 * Settings — Playback, Data & streaming, Privacy, Appearance (spec).
 * Audio-DSP options (EQ/mono/normalization/crossfade/output device) are not
 * available with cross-origin YouTube streaming and are intentionally absent.
 */
import { useState } from "react";
import { useSettings, ALLOWED_PLAYBACK_RATES } from "@/store/settings-store";
import { useProfile, useClearHistory } from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Volume2, Wifi, ShieldCheck, Keyboard } from "lucide-react";
import { ShortcutsDialog } from "@/components/shared/ShortcutsDialog";
import { useQueryClient } from "@tanstack/react-query";

export function SettingsView() {
  const s = useSettings();
  const { data: profile } = useProfile();
  const clear = useClearHistory();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl space-y-10 pb-20">
      <header>
        <h1 className="font-display text-2xl md:text-3xl font-extrabold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Playback, data, privacy and appearance.</p>
      </header>

      {/* ---------------------------- playback ---------------------------- */}
      <Section icon={<Volume2 className="w-4 h-4" />} title="Playback">
        <div className="space-y-5">
          <Row label="Default playback speed" hint="Snapped to speeds YouTube supports">
            <Select
              value={String(ALLOWED_PLAYBACK_RATES.reduce((a, b) => (Math.abs(b - s.defaultSpeed) < Math.abs(a - s.defaultSpeed) ? b : a)))}
              onValueChange={(v) => s.set("defaultSpeed", Number(v))}
            >
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALLOWED_PLAYBACK_RATES.map((r) => (
                  <SelectItem key={r} value={String(r)}>{r}×</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <SwitchRow
            label="Preload next track"
            hint="Load upcoming songs in advance for instant switching"
            checked={s.gapless}
            onChange={(v) => s.set("gapless", v)}
          />
          <SwitchRow
            label="Autoplay"
            hint="Keep the music going with real YouTube Music radio after your queue ends"
            checked={s.autoplay}
            onChange={(v) => s.set("autoplay", v)}
          />
        </div>
      </Section>

      {/* ------------------------ streaming & data ------------------------ */}
      <Section icon={<Wifi className="w-4 h-4" />} title="Streaming & data">
        <div className="space-y-5">
          <Row label="Streaming quality" hint="Best-effort — YouTube adapts to your connection">
            <Select value={s.quality} onValueChange={(v) => s.set("quality", v as never)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Data saver</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <SwitchRow
            label="Data saver"
            hint="Lower-resolution thumbnails on metered connections"
            checked={s.dataSaver}
            onChange={(v) => s.set("dataSaver", v)}
          />
        </div>
      </Section>

      {/* ---------------------------- privacy ---------------------------- */}
      <Section icon={<ShieldCheck className="w-4 h-4" />} title="Privacy">
        <div className="space-y-5">
          <SwitchRow
            label="Save listening history"
            hint="Powers history, On Repeat and recommendations"
            checked={s.saveHistory}
            onChange={(v) => s.set("saveHistory", v)}
          />
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-bold">Clear listening history</div>
              <div className="text-xs text-muted-foreground">Removes all history entries</div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">Clear</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear listening history?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Your history powers recommendations. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      clear.mutate(undefined, { onSuccess: () => toast({ title: "History cleared" }) });
                      qc.invalidateQueries();
                    }}
                  >
                    Clear all
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {profile && (
            <p className="text-xs text-muted-foreground">
              {profile.counts.liked} liked · {profile.counts.playlists} playlists · {profile.counts.playedTracks} tracks played · {profile.counts.historyEntries} plays
            </p>
          )}
        </div>
      </Section>

      {/* ---------------------------- appearance ---------------------------- */}
      <Section icon={<Keyboard className="w-4 h-4" />} title="Appearance & shortcuts">
        <div className="space-y-5">
          <Row label="Theme" hint="Just black and white — pick your side">
            <div className="flex gap-1.5">
              {(["light", "dark", "system"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => s.set("theme", t)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-full text-xs font-bold capitalize",
                    s.theme === t ? "bg-foreground text-background" : "border border-border hover:bg-accent"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Keyboard shortcuts" hint="Press ? anywhere to view">
            <Button variant="outline" size="sm" onClick={() => setShortcutsOpen(true)}>View</Button>
          </Row>
        </div>
      </Section>

      <p className="text-[11px] text-muted-foreground leading-5">
        All music streams live from YouTube Music through the YouTube IFrame Player. Equalizer, mono
        audio, crossfade and output-device selection are unavailable because browsers cannot process
        cross-origin media with the Web Audio API.
      </p>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="flex items-center gap-2 font-display text-lg font-extrabold mb-4">
        <span className="text-muted-foreground">{icon}</span> {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-bold">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      {children}
    </div>
  );
}

function SwitchRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row label={label} hint={hint}>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </Row>
  );
}
