import { useState } from "react";
import { Lock, GitFork, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShamirTool } from "./ShamirTool";
import { XorSplitTool } from "./XorSplitTool";
import { AesGcmTool } from "./AesGcmTool";

const ALGORITHMS = [
  {
    id: "aes-gcm" as const,
    label: "AES-256-GCM",
    shortLabel: "AES",
    icon: Lock,
    description: "Password-based symmetric encryption",
    color: "text-blue-400",
    activeBg: "bg-blue-500/10",
    activeBorder: "border-blue-500/40",
  },
  {
    id: "shamir" as const,
    label: "Shamir SSS",
    shortLabel: "SSS",
    icon: GitFork,
    description: "K-of-N threshold secret sharing",
    color: "text-violet-400",
    activeBg: "bg-violet-500/10",
    activeBorder: "border-violet-500/40",
  },
  {
    id: "xor" as const,
    label: "XOR Split",
    shortLabel: "XOR",
    icon: Zap,
    description: "N-of-N random one-time pad split",
    color: "text-amber-400",
    activeBg: "bg-amber-500/10",
    activeBorder: "border-amber-500/40",
  },
] as const;

type AlgoId = (typeof ALGORITHMS)[number]["id"];

export function SecretSharingPanel({ panelId: _panelId }: { panelId: string }) {
  const [algo, setAlgo] = useState<AlgoId>("aes-gcm");
  const active = ALGORITHMS.find((a) => a.id === algo)!;

  return (
    <div className="flex h-full bg-background text-foreground text-sm overflow-hidden">
      {/* Sidebar */}
      <div className="w-40 shrink-0 flex flex-col gap-2 p-2 border-r border-border overflow-y-auto">
        <p className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold select-none">
          Algorithm
        </p>
        {ALGORITHMS.map((a) => {
          const Icon = a.icon;
          const isActive = algo === a.id;
          return (
            <button
              key={a.id}
              onClick={() => setAlgo(a.id)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg px-2.5 py-2 text-left transition-all duration-150",
                "border",
                isActive
                  ? [a.activeBg, a.activeBorder]
                  : "border-transparent hover:bg-muted/50",
              )}
            >
              <div className="flex items-center gap-1.5 w-full">
                <Icon
                  className={cn(
                    "size-3 shrink-0 transition-colors",
                    isActive ? a.color : "text-muted-foreground",
                  )}
                />
                <span
                  className={cn(
                    "text-xs font-semibold tracking-wide transition-colors",
                    isActive ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {a.shortLabel}
                </span>
              </div>
              <p className="text-[10px] leading-tight text-muted-foreground/70 pl-0.5">
                {a.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header strip */}
        <div
          className={cn(
            "flex items-center gap-2 px-4 py-2 border-b border-border shrink-0",
            active.activeBg,
          )}
        >
          <active.icon className={cn("size-3.5", active.color)} />
          <span className="text-xs font-semibold text-foreground">
            {active.label}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {active.description}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          {algo === "aes-gcm" && <AesGcmTool />}
          {algo === "shamir" && <ShamirTool />}
          {algo === "xor" && <XorSplitTool />}
        </div>
      </div>
    </div>
  );
}
