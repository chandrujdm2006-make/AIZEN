import React from 'react';
import { AlertTriangle, ShieldCheck, Flame, ArrowRight, Zap, CheckCircle2 } from 'lucide-react';

export default function ConflictPanel({ conflicts }) {
  if (!conflicts || conflicts.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs text-slate-500 text-center py-6">
        No active resource conflicts detected. Generate a plan to run the automated conflict resolution engine.
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Conflict Resolution Layer ({conflicts.length} Resolved)
          </h2>
        </div>
        <span className="text-[11px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded font-mono flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Deterministic Solver Arbitration
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {conflicts.map((conflict) => {
          const isAmbulanceConflict = conflict.resource_type === 'ambulances';
          const isRoadConflict = conflict.resource_type === 'road';
          const isShelterConflict = conflict.resource_type === 'shelter';

          return (
            <div
              key={conflict.id}
              className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                isAmbulanceConflict
                  ? 'bg-rose-950/20 border-rose-500/50 shadow-sm shadow-rose-950/30'
                  : isShelterConflict
                  ? 'bg-amber-950/20 border-amber-500/40'
                  : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <div>
                {/* Badge & Title */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                    isAmbulanceConflict
                      ? 'bg-rose-900/60 text-rose-300 border border-rose-700/60'
                      : isShelterConflict
                      ? 'bg-amber-900/60 text-amber-300 border border-amber-700/60'
                      : 'bg-blue-900/60 text-blue-300 border border-blue-700/60'
                  }`}>
                    {conflict.conflict_type.replace('_', ' ')}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    ID: {conflict.id}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-200 font-medium mb-2.5">
                  {conflict.description}
                </p>

                {/* Demand vs Supply Metric Bar */}
                {!isRoadConflict && (
                  <div className="bg-slate-900/90 border border-slate-800 p-2 rounded-lg flex items-center justify-between text-xs font-mono mb-2.5">
                    <span className="text-rose-400">Demand: {Math.round(conflict.total_demand)} units</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-emerald-400">Supply: {Math.round(conflict.total_supply)} units</span>
                    <span className="text-red-400 font-bold">
                      Deficit: -{Math.round(conflict.total_demand - conflict.total_supply)}
                    </span>
                  </div>
                )}
              </div>

              {/* Resolution Rationale */}
              {conflict.resolution_rationale && (
                <div className="bg-slate-900/80 border-t border-slate-800/80 pt-2 text-[11px] text-slate-300">
                  <div className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1 mb-0.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Solver Outcome & Rationale:
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    {conflict.resolution_rationale}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
