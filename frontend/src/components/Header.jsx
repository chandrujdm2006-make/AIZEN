import React from 'react';
import { 
  ShieldAlert, 
  Cpu, 
  Play, 
  PlusCircle, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle,
  Lock,
  Layers
} from 'lucide-react';

export default function Header({
  scenario,
  currentPlan,
  diff,
  llmMode,
  isLoading,
  loadingStep,
  onGeneratePlan,
  onAddZoneE,
  onReset,
  onOpenApprovalModal,
}) {
  const isPlanApproved = currentPlan?.is_approved;

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 shadow-2xl">
      {/* Top Warning Banner */}
      <div className="bg-amber-950/70 border-b border-amber-500/30 px-4 py-1.5 flex items-center justify-between text-xs text-amber-200">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
          <span className="font-semibold tracking-wide uppercase text-amber-300">
            Decision Support System Only:
          </span>
          <span>
            Generative AI proposals are bounded by a deterministic solver. Human emergency commander must review and approve all operational dispatches.
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-slate-400">Problem HTH-GA-07</span>
          <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono text-[10px]">
            FastAPI + Vite
          </span>
        </div>
      </div>

      {/* Main Command Bar */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Title & Mode */}
        <div className="flex items-center gap-4">
          <div className="bg-blue-600/20 p-2.5 rounded-xl border border-blue-500/30 shadow-inner">
            <ShieldAlert className="w-7 h-7 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                DISASTER RESPONSE COORDINATOR
              </h1>
              {currentPlan && (
                <span className="bg-blue-950 text-blue-400 border border-blue-800 text-xs px-2 py-0.5 rounded-full font-mono font-semibold">
                  v{currentPlan.plan_version}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span>{scenario?.title || 'Metropolitan Emergency Scenario'}</span>
              <span>•</span>
              {/* LLM Status Badge */}
              <div className="flex items-center gap-1.5 bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700">
                <Cpu className={`w-3.5 h-3.5 ${llmMode === 'live_llm' ? 'text-emerald-400' : 'text-amber-400'}`} />
                <span className={`font-mono text-[11px] font-medium ${llmMode === 'live_llm' ? 'text-emerald-400' : 'text-amber-300'}`}>
                  {llmMode === 'live_llm' ? 'LIVE GEMINI 2.5' : 'FALLBACK ENGINE (DETERMINISTIC MOCK)'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Plan Status & Actions */}
        <div className="flex items-center gap-3">
          {/* Approval Status Pill */}
          {currentPlan && (
            <div className={`px-3 py-1.5 rounded-lg border text-xs flex items-center gap-2 ${
              isPlanApproved 
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' 
                : 'bg-amber-950/40 border-amber-500/30 text-amber-300'
            }`}>
              {isPlanApproved ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <div>
                    <div className="font-semibold">APPROVED by {currentPlan.approved_by}</div>
                    <div className="text-[10px] text-emerald-400/80">{currentPlan.approved_at}</div>
                  </div>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-amber-400" />
                  <div>
                    <div className="font-semibold">PENDING APPROVAL</div>
                    <div className="text-[10px] text-amber-400/70">Awaiting Commander Sign-off</div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={onGeneratePlan}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white font-medium px-3.5 py-2 rounded-lg text-xs flex items-center gap-2 shadow-lg shadow-blue-900/30 transition-all cursor-pointer"
              title="Execute Logistics, Medical, and Solver pipeline"
            >
              <Play className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? (loadingStep || 'Generating...') : 'Generate Plan'}</span>
            </button>

            <button
              onClick={onAddZoneE}
              disabled={isLoading || scenario?.zones?.some(z => z.id === 'zone_e')}
              className="bg-red-700 hover:bg-red-600 active:bg-red-800 disabled:opacity-40 text-white font-medium px-3.5 py-2 rounded-lg text-xs flex items-center gap-2 shadow-lg shadow-red-950/40 transition-all cursor-pointer"
              title="Simulate sudden flash flood dam breach in Zone E and dynamically re-plan"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Add Zone E (Flash Flood)</span>
            </button>

            {currentPlan && !isPlanApproved && (
              <button
                onClick={onOpenApprovalModal}
                disabled={isLoading}
                className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-medium px-3.5 py-2 rounded-lg text-xs flex items-center gap-2 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Approve Plan</span>
              </button>
            )}

            <button
              onClick={onReset}
              disabled={isLoading}
              className="bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-300 font-medium px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 border border-slate-700 transition-all cursor-pointer"
              title="Reset scenario to baseline (Zones A-D)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Re-plan Diff Banner */}
      {diff && (
        <div className="bg-gradient-to-r from-purple-950/90 via-indigo-950/90 to-purple-950/90 border-t border-purple-500/40 px-4 py-2 text-xs text-purple-200 shadow-md">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="bg-purple-600 text-white px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase flex items-center gap-1">
                <Layers className="w-3 h-3" />
                Dynamic Re-plan Diff (v{diff.old_version} → v{diff.new_version})
              </span>
              <span className="font-semibold text-white">
                Emergency Sector Added: {diff.newly_added_zones.map(z => z.toUpperCase()).join(', ')}
              </span>
              <span className="text-purple-300/80">•</span>
              <span className="text-purple-200">
                {diff.summary_of_changes?.slice(0, 2).join(' | ')}
              </span>
            </div>
            <div className="text-[11px] text-purple-300 font-mono">
              Highlighted table cells indicate reallocated resources
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
