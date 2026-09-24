import React, { useState } from 'react';
import { CheckCircle2, X, ShieldCheck, AlertTriangle } from 'lucide-react';

export default function ApprovalModal({ plan, isOpen, onClose, onConfirmApproval, isSubmitting }) {
  const [commanderName, setCommanderName] = useState('Commander Sarah Jenkins');
  const [notes, setNotes] = useState('Reviewed allocations and conflict resolutions. All dispatches approved for field deployment.');

  if (!isOpen || !plan) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!commanderName.trim()) return;
    onConfirmApproval(commanderName, notes);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0D1322] border border-[#212C44] rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#151D30]"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-emerald-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white font-mono">
              Commander Plan Approval
            </h3>
            <p className="text-xs text-slate-400">
              Formal Sign-off for Plan {plan.plan_id} (Version {plan.plan_version})
            </p>
          </div>
        </div>

        <div className="bg-amber-950/30 border border-amber-600/30 rounded-lg p-3 text-xs text-amber-200 mb-4 flex items-start gap-2 font-mono">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            Signing off formally authorizes field deployment of {plan.allocations?.reduce((acc, a) => acc + a.ambulances.allocated, 0)} ambulances, {plan.allocations?.reduce((acc, a) => acc + a.evacuation_vehicles.allocated, 0)} vehicles, and broadcast alerts.
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1 font-mono">
              Commander Full Name / Call-Sign
            </label>
            <input
              type="text"
              required
              value={commanderName}
              onChange={(e) => setCommanderName(e.target.value)}
              className="w-full bg-[#070A12] border border-[#1E2638] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 font-mono"
              placeholder="e.g. Incident Commander John Doe"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1 font-mono">
              Operational Audit Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#070A12] border border-[#1E2638] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-violet-500 resize-none font-mono"
              placeholder="Record any tactical observations or conditions..."
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium px-5 py-2 rounded-lg text-xs flex items-center gap-2 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Recording Signature...' : 'Authorize & Sign Plan'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
