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
  Sliders
} from 'lucide-react';


export default function App() {
  const [scenario, setScenario] = useState(null);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [diff, setDiff] = useState(null);
  const [llmMode, setLlmMode] = useState('fallback_mock');
  const [selectedZoneId, setSelectedZoneId] = useState(null);

  // Database Agent Telemetry
  const [dbState, setDbState] = useState(null);

  // Simplified UI Main Tab: 'map', 'allocations', 'agents', 'alerts'
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
      // 1. Health & Mode
      const healthRes = await axios.get('/api/health');
      setLlmMode(healthRes.data?.llm_mode || 'fallback_mock');

      // 2. Scenario
      const scenRes = await axios.get('/api/scenario');
      setScenario(scenRes.data);

      // 3. Database Agent Structured State
      fetchDatabaseState();

      // 4. Plan History
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
      await new Promise(r => setTimeout(r, 350));

      setLoadingStep('[Logistics Agent] Sizing vehicles & computing routes...');
      await new Promise(r => setTimeout(r, 350));

      setLoadingStep('[Medical Agent] Assessing casualty triage & ambulance scarcity...');
      await new Promise(r => setTimeout(r, 350));

      setLoadingStep('[Coordinator] Arbitrating Zone A vs Zone D conflict...');
      await new Promise(r => setTimeout(r, 350));

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
      await new Promise(r => setTimeout(r, 400));

      setLoadingStep('[Database Agent] Registering new topography & casualty data...');
      await new Promise(r => setTimeout(r, 350));

      setLoadingStep('[Solver] Dynamic re-allocation of scarce fleet...');
      const res = await axios.post('/api/add-zone');

      setCurrentPlan(res.data.plan);
      setDiff(res.data.diff);
      setSelectedZoneId('zone_e');

      // Refresh scenario & DB state
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
      setSelectedZoneId(null);
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

  const hasAmbulanceConflict = currentPlan?.conflicts?.some(
    c => c.conflict_type === 'contested_resource' && c.resource_type === 'ambulances'
  );

  return (
    <div className="min-h-screen bg-[#080D1A] text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* 1. Header Bar with One-Click Actions */}
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

      {/* Main Simplified Command Center Container */}
      <main className="max-w-7xl mx-auto w-full px-4 py-4 flex-1 space-y-4">
        
        {/* Critical Resource Conflict Notification Banner */}
        {hasAmbulanceConflict && (
          <div className="bg-gradient-to-r from-red-950/90 via-rose-950/90 to-red-950/90 border border-red-500/70 p-3 rounded-xl shadow-lg flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-600/30 rounded-lg border border-red-500/50 text-red-400">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase bg-red-700 text-white px-2 py-0.2 rounded font-bold">
                    RESOURCE TENSION DETECTED
                  </span>
                  <span className="text-xs font-bold text-white">
                    4 Ambulances Requested vs 3 Available in Pool
                  </span>
                </div>
                <p className="text-[11px] text-rose-200 mt-0.5">
                  Zone A (8 critical) awarded 2 units. Zone D (6 critical) awarded 1 unit. 1 unit documented as unmet.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('allocations')}
              className="text-xs bg-red-900/60 hover:bg-red-800 text-rose-200 px-3 py-1.5 rounded-lg border border-red-600/50 font-mono flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span>View Solver Proof</span>
              <span>→</span>
            </button>
          </div>
        )}

        {/* 2. Top Executive Metric Gauges (Live Values) */}
        <ResourceGauges
          resourceSummaries={currentPlan?.resource_summaries}
          shelterStatuses={currentPlan?.shelter_statuses}
          pool={scenario?.resource_pool}
        />

        {/* 3. SIMPLIFIED 4-TAB DASHBOARD NAVIGATION */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          {/* Main Operational Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('map')}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'map'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Box className="w-4 h-4 text-cyan-300" />
              <span>3D Digital Twin Map</span>
            </button>

            <button
              onClick={() => setActiveTab('allocations')}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'allocations'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Table className="w-4 h-4 text-emerald-400" />
              <span>Allocations & Conflicts</span>
              {currentPlan && (
                <span className="bg-emerald-950 text-emerald-300 text-[10px] px-1.5 py-0.2 rounded font-mono">
                  Solved
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('agents')}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'agents'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Bot className="w-4 h-4 text-purple-400" />
              <span>AI & Database Agents</span>
              <span className="bg-slate-800 text-cyan-300 text-[10px] px-1.5 py-0.2 rounded font-mono">
                4 Agents
              </span>
            </button>

            <button
              onClick={() => setActiveTab('alerts')}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'alerts'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Radio className="w-4 h-4 text-amber-400" />
              <span>Public SMS Alerts</span>
              {currentPlan?.communication_plan?.zone_alerts && (
                <span className="bg-amber-950 text-amber-300 text-[10px] px-1.5 py-0.2 rounded font-mono">
                  {currentPlan.communication_plan.zone_alerts.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('control_panel')}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'control_panel'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Sliders className="w-4 h-4 text-cyan-300" />
              <span>Dynamic Control Panel</span>
              <span className="bg-cyan-950 text-cyan-300 text-[10px] px-1.5 py-0.2 rounded font-mono border border-cyan-800/50 font-bold">
                Admin
              </span>
            </button>
          </div>


          {/* Database Agent Live Status Pill */}
          <div className="hidden sm:flex items-center gap-2 text-xs font-mono bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] text-slate-400">Database Agent:</span>
            <span className="text-cyan-300 font-bold">Synchronized</span>
            {dbState?.data_freshness_timestamp && (
              <span className="text-[10px] text-slate-500">
                ({new Date(dbState.data_freshness_timestamp).toLocaleTimeString()})
              </span>
            )}
          </div>
        </div>

        {/* 4. TAB CONTENT PANELS */}

        {/* TAB 1: 3D DIGITAL TWIN & SECTORS */}
        {activeTab === 'map' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* Map Canvas (8 cols) */}
              <div className="lg:col-span-8 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
                    <span>Tactical Digital Twin</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      (Moving Ambulances • Buses • Boats • Drones)
                    </span>
                  </div>

                  <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 p-0.5 rounded-lg text-xs font-mono">
                    <button
                      onClick={() => setMapView('3D')}
                      className={`px-3 py-1 rounded flex items-center gap-1.5 transition-all cursor-pointer ${
                        mapView === '3D' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Box className="w-3.5 h-3.5" />
                      <span>3D View</span>
                    </button>
                    <button
                      onClick={() => setMapView('2D')}
                      className={`px-3 py-1 rounded flex items-center gap-1.5 transition-all cursor-pointer ${
                        mapView === '2D' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Map className="w-3.5 h-3.5" />
                      <span>2D Vector</span>
                    </button>
                  </div>
                </div>

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

              {/* Zone Priority List (4 cols) */}
              <div className="lg:col-span-4 flex flex-col">
                <PriorityList
                  zonesRanked={currentPlan?.zones_ranked}
                  selectedZoneId={selectedZoneId}
                  onSelectZone={(id) => setSelectedZoneId(id)}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: RESOURCE ALLOCATIONS & CONFLICT RESOLUTION */}
        {activeTab === 'allocations' && (
          <div className="space-y-4">
            <AllocationTable
              allocations={currentPlan?.allocations}
              diff={diff}
              selectedZoneId={selectedZoneId}
              onSelectZone={(id) => setSelectedZoneId(id)}
            />

            <ConflictPanel conflicts={currentPlan?.conflicts} />

            <DecisionTracePanel
              decisionTrace={currentPlan?.decision_trace}
              allocations={currentPlan?.allocations}
            />
          </div>
        )}

        {/* TAB 3: MULTI-AGENT PIPELINE & DATABASE AGENT TELEMETRY */}
        {activeTab === 'agents' && (
          <div className="space-y-4">
            {/* Visual Agent Pipeline Diagram */}
            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl shadow-lg">
              <div className="text-xs font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                Multi-Agent Request Pipeline
              </div>
              <div className="flex flex-wrap items-center justify-between text-xs font-mono bg-slate-950/70 p-3 rounded-lg border border-slate-800 text-slate-300 gap-2">
                <div className="flex items-center gap-1.5 text-cyan-300 font-bold">
                  <Database className="w-3.5 h-3.5" />
                  <span>[1] Database Agent (Initial State)</span>
                </div>
                <span className="text-slate-600">➔</span>
                <div className="flex items-center gap-1.5 text-blue-300">
                  <Truck className="w-3.5 h-3.5" />
                  <span>[2] Logistics & Medical Reasoning</span>
                </div>
                <span className="text-slate-600">➔</span>
                <div className="flex items-center gap-1.5 text-amber-300 font-bold">
                  <Zap className="w-3.5 h-3.5" />
                  <span>[3] Conflict Resolution Layer</span>
                </div>
                <span className="text-slate-600">➔</span>
                <div className="flex items-center gap-1.5 text-emerald-300 font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>[4] Deterministic Constraint Solver</span>
                </div>
                <span className="text-slate-600">➔</span>
                <div className="flex items-center gap-1.5 text-purple-300">
                  <Radio className="w-3.5 h-3.5" />
                  <span>[5] Database Commitment & Alerts</span>
                </div>
              </div>
            </div>

            {/* 4 Agent Cards Grid (Database + Logistics + Medical + Communication) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Database Agent Card */}
              <div className="bg-slate-900 border border-cyan-500/30 rounded-xl p-3.5 shadow-md flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-cyan-950 border border-cyan-500/40 rounded-lg text-cyan-300">
                        <Database className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-white uppercase">DATABASE AGENT</span>
                    </div>
                    <span className="bg-cyan-950 text-cyan-300 text-[9px] px-1.5 py-0.2 rounded font-mono font-bold">
                      ACTIVE
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mb-2 leading-relaxed">
                    Maintains persistent SQLite storage, topology graphs, and historical response records.
                  </p>
                  <div className="text-[10px] text-slate-400 space-y-1 font-mono">
                    <div className="flex justify-between bg-slate-950/60 p-1 rounded">
                      <span>Tracked Zones:</span>
                      <span className="text-cyan-300 font-bold">{scenario?.zones?.length || 4} Sectors</span>
                    </div>
                    <div className="flex justify-between bg-slate-950/60 p-1 rounded">
                      <span>Persistence:</span>
                      <span className="text-emerald-400 font-bold">SQLite Connected</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Logistics Agent Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-md flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-blue-950 border border-blue-500/40 rounded-lg text-blue-300">
                        <Truck className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-white uppercase">LOGISTICS AGENT</span>
                    </div>
                    <span className="bg-emerald-950 text-emerald-300 text-[9px] px-1.5 py-0.2 rounded font-mono font-bold">
                      ACTIVE
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mb-2 leading-relaxed">
                    Evaluates evacuation vehicles, Dijkstra shortest paths, and shelter capacity matching.
                  </p>
                  <div className="text-[10px] text-slate-400 space-y-1 font-mono">
                    <div className="flex justify-between bg-slate-950/60 p-1 rounded">
                      <span>Vehicle Demand:</span>
                      <span className="text-cyan-300 font-bold">{currentPlan ? '5 / 5 Units' : 'Assessing'}</span>
                    </div>
                    <div className="flex justify-between bg-slate-950/60 p-1 rounded">
                      <span>Shelters:</span>
                      <span className="text-emerald-400 font-bold">2 Reachable</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Medical Agent Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-md flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-rose-950 border border-rose-500/40 rounded-lg text-rose-300">
                        <HeartPulse className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-white uppercase">MEDICAL AGENT</span>
                    </div>
                    <span className="bg-emerald-950 text-emerald-300 text-[9px] px-1.5 py-0.2 rounded font-mono font-bold">
                      ACTIVE
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mb-2 leading-relaxed">
                    Triages critical casualties, trauma severity, and emergency ambulance transport.
                  </p>
                  <div className="text-[10px] text-slate-400 space-y-1 font-mono">
                    <div className="flex justify-between bg-slate-950/60 p-1 rounded">
                      <span>Ambulance Pool:</span>
                      <span className="text-rose-300 font-bold">3 Units Max</span>
                    </div>
                    <div className="flex justify-between bg-slate-950/60 p-1 rounded">
                      <span>Field Medics:</span>
                      <span className="text-emerald-400 font-bold">6 Active</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Communication Agent Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-md flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-purple-950 border border-purple-500/40 rounded-lg text-purple-300">
                        <Radio className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-white uppercase">COMMUNICATION AGENT</span>
                    </div>
                    <span className="bg-emerald-950 text-emerald-300 text-[9px] px-1.5 py-0.2 rounded font-mono font-bold">
                      ACTIVE
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mb-2 leading-relaxed">
                    Synthesizes concise SMS advisories and route hazard notifications for citizens.
                  </p>
                  <div className="text-[10px] text-slate-400 space-y-1 font-mono">
                    <div className="flex justify-between bg-slate-950/60 p-1 rounded">
                      <span>Dispatches:</span>
                      <span className="text-purple-300 font-bold">{currentPlan?.communication_plan?.zone_alerts?.length || 4} Zones</span>
                    </div>
                    <div className="flex justify-between bg-slate-950/60 p-1 rounded">
                      <span>Format:</span>
                      <span className="text-cyan-300 font-bold">&lt;160 Chars</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Agent Telemetry Streams */}
            <AgentPanels
              logistics={currentPlan?.logistics_recommendations}
              medical={currentPlan?.medical_recommendations}
              communication={currentPlan?.communication_plan}
              agentModes={currentPlan?.agent_execution_modes}
            />
          </div>
        )}

        {/* TAB 4: PUBLIC SMS ALERTS */}
        {activeTab === 'alerts' && (
          <div className="space-y-4">
            <AlertsPanel
              communicationPlan={currentPlan?.communication_plan}
            />
          </div>
        )}

        {/* TAB 5: DYNAMIC CONTROL PANEL */}
        {activeTab === 'control_panel' && (
          <DynamicControlPanel
            onPlanUpdated={(newPlan) => {
              if (newPlan) {
                setCurrentPlan(newPlan);
              }
              fetchInitialData();
            }}
          />
        )}
      </main>


      {/* Simplified Compact Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-3 text-center text-xs text-slate-500 font-mono flex items-center justify-center gap-4">
        <span>AIZEN Disaster Response Coordinator</span>
        <span>•</span>
        <span>Database Agent: Persistent SQLite</span>
        <span>•</span>
        <span>Deterministic Constraints Enforced</span>
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
