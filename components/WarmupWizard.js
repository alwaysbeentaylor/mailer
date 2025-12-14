
import { useState } from 'react';
import { WARMUP_PROFILES, STARTING_POINTS, calculateDailyLimit, getDaysRemaining } from '../utils/warmupProfiles';

export default function WarmupWizard({ onComplete, onCancel }) {
  const [step, setStep] = useState(1);
  const [settings, setSettings] = useState({
    profile: 'standard',
    startingPoint: 'new',
    reduceOnWeekends: true,
    customLimit: null
  });

  const profile = WARMUP_PROFILES[settings.profile];
  const startingPoint = STARTING_POINTS[settings.startingPoint];

  // Calculate preview
  const previewData = {
    warmupEnabled: true,
    warmupProfile: settings.profile,
    warmupStartDate: new Date().toISOString().split('T')[0],
    startingPoint: settings.startingPoint,
    customDailyLimit: settings.customLimit
  };
  const initialLimit = calculateDailyLimit(previewData);
  const daysRemaining = getDaysRemaining(previewData);

  const handleComplete = () => {
    onComplete(settings);
  };

  return (
    <div className="glass-card bg-[#0d0d1a] border-glass p-6 max-w-lg mx-auto w-full">
      <div className="mb-6">
        <h3 className="text-xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-red-600">🔥 Warm-up Configuratie</h3>
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(s => (
            <span key={s} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${s === step ? 'bg-accent text-white shadow-lg shadow-accent/50 scale-110' : s < step ? 'bg-success text-white' : 'bg-white/10 text-secondary'}`}>
              {s < step ? '✓' : s}
            </span>
          ))}
        </div>
      </div>

      <div className="min-h-[300px]">
        {/* Step 1: Profile Selection */}
        {step === 1 && (
          <div className="animate-in slide-in-from-right-4 fade-in duration-300">
            <h4 className="text-lg font-bold mb-4 text-white">Kies je warm-up strategie</h4>
            <div className="space-y-3">
              {Object.values(WARMUP_PROFILES).map(p => (
                <label
                  key={p.id}
                  className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${settings.profile === p.id ? 'bg-accent/10 border-accent shadow-md shadow-accent/20' : 'bg-white/5 border-glass hover:bg-white/10'}`}
                >
                  <input
                    type="radio"
                    name="profile"
                    value={p.id}
                    checked={settings.profile === p.id}
                    onChange={(e) => setSettings({ ...settings, profile: e.target.value })}
                    className="mt-1 accent-accent"
                  />
                  <div>
                    <div className="font-bold text-white mb-1">{p.name}</div>
                    <div className="text-sm text-secondary">{p.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Starting Point */}
        {step === 2 && (
          <div className="animate-in slide-in-from-right-4 fade-in duration-300">
            <h4 className="text-lg font-bold mb-4 text-white">Huidige status van dit account</h4>
            <div className="space-y-3">
              {Object.values(STARTING_POINTS).map(sp => (
                <label
                  key={sp.id}
                  className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${settings.startingPoint === sp.id ? 'bg-accent/10 border-accent shadow-md shadow-accent/20' : 'bg-white/5 border-glass hover:bg-white/10'}`}
                >
                  <input
                    type="radio"
                    name="startingPoint"
                    value={sp.id}
                    checked={settings.startingPoint === sp.id}
                    onChange={(e) => setSettings({ ...settings, startingPoint: e.target.value })}
                    className="mt-1 accent-accent"
                  />
                  <div>
                    <div className="font-bold text-white mb-1">{sp.label}</div>
                    <div className="text-sm text-secondary">{sp.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Weekend Mode */}
        {step === 3 && (
          <div className="animate-in slide-in-from-right-4 fade-in duration-300">
            <h4 className="text-lg font-bold mb-4 text-white">Extra Instellingen</h4>

            <label className="flex items-center gap-4 p-4 rounded-xl border bg-white/5 border-glass cursor-pointer hover:bg-white/10 mb-6">
              <input
                type="checkbox"
                checked={settings.reduceOnWeekends}
                onChange={(e) => setSettings({ ...settings, reduceOnWeekends: e.target.checked })}
                className="w-5 h-5 accent-accent"
              />
              <div>
                <div className="font-bold text-white">📅 Verminder op weekenden</div>
                <div className="text-sm text-secondary">
                  50% minder emails op zaterdag en zondag voor een realistischer patroon.
                </div>
              </div>
            </label>

            {settings.profile === 'custom' && (
              <div className="p-4 rounded-xl bg-white/5 border border-glass">
                <label className="block text-sm text-secondary mb-2">Dagelijks limiet:</label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={settings.customLimit || 50}
                  onChange={(e) => setSettings({ ...settings, customLimit: parseInt(e.target.value) || 50 })}
                  className="premium-input w-full"
                />
              </div>
            )}
          </div>
        )}

        {/* Step 4: Summary */}
        {step === 4 && (
          <div className="animate-in slide-in-from-right-4 fade-in duration-300">
            <h4 className="text-lg font-bold mb-4 text-white">Controleer Instellingen</h4>
            <div className="p-5 rounded-xl bg-white/5 border border-glass space-y-3">
              <div className="flex justify-between text-sm py-2 border-b border-white/10">
                <span className="text-secondary">Strategie</span>
                <strong className="text-white">{profile.name}</strong>
              </div>
              <div className="flex justify-between text-sm py-2 border-b border-white/10">
                <span className="text-secondary">Start positie</span>
                <strong className="text-white">{startingPoint.label}</strong>
              </div>
              <div className="flex justify-between text-sm py-2 border-b border-white/10">
                <span className="text-secondary">Weekend modus</span>
                <strong className="text-white">{settings.reduceOnWeekends ? '✅ Actief' : '❌ Uit'}</strong>
              </div>

              <div className="pt-2 mt-4 space-y-2">
                <div className="flex justify-between items-center p-3 bg-accent/10 border border-accent/20 rounded-lg">
                  <span className="text-accent font-bold">Start Limiet Vandaag</span>
                  <strong className="text-white text-lg">{initialLimit} emails</strong>
                </div>
                <div className="flex justify-between items-center p-3 bg-white/5 border border-white/10 rounded-lg">
                  <span className="text-secondary">Volledig opgewarmd over</span>
                  <strong className="text-white">{daysRemaining} dagen</strong>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-4 mt-8 pt-6 border-t border-glass">
        {step > 1 && (
          <button className="premium-button secondary" onClick={() => setStep(step - 1)}>
            ← Vorige
          </button>
        )}
        {step < 4 ? (
          <button className="premium-button flex-1" onClick={() => setStep(step + 1)}>
            Volgende →
          </button>
        ) : (
          <button className="premium-button flex-1 bg-gradient-to-r from-orange-500 to-red-600" onClick={handleComplete}>
            ✅ Start Warm-up
          </button>
        )}
        <button className="premium-button secondary text-muted hover:text-white ml-auto" onClick={onCancel}>
          Annuleren
        </button>
      </div>
    </div>
  );
}
