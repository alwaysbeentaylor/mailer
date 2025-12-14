
import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../components/Layout';
import WarmupStatus from '../components/WarmupStatus';
import WarmupWizard from '../components/WarmupWizard';
import { getSmtpAccounts } from '../utils/campaignStore';
import {
  getWarmupSummary,
  initializeWarmup,
  pauseWarmup,
  resumeWarmup,
  disableWarmup,
  updateWarmupSettings
} from '../utils/warmupStore';

export default function WarmupPage() {
  const [accounts, setAccounts] = useState([]);
  const [warmupData, setWarmupData] = useState({});
  const [showWizard, setShowWizard] = useState(null); // accountId or null
  const [editingLimit, setEditingLimit] = useState(null); // accountId or null
  const [customLimitValue, setCustomLimitValue] = useState('');

  useEffect(() => {
    loadData();
    // Refresh every minute to update counters
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadData = () => {
    const smtpAccounts = getSmtpAccounts();
    setAccounts(smtpAccounts);

    const data = {};
    smtpAccounts.forEach(account => {
      data[account.id] = getWarmupSummary(account.id);
    });
    setWarmupData(data);
  };

  const handleSetupComplete = (accountId, settings) => {
    initializeWarmup(accountId, settings);
    setShowWizard(null);
    loadData();
  };

  const handlePause = (accountId) => {
    pauseWarmup(accountId);
    loadData();
  };

  const handleResume = (accountId) => {
    resumeWarmup(accountId);
    loadData();
  };

  const handleDisable = (accountId) => {
    if (confirm('Weet je zeker dat je warm-up wilt uitschakelen voor dit account?')) {
      disableWarmup(accountId);
      loadData();
    }
  };

  const handleOverrideLimit = (accountId) => {
    const limit = parseInt(customLimitValue);
    if (limit > 0) {
      updateWarmupSettings(accountId, { customDailyLimit: limit });
      setEditingLimit(null);
      setCustomLimitValue('');
      loadData();
    }
  };

  const handleClearOverride = (accountId) => {
    updateWarmupSettings(accountId, { customDailyLimit: null });
    loadData();
  };

  return (
    <Layout title="Warm-up | SKYE Mail Agent">
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">🔥 Email Warm-up</h1>
          <p className="page-subtitle">Beheer de reputatie en opwarm-status van je SMTP accounts.</p>
        </div>

        {accounts.length === 0 ? (
          <div className="glass-card text-center py-16">
            <span className="text-6xl block mb-6">📭</span>
            <h2 className="text-2xl font-bold mb-2">Geen SMTP accounts</h2>
            <p className="text-secondary mb-8">Voeg eerst SMTP accounts toe om warm-up te configureren</p>
            <Link href="/settings">
              <button className="premium-button">⚙️ Ga naar Settings</button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-12">
            {accounts.map(account => {
              const summary = warmupData[account.id] || {};
              const isEditing = editingLimit === account.id;

              return (
                <div key={account.id} className="glass-card flex flex-col h-full bg-[#0d0d1a] border-glass">
                  <div className="flex justify-between items-start mb-4 border-b border-glass pb-4">
                    <div>
                      <h3 className="font-bold text-lg truncate pr-2">{account.name || 'Account'}</h3>
                      <span className="text-xs text-secondary">{account.user}</span>
                    </div>
                    <span className={`badge ${account.active ? 'badge-success' : 'badge-warning'}`}>
                      {account.active ? '● Actief' : '○ Inactief'}
                    </span>
                  </div>

                  {showWizard === account.id ? (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                      <WarmupWizard
                        onComplete={(settings) => {
                          handleSetupComplete(account.id, settings);
                          setShowWizard(null);
                        }}
                        onCancel={() => setShowWizard(null)}
                      />
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col">
                      <WarmupStatus summary={summary} />

                      {/* Custom Limit Override */}
                      {summary.enabled && !summary.isComplete && (
                        <div className="mt-4 p-3 bg-white/5 rounded-lg border border-glass">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <input
                                type="number"
                                min="1"
                                max="500"
                                value={customLimitValue}
                                onChange={(e) => setCustomLimitValue(e.target.value)}
                                placeholder="Nieuw limiet"
                                className="premium-input text-sm py-1 px-2 flex-1"
                                autoFocus
                              />
                              <button onClick={() => handleOverrideLimit(account.id)} className="premium-button text-xs py-1 px-3">
                                ✓
                              </button>
                              <button onClick={() => setEditingLimit(null)} className="premium-button secondary text-xs py-1 px-3">
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingLimit(account.id);
                                setCustomLimitValue(summary.dailyLimit?.toString() || '');
                              }}
                              className="text-xs text-secondary hover:text-accent flex items-center gap-1 w-full"
                            >
                              ✏️ Pas dagelijks limiet aan
                            </button>
                          )}
                        </div>
                      )}

                      {/* Controls */}
                      <div className="mt-auto pt-4 space-y-3">
                        {!summary.enabled ? (
                          <button
                            onClick={() => setShowWizard(account.id)}
                            className="premium-button w-full bg-gradient-to-r from-orange-500 to-red-600"
                          >
                            🔥 Warm-up Starten
                          </button>
                        ) : (
                          <div className="grid grid-cols-2 gap-3">
                            {summary.paused ? (
                              <button onClick={() => handleResume(account.id)} className="premium-button w-full from-green-600 to-green-700">
                                ▶️ Hervatten
                              </button>
                            ) : !summary.isComplete ? (
                              <button onClick={() => handlePause(account.id)} className="premium-button secondary w-full text-warning border-warning/30 hover:bg-warning/10">
                                ⏸️ Pauzeren
                              </button>
                            ) : (
                              <div className="text-center text-success font-bold py-2 col-span-2">Klaar!</div>
                            )}

                            <button onClick={() => handleDisable(account.id)} className="premium-button secondary w-full text-muted hover:text-error text-xs">
                              🛑 Stoppen
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Stats */}
                      {summary.enabled && (
                        <div className="flex justify-between mt-4 pt-4 border-t border-glass text-center">
                          <div>
                            <div className="text-xl font-bold text-accent">{summary.totalSent || 0}</div>
                            <div className="text-[10px] text-secondary uppercase">Totaal</div>
                          </div>
                          <div>
                            <div className="text-xl font-bold text-white">{summary.daysRemaining || 0}</div>
                            <div className="text-[10px] text-secondary uppercase">Dagen</div>
                          </div>
                          <div>
                            <div className="text-xl font-bold text-success">{Math.round(summary.reputationScore || 100)}%</div>
                            <div className="text-[10px] text-secondary uppercase">Score</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Info Section */}
        <div className="glass-card">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">💡 Over Email Warm-up</h3>
          <p className="text-secondary mb-6 max-w-3xl">
            Email warm-up is het proces van geleidelijk het volume van verzonden emails verhogen
            vanaf een nieuw email account. Dit helpt om een goede reputatie op te bouwen bij
            email providers zoals Gmail en Outlook, zodat je emails niet in de spam belanden.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-white/5 rounded-xl border border-glass flex flex-col items-center text-center">
              <span className="text-3xl mb-2">🐢</span>
              <strong className="text-white block mb-1">Voorzichtig</strong>
              <span className="text-xs text-secondary">8 weken, start met 3/dag</span>
            </div>
            <div className="p-4 bg-white/5 rounded-xl border border-glass flex flex-col items-center text-center border-accent/30 shadow-[0_0_15px_rgba(0,164,232,0.1)]">
              <span className="text-3xl mb-2">🚶</span>
              <strong className="text-accent block mb-1">Standaard</strong>
              <span className="text-xs text-secondary">4 weken, start met 10/dag</span>
            </div>
            <div className="p-4 bg-white/5 rounded-xl border border-glass flex flex-col items-center text-center">
              <span className="text-3xl mb-2">🏃</span>
              <strong className="text-white block mb-1">Agressief</strong>
              <span className="text-xs text-secondary">2 weken, start met 20/dag</span>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
