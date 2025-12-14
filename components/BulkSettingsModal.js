
import { useState } from 'react';

export default function BulkSettingsModal({ isOpen, onClose, selectedCount, onApply }) {
  const [settings, setSettings] = useState({
    hourlyLimit: '',
    dailyLimit: '',
    warmupEnabled: null,
    active: null
  });

  const handleApply = () => {
    // Only send non-empty values
    const updates = {};
    if (settings.hourlyLimit !== '') updates.hourlyLimit = parseInt(settings.hourlyLimit);
    if (settings.dailyLimit !== '') updates.dailyLimit = parseInt(settings.dailyLimit);
    if (settings.warmupEnabled !== null) updates.warmupEnabled = settings.warmupEnabled;
    if (settings.active !== null) updates.active = settings.active;

    if (Object.keys(updates).length > 0) {
      onApply(updates);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-6 border-b border-glass mb-4">
          <h2 className="text-xl font-bold text-white">⚙️ Bulk Instellingen</h2>
          <button className="text-secondary hover:text-white text-2xl" onClick={onClose}>×</button>
        </div>

        <div className="p-6 space-y-6">
          <div className="p-4 bg-accent/10 border border-accent/30 rounded-lg text-center text-accent mb-6">
            Instellingen toepassen op <strong className="text-white text-lg mx-1">{selectedCount}</strong> accounts
          </div>

          {/* Hourly Limit */}
          <div className="space-y-2">
            <label className="text-xs text-secondary uppercase font-bold">Hourly Limit</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="500"
                placeholder="Niet wijzigen"
                value={settings.hourlyLimit}
                onChange={e => setSettings(s => ({ ...s, hourlyLimit: e.target.value }))}
                className="premium-input flex-1"
              />
              <span className="text-sm text-secondary">emails/uur</span>
            </div>
          </div>

          {/* Daily Limit */}
          <div className="space-y-2">
            <label className="text-xs text-secondary uppercase font-bold">Daily Limit</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="10000"
                placeholder="Niet wijzigen"
                value={settings.dailyLimit}
                onChange={e => setSettings(s => ({ ...s, dailyLimit: e.target.value }))}
                className="premium-input flex-1"
              />
              <span className="text-sm text-secondary">emails/dag</span>
            </div>
          </div>

          {/* Warmup Toggle */}
          <div className="space-y-2">
            <label className="text-xs text-secondary uppercase font-bold">Warmup</label>
            <div className="flex gap-2">
              <button
                className={`flex-1 py-2 px-3 rounded border text-sm transition-all ${settings.warmupEnabled === null ? 'bg-white/10 border-white/20 text-white' : 'bg-transparent border-glass text-secondary'}`}
                onClick={() => setSettings(s => ({ ...s, warmupEnabled: null }))}
              >
                — Niet wijzigen
              </button>
              <button
                className={`flex-1 py-2 px-3 rounded border text-sm transition-all ${settings.warmupEnabled === true ? 'bg-orange-500/20 border-orange-500 text-orange-500 font-bold' : 'bg-transparent border-glass text-secondary'}`}
                onClick={() => setSettings(s => ({ ...s, warmupEnabled: true }))}
              >
                🔥 Aan
              </button>
              <button
                className={`flex-1 py-2 px-3 rounded border text-sm transition-all ${settings.warmupEnabled === false ? 'bg-blue-500/20 border-blue-500 text-blue-500 font-bold' : 'bg-transparent border-glass text-secondary'}`}
                onClick={() => setSettings(s => ({ ...s, warmupEnabled: false }))}
              >
                ❄️ Uit
              </button>
            </div>
          </div>

          {/* Active Toggle */}
          <div className="space-y-2">
            <label className="text-xs text-secondary uppercase font-bold">Account Status</label>
            <div className="flex gap-2">
              <button
                className={`flex-1 py-2 px-3 rounded border text-sm transition-all ${settings.active === null ? 'bg-white/10 border-white/20 text-white' : 'bg-transparent border-glass text-secondary'}`}
                onClick={() => setSettings(s => ({ ...s, active: null }))}
              >
                — Niet wijzigen
              </button>
              <button
                className={`flex-1 py-2 px-3 rounded border text-sm transition-all ${settings.active === true ? 'bg-green-500/20 border-green-500 text-green-500 font-bold' : 'bg-transparent border-glass text-secondary'}`}
                onClick={() => setSettings(s => ({ ...s, active: true }))}
              >
                ✅ Actief
              </button>
              <button
                className={`flex-1 py-2 px-3 rounded border text-sm transition-all ${settings.active === false ? 'bg-red-500/20 border-red-500 text-red-500 font-bold' : 'bg-transparent border-glass text-secondary'}`}
                onClick={() => setSettings(s => ({ ...s, active: false }))}
              >
                ⏸️ Inactief
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-glass flex justify-end gap-3 bg-black/20">
          <button className="premium-button secondary" onClick={onClose}>
            Annuleren
          </button>
          <button className="premium-button" onClick={handleApply}>
            ✅ Toepassen op {selectedCount} accounts
          </button>
        </div>
      </div>
    </div>
  );
}
