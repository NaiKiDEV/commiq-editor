export function TitleBar() {
  return (
    <div
      className="flex items-center h-9 bg-card border-b border-border select-none shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <span className="px-3 text-xs font-medium text-muted-foreground tracking-wide">
        Commiq Editor
      </span>
      {/* Spacer for Windows title bar overlay controls */}
      <div className="w-[138px] shrink-0 ml-auto" />
    </div>
  );
}
