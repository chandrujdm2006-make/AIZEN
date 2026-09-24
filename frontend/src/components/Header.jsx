import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Cpu, 
  Play, 
  PlusCircle, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle,
  Lock,
  Layers,
  Bell,
  Settings,
  User,
  Radio,
  Clock,
  Sparkles,
  Zap,
  Activity
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
  conflictCount = 0,
}) {
  const isPlanApproved = currentPlan?.is_approved;
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <header className="sticky top-0 z-40 h-20 bg-[#0F172A]/90 backdrop-blur-md border-b border-[#334155]/80 shadow-lg px-6 flex items-center justify-between transition-all">
      {/* LEFT: Logo + System Name + Badge */}
      <div className="flex items-center gap-3.5">
        <div className="relative group">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 text-white shadow-md shadow-blue-500/25 group-hover:scale-105 transition-transform">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-[#0F172A] rounded-full animate-pulse" />
        </div>

        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-xl font-black tracking-tight text-white font-mono">
              AIZEN
            </span>
            <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 shadow-sm">
              v1.0
            </span>
            {currentPlan && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-950/80 text-blue-300 border border-blue-700/60">
                Plan v{currentPlan.plan_version}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 font-medium tracking-wide">
            Multi-Agent Disaster Response Command Center
          </p>
        </div>
      </div>

      {/* CENTER: Live Status Indicator */}
      <div className="hidden lg:flex items-center gap-3 bg-slate-900/80 border border-slate-700/70 px-4 py-2 rounded-2xl shadow-inner backdrop-blur-sm">
        {/* Pulsing indicator dot */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              isLoading ? 'bg-amber-400' : 'bg-emerald-400'
            }`} />
            <span className={`relative inline-flex rounded-full h-3 w-3 ${
              isLoading ? 'bg-amber-500' : 'bg-emerald-500'
            }`} />
          </span>
          <span className="text-xs font-bold text-white font-mono uppercase tracking-wider">
            {isLoading ? 'COORDINATING AGENTS...' : 'SYSTEM OPTIMAL'}
          </span>
        </div>

        <span className="text-slate-600">•</span>

        {/* Engine mode badge */}
        <div className="flex items-center gap-1.5 text-xs text-slate-300">
          <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-400">Mode:</span>
          <span className="font-semibold text-cyan-300 font-mono text-[11px]">
            {llmMode === 'live_llm' ? 'Live Gemini 2.5' : 'Deterministic Solver'}
          </span>
        </div>

        <span className="text-slate-600">•</span>

        {/* Last update clock */}
        <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
          <Clock className="w-3 h-3 text-slate-500" />
          <span>Updated: Just now</span>
        </div>
      </div>

      {/* RIGHT: Action Buttons + Commander Profile + Utilities */}
      <div className="flex items-center gap-3">
        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Add Zone E Button */}
          <button
            onClick={onAddZoneE}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs font-mono tracking-wide shadow-md shadow-amber-900/30 hover:shadow-amber-500/30 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Simulate Flash Flood Dam Breach in Sector E"
          >
            <PlusCircle className="w-4 h-4 animate-pulse" />
            <span>+ ADD ZONE E</span>
          </button>

          {/* Generate / Re-plan Button */}
          <button
            onClick={onGeneratePlan}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs font-mono tracking-wide shadow-md shadow-blue-900/40 hover:shadow-blue-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Run multi-agent arbitration pipeline"
          >
            <Zap className={`w-4 h-4 ${isLoading ? 'animate-spin' : 'text-cyan-300'}`} />
            <span>{isLoading ? 'SOLVING...' : 'GENERATE PLAN'}</span>
          </button>

          {/* Approve Plan Button */}
          {currentPlan && (
            <button
              onClick={onOpenApprovalModal}
              disabled={isPlanApproved || isLoading}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold font-mono tracking-wide flex items-center gap-1.5 transition-all cursor-pointer ${
                isPlanApproved
                  ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-300'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/30 hover:shadow-emerald-500/30 hover:-translate-y-0.5'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isPlanApproved ? 'APPROVED' : 'APPROVE'}</span>
            </button>
          )}

          {/* Reset Baseline Button */}
          <button
            onClick={onReset}
            disabled={isLoading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 transition-all cursor-pointer disabled:opacity-50"
            title="Reset scenario to baseline (Zones A-D)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Vertical Divider */}
        <div className="h-8 w-px bg-slate-800 hidden sm:block" />

        {/* Notifications Bell */}
        <div className="relative">
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 transition-all relative cursor-pointer"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {conflictCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-bounce">
                {conflictCount}
              </span>
            )}
          </button>

          {/* Notification dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 z-50 animate-fade-in text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 font-bold text-white">
                <span>Operational Alerts</span>
                <span className="text-[10px] text-cyan-400 font-mono">Live</span>
              </div>
              <div className="space-y-2">
                <div className="p-2 rounded-lg bg-red-950/40 border border-red-500/40 text-rose-200">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    Ambulance Tension
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    Zone A vs Zone D competing for limited ambulance pool (3 available).
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-blue-950/40 border border-blue-500/40 text-cyan-200">
                  <div className="font-semibold flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                    Database Agent
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    Telemetric state synchronized with SQLite ledger.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Commander Profile Pill */}
        <div className="flex items-center gap-2.5 bg-slate-900/90 border border-slate-800/90 px-3 py-1.5 rounded-xl">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold font-mono text-xs flex items-center justify-center shadow-inner">
            CS
          </div>
          <div className="hidden xl:block text-left">
            <div className="text-xs font-bold text-white leading-tight">Cmdr. Shepard</div>
            <div className="text-[10px] text-slate-400 font-mono">Incident Commander</div>
          </div>
        </div>
      </div>
    </header>
  );
}
