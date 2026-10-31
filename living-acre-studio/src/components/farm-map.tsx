"use client";

import { useMemo, useState } from "react";
import { LocateFixed } from "lucide-react";

export interface MapAsset {
  id: string;
  kind: string;
  name: string;
  subtitle: string;
  description: string;
  imagePath: string | null;
  spec: {
    position?: { x: number; y: number; w: number; h: number };
    dimensions?: Record<string, number>;
    identityTokens?: string[];
    palette?: string[];
    materials?: string[];
    markings?: string;
    breed?: string;
    notes?: string;
  } | null;
}

const ZONE_STYLE: Record<string, { fill: string; stroke: string; label: string }> = {
  "loc-farmhouse": { fill: "#c96a45", stroke: "#e8a33d", label: "FARMHOUSE" },
  "loc-goshala": { fill: "#cdb37e", stroke: "#e8d9ab", label: "GOSHALA" },
  "loc-vegbeds": { fill: "#5b7c4a", stroke: "#8fae6a", label: "VEGETABLE BEDS" },
  "loc-orchard": { fill: "#47603a", stroke: "#7c9a5d", label: "ORCHARD" },
  "loc-pond": { fill: "#3e6d85", stroke: "#7ba3b5", label: "POND" },
  "loc-compost": { fill: "#6e4a2f", stroke: "#a5793f", label: "COMPOST" },
};

