
import { useState, useEffect } from 'react';

export default function SmtpSettingsModal({ isOpen, onClose, account, advice, onSave, onTest }) {
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    port: '587',
    user: '',
    pass: '',
    fromName: '',
    fromEmail: '',
    hourlyLimit: 10,
    dailyLimit: 50,
    warmupEnabled: false,
    active: true
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (account) {
      setFormData({
        name: account.name || '',
        host: account.host || '',
        port: account.port || '587',
        user: account.user || '',
        pass: '', // Don't show password
        fromName: account.fromName || '',
        fromEmail: account.fromEmail || '',
        hourlyLimit: account.hourlyLimit || advice?.recommended?.hourly || 10,
        dailyLimit: account.dailyLimit || advice?.recommended?.daily || 50,
        warmupEnabled: account.warmupEnabled || false,
        active: account.active !== false
      });
    } else {
      // Reset for new account
      setFormData({
        name: '',
        host: '',
        port: '587',
        user: '',
        pass: '',
        fromName: '',
        fromEmail: '',
        hourlyLimit: 10,
        dailyLimit: 50,
        warmupEnabled: false,
        active: true
      });
    }
    setTestResult(null);
  }, [account, advice, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onSave(account?.id, formData);
    onClose();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTest(formData);
      setTestResult(result);
    } catch (error) {
      setTestResult({ success: false, message: error.message });
    }
    setTesting(false);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-6 border-b border-glass mb-4">
          <h2 className="text-xl font-bold text-white">⚙️ {account ? 'SMTP Instellingen' : 'Nieuw SMTP Account'}</h2>
          <button className="text-secondary hover:text-white text-2xl" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
          <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6 max-h-[70vh]">
            {/* Advice Card (if available) */}
            {advice && (
              <div className="bg-white/5 border rounded-lg p-4 mb-4" style={{ borderColor: advice.statusColor }}>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-sm" style={{ color: advice.statusColor }}>
                    {advice.statusEmoji} {advice.statusLabel}
                  </span>
                  <span className="text-xs text-secondary">
                    Score: {advice.healthScore}/100
                  </span>
                </div>
                <div className="text-sm text-white mb-2">
                  📊 Aanbevolen: {advice.recommended.hourly}/uur, {advice.recommended.daily}/dag
                </div>
                {advice.warnings?.length > 0 && (
                  <div className="text-xs text-warning space-y-1">
                    {advice.warnings.map((w, i) => (
                      <div key={i}>⚠️ {w}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Account Name */}
              <div className="md:col-span-2 space-y-2">
                <label className="text-xs text-secondary uppercase font-bold">Account Naam</label>
                <input
                  type="text"
                  placeholder="Bijv: Gmail #1"
                  value={formData.name}
                  onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                  className="premium-input w-full"
                />
              </div>

              {/* Host & Port */}
              <div className="space-y-2">
                <label className="text-xs text-secondary uppercase font-bold">SMTP Host *</label>
                <input
                  type="text"
                  required
                  placeholder="smtp.gmail.com"
                  value={formData.host}
                  onChange={e => setFormData(f => ({ ...f, host: e.target.value }))}
                  className="premium-input w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-secondary uppercase font-bold">Port</label>
                <input
                  type="text"
                  placeholder="587"
                  value={formData.port}
                  onChange={e => setFormData(f => ({ ...f, port: e.target.value }))}
                  className="premium-input w-full"
                />
              </div>

              {/* User & Pass */}
              <div className="space-y-2">
                <label className="text-xs text-secondary uppercase font-bold">Username / Email *</label>
                <input
                  type="email"
                  required
                  placeholder="email@domain.com"
                  value={formData.user}
                  onChange={e => setFormData(f => ({ ...f, user: e.target.value }))}
                  className="premium-input w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-secondary uppercase font-bold">Password *</label>
                <input
                  type="password"
                  required={!account}
                  placeholder={account ? '••••••••' : 'App Password'}
                  value={formData.pass}
                  onChange={e => setFormData(f => ({ ...f, pass: e.target.value }))}
                  className="premium-input w-full"
                />
              </div>

              {/* From Name & Email */}
              <div className="space-y-2">
                <label className="text-xs text-secondary uppercase font-bold">Afzender Naam</label>
                <input
                  type="text"
                  placeholder="SKYE"
                  value={formData.fromName}
                  onChange={e => setFormData(f => ({ ...f, fromName: e.target.value }))}
                  className="premium-input w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-secondary uppercase font-bold">Afzender Email</label>
                <input
                  type="email"
                  placeholder="(optioneel, default = user)"
                  value={formData.fromEmail}
                  onChange={e => setFormData(f => ({ ...f, fromEmail: e.target.value }))}
                  className="premium-input w-full"
                />
              </div>

              {/* Limits */}
              <div className="space-y-2">
                <label className="text-xs text-secondary uppercase font-bold">Hourly Limit</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={formData.hourlyLimit}
                  onChange={e => setFormData(f => ({ ...f, hourlyLimit: parseInt(e.target.value) || 10 }))}
                  className="premium-input w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-secondary uppercase font-bold">Daily Limit</label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={formData.dailyLimit}
                  onChange={e => setFormData(f => ({ ...f, dailyLimit: parseInt(e.target.value) || 50 }))}
                  className="premium-input w-full"
                />
              </div>

              {/* Toggles */}
              <div className="space-y-2">
                <label className="text-xs text-secondary uppercase font-bold">Warmup</label>
                <button
                  type="button"
                  className={`w-full py-2 px-3 rounded border text-sm transition-all text-left ${formData.warmupEnabled ? 'bg-orange-500/20 border-orange-500 text-orange-500 font-bold' : 'bg-white/5 border-glass text-secondary'}`}
                  onClick={() => setFormData(f => ({ ...f, warmupEnabled: !f.warmupEnabled }))}
                >
                  {formData.warmupEnabled ? '🔥 Aan' : '❄️ Uit'}
                </button>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-secondary uppercase font-bold">Status</label>
                <button
                  type="button"
                  className={`w-full py-2 px-3 rounded border text-sm transition-all text-left ${formData.active ? 'bg-green-500/20 border-green-500 text-green-500 font-bold' : 'bg-white/5 border-glass text-secondary'}`}
                  onClick={() => setFormData(f => ({ ...f, active: !f.active }))}
                >
                  {formData.active ? '✅ Actief' : '⏸️ Inactief'}
                </button>
              </div>
            </div>

            {/* Test Button & Result */}
            <div className="mt-4">
              <button
                type="button"
                className="premium-button secondary w-full"
                onClick={handleTest}
                disabled={testing || !formData.host || !formData.user}
              >
                {testing ? '⏳ Testen...' : '🔌 Test Verbinding'}
              </button>

              {testResult && (
                <div className={`mt-3 p-3 rounded-lg text-sm border font-bold ${testResult.success ? 'bg-green-500/10 border-green-500/30 text-success' : 'bg-red-500/10 border-error/30 text-error'}`}>
                  {testResult.success ? '✅ ' : '❌ '} {testResult.message}
                </div>
              )}
            </div>
          </div>

          <div className="p-6 border-t border-glass flex justify-end gap-3 bg-black/20 mt-auto">
            <button type="button" className="premium-button secondary" onClick={onClose}>
              Annuleren
            </button>
            <button type="submit" className="premium-button bg-gradient-to-r from-blue-600 to-indigo-600">
              💾 Opslaan
            </button>
          </div>
        </form>
      </div>
      <style jsx>{`
               .custom-scrollbar::-webkit-scrollbar {
                  width: 6px;
               }
               .custom-scrollbar::-webkit-scrollbar-track {
                  background: rgba(0,0,0,0.1);
               }
               .custom-scrollbar::-webkit-scrollbar-thumb {
                  background: rgba(255,255,255,0.1);
                  border-radius: 3px;
               }
            `}</style>
    </div>
  );
}
