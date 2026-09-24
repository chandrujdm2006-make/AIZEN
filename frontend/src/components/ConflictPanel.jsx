import React, { useState } from 'react';
import { 
  AlertTriangle, 
  ShieldCheck, 
  ArrowRight, 
  CheckCircle2, 
  XCircle,
  ExternalLink,
  Check,
  Zap,
  Ambulance,
  Truck,
  Stethoscope
} from 'lucide-react';

export default function ConflictPanel({ conflicts = [], onViewResolution }) {
  const [acknowledged, setAcknowledged] = useState(false);

  if (!conflicts || conflicts.length === 0 || acknowledged) {
    return (
      <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 backdrop-blur-md text-xs font-mono text-emerald-300 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>All resource tensions resolved deterministically.</span>
        </div>
        {acknowledged && (
          <button
            onClick={() => setAcknowledged(false)}
            className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
          >
            Show alerts
          </button>
        )}
      </div>
    );
  }

  // Find the primary contested resource conflict (e.g. ambulances)
  const primaryConflict = conflicts.find(c => c.conflict_type === 'contested_resource') || conflicts[0];

  return (
    <div className="p-4 rounded-xl border border-red-500/60 bg-gradient-to-b from-red-950/40 via-[#1E293B]/90 to-[#1E293B]/90 backdrop-blur-md shadow-xl space-y-3 glow-red">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-red-500/30 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-red-600/30 text-red-400 border border-red-500/50">
            <AlertTriangle className="w-4 h-4 animate-pulse" />
          </div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-rose-200 font-mono">
            Resource Conflict Detected
          </h2>
        </div>
        <span className="text-[10px] font-mono font-bold bg-red-700 text-white px-2 py-0.5 rounded-full animate-pulse">
          HIGH TENSION
        </span>
      </div>

      {/* Main Scarcity Metrics Callout */}
      <div className="bg-slate-950/80 border border-red-900/60 p-3 rounded-lg space-y-1">
        <div className="flex items-center gap-2 text-rose-300 font-mono font-bold text-xs">
          <Ambulance className="w-4 h-4 text-red-400" />
          <span>Ambulances: 4 Requested vs 3 Available in Pool</span>
        </div>
        <p className="text-[11px] text-slate-300">
          Severe casualty triage contention between high-severity flash flood sectors.
        </p>
      </div>

      {/* Affected Zones Breakdown */}
      <div className="space-y-1.5 text-xs font-mono">
        <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
          Affected Sectors & Solver Arbitration:
        </span>
        <div className="space-y-1 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between text-slate-200">
            <span>• Zone A (North Riverbank - 8 Critical)</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              2 units <CheckCircle2 className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-200">
            <span>• Zone D (Industrial South - 6 Critical)</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              1 unit <CheckCircle2 className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="flex items-center justify-between text-rose-300">
            <span>• Sector Deficit (Unmet Critical Transports)</span>
            <span className="text-red-400 font-bold flex items-center gap-1 bg-red-950 px-1.5 py-0.2 rounded border border-red-800/60">
              1 unit ✗ UNMET
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-1 gap-2">
        <button
          onClick={onViewResolution}
          className="flex-1 py-1.5 px-3 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/60 text-cyan-200 text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
        >
          <span>View Resolution Proof</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setAcknowledged(true)}
          className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-medium border border-slate-700 flex items-center gap-1 transition-all cursor-pointer"
        >
          <Check className="w-3.5 h-3.5 text-slate-400" />
          <span>Acknowledge</span>
        </button>
      </div>
    </div>
  );
}
