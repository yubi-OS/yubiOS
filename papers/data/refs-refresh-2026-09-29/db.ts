// Research DB: jev-weighted refs/ refresh sweep, 2026-09-29
// Raw data lives in archive.json + digs/*.json next to this file.
// Requires resolveJsonModule (tsconfig) to import the JSON artifacts.

export interface RefDoc {
  file: string; title: string; size_bytes: number; age_days: number | null;
  has_verification: boolean; has_recommendation: boolean;
  jev_needs_refresh_noul: number | null; jev_task_id: string | null;
  jev_cost_usd: string | null; jev_ts: string | null;
}

export interface SearchResult {
  title: string; url: string; engines: string[]; snippet: string;
  jev_quality_noul: number | null; jev_cost_usd: string | null;
}

export interface Dig { query: string; n_results: number | null; top: SearchResult[] }
export interface DocDig { doc: string; queries: Dig[] }

export const RUN_DATE = '2026-09-29';
export const JEV_MODEL = 'typesafe/jev-1.13-20260917';
export const N_DOCS_SCORED = 234;
export const N_RESULTS_WEIGHTED = 144;
export const NOUL_STATS = { min: 0.11, median: 0.4, max: 0.79, mean: 0.417 };
export const TOTAL_JEV_COST_USD = 0.045256;
export const DIG_DOCS: string[] = ["systemd-v262-audit-2026-07-14.md", "systemd-upstream-progress-2026-07-21.md", "bootc-dev-org-releases-2026-07-23.md", "arm64-rk-board-status-2026-07-17.md", "fedora-bootc-base-images-status-2026-07-23.md", "mkosi-bcvk-fork-status-2026-07-23.md", "arm64-path-a-b-board-status-2026-07-23.md", "post-quantum-tls-adoption-2026-07-23.md", "osbuild-image-builder-2026-07-23.md", "endlessh-openwrt-fit-2026-07-17.md", "frost-panfrost-lockout-2026-07-17.md", "systemd-hardening-audit-2026-07-17.md"];

// import archiveJson from './archive.json';
// import digJson from './digs/systemd-v262-audit-2026-07-14.json';
// Usage: load with resolveJsonModule, then cast: archiveJson.docs as RefDoc[]
