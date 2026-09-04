import { ArrowDownRight, ArrowUpRight, CircleDot, Radio, ShieldCheck } from "lucide-react";

const marks = [
  { label: "MT5", x: "14%", y: "22%", color: "bg-[#c8102e]" },
  { label: "DHAN", x: "72%", y: "16%", color: "bg-[#c8102e]" },
  { label: "NSE", x: "80%", y: "70%", color: "bg-[#111111]" },
  { label: "TV", x: "18%", y: "76%", color: "bg-[#111111]" },
];

export function SignalGlobe() {
  return (
    <div data-orb className="relative mx-auto aspect-square w-[min(78vw,560px)]" aria-label="Aether signal network visualization">
      <div className="absolute inset-[12%] rounded-full bg-[#c8102e]/10 blur-3xl" aria-hidden />
      <div className="signal-globe absolute inset-[11%]" aria-hidden>
        {Array.from({ length: 11 }).map((_, index) => <span key={`longitude-${index}`} className="signal-globe__longitude" style={{ transform: `rotateY(${index * 16}deg)` }} />)}
        {Array.from({ length: 5 }).map((_, index) => <span key={`latitude-${index}`} className="signal-globe__latitude" style={{ transform: `rotateX(${(index - 2) * 20}deg)` }} />)}
        <span className="signal-globe__axis signal-globe__axis--one" />
        <span className="signal-globe__axis signal-globe__axis--two" />
        <span className="signal-globe__core" />
      </div>
      <div className="absolute inset-0" aria-hidden>
        {marks.map((mark, index) => <div key={mark.label} data-drift className="absolute flex items-center gap-2" style={{ left: mark.x, top: mark.y }}><span className={`size-2.5 rounded-full ${mark.color} ring-4 ring-[#f3f1ed]`} /><span className="font-mono text-[10px] font-medium tracking-[0.18em] text-black/60">{mark.label}</span>{index === 0 ? <ArrowUpRight className="size-3 text-[#c8102e]" /> : null}</div>)}
      </div>
      <div className="absolute bottom-[4%] left-1/2 w-[72%] -translate-x-1/2 border-t border-black/15 pt-3 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-black/45">Signal topology / live</div>
    </div>
  );
}

export function ConsolePreview() {
  const strategies = [["Astra / XAUUSD", "AUTO", "+2.14%"], ["Nifty Opening Range", "MANUAL", "+0.88%"], ["Mean Revert / USDJPY", "BY STRATEGY", "—"]];
  const signals = [["BUY", "NIFTY 50", "09:42:18"], ["EXIT", "XAUUSD", "09:36:04"], ["HOLD", "USDJPY", "09:31:47"]];
  return (
    <div data-tilt className="relative overflow-hidden border border-white/15 bg-[#111111] text-[#f3f1ed] shadow-[24px_28px_0_rgba(200,16,46,0.95)] [transform-style:preserve-3d]">
      <div className="grid grid-cols-[1fr_auto] border-b border-white/10 px-5 py-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">Monarch / operating picture</p><p className="mt-2 text-lg font-light tracking-[-0.04em]">Workspace: Northstar</p></div><div className="flex items-start gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#ff8a9c]"><span className="mt-1 size-2 rounded-full bg-[#c8102e]" />Live</div></div>
      <div className="grid grid-cols-3 divide-x divide-white/10 border-b border-white/10">{[["Open risk", "1.84%", "within guardrail"], ["Signals", "18", "today"], ["Net P&L", "+₹42,680", "this session"]].map(([label, value, note]) => <div key={label} className="px-4 py-5"><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/38">{label}</p><p className="mt-3 tabular-nums text-xl font-light tracking-[-0.04em]">{value}</p><p className="mt-1 text-[11px] text-white/45">{note}</p></div>)}</div>
      <div className="grid gap-0 md:grid-cols-[1.05fr_0.95fr]"><div className="border-b border-white/10 p-5 md:border-b-0 md:border-r"><div className="flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">Active strategies</p><span className="font-mono text-[10px] text-white/35">03 / 06</span></div><div className="mt-5 space-y-4">{strategies.map(([name, mode, result], index) => <div key={name} className="flex items-center justify-between gap-3 border-t border-white/10 pt-3"><div className="min-w-0"><p className="truncate text-sm text-white/85">{name}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-[0.15em] text-white/35">{mode}</p></div><span className={`font-mono text-xs tabular-nums ${index === 2 ? "text-white/35" : "text-[#ff8a9c]"}`}>{result}</span></div>)}</div></div><div className="p-5"><div className="flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">Signal log</p><Radio className="size-4 text-[#c8102e]" /></div><div className="mt-5 space-y-4">{signals.map(([action, symbol, time]) => <div key={`${action}-${symbol}`} className="flex items-center gap-3 border-t border-white/10 pt-3"><span className={`flex size-6 items-center justify-center border ${action === "BUY" ? "border-[#c8102e] text-[#ff8a9c]" : "border-white/15 text-white/50"}`}>{action === "BUY" ? <ArrowUpRight className="size-3" /> : action === "EXIT" ? <ArrowDownRight className="size-3" /> : <CircleDot className="size-3" />}</span><div className="min-w-0 flex-1"><p className="text-xs text-white/80">{symbol}</p><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">{action}</p></div><span className="font-mono text-[10px] tabular-nums text-white/35">{time}</span></div>)}</div><div className="mt-7 flex items-center gap-2 border-t border-white/10 pt-4 text-[11px] text-white/50"><ShieldCheck className="size-3.5 text-[#c8102e]" />Risk checks passed before dispatch</div></div></div>
    </div>
  );
}

export function RouteDiagram() {
  const steps = [["01", "Signal", "TradingView / webhook"], ["02", "Guard", "Cooldown + risk rules"], ["03", "Route", "Broker adapter"], ["04", "Record", "Position + audit trail"]];
  return (
    <div className="relative border border-black/15 bg-[#e9e6df] p-4 sm:p-6" data-tilt>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{steps.map(([number, title, detail], index) => <div key={number} className="relative min-h-[132px] border border-black/15 bg-[#f3f1ed] p-4" data-stagger-item><p className="font-mono text-[10px] tracking-[0.16em] text-black/40">{number}</p><p className="mt-8 text-base font-normal tracking-[-0.03em]">{title}</p><p className="mt-2 max-w-[18ch] text-xs leading-relaxed text-black/55">{detail}</p>{index < 3 ? <span className="absolute -right-2 top-1/2 hidden size-4 -translate-y-1/2 rotate-45 border-r border-t border-[#c8102e] bg-[#e9e6df] sm:block" /> : null}</div>)}</div>
      <svg className="pointer-events-none absolute left-[9%] right-[9%] top-1/2 hidden h-4 -translate-y-1/2 sm:block" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden><path data-route-path d="M0 6 C 18 -1, 28 13, 47 6 S 74 -1, 100 6" fill="none" stroke="#c8102e" strokeWidth="0.7" vectorEffect="non-scaling-stroke" /></svg>
    </div>
  );
}
