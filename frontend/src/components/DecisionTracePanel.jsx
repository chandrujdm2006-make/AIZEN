import React, { useState } from 'react';
import { History, CheckCircle, ChevronDown, ChevronUp, FileText, Cpu, ListOrdered } from 'lucide-react';

export default function DecisionTracePanel({ decisionTrace, allocations }) {
  const [showAllSteps, setShowAllSteps] = useState(false);

  if (!decisionTrace) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs text-slate-500 text-center py-6">
        No decision trace available. Generate a plan to view the step-by-step solver audit timeline.
      </div>
    );
  }

  const steps = decisionTrace.solver_steps || [];
  const visibleSteps = showAllSteps ? steps : steps.slice(0, 6);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Explainability & Decision Trace Audit
          </h2>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          {steps.length} Solver Execution Steps Recorded
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 1. Per-Zone Allocation Rationales */}
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-mono font-bold flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-blue-400" />
            Per-Sector Allocation Rationales:
          </div>
          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
            {allocations?.map((a) => (
              <div
                key={a.zone_id}
                className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-xs"
              >
                <div className="flex justify-between items-baseline mb-1">
                  <span className="font-bold text-white font-mono">{a.zone_name}</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Priority Rank #{a.priority_rank} ({a.priority_score.toFixed(1)})
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                  {a.rationale || "Demand satisfied via standard priority allocation."}
                </p>
                <div className="mt-1 pt-1 border-t border-slate-800/80 text-[10px] font-mono text-cyan-300/80 flex flex-wrap gap-2">
                  <span>Ambulances: {a.ambulances.allocated}/{a.ambulances.requested}</span>
                  <span>Vehicles: {a.evacuation_vehicles.allocated}/{a.evacuation_vehicles.requested}</span>
                  <span>Sheltered: {a.evacuees_sheltered}/{a.evacuees_sheltered + a.evacuees_unmet}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Chronological Solver Steps Timeline */}
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-mono font-bold flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ListOrdered className="w-3.5 h-3.5 text-emerald-400" />
              Chronological Solver Audit Trail:
            </div>
            {steps.length > 6 && (
              <button
                onClick={() => setShowAllSteps(!showAllSteps)}
                className="text-[10px] text-blue-400 hover:text-blue-300 font-mono flex items-center gap-0.5"
              >
                {showAllSteps ? 'Show Fewer' : `View All ${steps.length}`}
              </button>
            )}
          </div>

          <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
            {visibleSteps.map((step) => {
              const isPass1 = step.action_type.includes('PASS_1');
              const isPass2 = step.action_type.includes('PASS_2');
              const isUnmet = step.action_type.includes('UNMET');
              const isShelter = step.action_type.includes('SHELTER');

              let badgeColor = 'bg-slate-800 text-slate-300';
              if (isPass1) badgeColor = 'bg-rose-950 text-rose-300 border border-rose-800/60';
              if (isPass2) badgeColor = 'bg-blue-950 text-blue-300 border border-blue-800/60';
              if (isUnmet) badgeColor = 'bg-red-950 text-red-300 border border-red-800/60';
              if (isShelter) badgeColor = 'bg-emerald-950 text-emerald-300 border border-emerald-800/60';

              return (
                <div
                  key={step.step_number}
                  className="p-2 rounded bg-slate-950/60 border border-slate-800 text-[11px] flex items-start gap-2 font-mono"
                >
                  <span className="text-[9px] text-slate-500 shrink-0 mt-0.5">
                    #{step.step_number}
                  </span>
                  <div className="flex-1">
                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase mr-1.5 ${badgeColor}`}>
                      {step.action_type}
                    </span>
                    <span className="text-slate-300">{step.description}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
