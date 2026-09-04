import type { ReactNode } from "react";
import { Activity, ArrowUpRight, Bot, CandlestickChart, Check, LockKeyhole, MousePointer2, Radio, ShieldCheck } from "lucide-react";

const brokers = [
  { code: "MT5", label: "FOREX", value: "+1.84%", color: "red" },
  { code: "DHAN", label: "OPTIONS", value: "NIFTY 50", color: "light" },
  { code: "NSE", label: "EQUITY", value: "12 POSITIONS", color: "light" },
];

function Monitor({ className, title, children, focus }: { className: string; title: string; children: ReactNode; focus: string }) {
  return (
    <div data-desk-focus={focus} className={`trading-desk__monitor ${className}`}>
      <div className="trading-desk__monitor-frame"><div className="trading-desk__monitor-screen"><div className="trading-desk__screen-chrome"><span>{title}</span><span><i />LIVE</span></div>{children}</div></div>
      <div className="trading-desk__monitor-neck" />
      <div className="trading-desk__monitor-foot" />
    </div>
  );
}

export function SignalRouter() {
  return (
    <div data-desk-scene className="trading-desk relative h-[min(94vh,900px)] min-h-[680px] w-full" aria-label="Interactive 3D trading desk showing Aether's signal, risk, broker, and position workflow">
      <div className="trading-desk__ambient" aria-hidden="true" />
      <div data-desk-camera className="trading-desk__camera">
        <div data-desk-world className="trading-desk__world">
          <div className="trading-desk__wall" data-desk-depth>
            <div className="trading-desk__wall-light" />
            <div className="trading-desk__wall-grid" />
            <span className="trading-desk__wall-label">AETHER / MONARCH / TRADING DESK</span>
          </div>
          <div className="trading-desk__desk-back" data-desk-depth><span>ONE OPERATING PICTURE</span><span>CONNECTED / 04 BROKERS</span></div>
          <Monitor className="trading-desk__monitor--left" title="AETHER / MARKET WATCH" focus="market">
            <div className="trading-desk__market-head"><span>MARKET WATCH</span><strong>NIFTY 50 <em>+1.84%</em></strong></div>
            <div className="trading-desk__chart"><span className="trading-desk__chart-line trading-desk__chart-line--one" /><span className="trading-desk__chart-line trading-desk__chart-line--two" /><span className="trading-desk__chart-dot" /></div>
            <div className="trading-desk__ticker"><span>BTCUSD&nbsp; 64,102</span><span>SPX&nbsp; 5,612</span><span>USDINR&nbsp; 83.94</span></div>
          </Monitor>
          <Monitor className="trading-desk__monitor--center" title="MONARCH / SIGNALS" focus="signal">
            <div className="trading-desk__signal-bar"><span className="trading-desk__signal-dot"><Radio className="size-3" /></span><span><b>01 / SIGNAL RECEIVED</b><small>TRADINGVIEW / WEBHOOK</small></span><time>12:04:32.881</time></div>
            <div className="trading-desk__signal-data"><div><span>STRATEGY</span><strong>ORB_BREAKOUT</strong></div><div><span>SYMBOL</span><strong>NIFTY 50</strong></div><div><span>SIDE</span><strong className="is-red">BUY</strong></div></div>
            <div className="trading-desk__screen-footer"><span><Activity className="size-3" />PAYLOAD PARSED</span><span>RISK CHECK PENDING</span></div>
          </Monitor>
          <Monitor className="trading-desk__monitor--right" title="AETHER / EXECUTION" focus="execution">
            <div className="trading-desk__execution-head"><span>RISK GUARD</span><strong><i />PASSED</strong></div>
            <div className="trading-desk__risk-ring"><span>0.42%</span><small>CALCULATED RISK</small></div>
            <div className="trading-desk__risk-list"><span><Check className="size-3" />COOLDOWN CLEAR</span><span><Check className="size-3" />ACCOUNT VERIFIED</span><span><Check className="size-3" />DAILY LIMIT CLEAR</span></div>
          </Monitor>
          <div className="trading-desk__arms" data-desk-depth><span /><span /><span /></div>
          <div data-desk-table className="trading-desk__table" data-desk-depth>
            <div className="trading-desk__table-top"><div className="trading-desk__table-grain" /><div className="trading-desk__table-line" /></div>
            <div className="trading-desk__table-edge" />
            <div className="trading-desk__keyboard"><div className="trading-desk__keyboard-display"><span>MONARCH / ROUTER</span><b>LIVE</b></div><div className="trading-desk__keys">{Array.from({ length: 42 }).map((_, index) => <i key={index} />)}</div></div>
            <div className="trading-desk__mouse"><MousePointer2 className="size-4" /></div>
            <div className="trading-desk__tablet"><div><span>POSITION RECORDED</span><strong>NIFTY 50 <em>BUY</em></strong><small><LockKeyhole className="size-3" />ATTACHED TO SIGNAL</small></div></div>
            <div className="trading-desk__phone"><div className="trading-desk__phone-screen"><span>MONARCH</span><strong>04</strong><small>POSITIONS</small></div></div>
          </div>
          <div className="trading-desk__support trading-desk__support--left" data-desk-depth><span className="trading-desk__support-column" /><span className="trading-desk__support-foot" /></div>
          <div className="trading-desk__support trading-desk__support--right" data-desk-depth><span className="trading-desk__support-column" /><span className="trading-desk__support-foot" /></div>
          <div className="trading-desk__cable-tray" data-desk-depth><span /><span /><span /></div>
          <div className="trading-desk__broker-rail" data-desk-depth>
            {brokers.map((broker) => <div key={broker.code} data-desk-broker className={`trading-desk__broker-card trading-desk__broker-card--${broker.color}`}><span className="trading-desk__broker-dot" /><span><b>{broker.code}</b><small>{broker.label}</small></span><strong>{broker.value}</strong></div>)}
          </div>
          <div data-desk-scan className="trading-desk__scan" aria-hidden="true" />
          <div data-desk-pulse className="trading-desk__pulse" aria-hidden="true"><span /></div>
          <div data-desk-route className="trading-desk__route-overlay"><svg viewBox="0 0 1000 600" fill="none" aria-hidden="true"><path className="trading-desk__route-ghost" d="M144 224 C 346 180 490 286 844 208" /><path className="trading-desk__route-path" data-desk-route-path d="M214 306 C 360 302 472 428 822 322" /><circle cx="214" cy="306" r="7" /><circle cx="822" cy="322" r="7" /></svg></div>
          <div data-desk-callout="signal" className="trading-desk__callout"><span className="trading-desk__callout-icon"><Radio className="size-4" /></span><span><b>01 / SIGNAL</b><small>Zoom to inspect the incoming trade</small></span></div>
          <div data-desk-callout="risk" className="trading-desk__callout"><span className="trading-desk__callout-icon"><ShieldCheck className="size-4" /></span><span><b>02 / RISK GUARD</b><small>Every order checked before it moves</small></span></div>
          <div data-desk-callout="route" className="trading-desk__callout"><span className="trading-desk__callout-icon"><ArrowUpRight className="size-4" /></span><span><b>03 / ROUTE</b><small>One signal, the right connected account</small></span></div>
        </div>
      </div>
      <div className="trading-desk__hud"><span><CandlestickChart className="size-3.5" />SCROLL TO NAVIGATE THE DESK</span><span><Bot className="size-3.5" />AETHER / MONARCH</span></div>
    </div>
  );
}
