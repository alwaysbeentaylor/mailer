import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import {
  getCampaigns,
  getCampaign,
  updateCampaign,
  updateCampaignEmail,
  deleteCampaign,
  getSmtpAccounts,
  getNextSmtpAccount,
  advanceSmtpIndex,
  saveSmtpAccounts
} from "../utils/campaignStore";
import { canSendEmail, incrementDailySent, getWarmupSummary } from "../utils/warmupStore";

export default function Campaigns() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [smtpAccounts, setSmtpAccounts] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentEmailIndex, setCurrentEmailIndex] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('idle'); // idle, connecting, connected, error
  const [logs, setLogs] = useState([]);
  const [viewingEmail, setViewingEmail] = useState(null); // Email being previewed
  const abortRef = useRef(false);
  const logsEndRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  // Auto-select campaign from URL query
  useEffect(() => {
    if (router.query.id && campaigns.length > 0) {
      const campaign = campaigns.find(c => c.id === router.query.id);
      if (campaign && !selectedCampaign) {
        selectCampaign(campaign);
      }
    }
  }, [router.query.id, campaigns]);

  useEffect(() => {
    // Scroll logs to bottom
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const loadData = () => {
    setCampaigns(getCampaigns());
    setSmtpAccounts(getSmtpAccounts());

    // Sync SMTP accounts from API to ensure we have latest data (esp. for new accounts)
    fetch('/api/smtp-accounts')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.accounts) {
          saveSmtpAccounts(data.accounts);
          setSmtpAccounts(data.accounts);
        }
      })
      .catch(err => console.error('Failed to sync SMTP accounts:', err));
  };

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString('nl-NL');
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };

  const selectCampaign = (campaign) => {
    setSelectedCampaign(campaign);
    setLogs([]);
    setCurrentEmailIndex(campaign.emails.findIndex(e => e.status === 'pending'));
  };

  const startCampaign = async () => {
    if (!selectedCampaign) return;

    abortRef.current = false;
    setIsRunning(true);
    setConnectionStatus('connecting');

    // Update status
    updateCampaign(selectedCampaign.id, {
      status: 'running',
      startedAt: selectedCampaign.startedAt || new Date().toISOString()
    });

    addLog('🚀 Campagne gestart...', 'success');

    // Get pending emails
    const pendingEmails = selectedCampaign.emails
      .map((email, index) => ({ ...email, originalIndex: index }))
      .filter(e => e.status === 'pending' || e.status === 'failed');

    if (pendingEmails.length === 0) {
      addLog('✅ Geen emails meer te versturen', 'success');
      setIsRunning(false);
      setConnectionStatus('idle');
      return;
    }

    addLog(`📧 ${pendingEmails.length} emails te versturen`);

    for (let i = 0; i < pendingEmails.length; i++) {
      if (abortRef.current) {
        addLog('⏸️ Campagne gepauzeerd', 'warning');
        break;
      }

      const emailData = pendingEmails[i];
      setCurrentEmailIndex(emailData.originalIndex);

      // Get SMTP account
      const campaign = getCampaign(selectedCampaign.id);
      const smtpAccount = getNextSmtpAccount(campaign);

      if (!smtpAccount) {
        addLog('❌ Geen actief SMTP account beschikbaar!', 'error');
        setConnectionStatus('error');
        break;
      }

      setConnectionStatus('connected');

      // Step 1: Verify domain before sending (if enabled)
      if (campaign.verifyDomains !== false && emailData.websiteUrl) {
        addLog(`🔍 Verificatie domein voor ${emailData.businessName || emailData.email}...`);

        try {
          const verifyResponse = await fetch('/api/verify-domain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ websiteUrl: emailData.websiteUrl })
          });

          const verifyResult = await verifyResponse.json();

          if (!verifyResult.valid) {
            // Domain is not reachable - skip this email
            updateCampaignEmail(selectedCampaign.id, emailData.originalIndex, {
              status: 'failed',
              error: `Domein onbereikbaar: ${verifyResult.error || 'DNS check mislukt'}`
            });
            addLog(`⚠️ ${emailData.email} - Domein onbereikbaar, overgeslagen`, 'warning');
            setSelectedCampaign(getCampaign(selectedCampaign.id));
            continue; // Skip to next email
          }

          addLog(`✅ Domein ${verifyResult.domain} geverifieerd`);
        } catch (verifyError) {
          // If verification fails, log warning but continue (don't block)
          addLog(`⚠️ Domein verificatie mislukt: ${verifyError.message}, toch doorgaan...`, 'warning');
        }
      }

      // Step 2: Check warm-up limit
      const warmupCheck = canSendEmail(smtpAccount.id);
      if (!warmupCheck.allowed) {
        addLog(`⚠️ Warm-up limiet bereikt voor ${smtpAccount.name || smtpAccount.host}: ${warmupCheck.reason}`, 'warning');
        updateCampaignEmail(selectedCampaign.id, emailData.originalIndex, {
          status: 'failed',
          error: `Warm-up limiet: ${warmupCheck.reason}`
        });
        setSelectedCampaign(getCampaign(selectedCampaign.id));
        continue; // Skip to next email
      }

      addLog(`📤 Verzenden naar ${emailData.email} via ${smtpAccount.name || smtpAccount.host}... (${warmupCheck.remaining} over vandaag)`);

      // Mark as sending
      updateCampaignEmail(selectedCampaign.id, emailData.originalIndex, { status: 'sending' });

      try {
        const response = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toEmail: emailData.email,
            businessName: emailData.businessName,
            websiteUrl: emailData.websiteUrl,
            contactPerson: emailData.contactPerson,
            emailTone: campaign.emailTone,
            customSubject: campaign.customSubject,
            customPreheader: campaign.customPreheader,
            sessionPrompt: campaign.sessionPrompt,
            smtpConfig: smtpAccount,
            smtpAccountId: smtpAccount.id
          })
        });

        const result = await response.json();

        if (result.success) {
          updateCampaignEmail(selectedCampaign.id, emailData.originalIndex, {
            status: 'sent',
            sentAt: new Date().toISOString(),
            smtpUsed: smtpAccount.name || smtpAccount.host,
            emailId: result.emailId,
            // Store generated content for viewing later
            generatedSubject: result.subject,
            generatedBody: result.body,
            generatedSections: result.sections
          });
          // Update warm-up counter
          incrementDailySent(smtpAccount.id);
          addLog(`✅ ${emailData.email} - verzonden`, 'success');
        } else {
          updateCampaignEmail(selectedCampaign.id, emailData.originalIndex, {
            status: 'failed',
            error: result.error || result.details
          });
          addLog(`❌ ${emailData.email} - ${result.error || 'Mislukt'}`, 'error');
        }
      } catch (err) {
        updateCampaignEmail(selectedCampaign.id, emailData.originalIndex, {
          status: 'failed',
          error: err.message
        });
        addLog(`❌ ${emailData.email} - ${err.message}`, 'error');
      }

      // Advance SMTP rotation
      if (campaign.smtpMode === 'rotate') {
        advanceSmtpIndex(selectedCampaign.id);
      }

      // Reload campaign data
      setSelectedCampaign(getCampaign(selectedCampaign.id));

      // Delay between emails
      if (i < pendingEmails.length - 1 && !abortRef.current) {
        const delay = campaign.delayBetweenEmails || 3000;
        addLog(`⏳ Wachten ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    // Complete
    const finalCampaign = getCampaign(selectedCampaign.id);
    const allDone = finalCampaign.emails.every(e => e.status === 'sent' || e.status === 'failed');

    if (allDone && !abortRef.current) {
      updateCampaign(selectedCampaign.id, {
        status: 'completed',
        completedAt: new Date().toISOString()
      });
      addLog('🎉 Campagne voltooid!', 'success');
    } else if (abortRef.current) {
      updateCampaign(selectedCampaign.id, { status: 'paused' });
    }

    setIsRunning(false);
    setConnectionStatus('idle');
    setSelectedCampaign(getCampaign(selectedCampaign.id));
    loadData();
  };

  const pauseCampaign = () => {
    abortRef.current = true;
    addLog('⏸️ Pauzeren...', 'warning');
  };

  const stopCampaign = () => {
    abortRef.current = true;
    updateCampaign(selectedCampaign.id, { status: 'stopped' });
    addLog('⏹️ Campagne gestopt', 'warning');
    setIsRunning(false);
    setConnectionStatus('idle');
    setSelectedCampaign(getCampaign(selectedCampaign.id));
    loadData();
  };

  const retryFailed = async () => {
    if (!selectedCampaign) return;

    // Reset failed emails to pending
    const campaign = getCampaign(selectedCampaign.id);
    campaign.emails.forEach((email, index) => {
      if (email.status === 'failed') {
        updateCampaignEmail(selectedCampaign.id, index, { status: 'pending', error: null });
      }
    });

    setSelectedCampaign(getCampaign(selectedCampaign.id));
    addLog('🔄 Mislukte emails gereset, klaar om opnieuw te proberen');
  };

  const handleDeleteCampaign = (id) => {
    if (confirm('Weet je zeker dat je deze campagne wilt verwijderen?')) {
      deleteCampaign(id);
      if (selectedCampaign?.id === id) {
        setSelectedCampaign(null);
      }
      loadData();
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'running': return <span className="badge badge-success">🔄 Actief</span>;
      case 'paused': return <span className="badge badge-warning">⏸️ Gepauzeerd</span>;
      case 'completed': return <span className="badge badge-info">✅ Voltooid</span>;
      case 'stopped': return <span className="badge badge-error">⏹️ Gestopt</span>;
      case 'error': return <span className="badge badge-error">❌ Fout</span>;
      default: return <span className="badge badge-info opacity-70">⏳ Klaar</span>;
    }
  };

  const progress = selectedCampaign
    ? Math.round((selectedCampaign.sent / selectedCampaign.total) * 100) || 0
    : 0;

  return (
    <Layout title="Campagnes | SKYE Mail Agent">
      <div className="flex gap-6 h-[calc(100vh-100px)] items-stretch">

        {/* Sidebar - Campaign List */}
        <aside className="w-80 flex-shrink-0 flex flex-col gap-4">
          <div className="glass-card flex-1 flex flex-col overflow-hidden p-0">
            <div className="p-4 border-b border-glass">
              <h2 className="text-lg font-bold">📋 Campagnes</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {campaigns.length === 0 ? (
                <div className="text-center py-8 opacity-50">
                  <div className="text-2xl mb-2">📭</div>
                  <p className="text-sm">Geen campagnes</p>
                  <Link href="/batch" className="text-accent hover:underline text-xs mt-2 block">
                    Ga naar Batch →
                  </Link>
                </div>
              ) : (
                campaigns.map(camp => (
                  <div
                    key={camp.id}
                    onClick={() => selectCampaign(camp)}
                    className={`p-3 rounded-lg cursor-pointer transition-all border border-transparent hover:border-glass hover:bg-white/5 ${selectedCampaign?.id === camp.id ? 'bg-accent/10 border-accent' : ''}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold text-sm truncate pr-2">{camp.name}</span>
                      <button
                        className="text-muted hover:text-error transition-colors"
                        onClick={(e) => { e.stopPropagation(); handleDeleteCampaign(camp.id); }}
                      >
                        🗑️
                      </button>
                    </div>
                    <div className="flex justify-between items-center text-xs text-secondary mb-2">
                      {getStatusBadge(camp.status)}
                      <span>{camp.sent}/{camp.total}</span>
                    </div>
                    <div className="h-1 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all duration-300"
                        style={{ width: `${(camp.sent / camp.total) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 flex flex-col gap-6 overflow-hidden">
          {!selectedCampaign ? (
            <div className="glass-card flex-1 flex flex-col items-center justify-center text-center opacity-50">
              <div className="text-4xl mb-4">👈</div>
              <h2 className="text-xl font-bold mb-2">Selecteer een campagne</h2>
              <p className="text-secondary">Of maak een nieuwe campagne via de Batch pagina</p>
            </div>
          ) : (
            <>
              {/* Header & Stats */}
              <div className="glass-card">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h1 className="text-2xl font-bold mb-1">{selectedCampaign.name}</h1>
                    <p className="text-xs text-secondary">
                      Aangemaakt: {new Date(selectedCampaign.createdAt).toLocaleString('nl-NL')}
                    </p>
                  </div>
                  <div>{getStatusBadge(selectedCampaign.status)}</div>
                </div>

                {/* Big Progress */}
                <div className="mb-6">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-4xl font-bold text-highlight">{progress}%</span>
                    <span className="text-secondary text-sm">{selectedCampaign.sent}/{selectedCampaign.total} emails</span>
                  </div>
                  <div className="h-3 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-accent to-purple-500 transition-all duration-500" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="p-3 rounded-lg bg-white/5 border border-glass text-center">
                    <div className="text-2xl font-bold text-success">{selectedCampaign.sent}</div>
                    <div className="text-xs text-secondary uppercase tracking-wider">Verzonden</div>
                  </div>
                  <div className="p-3 rounded-lg bg-white/5 border border-glass text-center">
                    <div className="text-2xl font-bold text-error">{selectedCampaign.failed}</div>
                    <div className="text-xs text-secondary uppercase tracking-wider">Mislukt</div>
                  </div>
                  <div className="p-3 rounded-lg bg-white/5 border border-glass text-center">
                    <div className="text-2xl font-bold text-warning">{selectedCampaign.pending}</div>
                    <div className="text-xs text-secondary uppercase tracking-wider">Wachtend</div>
                  </div>
                  <div className="p-3 rounded-lg bg-white/5 border border-glass text-center">
                    <div className={`text-sm font-bold mt-1 ${connectionStatus === 'error' ? 'text-error' : connectionStatus === 'connected' ? 'text-success' : 'text-secondary'}`}>
                      {connectionStatus === 'connected' ? '📡 Verbonden' : connectionStatus === 'error' ? '❌ Fout' : connectionStatus === 'connecting' ? '🔄 ...' : '🔌 Idle'}
                    </div>
                    <div className="text-xs text-secondary uppercase tracking-wider mt-1">Status</div>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex gap-3">
                  {!isRunning ? (
                    <button onClick={startCampaign} className="premium-button flex-1">
                      ▶️ {selectedCampaign.status === 'paused' ? 'Hervatten' : 'Starten'}
                    </button>
                  ) : (
                    <button onClick={pauseCampaign} className="premium-button secondary flex-1 border-warning text-warning">
                      ⏸️ Pauzeren
                    </button>
                  )}
                  <button onClick={stopCampaign} disabled={!isRunning} className="premium-button secondary text-error border-error">
                    ⏹️ Stop
                  </button>
                  <button onClick={retryFailed} disabled={isRunning || selectedCampaign.failed === 0} className="premium-button secondary">
                    🔄 Retry Mislukte
                  </button>
                </div>
              </div>

              <div className="flex-1 flex gap-6 min-h-0">
                {/* Logs Panel */}
                <div className="glass-card flex-1 flex flex-col p-0 overflow-hidden min-w-0">
                  <div className="p-3 border-b border-glass bg-white/5">
                    <h3 className="font-bold text-sm">📜 Logs</h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-xs max-h-[400px]">
                    {logs.length === 0 ? (
                      <div className="text-center opacity-30 py-4">Nog geen activiteit...</div>
                    ) : (
                      logs.map((log, i) => (
                        <div key={i} className={`flex gap-2 ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : log.type === 'warning' ? 'text-yellow-400' : 'text-gray-400'}`}>
                          <span className="opacity-50 min-w-[60px]">{log.timestamp}</span>
                          <span>{log.message}</span>
                        </div>
                      ))
                    )}
                    <div ref={logsEndRef} />
                  </div>
                </div>

                {/* Emails List */}
                <div className="glass-card flex-[2] flex flex-col p-0 overflow-hidden min-w-0">
                  <div className="p-3 border-b border-glass bg-white/5 flex justify-between items-center">
                    <h3 className="font-bold text-sm">📧 Emails ({selectedCampaign.total})</h3>
                  </div>
                  <div className="flex-1 overflow-auto table-container">
                    <table className="premium-table">
                      <thead>
                        <tr>
                          <th className="w-10">#</th>
                          <th>Email</th>
                          <th>Status</th>
                          <th>SMTP</th>
                          <th className="w-20">Actie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCampaign.emails.map((email, idx) => (
                          <tr key={idx} className={idx === currentEmailIndex && isRunning ? 'bg-accent/10' : ''}>
                            <td className="text-secondary">{idx + 1}</td>
                            <td>
                              <div className="font-bold text-sm">{email.email}</div>
                              {email.businessName && <div className="text-xs text-secondary">{email.businessName}</div>}
                            </td>
                            <td>
                              <div className="flex items-center gap-2">
                                {email.status === 'sent' && <span className="status-dot active"></span>}
                                {email.status === 'failed' && <span className="status-dot error"></span>}
                                {email.status === 'sending' && <span className="spinner text-accent">⚙️</span>}
                                {email.status === 'pending' && <span className="status-dot inactive"></span>}
                                <span className="capitalize text-xs">{email.status}</span>
                              </div>
                              {email.error && <div className="text-xs text-error mt-1 truncate max-w-[150px]" title={email.error}>{email.error}</div>}
                            </td>
                            <td className="text-xs text-secondary">{email.smtpUsed || '-'}</td>
                            <td>
                              {email.status === 'sent' && email.generatedSubject && (
                                <button onClick={() => setViewingEmail(email)} className="text-accent hover:text-white text-xs border border-accent/30 rounded px-2 py-1">
                                  👁️ Bekijk
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Email Preview Modal */}
      {viewingEmail && (
        <div className="modal-overlay" onClick={() => setViewingEmail(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-glass flex justify-between items-center">
              <h2 className="text-lg font-bold">📧 Verstuurde Email</h2>
              <button onClick={() => setViewingEmail(null)} className="text-secondary hover:text-white">✕</button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                <div className="p-3 rounded bg-white/5">
                  <span className="block text-xs text-secondary uppercase">Aan</span>
                  <span className="font-bold">{viewingEmail.email}</span>
                </div>
                <div className="p-3 rounded bg-white/5">
                  <span className="block text-xs text-secondary uppercase">Bedrijf</span>
                  <span className="font-bold">{viewingEmail.businessName || '-'}</span>
                </div>
                <div className="p-3 rounded bg-white/5">
                  <span className="block text-xs text-secondary uppercase">Verstuurd</span>
                  <span className="font-bold">{viewingEmail.sentAt ? new Date(viewingEmail.sentAt).toLocaleString('nl-NL') : '-'}</span>
                </div>
                <div className="p-3 rounded bg-white/5">
                  <span className="block text-xs text-secondary uppercase">Via</span>
                  <span className="font-bold">{viewingEmail.smtpUsed || '-'}</span>
                </div>
              </div>

              <div className="mb-6">
                <span className="text-xs text-secondary uppercase">Onderwerp</span>
                <div className="text-lg font-bold">{viewingEmail.generatedSubject}</div>
              </div>

              <div className="space-y-4">
                {viewingEmail.generatedSections ? (
                  <>
                    {Object.entries(viewingEmail.generatedSections).map(([key, content]) => (
                      content && (
                        <div key={key} className="p-4 rounded border border-glass bg-white/5">
                          <div className="text-xs text-accent uppercase font-bold mb-2">{key}</div>
                          <div className="whitespace-pre-line text-sm leading-relaxed">{content}</div>
                        </div>
                      )
                    ))}
                  </>
                ) : (
                  <div className="whitespace-pre-line text-sm leading-relaxed p-4 rounded border border-glass bg-white/5">
                    {viewingEmail.generatedBody || 'Geen content beschikbaar'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        /* Custom scrollbar override for this specific layout if needed */
        .overflow-y-auto::-webkit-scrollbar { width: 6px; }
      `}</style>
    </Layout>
  );
}
