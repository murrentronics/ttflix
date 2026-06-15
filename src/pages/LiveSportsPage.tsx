import { AppShell } from "@/components/AppShell";
import { LiveSportsRow } from "@/components/LiveSportsRow";
import { Radio } from "lucide-react";

export function LiveSportsPage() {
  return (
    <AppShell>
      <div className="pt-24 pb-10">
        <div className="flex items-center gap-3 px-4 pb-2 sm:px-8">
          <Radio className="h-6 w-6 text-red-500" style={{ animation: "livepulse 1.2s ease-in-out infinite" }} />
          <h1 className="text-2xl font-extrabold sm:text-3xl">Live Sports</h1>
        </div>
        <p className="px-4 pb-6 text-sm text-muted-foreground sm:px-8">
          Live and upcoming matches — tap any card to watch
        </p>
        <LiveSportsRow standalone />
      </div>
      <style>{`@keyframes livepulse { 0%,100%{opacity:1;} 50%{opacity:0.25;} }`}</style>
    </AppShell>
  );
}
