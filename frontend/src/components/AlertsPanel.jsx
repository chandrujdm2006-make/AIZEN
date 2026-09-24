import React, { useState } from 'react';
import { Send, Copy, Check, MessageSquare, AlertCircle, Edit3 } from 'lucide-react';

export default function AlertsPanel({ communicationPlan }) {
  const [copiedId, setCopiedId] = useState(null);
  const [editableAlerts, setEditableAlerts] = useState({});

  if (!communicationPlan || !communicationPlan.zone_alerts) {
    return (
      <div className="bg-[#0D1322]/85 backdrop-blur-xl border border-[#212C44] rounded-xl p-4 text-xs text-slate-500 text-center py-6">
        No draft public alerts available. Generate a plan to trigger the Communication Agent.
      </div>
    );
  }

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleTextChange = (id, newText) => {
    setEditableAlerts(prev => ({
      ...prev,
      [id]: newText,
    }));
  };

  return (
    <div className="bg-[#0D1322]/85 backdrop-blur-xl border border-[#212C44] rounded-xl p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
            Draft Public SMS Dispatches ({communicationPlan.zone_alerts.length} Sectors)
          </h2>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          Ready for Emergency Broadcast
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {communicationPlan.zone_alerts.map((za) => {
          const currentText = editableAlerts[za.zone_id] !== undefined
            ? editableAlerts[za.zone_id]
            : za.sms_text;
          const charCount = currentText.length;
          const isCopied = copiedId === za.zone_id;

          return (
            <div
              key={za.zone_id}
              className="bg-[#0A0E1A]/80 border border-[#1E2638] rounded-xl p-3.5 flex flex-col justify-between"
            >
              <div>
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-xs font-mono">
                      {za.zone_name}
                    </span>
                    <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase ${
                      za.urgency_level === 'CRITICAL' ? 'bg-red-950 text-red-300 border border-red-800' :
                      za.urgency_level === 'HIGH' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                      'bg-slate-800 text-slate-300'
                    }`}>
                      {za.urgency_level}
                    </span>
                  </div>

                  <span className={`text-[10px] font-mono ${charCount > 160 ? 'text-amber-400' : 'text-slate-500'}`}>
                    {charCount}/160 chars
                  </span>
                </div>

                {/* What Changed on Re-plan */}
                {za.what_changed && (
                  <div className="mb-2 p-1.5 rounded bg-purple-950/40 border border-purple-800/40 text-[10px] text-purple-200 font-mono">
                    <span className="font-bold text-purple-300 uppercase">What Changed: </span>
                    {za.what_changed}
                  </div>
                )}

                {/* Editable Text Area */}
                <div className="relative mb-2">
                  <textarea
                    rows={3}
                    value={currentText}
                    onChange={(e) => handleTextChange(za.zone_id, e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg p-2 text-xs text-slate-100 font-sans focus:outline-none focus:border-blue-500 resize-none"
                    placeholder="Enter dispatch message..."
                  />
                  <div className="absolute right-2 bottom-2 text-slate-500 pointer-events-none">
                    <Edit3 className="w-3 h-3" />
                  </div>
                </div>

                {/* Route & Shelter advisory metadata */}
                <div className="text-[10px] text-slate-400 space-y-0.5 mb-2 font-mono">
                  <div>Shelter: <span className="text-slate-300">{za.shelter_info}</span></div>
                  <div>Hazard: <span className="text-amber-300/90">{za.route_hazards}</span></div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                <span className="text-[10px] text-slate-500">
                  Dispatcher verified
                </span>
                <button
                  onClick={() => handleCopy(za.zone_id, currentText)}
                  className={`text-xs px-2.5 py-1 rounded font-medium flex items-center gap-1.5 transition-all ${
                    isCopied
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy SMS</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