export function FarmMap({ assets }: { assets: MapAsset[] }) {
  const zones = useMemo(
    () => assets.filter((a) => a.kind === "location" && a.spec?.position && a.id !== "loc-boundary"),
    [assets],
  );
  const [sel, setSel] = useState<MapAsset | null>(
    () => assets.find((a) => a.id === "loc-goshala") ?? null,
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
      <div className="card-surface grain relative overflow-hidden p-4">
        <svg viewBox="-6 -6 112 112" className="relative z-[2] w-full rounded-xl" role="img" aria-label="Map of The Living Acre">
          <defs>
            <pattern id="rows" width="3.4" height="3.4" patternUnits="userSpaceOnUse" patternTransform="rotate(24)">
              <rect width="3.4" height="3.4" fill="transparent" />
              <line x1="0" y1="0" x2="0" y2="3.4" stroke="#0d0b09" strokeWidth="1.1" opacity="0.5" />
            </pattern>
          </defs>
          {/* the acre */}
          <rect x="0" y="0" width="100" height="100" rx="2.5" fill="#241c12" stroke="#4a3d2c" strokeWidth="0.7" strokeDasharray="2.4 1.6" />
          {/* path */}
          <path
            d="M 16 19 C 26 26, 40 22, 44 20 S 38 42, 30 48 S 44 66, 70 70"
            fill="none" stroke="#8a6f4d" strokeWidth="3.2" strokeLinecap="round" opacity="0.85"
          />
          {zones.map((z) => {
            const p = z.spec!.position!;
            const st = ZONE_STYLE[z.id] ?? { fill: "#3a3025", stroke: "#6f6454", label: z.name.toUpperCase() };
            const active = sel?.id === z.id;
            if (z.id === "loc-pond")
              return (
                <g key={z.id} onClick={() => setSel(z)} className="cursor-pointer">
                  <ellipse cx={p.x + p.w / 2} cy={p.y + p.h / 2} rx={p.w / 2 + (active ? 1.2 : 0)} ry={p.h / 2 + (active ? 1.2 : 0)} fill={st.fill} stroke={st.stroke} strokeWidth={active ? 1.1 : 0.55} opacity={0.92} />
                  <FLabel x={p.x + p.w / 2} y={p.y + p.h / 2} text={st.label} active={active} />
                </g>
              );
            return (
              <g key={z.id} onClick={() => setSel(z)} className="cursor-pointer">
                <rect
                  x={p.x - (active ? 0.6 : 0)} y={p.y - (active ? 0.6 : 0)}
                  width={p.w + (active ? 1.2 : 0)} height={p.h + (active ? 1.2 : 0)}
                  rx="1.6" fill={st.fill} stroke={st.stroke} strokeWidth={active ? 1.1 : 0.55} opacity={0.95}
                />
                {z.id === "loc-vegbeds" && (
                  <rect x={p.x + 2} y={p.y + 2} width={p.w - 4} height={p.h - 4} rx="1.2" fill="url(#rows)" opacity="0.8" />
                )}
                {z.id === "loc-orchard" &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <circle key={i} cx={p.x + 7 + (i % 3) * 10} cy={p.y + 8 + Math.floor(i / 3) * 12} r="2.6" fill="#2f4426" stroke="#7c9a5d" strokeWidth="0.5" />
                  ))}
                <FLabel x={p.x + p.w / 2} y={p.y + p.h / 2} text={st.label} active={active} />
              </g>
            );
          })}
          {/* gate + compass + scale */}
          <rect x="0" y="44" width="2.6" height="10" fill="#e8a33d" />
          <text x="4.2" y="51" fontSize="3" fill="#e8a33d" fontFamily="monospace">GATE</text>
          <g transform="translate(92,11)">
            <circle r="5" fill="#171310" stroke="#4a3d2c" strokeWidth="0.5" />
            <path d="M0,-3.4 L1.4,2 L0,1 L-1.4,2 Z" fill="#e8a33d" />
            <text y="-6.4" textAnchor="middle" fontSize="3" fill="#cfc4ab" fontFamily="monospace">N</text>
          </g>
          <g transform="translate(4,94)">
            <line x1="0" y1="0" x2="23.9" y2="0" stroke="#cfc4ab" strokeWidth="0.5" />
            <line x1="0" y1="-1" x2="0" y2="1" stroke="#cfc4ab" strokeWidth="0.5" />
            <line x1="23.9" y1="-1" x2="23.9" y2="1" stroke="#cfc4ab" strokeWidth="0.5" />
            <text x="12" y="4" textAnchor="middle" fontSize="3" fill="#9c8f78" fontFamily="monospace">50 FT</text>
          </g>
        </svg>
        <div className="relative z-[2] mt-3 flex flex-wrap items-center justify-between gap-2 px-1 font-mono text-[10.5px] text-faint">
          <span>209 FT × 208.3 FT — 43,560 SQ FT EXACTLY</span>
          <span className="flex items-center gap-1.5"><LocateFixed className="h-3.5 w-3.5 text-amber" /> fixed canon · never silently moved</span>
        </div>
      </div>

      {/* detail panel */}
      <div className="card-surface rise-in p-5">
        {sel ? (
          <>
            <div className="eyebrow mb-2">map zone</div>
            <h3 className="font-display text-2xl font-semibold text-cream">{sel.name}</h3>
            <p className="mt-1 text-[12.5px] italic text-amber/80">{sel.subtitle}</p>
            {sel.imagePath && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sel.imagePath} alt={sel.name} className="mt-4 aspect-[16/10] w-full rounded-xl border hairline object-cover" />
            )}
            <p className="mt-4 text-[13px] leading-relaxed text-muted">{sel.description}</p>
            {sel.spec?.dimensions && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {Object.entries(sel.spec.dimensions).map(([k, v]) => (
                  <div key={k} className="rounded-lg border hairline bg-ink/50 px-3 py-2">
                    <div className="eyebrow text-[9px]">{k.replace(/([A-Z]|Ft$)/g, " $&").trim()}</div>
                    <div className="font-mono mt-0.5 text-sm text-cream">{v}</div>
                  </div>
                ))}
              </div>
            )}
            {sel.spec?.identityTokens && sel.spec.identityTokens.length > 0 && (
              <div className="mt-4">
                <div className="eyebrow mb-2 text-[9px]">generation identity tokens</div>
                <div className="flex flex-wrap gap-1.5">
                  {sel.spec.identityTokens.map((t) => (
                    <span key={t} className="rounded-md border hairline bg-raise px-2 py-1 font-mono text-[10.5px] text-straw">{t}</span>
                  ))}
                </div>
              </div>
            )}
            {sel.spec?.notes && <p className="mt-4 border-l-2 border-amber/50 pl-3 text-[12px] leading-relaxed text-muted">{sel.spec.notes}</p>}
          </>
        ) : (
          <p className="text-sm text-muted">Select a zone on the map.</p>
        )}
      </div>
    </div>
  );
}

function FLabel({ x, y, text, active }: { x: number; y: number; text: string; active: boolean }) {
  return (
    <text
      x={x} y={y + 1} textAnchor="middle" fontSize="3.1"
      fontFamily="monospace" letterSpacing="0.6"
      fill={active ? "#12100e" : "#f1ead9"}
      stroke={active ? "none" : "#12100e"} strokeWidth="0.14" paintOrder="stroke"
      fontWeight="700"
    >
      {text}
    </text>
  );
}
