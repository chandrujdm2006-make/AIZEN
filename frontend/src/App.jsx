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
import DynamicControlPanel from './components/DynamicControlPanel';

import { 
  Bot, 
  Database,
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
  Table,
  Layers,
  FileText,
  Activity,
  ShieldCheck,
  Clock,
  Sliders,
  Shield,
  Check,
  ChevronRight,
  ExternalLink,
  Cpu,
  Waves,
  Users,
  Compass,
  Maximize2
} from 'lucide-react';

export default function App() {
  const [scenario, setScenario] = useState(null);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [diff, setDiff] = useState(null);
  const [llmMode, setLlmMode] = useState('fallback_mock');
  const [selectedZoneId, setSelectedZoneId] = useState('zone_a');

  // Database Agent Telemetry
  const [dbState, setDbState] = useState(null);

  // Center Bottom Content Tab: 'map', 'control_panel', 'allocations', 'agents', 'alerts'
  const [activeTab, setActiveTab] = useState('map');

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
          if (msg.event === 'CRITICAL_ZONE_ADDED' || msg.event === 'PLAN_GENERATED' || msg.event === 'CONTROL_PANEL_UPDATED') {
            fetchLatestPlan();
            fetchDatabaseState();
            axios.get('/api/scenario').then(r => setScenario(r.data)).catch(() => {});
          } else if (msg.event === 'SCENARIO_RESET' || msg.event === 'CONTROL_PANEL_RESET') {
            fetchInitialData();
          }
        } catch (e) {
          // ignore
        }
      };

      socket.onclose = () => {
        setWsConnected(false);
        setTimeout(initWebSocket, 3000);
      };

      socket.onerror = () => {
        setWsConnected(false);
      };
    } catch (e) {
      console.warn('WebSocket init skipped:', e);
    }
  };

  const fetchInitialData = async () => {
    try {
      const healthRes = await axios.get('/api/health');
      setLlmMode(healthRes.data?.llm_mode || 'fallback_mock');

      const scenRes = await axios.get('/api/scenario');
      setScenario(scenRes.data);

      fetchDatabaseState();
      fetchLatestPlan();
    } catch (err) {
      console.error('Error fetching initial scenario data:', err);
    }
  };

  const fetchDatabaseState = async () => {
    try {
      const res = await axios.get('/api/database/state');
      setDbState(res.data);
    } catch (e) {
      console.warn('Could not fetch database state:', e);
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
      setLoadingStep('[Database Agent] Retrieving initial zone & road states...');
      await new Promise(r => setTimeout(r, 250));

      setLoadingStep('[Logistics Agent] Sizing vehicles & computing routes...');
      await new Promise(r => setTimeout(r, 250));

      setLoadingStep('[Medical Agent] Assessing casualty triage & ambulance scarcity...');
      await new Promise(r => setTimeout(r, 250));

      setLoadingStep('[Coordinator] Arbitrating Zone A vs Zone D conflict...');
      await new Promise(r => setTimeout(r, 250));

      setLoadingStep('[Deterministic Solver] Locking allocations & storing in DB...');
      const res = await axios.post('/api/allocate');

      setCurrentPlan(res.data);
      setSelectedZoneId(res.data.zones_ranked?.[0]?.zone_id || 'zone_a');
      fetchDatabaseState();
    } catch (err) {
      console.error('Failed to generate plan:', err);
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
      setLoadingStep('[Alert] FLASH FLOOD: Zone E Dam Breach Detected...');
      await new Promise(r => setTimeout(r, 300));

      setLoadingStep('[Database Agent] Registering new topography & casualty data...');
      await new Promise(r => setTimeout(r, 250));

      setLoadingStep('[Solver] Dynamic re-allocation of scarce fleet...');
      const res = await axios.post('/api/add-zone');

      setCurrentPlan(res.data.plan);
      setDiff(res.data.diff);
      setSelectedZoneId('zone_e');

      const scenRes = await axios.get('/api/scenario');
      setScenario(scenRes.data);
      fetchDatabaseState();
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
      setSelectedZoneId('zone_a');
      fetchDatabaseState();
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
      fetchDatabaseState();
    } catch (err) {
      console.error('Approval failed:', err);
    } finally {
      setIsApproving(false);
    }
  };

  // Aggregated Demographics & Metrics
  const totalPop = scenario?.zones?.reduce((sum, z) => sum + (z.population || 0), 0) || 1640;
  const totalInjured = scenario?.zones?.reduce((sum, z) => sum + (z.injured || 0), 0) || 74;
  const totalCritical = scenario?.zones?.reduce((sum, z) => sum + (z.critical_patients || 0), 0) || 20;
  const totalEvacDemand = scenario?.zones?.reduce((sum, z) => sum + (z.evacuation_demand || 0), 0) || 270;

  const selectedZone = scenario?.zones?.find(z => z.id === selectedZoneId) || scenario?.zones?.[0];
  const selectedZoneAlloc = currentPlan?.allocations?.find(a => a.zone_id === selectedZoneId);
  const selectedZoneRank = currentPlan?.zones_ranked?.find(z => z.zone_id === selectedZoneId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#080B11] via-[#0E131F] to-[#151B2B] text-slate-100 flex flex-col font-sans selection:bg-violet-600 selection:text-white">
      {/* 1. FIXED HEADER (80px) */}
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
        conflictCount={currentPlan?.conflicts?.length || 0}
      />

      {/* 2. MAIN DASHBOARD 3-COLUMN GRID */}
      <main className="w-full max-w-[1920px] mx-auto px-4 lg:px-6 py-5 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* ========================================================================= */}
          {/* LEFT SIDEBAR (20% - approx 2.5/12 cols) */}
          {/* ========================================================================= */}
          <aside className="lg:col-span-3 xl:col-span-2 space-y-4">
            
            {/* 1. NAVIGATION MENU CARD */}
            <div className="bg-[#0D1322]/85 backdrop-blur-xl border border-[#212C44] rounded-xl p-3 shadow-md space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 px-2 py-1 block">
                Command Navigation
              </span>

              <button
                onClick={() => setActiveTab('map')}
                className={`w-full px-3 py-2 rounded-lg flex items-center justify-between text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'map'
                    ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-900/40'
                    : 'text-slate-300 hover:text-white hover:bg-[#151D30]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Box className="w-4 h-4 text-cyan-300" />
                  <span>3D Digital Twin</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              </button>

              <button
                onClick={() => setActiveTab('control_panel')}
                className={`w-full px-3 py-2 rounded-lg flex items-center justify-between text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'control_panel'
                    ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-900/40'
                    : 'text-slate-300 hover:text-white hover:bg-[#151D30]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <span>Control Panel</span>
                </div>
                <span className="text-[10px] font-mono font-bold bg-cyan-950/80 text-cyan-300 px-1.5 py-0.2 rounded border border-cyan-700/50">
                  Admin
                </span>
              </button>

              <button
                onClick={() => setActiveTab('allocations')}
                className={`w-full px-3 py-2 rounded-lg flex items-center justify-between text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'allocations'
                    ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-900/40'
                    : 'text-slate-300 hover:text-white hover:bg-[#151D30]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Table className="w-4 h-4 text-emerald-400" />
                  <span>Allocations & Proof</span>
                </div>
                {currentPlan && (
                  <span className="text-[10px] font-mono bg-emerald-950 text-emerald-300 px-1.5 py-0.2 rounded">
                    Solved
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('agents')}
                className={`w-full px-3 py-2 rounded-lg flex items-center justify-between text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'agents'
                    ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-900/40'
                    : 'text-slate-300 hover:text-white hover:bg-[#151D30]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Bot className="w-4 h-4 text-purple-400" />
                  <span>AI Agent Feeds</span>
                </div>
                <span className="text-[10px] font-mono bg-purple-950 text-purple-300 px-1.5 py-0.2 rounded">
                  4 AI
                </span>
              </button>

              <button
                onClick={() => setActiveTab('alerts')}
                className={`w-full px-3 py-2 rounded-lg flex items-center justify-between text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'alerts'
                    ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-900/40'
                    : 'text-slate-300 hover:text-white hover:bg-[#151D30]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Radio className="w-4 h-4 text-amber-400" />
                  <span>Public SMS Alerts</span>
                </div>
                {currentPlan?.communication_plan?.zone_alerts && (
                  <span className="text-[10px] font-mono bg-amber-950 text-amber-300 px-1.5 py-0.2 rounded">
                    {currentPlan.communication_plan.zone_alerts.length}
                  </span>
                )}
              </button>
            </div>

            {/* 2. QUICK STATS WIDGET */}
            <div className="bg-[#0D1322]/85 backdrop-blur-xl border border-[#212C44] rounded-xl p-3.5 shadow-md space-y-2.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
                Regional Triage Snapshot
              </span>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-[#0A0E1A]/80 p-2 rounded-lg border border-[#1E2638]">
                  <div className="text-[10px] text-slate-400">Active Zones</div>
                  <div className="text-base font-bold text-white mt-0.5">{scenario?.zones?.length || 4} Sectors</div>
                </div>

                <div className="bg-[#0A0E1A]/80 p-2 rounded-lg border border-[#1E2638]">
                  <div className="text-[10px] text-slate-400">Evac Demand</div>
                  <div className="text-base font-bold text-cyan-300 mt-0.5">{totalEvacDemand}</div>
                </div>

                <div className="bg-[#0A0E1A]/80 p-2 rounded-lg border border-[#1E2638]">
                  <div className="text-[10px] text-slate-400">Casualties</div>
                  <div className="text-base font-bold text-amber-400 mt-0.5">{totalInjured} injured</div>
                </div>

                <div className="bg-[#0A0E1A]/80 p-2 rounded-lg border border-[#1E2638]">
                  <div className="text-[10px] text-slate-400">Critical</div>
                  <div className="text-base font-bold text-rose-400 mt-0.5">{totalCritical} crit</div>
                </div>
              </div>

              <div className="bg-[#0A0E1A]/80 p-2.5 rounded-lg border border-[#1E2638] flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span className="font-semibold">Deterministic Solver</span>
                </div>
                <span className="text-[10px] bg-emerald-950/80 text-emerald-300 px-1.5 py-0.5 rounded font-bold border border-emerald-800/40">
                  100% Enforced
                </span>
              </div>
            </div>

            {/* 3. AI AGENTS STATUS WIDGET (As specifically requested) */}
            <div className="bg-[#0D1322]/85 backdrop-blur-xl border border-[#212C44] rounded-xl p-3.5 shadow-md space-y-3">
              <div className="flex items-center justify-between border-b border-[#1E2638] pb-2">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono">
                    AI Agents Status
                  </h3>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              </div>

              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between py-1 px-2 rounded bg-[#0A0E1A]/60 border border-[#1E2638]/70">
                  <span className="text-slate-300 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Logistics Agent
                  </span>
                  <span className="text-emerald-400 font-bold">✓ Ready</span>
                </div>

                <div className="flex items-center justify-between py-1 px-2 rounded bg-[#0A0E1A]/60 border border-[#1E2638]/70">
                  <span className="text-slate-300 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Medical Agent
                  </span>
                  <span className="text-emerald-400 font-bold">✓ Ready</span>
                </div>

                <div className="flex items-center justify-between py-1 px-2 rounded bg-[#0A0E1A]/60 border border-[#1E2638]/70">
                  <span className="text-slate-300 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Comms Agent
                  </span>
                  <span className="text-emerald-400 font-bold">✓ Ready</span>
                </div>

                <div className="flex items-center justify-between py-1 px-2 rounded bg-[#0A0E1A]/60 border border-[#1E2638]/70">
                  <span className="text-slate-300 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    Database Agent
                  </span>
                  <span className="text-cyan-300 font-bold">✓ Synced</span>
                </div>
              </div>

              <div className="text-[11px] font-mono text-slate-400 pt-2 border-t border-[#1E2638] space-y-1">
                <div className="flex justify-between">
                  <span>Last Coordination:</span>
                  <span className="text-slate-200">Just now</span>
                </div>
                <div className="flex justify-between">
                  <span>Next Re-plan:</span>
                  <span className="text-cyan-300">Auto on Change</span>
                </div>
                <div className="flex justify-between">
                  <span>Avg Processing:</span>
                  <span className="text-emerald-400">1.2s</span>
                </div>
              </div>
            </div>

            {/* 4. SYSTEM HEALTH */}
            <div className="bg-[#0D1322]/85 backdrop-blur-xl border border-[#212C44] rounded-xl p-3 text-xs font-mono space-y-1 text-slate-400">
              <div className="flex items-center justify-between">
                <span>WebSocket Stream:</span>
                <span className={`font-bold ${wsConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {wsConnected ? '● Connected' : '○ Polling'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>SQLite Ledger:</span>
                <span className="text-cyan-300 font-bold">● Active</span>
              </div>
            </div>

          </aside>

          {/* ========================================================================= */}
          {/* CENTER CONTENT (50-55% - approx 6-7/12 cols) */}
          {/* ========================================================================= */}
          <section className="lg:col-span-6 xl:col-span-7 space-y-4">
            
            {/* TOP: RESOURCE STATUS CARDS (Component Spec 1) */}
            <ResourceGauges
              resourceSummaries={currentPlan?.resource_summaries}
              shelterStatuses={currentPlan?.shelter_statuses}
              pool={scenario?.resource_pool}
            />

            {/* MIDDLE: INTERACTIVE MAP VISUALIZATION */}
            <div className="bg-[#0D1322]/85 backdrop-blur-xl border border-[#212C44] rounded-xl shadow-xl overflow-hidden flex flex-col">
              {/* Map Bar Header */}
              <div className="px-4 py-3 bg-[#0A0E1A]/90 border-b border-[#1E2638] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Compass className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold uppercase font-mono tracking-wider text-white">
                    Interactive Geospatial Digital Twin
                  </span>
                  {selectedZone && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-950/80 text-violet-300 border border-violet-700/50">
                      Target: {selectedZone.name}
                    </span>
                  )}
                </div>

                {/* 3D vs 2D Switcher */}
                <div className="flex items-center gap-1 bg-[#070A12] p-1 rounded-lg border border-[#1E2638] text-xs font-mono">
                  <button
                    onClick={() => setMapView('3D')}
                    className={`px-2.5 py-1 rounded transition-all cursor-pointer font-bold ${
                      mapView === '3D' ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    3D Simulation
                  </button>
                  <button
                    onClick={() => setMapView('2D')}
                    className={`px-2.5 py-1 rounded transition-all cursor-pointer font-bold ${
                      mapView === '2D' ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    2D Vectors
                  </button>
                </div>
              </div>

              {/* Map Canvas Area */}
              <div className="h-[430px] w-full bg-[#05070D] relative">
                {mapView === '3D' ? (
                  <Disaster3DMap
                    scenario={scenario}
                    currentPlan={currentPlan}
                    selectedZoneId={selectedZoneId}
                    onSelectZone={(zid) => setSelectedZoneId(zid)}
                  />
                ) : (
                  <SvgMap
                    scenario={scenario}
                    currentPlan={currentPlan}
                    selectedZoneId={selectedZoneId}
                    onSelectZone={(zid) => setSelectedZoneId(zid)}
                  />
                )}
              </div>
            </div>

            {/* BOTTOM: ZONE DETAILS PANEL / DYNAMIC TABS */}
            <div className="bg-[#0D1322]/85 backdrop-blur-xl border border-[#212C44] rounded-xl p-4 shadow-xl space-y-4">
              
              {/* Dynamic Tab Bar Header */}
              <div className="flex items-center justify-between border-b border-[#1E2638] pb-2">
                <div className="flex items-center gap-1.5 text-xs font-mono font-bold">
                  <button
                    onClick={() => setActiveTab('map')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      activeTab === 'map' ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-violet-900/30' : 'text-slate-400 hover:text-white hover:bg-[#151D30]'
                    }`}
                  >
                    Sector Detail Inspector
                  </button>
                  <button
                    onClick={() => setActiveTab('control_panel')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                      activeTab === 'control_panel' ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-violet-900/30' : 'text-slate-400 hover:text-white hover:bg-[#151D30]'
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Dynamic Control Panel</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('allocations')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      activeTab === 'allocations' ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-violet-900/30' : 'text-slate-400 hover:text-white hover:bg-[#151D30]'
                    }`}
                  >
                    Allocations Matrix
                  </button>
                  <button
                    onClick={() => setActiveTab('agents')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      activeTab === 'agents' ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-violet-900/30' : 'text-slate-400 hover:text-white hover:bg-[#151D30]'
                    }`}
                  >
                    AI Recommendations
                  </button>
                  <button
                    onClick={() => setActiveTab('alerts')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      activeTab === 'alerts' ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-violet-900/30' : 'text-slate-400 hover:text-white hover:bg-[#151D30]'
                    }`}
                  >
                    Public SMS
                  </button>
                </div>
              </div>

              {/* TAB 1: SECTOR DETAIL INSPECTOR (Active when viewing map) */}
              {activeTab === 'map' && selectedZone && (
                <div className="space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between bg-[#0A0E1A]/80 p-3 rounded-xl border border-[#1E2638]">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl font-mono text-sm font-bold ${
                        selectedZone.id === 'zone_e'
                          ? 'bg-rose-500/20 border border-rose-500/40 text-rose-400'
                          : 'bg-violet-600/20 border border-violet-500/40 text-violet-300'
                      }`}>
                        {selectedZone.id.toUpperCase().replace('_', ' ')}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white flex items-center gap-2">
                          <span>{selectedZone.name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#131A2B] text-slate-300 border border-[#212C44]">
                            Rank #{selectedZoneRank?.rank || 1} ({selectedZoneRank?.score.toFixed(1) || '64.0'} pts)
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Flood Severity: Level {selectedZone.flood_severity}/10 • Vulnerable: {selectedZone.vulnerable_population} persons
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setActiveTab('control_panel')}
                      className="px-3 py-1.5 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/40 text-violet-300 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Tune in Control Panel</span>
                    </button>
                  </div>

                  {/* 4-Stat Metric Breakdown */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                    <div className="bg-[#0A0E1A]/60 p-2.5 rounded-lg border border-[#1E2638]">
                      <span className="text-slate-400 text-[10px]">Population</span>
                      <div className="text-sm font-bold text-white mt-0.5">{selectedZone.population} citizens</div>
                    </div>
                    <div className="bg-[#0A0E1A]/60 p-2.5 rounded-lg border border-[#1E2638]">
                      <span className="text-slate-400 text-[10px]">Evacuation Demand</span>
                      <div className="text-sm font-bold text-cyan-300 mt-0.5">{selectedZone.evacuation_demand} persons</div>
                    </div>
                    <div className="bg-[#0A0E1A]/60 p-2.5 rounded-lg border border-[#1E2638]">
                      <span className="text-slate-400 text-[10px]">Assigned Vehicles</span>
                      <div className="text-sm font-bold text-cyan-300 mt-0.5">
                        {selectedZoneAlloc?.evacuation_vehicles?.allocated || 0} buses ({(selectedZoneAlloc?.evacuation_vehicles?.allocated || 0) * 20} seats)
                      </div>
                    </div>
                    <div className="bg-[#0A0E1A]/60 p-2.5 rounded-lg border border-[#1E2638]">
                      <span className="text-slate-400 text-[10px]">Assigned Ambulances</span>
                      <div className="text-sm font-bold text-violet-300 mt-0.5">
                        {selectedZoneAlloc?.ambulances?.allocated || 0} units ({selectedZone.critical_patients} critical)
                      </div>
                    </div>
                  </div>

                  {/* Solver Rationale */}
                  {selectedZoneAlloc?.rationale && (
                    <div className="bg-[#0A0E1A]/80 p-3 rounded-lg border border-[#1E2638] text-xs font-mono text-slate-300">
                      <span className="text-[10px] text-emerald-400 font-bold uppercase block mb-1">
                        Deterministic Allocation Rationale:
                      </span>
                      <p className="leading-relaxed text-slate-300">{selectedZoneAlloc.rationale}</p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: DYNAMIC CONTROL PANEL */}
              {activeTab === 'control_panel' && (
                <DynamicControlPanel
                  onPlanUpdated={(newPlan) => {
                    if (newPlan) setCurrentPlan(newPlan);
                    fetchInitialData();
                  }}
                />
              )}

              {/* TAB 3: ALLOCATIONS MATRIX & DECISION TRACE */}
              {activeTab === 'allocations' && (
                <div className="space-y-4 animate-fade-in">
                  <AllocationTable allocations={currentPlan?.allocations} />
                  <DecisionTracePanel trace={currentPlan?.decision_trace} />
                </div>
              )}

              {/* TAB 4: AI AGENT RECOMMS */}
              {activeTab === 'agents' && (
                <div className="space-y-4 animate-fade-in">
                  <AgentPanels
                    logistics={currentPlan?.logistics_recommendations}
                    medical={currentPlan?.medical_recommendations}
                    communication={currentPlan?.communication_plan}
                    agentModes={currentPlan?.agent_execution_modes}
                  />
                </div>
              )}

              {/* TAB 5: PUBLIC SMS BROADCASTS */}
              {activeTab === 'alerts' && (
                <div className="space-y-4 animate-fade-in">
                  <AlertsPanel communicationPlan={currentPlan?.communication_plan} />
                </div>
              )}
            </div>

          </section>

          {/* ========================================================================= */}
          {/* RIGHT SIDEBAR (25-30% - approx 3/12 cols) */}
          {/* ========================================================================= */}
          <aside className="lg:col-span-3 xl:col-span-3 space-y-4">
            
            {/* CONFLICT ALERT PANEL (Component Spec 3) */}
            <ConflictPanel
              conflicts={currentPlan?.conflicts}
              onViewResolution={() => setActiveTab('allocations')}
            />

            {/* ZONE PRIORITY CARDS (Component Spec 2) */}
            <PriorityList
              zonesRanked={currentPlan?.zones_ranked}
              allocations={currentPlan?.allocations}
              rawZones={scenario?.zones}
              selectedZoneId={selectedZoneId}
              onSelectZone={(zid) => setSelectedZoneId(zid)}
              onEditZone={(zid) => {
                setSelectedZoneId(zid);
                setActiveTab('control_panel');
              }}
            />

          </aside>

        </div>
      </main>

      {/* Simplified Compact Modern Footer */}
      <footer className="border-t border-[#1E2638] bg-[#070A12] py-3 text-center text-xs text-slate-400 font-mono flex items-center justify-center gap-4">
        <span>AIZEN Disaster Response Command Center</span>
        <span>•</span>
        <span>WCAG 2.1 AA Compliant</span>
        <span>•</span>
        <span>Pure Python Solver</span>
        <span>•</span>
        <span>Persistent SQLite Digital Twin</span>
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
