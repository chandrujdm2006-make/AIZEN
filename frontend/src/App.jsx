import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Header from './components/Header';
import ResourceGauges from './components/ResourceGauges';
import Disaster3DMap from './components/Disaster3DMap';
import SvgMap from './components/SvgMap';
import PriorityList from './components/PriorityList';
import ConflictPanel from './components/ConflictPanel';
import AllocationTable from './components/AllocationTable';
import AgentPanels from './components/AgentPanels';
import DecisionTracePanel from './components/DecisionTracePanel';
import AlertsPanel from './components/AlertsPanel';
import ApprovalModal from './components/ApprovalModal';

import { 
  Bot, 
  Truck, 
  HeartPulse, 
  Radio, 
  AlertTriangle, 
  Zap, 
  Map, 
  Box, 
  PlusCircle, 
  Play, 
  RefreshCw,
  CheckCircle2,
  Activity
} from 'lucide-react';

export default function App() {
  const [scenario, setScenario] = useState(null);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [diff, setDiff] = useState(null);
  const [llmMode, setLlmMode] = useState('fallback_mock');
  const [selectedZoneId, setSelectedZoneId] = useState(null);

  // Map view toggle: '3D' (React Three Fiber) or '2D' (SVG vector)
  const [mapView, setMapView] = useState('3D');

  // Loading & Agent Orchestration Progress
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');

  // Approval Modal State
  const [isApprovalOpen, setIsApprovalOpen] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  // WebSocket Live Connection
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);

  // Initialize Data & WebSocket on Mount
  useEffect(() => {
    fetchInitialData();
    initWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const initWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setWsConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === 'CRITICAL_ZONE_ADDED' || msg.event === 'PLAN_GENERATED') {
            fetchLatestPlan();
          } else if (msg.event === 'SCENARIO_RESET') {
            fetchInitialData();
          }
        } catch (e) {
          // ignore non-json
        }
      };

      socket.onclose = () => {
        setWsConnected(false);
        // Try reconnecting after 3 seconds
        setTimeout(initWebSocket, 3000);
      };

      socket.onerror = () => {
        setWsConnected(false);
      };
    } catch (e) {
      console.warn('WebSocket init skipped or proxy unreachable:', e);
    }
  };

  const fetchInitialData = async () => {
    try {
      // 1. Health & Mode via Axios
      const healthRes = await axios.get('/api/health');
      setLlmMode(healthRes.data?.llm_mode || 'fallback_mock');

      // 2. Scenario & Zones
      const scenRes = await axios.get('/api/scenario');
      setScenario(scenRes.data);

      // 3. Plan History
      fetchLatestPlan();
    } catch (err) {
      console.error('Error fetching initial scenario data via Axios:', err);
    }
  };

  const fetchLatestPlan = async () => {
    try {
      const histRes = await axios.get('/api/plan/history');
      if (histRes.data && histRes.data.length > 0) {
        const latest = histRes.data[histRes.data.length - 1];
        setCurrentPlan(latest);
        if (!selectedZoneId && latest.zones_ranked?.[0]) {
          setSelectedZoneId(latest.zones_ranked[0].zone_id);
        }
      }
    } catch (err) {
      console.error('Error fetching plan history:', err);
    }
  };

  // Generate Plan Handler (Sequential Agent Orchestration)
  const handleGeneratePlan = async () => {
    setIsLoading(true);
    setDiff(null);

    try {
      setLoadingStep('Logistics Agent Analyzing Routes...');
      await new Promise(r => setTimeout(r, 400));

      setLoadingStep('Medical Agent Assessing Casualties...');
      await new Promise(r => setTimeout(r, 400));

      setLoadingStep('Coordinator Detecting Conflicts...');
      await new Promise(r => setTimeout(r, 350));

      setLoadingStep('Deterministic Solver Executing Invariants...');
      const res = await axios.post('/api/allocate');

      setCurrentPlan(res.data);
      setSelectedZoneId(res.data.zones_ranked?.[0]?.zone_id || 'zone_a');
    } catch (err) {
      console.error('Failed to generate plan via Axios:', err);
      alert('Plan generation failed. Check backend server console.');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  // Add Zone E (Flash Flood Re-plan Demo)
  const handleAddZoneE = async () => {
    setIsLoading(true);
    try {
      setLoadingStep('CRITICAL FLASH FLOOD IN ZONE E...');
      await new Promise(r => setTimeout(r, 450));

      setLoadingStep('Multi-Agent Re-evaluation & Dynamic Re-solving...');
      const res = await axios.post('/api/add-zone');

      setCurrentPlan(res.data.plan);
      setDiff(res.data.diff);
      setSelectedZoneId('zone_e');

      // Refresh scenario to update 3D/2D map
      const scenRes = await axios.get('/api/scenario');
      setScenario(scenRes.data);
    } catch (err) {
      console.error('Failed to add critical Zone E:', err);
      alert('Failed to simulate Zone E flood. Check backend logs.');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  // Reset to Baseline
  const handleReset = async () => {
    setIsLoading(true);
    try {
      const res = await axios.post('/api/reset');
      setScenario(res.data);
      setCurrentPlan(null);
      setDiff(null);
      setSelectedZoneId(null);
    } catch (err) {
      console.error('Reset failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Approve Plan
  const handleApprovePlan = async (commanderName, notes) => {
    setIsApproving(true);
    try {
      const res = await axios.post('/api/plan/approve', {
        approval: {
          commander_name: commanderName,
          notes: notes,
        },
        plan_id: currentPlan?.plan_id,
      });

      setCurrentPlan(prev => ({
        ...prev,
        is_approved: true,
        approved_by: res.data.approved_by,
        approved_at: res.data.approved_at,
      }));
      setIsApprovalOpen(false);
    } catch (err) {
      console.error('Approval failed:', err);
    } finally {
      setIsApproving(false);
    }
  };

  // Ambulance Conflict Flag: Detect if Zone A and Zone D each requested 2 ambulances
  const hasAmbulanceConflict = currentPlan?.conflicts?.some(
    c => c.conflict_type === 'contested_resource' && c.resource_type === 'ambulances'
  );

  return (
    <div className="min-h-screen bg-[#080D1A] text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* 1. Command Header Bar */}
      <Header
        scenario={scenario}
        currentPlan={currentPlan}
        diff={diff}
        llmMode={llmMode}
        isLoading={isLoading}
        loadingStep={loadingStep}
        onGeneratePlan={handleGeneratePlan}
        onAddZoneE={handleAddZoneE}
        onReset={handleReset}
        onOpenApprovalModal={() => setIsApprovalOpen(true)}
      />

      {/* Main Command Center Dashboard */}
      <main className="max-w-7xl mx-auto w-full px-4 py-5 flex-1 space-y-5">
        
        {/* RESOURCE CONFLICT HIGHLIGHT BANNER (STEP 9) */}
        {hasAmbulanceConflict && (
          <div className="bg-gradient-to-r from-red-950 via-rose-950 to-red-950 border-2 border-red-500/70 p-3.5 rounded-2xl shadow-xl shadow-red-950/50 flex flex-wrap items-center justify-between gap-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-red-600/30 rounded-xl border border-red-500/60 text-red-400">
                <AlertTriangle className="w-6 h-6 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs uppercase bg-red-800 text-white px-2 py-0.5 rounded font-extrabold tracking-wider">
                    CRITICAL WARNING
                  </span>
                  <h3 className="text-sm font-bold text-white tracking-wide">
                    RESOURCE CONFLICT DETECTED: 4 AMBULANCES REQUESTED VS 3 AVAILABLE
                  </h3>
                </div>
                <p className="text-xs text-rose-200 mt-0.5">
                  Zone A (8 critical) and Zone D (6 critical) both requested 2 units. Deterministic solver resolved priority: 
                  <span className="font-bold text-white"> Zone A: 2 units</span>, 
                  <span className="font-bold text-white"> Zone D: 1 unit</span> (1 unmet).
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs bg-black/40 border border-red-500/40 px-3 py-1.5 rounded-lg text-rose-300 shrink-0">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Two-Pass Solver Guarantee Enforced</span>
            </div>
          </div>
        )}

        {/* 2. Top Resource Status Gauges (Live Values) */}
        <ResourceGauges
          resourceSummaries={currentPlan?.resource_summaries}
          shelterStatuses={currentPlan?.shelter_statuses}
          pool={scenario?.resource_pool}
        />

        {/* 3. Primary Command Center Workspace: AI Agents (Left) + 3D Flood Map (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          
          {/* LEFT: Three Holographic AI Agent Panels (4 Cols) */}
          <div className="lg:col-span-4 flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-cyan-400" />
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                  Specialized AI Agent Panels
                </h2>
              </div>
              <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                {wsConnected ? 'LIVE WS' : 'ACTIVE'}
              </span>
            </div>

            {/* Agent 1: Logistics Agent */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between shadow-lg">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-blue-950 border border-blue-600/40 text-blue-400">
                      <Truck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white uppercase">LOGISTICS AGENT</div>
                      <div className="text-[10px] text-slate-400 font-mono">Routing & Transportation</div>
                    </div>
                  </div>
                  <span className="bg-emerald-950 border border-emerald-500/40 text-emerald-300 text-[10px] px-2 py-0.5 rounded font-mono font-bold">
                    ACTIVE
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 space-y-1 font-mono">
                  <div className="flex justify-between bg-slate-950/60 p-1.5 rounded">
                    <span>Evacuation Vehicles:</span>
                    <span className="text-cyan-300 font-bold">{currentPlan ? '5 / 5 Allocated' : '5 Available'}</span>
                  </div>
                  <div className="flex justify-between bg-slate-950/60 p-1.5 rounded">
                    <span>Active Routes:</span>
                    <span className="text-blue-300 font-bold">{currentPlan ? 'Dijkstra Detours Active' : 'Calculated'}</span>
                  </div>
                  <div className="flex justify-between bg-slate-950/60 p-1.5 rounded">
                    <span>Shelter Matching:</span>
                    <span className="text-emerald-300 font-bold">2 Shelters (Cap 250)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Agent 2: Medical Agent */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between shadow-lg">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-rose-950 border border-rose-600/40 text-rose-400">
                      <HeartPulse className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white uppercase">MEDICAL AGENT</div>
                      <div className="text-[10px] text-slate-400 font-mono">Casualty & Trauma Triage</div>
                    </div>
                  </div>
                  <span className="bg-emerald-950 border border-emerald-500/40 text-emerald-300 text-[10px] px-2 py-0.5 rounded font-mono font-bold">
                    ACTIVE
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 space-y-1 font-mono">
                  <div className="flex justify-between bg-slate-950/60 p-1.5 rounded">
                    <span>Critical Patients:</span>
                    <span className="text-rose-400 font-bold">
                      {scenario?.zones?.reduce((acc, z) => acc + z.critical_patients, 0) || 20} Cases
                    </span>
                  </div>
                  <div className="flex justify-between bg-slate-950/60 p-1.5 rounded">
                    <span>Ambulances:</span>
                    <span className="text-rose-300 font-bold">{currentPlan ? '3 / 3 Dispatched' : '3 Available'}</span>
                  </div>
                  <div className="flex justify-between bg-slate-950/60 p-1.5 rounded">
                    <span>Field Paramedics:</span>
                    <span className="text-emerald-300 font-bold">{currentPlan ? '6 / 6 Assigned' : '6 Available'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Agent 3: Communication Agent */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between shadow-lg">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-purple-950 border border-purple-600/40 text-purple-400">
                      <Radio className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white uppercase">COMMUNICATION AGENT</div>
                      <div className="text-[10px] text-slate-400 font-mono">Public Alerts & Warnings</div>
                    </div>
                  </div>
                  <span className="bg-emerald-950 border border-emerald-500/40 text-emerald-300 text-[10px] px-2 py-0.5 rounded font-mono font-bold">
                    ACTIVE
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 space-y-1 font-mono">
                  <div className="flex justify-between bg-slate-950/60 p-1.5 rounded">
                    <span>Public Dispatches:</span>
                    <span className="text-purple-300 font-bold">
                      {currentPlan?.communication_plan?.zone_alerts?.length || 4} Sectors
                    </span>
                  </div>
                  <div className="flex justify-between bg-slate-950/60 p-1.5 rounded">
                    <span>Route Hazard Warnings:</span>
                    <span className="text-amber-400 font-bold">Zone A Detour Alert</span>
                  </div>
                  <div className="flex justify-between bg-slate-950/60 p-1.5 rounded">
                    <span>Broadcast Format:</span>
                    <span className="text-cyan-300 font-bold">Standard SMS (&lt;160c)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Demo Controls */}
            <div className="bg-slate-900/60 border border-slate-800 p-2.5 rounded-xl space-y-2">
              <button
                onClick={handleAddZoneE}
                disabled={isLoading || scenario?.zones?.some(z => z.id === 'zone_e')}
                className="w-full bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:opacity-40 text-white font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-950/50 cursor-pointer transition-all"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ ADD CRITICAL ZONE (ZONE E)</span>
              </button>
            </div>
          </div>

          {/* RIGHT: 3D Digital Twin Map / 2D Cartography (8 Cols) */}
          <div className="lg:col-span-8 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Disaster Operational Environment
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  (Isometric 3D Digital Twin with Animated Vehicles)
                </span>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 p-0.5 rounded-lg text-xs font-mono">
                <button
                  onClick={() => setMapView('3D')}
                  className={`px-3 py-1 rounded flex items-center gap-1.5 transition-all ${
                    mapView === '3D' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Box className="w-3.5 h-3.5" />
                  <span>3D Digital Twin</span>
                </button>
                <button
                  onClick={() => setMapView('2D')}
                  className={`px-3 py-1 rounded flex items-center gap-1.5 transition-all ${
                    mapView === '2D' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Map className="w-3.5 h-3.5" />
                  <span>2D Tactical SVG</span>
                </button>
              </div>
            </div>

            {/* Map Display */}
            {mapView === '3D' ? (
              <Disaster3DMap
                scenario={scenario}
                currentPlan={currentPlan}
                selectedZoneId={selectedZoneId}
                onSelectZone={(id) => setSelectedZoneId(id)}
              />
            ) : (
              <SvgMap
                scenario={scenario}
                currentPlan={currentPlan}
                selectedZoneId={selectedZoneId}
                onSelectZone={(id) => setSelectedZoneId(id)}
              />
            )}
          </div>
        </div>

        {/* 4. Prioritized Sectors (0-100 Score Breakdown) */}
        <PriorityList
          zonesRanked={currentPlan?.zones_ranked}
          selectedZoneId={selectedZoneId}
          onSelectZone={(id) => setSelectedZoneId(id)}
        />

        {/* 5. Conflict Resolution Panel */}
        <ConflictPanel conflicts={currentPlan?.conflicts} />

        {/* 6. Resource Allocation & Unmet Demands Matrix */}
        <AllocationTable
          allocations={currentPlan?.allocations}
          diff={diff}
          selectedZoneId={selectedZoneId}
          onSelectZone={(id) => setSelectedZoneId(id)}
        />

        {/* 7. Detailed Multi-Agent Intelligence Streams */}
        <AgentPanels
          logistics={currentPlan?.logistics_recommendations}
          medical={currentPlan?.medical_recommendations}
          communication={currentPlan?.communication_plan}
          agentModes={currentPlan?.agent_execution_modes}
        />

        {/* 8. Explainability & Decision Trace Audit */}
        <DecisionTracePanel
          decisionTrace={currentPlan?.decision_trace}
          allocations={currentPlan?.allocations}
        />

        {/* 9. Draft Public Alerts Dispatch Panel */}
        <AlertsPanel
          communicationPlan={currentPlan?.communication_plan}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-3 text-center text-xs text-slate-500 font-mono">
        Multi-Agent Disaster Response Coordinator • Problem HTH-GA-07 • 3D Digital Twin Command Center
      </footer>

      {/* Commander Approval Modal */}
      <ApprovalModal
        plan={currentPlan}
        isOpen={isApprovalOpen}
        onClose={() => setIsApprovalOpen(false)}
        onConfirmApproval={handleApprovePlan}
        isSubmitting={isApproving}
      />
    </div>
  );
}
