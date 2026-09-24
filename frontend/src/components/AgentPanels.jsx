import React, { useState } from 'react';
import { Truck, HeartPulse, Radio, AlertOctagon, ShieldAlert, Cpu } from 'lucide-react';

export default function AgentPanels({ logistics, medical, communication, agentModes }) {
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'logistics', 'medical', 'communication'

  if (!logistics && !medical && !communication) {
    return (
      <div className="bg-[#0D1322]/85 backdrop-blur-xl border border-[#212C44] rounded-xl p-4 text-xs text-slate-500 text-center py-6">
        Agent telemetry idle. Click "Generate Plan" to invoke Logistics, Medical, and Communication agents.
      </div>
    );
  }

  return (
    <div className="bg-[#0D1322]/85 backdrop-blur-xl border border-[#212C44] rounded-xl p-4 shadow-xl">
      {/* Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-purple-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
            Agent Intelligence Streams
          </h2>
        </div>

        <div className="flex items-center gap-1 bg-[#070A12] p-1 rounded-lg border border-[#1E2638] text-xs font-mono">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-2.5 py-1 rounded font-medium transition-all ${
              activeTab === 'all' ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold shadow-md shadow-violet-900/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            All Streams (3 Columns)
          </button>
          <button
            onClick={() => setActiveTab('logistics')}
            className={`px-2.5 py-1 rounded font-medium transition-all ${
              activeTab === 'logistics' ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold shadow-md shadow-violet-900/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            Logistics Agent
          </button>
          <button
            onClick={() => setActiveTab('medical')}
            className={`px-2.5 py-1 rounded font-medium transition-all ${
              activeTab === 'medical' ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold shadow-md shadow-violet-900/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            Medical Agent
          </button>
          <button
            onClick={() => setActiveTab('communication')}
            className={`px-2.5 py-1 rounded font-medium transition-all ${
              activeTab === 'communication' ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold shadow-md shadow-violet-900/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            Communication Agent
          </button>
        </div>
      </div>

      {/* Grid of Agent Panels */}
      <div className={`grid gap-4 ${
        activeTab === 'all' ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'
      }`}>
        {/* 1. Logistics Agent Panel */}
        {(activeTab === 'all' || activeTab === 'logistics') && (
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-blue-900/40 text-blue-400">
                    <Truck className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Logistics Agent
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-blue-300">
                  {agentModes?.logistics_agent || logistics?.mode || 'Active'}
                </span>
              </div>

              {/* Blocked Route Warnings */}
              {logistics?.blocked_route_warnings?.length > 0 && (
                <div className="mb-3 p-2 rounded bg-red-950/40 border border-red-800/40 text-[11px] text-red-300 space-y-1">
                  <div className="font-bold flex items-center gap-1 text-[10px] uppercase text-red-400">
                    <AlertOctagon className="w-3 h-3" />
                    Hazard Alert:
                  </div>
                  {logistics.blocked_route_warnings.map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                </div>
              )}

              {/* Zone Requests */}
              <div className="space-y-2">
                {logistics?.zone_requests?.map((zr) => (
                  <div key={zr.zone_id} className="p-2 rounded bg-slate-900/80 border border-slate-800/60 text-xs">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-bold text-slate-200 font-mono">{zr.zone_id.toUpperCase()}</span>
                      <span className="text-blue-300 font-mono font-semibold">
                        Req: {zr.requested_evac_vehicles} vehicles
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Destination: <span className="text-slate-300">{zr.preferred_shelter_id}</span> ({zr.estimated_travel_minutes} min)
                    </div>
                    {zr.is_alternate_route && (
                      <div className="text-[10px] text-amber-400 font-semibold mt-0.5">
                        ⚠️ Detour: {zr.route_node_path.join(' → ')}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-400 mt-1 italic">
                      "{zr.notes}"
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 2. Medical Agent Panel */}
        {(activeTab === 'all' || activeTab === 'medical') && (
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-rose-900/40 text-rose-400">
                    <HeartPulse className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Medical Agent
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-rose-300">
                  {agentModes?.medical_agent || medical?.mode || 'Active'}
                </span>
              </div>

              {/* Critical Triage Alerts */}
              {medical?.critical_triage_alerts?.length > 0 && (
                <div className="mb-3 p-2 rounded bg-rose-950/40 border border-rose-800/40 text-[11px] text-rose-300 space-y-1">
                  <div className="font-bold flex items-center gap-1 text-[10px] uppercase text-rose-400">
                    <ShieldAlert className="w-3 h-3" />
                    Triage Alert:
                  </div>
                  {medical.critical_triage_alerts.map((a, i) => (
                    <div key={i}>{a}</div>
                  ))}
                </div>
              )}

              {/* Zone Requests */}
              <div className="space-y-2">
                {medical?.zone_requests?.map((mr) => (
                  <div key={mr.zone_id} className="p-2 rounded bg-slate-900/80 border border-slate-800/60 text-xs">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-bold text-slate-200 font-mono">{mr.zone_id.toUpperCase()}</span>
                      <div className="space-x-2 font-mono text-[11px]">
                        <span className="text-rose-300 font-bold">{mr.requested_ambulances} amb</span>
                        <span className="text-emerald-300 font-bold">{mr.requested_medics} med</span>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-300">
                      Triage: {mr.triage_notes}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      Vulnerable: {mr.vulnerable_group_concerns}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 3. Communication Agent Panel */}
        {(activeTab === 'all' || activeTab === 'communication') && (
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-emerald-900/40 text-emerald-400">
                    <Radio className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Communication Agent
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-300">
                  {agentModes?.communication_agent || communication?.mode || 'Post-Solve'}
                </span>
              </div>

              {/* General Broadcast */}
              {communication?.general_broadcast_alert && (
                <div className="mb-3 p-2.5 rounded bg-blue-950/40 border border-blue-800/40 text-xs text-blue-200">
                  <div className="font-bold text-[10px] uppercase text-blue-300 tracking-wider mb-1">
                    Metropolitan Broadcast Alert:
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {communication.general_broadcast_alert}
                  </p>
                </div>
              )}

              {/* Zone Alerts Teaser */}
              <div className="space-y-2">
                <div className="text-[10px] text-slate-400 uppercase font-mono font-semibold">
                  Zone SMS Dispatches ({communication?.zone_alerts?.length || 0}):
                </div>
                {communication?.zone_alerts?.slice(0, 3).map((za) => (
                  <div key={za.zone_id} className="p-2 rounded bg-slate-900/80 border border-slate-800/60 text-xs">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-bold text-white font-mono">{za.zone_id.toUpperCase()}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded font-mono ${
                        za.urgency_level === 'CRITICAL' ? 'bg-red-950 text-red-300 border border-red-800' :
                        za.urgency_level === 'HIGH' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                        'bg-slate-800 text-slate-300'
                      }`}>
                        {za.urgency_level}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-snug">
                      "{za.sms_text}"
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
