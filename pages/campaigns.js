import { useState, useEffect, useRef } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  getCampaigns,
  getCampaign,
  updateCampaign,
  updateCampaignEmail,
  deleteCampaign,
  getSmtpAccounts,
  getNextSmtpAccount,
  advanceSmtpIndex
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
            smtpConfig: smtpAccount
          })
        });

        const result = await response.json();

        if (result.success) {
          updateCampaignEmail(selectedCampaign.id, emailData.originalIndex, {
            status: 'sent',
            sentAt: new Date().toISOString(),
            smtpUsed: smtpAccount.name || smtpAccount.host,
            emailId: result.emailId
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

  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return '#22c55e';
      case 'paused': return '#f59e0b';
      case 'completed': return '#06b6d4';
      case 'stopped': return '#ef4444';
      case 'error': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return '⏳ Klaar om te starten';
      case 'running': return '🔄 Actief';
      case 'paused': return '⏸️ Gepauzeerd';
      case 'completed': return '✅ Voltooid';
      case 'stopped': return '⏹️ Gestopt';
      case 'error': return '❌ Fout';
      default: return status;
    }
  };

  const progress = selectedCampaign
    ? Math.round((selectedCampaign.sent / selectedCampaign.total) * 100) || 0
    : 0;

  return (
    <>
      <Head>
        <title>Campagnes | SKYE Mail Agent</title>
      </Head>

      <div className="container">
        {/* Navigation */}
        <nav className="nav-bar">
          <Link href="/" className="nav-link">📧 Verstuur</Link>
          <Link href="/batch" className="nav-link">📦 Batch</Link>
          <Link href="/campaigns" className="nav-link active">🚀 Campagnes</Link>
          <Link href="/enrich" className="nav-link">🔍 Enricher</Link>
          <Link href="/analytics" className="nav-link">📊 Analytics</Link>
          <Link href="/warmup" className="nav-link">🔥 Warm-up</Link>
          <Link href="/settings" className="nav-link">⚙️ Settings</Link>
        </nav>

        <div className="layout">
          {/* Sidebar - Campaign List */}
          <aside className="sidebar">
            <h2>📋 Campagnes</h2>

            {campaigns.length === 0 ? (
              <div className="empty-sidebar">
                <p>Geen campagnes</p>
                <Link href="/batch" className="btn-link">
                  Ga naar Batch →
                </Link>
              </div>
            ) : (
              <div className="campaign-list">
                {campaigns.map(camp => (
                  <div
                    key={camp.id}
                    className={`campaign-item ${selectedCampaign?.id === camp.id ? 'selected' : ''}`}
                    onClick={() => selectCampaign(camp)}
                  >
                    <div className="campaign-item-header">
                      <span className="campaign-name">{camp.name}</span>
                      <button
                        className="delete-btn"
                        onClick={(e) => { e.stopPropagation(); handleDeleteCampaign(camp.id); }}
                      >
                        🗑️
                      </button>
                    </div>
                    <div className="campaign-meta">
                      <span style={{ color: getStatusColor(camp.status) }}>
                        {getStatusLabel(camp.status)}
                      </span>
                      <span>{camp.sent}/{camp.total}</span>
                    </div>
                    <div className="mini-progress">
                      <div
                        className="mini-progress-bar"
                        style={{ width: `${(camp.sent / camp.total) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>

          {/* Main Content */}
          <main className="main-content">
            {!selectedCampaign ? (
              <div className="select-prompt">
                <h2>👈 Selecteer een campagne</h2>
                <p>Of maak een nieuwe campagne via de Batch pagina</p>
              </div>
            ) : (
              <>
                {/* Campaign Header */}
                <div className="campaign-header">
                  <div>
                    <h1>{selectedCampaign.name}</h1>
                    <p className="campaign-date">
                      Aangemaakt: {new Date(selectedCampaign.createdAt).toLocaleString('nl-NL')}
                    </p>
                  </div>
                  <div className="status-badge" style={{ background: getStatusColor(selectedCampaign.status) }}>
                    {getStatusLabel(selectedCampaign.status)}
                  </div>
                </div>

                {/* Progress Panel */}
                <div className="progress-panel">
                  <div className="progress-header">
                    <span className="progress-text">{progress}%</span>
                    <span className="progress-count">{selectedCampaign.sent}/{selectedCampaign.total} emails</span>
                  </div>
                  <div className="progress-bar-container">
                    <div className="progress-bar" style={{ width: `${progress}%` }} />
                  </div>

                  <div className="stats-row">
                    <div className="stat">
                      <span className="stat-value sent">{selectedCampaign.sent}</span>
                      <span className="stat-label">Verzonden</span>
                    </div>
                    <div className="stat">
                      <span className="stat-value failed">{selectedCampaign.failed}</span>
                      <span className="stat-label">Mislukt</span>
                    </div>
                    <div className="stat">
                      <span className="stat-value pending">{selectedCampaign.pending}</span>
                      <span className="stat-label">Wachtend</span>
                    </div>
                  </div>

                  {/* Connection Status */}
                  <div className={`connection-status ${connectionStatus}`}>
                    {connectionStatus === 'idle' && '🔌 Niet verbonden'}
                    {connectionStatus === 'connecting' && '🔄 Verbinden...'}
                    {connectionStatus === 'connected' && '📡 Verbonden'}
                    {connectionStatus === 'error' && '❌ Verbindingsfout'}
                  </div>

                  {/* Controls */}
                  <div className="controls">
                    {!isRunning ? (
                      <button className="btn-start" onClick={startCampaign}>
                        ▶️ {selectedCampaign.status === 'paused' ? 'Hervatten' : 'Starten'}
                      </button>
                    ) : (
                      <button className="btn-pause" onClick={pauseCampaign}>
                        ⏸️ Pauzeren
                      </button>
                    )}
                    <button
                      className="btn-stop"
                      onClick={stopCampaign}
                      disabled={!isRunning}
                    >
                      ⏹️ Stop
                    </button>
                    <button
                      className="btn-retry"
                      onClick={retryFailed}
                      disabled={isRunning || selectedCampaign.failed === 0}
                    >
                      🔄 Retry Mislukte ({selectedCampaign.failed})
                    </button>
                  </div>
                </div>

                {/* Logs */}
                <div className="logs-panel">
                  <h3>📜 Logs</h3>
                  <div className="logs-container">
                    {logs.length === 0 ? (
                      <p className="logs-empty">Nog geen activiteit...</p>
                    ) : (
                      logs.map((log, i) => (
                        <div key={i} className={`log-entry ${log.type}`}>
                          <span className="log-time">{log.timestamp}</span>
                          <span className="log-message">{log.message}</span>
                        </div>
                      ))
                    )}
                    <div ref={logsEndRef} />
                  </div>
                </div>

                {/* Email List */}
                <div className="emails-panel">
                  <h3>📧 Emails ({selectedCampaign.total})</h3>
                  <div className="emails-table-container">
                    <table className="emails-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Email</th>
                          <th>Bedrijf</th>
                          <th>Status</th>
                          <th>SMTP</th>
                          <th>Tijd</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCampaign.emails.map((email, idx) => (
                          <tr
                            key={idx}
                            className={`${email.status} ${idx === currentEmailIndex && isRunning ? 'current' : ''}`}
                          >
                            <td>{idx + 1}</td>
                            <td>{email.email}</td>
                            <td>{email.businessName || '-'}</td>
                            <td>
                              <span className={`email-status ${email.status}`}>
                                {email.status === 'sent' && '✅'}
                                {email.status === 'failed' && '❌'}
                                {email.status === 'sending' && '📤'}
                                {email.status === 'pending' && '⏳'}
                                {' '}{email.status}
                                {email.error && <span className="error-tooltip" title={email.error}>ℹ️</span>}
                              </span>
                            </td>
                            <td>{email.smtpUsed || '-'}</td>
                            <td>{email.sentAt ? new Date(email.sentAt).toLocaleTimeString('nl-NL') : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      </div>

      <style jsx>{`
        .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 20px;
        }

        .nav-bar {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .nav-link {
          padding: 10px 16px;
          background: #1a1a2e;
          color: #ccc;
          text-decoration: none;
          border-radius: 8px;
          font-size: 14px;
          transition: all 0.2s;
        }

        .nav-link:hover { background: #252542; color: #fff; }
        .nav-link.active { background: #00A4E8; color: #fff; }

        .layout {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 24px;
          min-height: calc(100vh - 120px);
        }

        .sidebar {
          background: #1a1a2e;
          border-radius: 12px;
          padding: 20px;
          height: fit-content;
          position: sticky;
          top: 20px;
        }

        .sidebar h2 {
          margin: 0 0 16px 0;
          color: #fff;
          font-size: 18px;
        }

        .empty-sidebar {
          text-align: center;
          color: #888;
          padding: 20px 0;
        }

        .btn-link {
          display: inline-block;
          margin-top: 12px;
          color: #00A4E8;
          text-decoration: none;
        }

        .campaign-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .campaign-item {
          background: #0d0d1a;
          border: 1px solid #2a2a4e;
          border-radius: 8px;
          padding: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .campaign-item:hover { border-color: #00A4E8; }
        .campaign-item.selected { border-color: #00A4E8; background: #1a1a3e; }

        .campaign-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .campaign-name {
          font-weight: 600;
          color: #fff;
          font-size: 14px;
        }

        .delete-btn {
          background: none;
          border: none;
          cursor: pointer;
          opacity: 0.5;
          transition: opacity 0.2s;
        }

        .delete-btn:hover { opacity: 1; }

        .campaign-meta {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #888;
          margin-top: 6px;
        }

        .mini-progress {
          height: 3px;
          background: #2a2a4e;
          border-radius: 2px;
          margin-top: 8px;
          overflow: hidden;
        }

        .mini-progress-bar {
          height: 100%;
          background: #00A4E8;
          transition: width 0.3s;
        }

        .main-content {
          min-width: 0;
        }

        .select-prompt {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 300px;
          text-align: center;
          color: #888;
        }

        .select-prompt h2 { color: #fff; margin-bottom: 8px; }

        .campaign-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
        }

        .campaign-header h1 {
          margin: 0;
          color: #fff;
        }

        .campaign-date {
          color: #888;
          font-size: 14px;
          margin-top: 4px;
        }

        .status-badge {
          padding: 8px 16px;
          border-radius: 20px;
          color: #fff;
          font-weight: 600;
          font-size: 14px;
        }

        .progress-panel {
          background: #1a1a2e;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 20px;
        }

        .progress-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .progress-text {
          font-size: 32px;
          font-weight: 700;
          color: #00A4E8;
        }

        .progress-count {
          color: #888;
          font-size: 16px;
          align-self: flex-end;
        }

        .progress-bar-container {
          height: 12px;
          background: #2a2a4e;
          border-radius: 6px;
          overflow: hidden;
          margin-bottom: 20px;
        }

        .progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #00A4E8, #06b6d4);
          transition: width 0.5s ease;
        }

        .stats-row {
          display: flex;
          gap: 24px;
          margin-bottom: 16px;
        }

        .stat {
          display: flex;
          flex-direction: column;
        }

        .stat-value {
          font-size: 24px;
          font-weight: 700;
        }

        .stat-value.sent { color: #22c55e; }
        .stat-value.failed { color: #ef4444; }
        .stat-value.pending { color: #f59e0b; }

        .stat-label {
          font-size: 12px;
          color: #888;
        }

        .connection-status {
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 14px;
          margin-bottom: 16px;
          display: inline-block;
        }

        .connection-status.idle { background: #374151; color: #9ca3af; }
        .connection-status.connecting { background: #1e3a5f; color: #60a5fa; }
        .connection-status.connected { background: #14532d; color: #22c55e; }
        .connection-status.error { background: #450a0a; color: #ef4444; }

        .controls {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .controls button {
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }

        .controls button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-start { background: #22c55e; color: #fff; }
        .btn-start:hover:not(:disabled) { background: #16a34a; }
        
        .btn-pause { background: #f59e0b; color: #fff; }
        .btn-pause:hover { background: #d97706; }
        
        .btn-stop { background: #ef4444; color: #fff; }
        .btn-stop:hover:not(:disabled) { background: #dc2626; }
        
        .btn-retry { background: #3b82f6; color: #fff; }
        .btn-retry:hover:not(:disabled) { background: #2563eb; }

        .logs-panel {
          background: #1a1a2e;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 20px;
        }

        .logs-panel h3 {
          margin: 0 0 12px 0;
          color: #fff;
        }

        .logs-container {
          background: #0d0d1a;
          border-radius: 8px;
          padding: 12px;
          max-height: 200px;
          overflow-y: auto;
          font-family: monospace;
          font-size: 13px;
        }

        .logs-empty {
          color: #666;
          margin: 0;
        }

        .log-entry {
          display: flex;
          gap: 12px;
          padding: 4px 0;
        }

        .log-time {
          color: #666;
          flex-shrink: 0;
        }

        .log-entry.success .log-message { color: #22c55e; }
        .log-entry.error .log-message { color: #ef4444; }
        .log-entry.warning .log-message { color: #f59e0b; }
        .log-entry.info .log-message { color: #ccc; }

        .emails-panel {
          background: #1a1a2e;
          border-radius: 12px;
          padding: 20px;
        }

        .emails-panel h3 {
          margin: 0 0 12px 0;
          color: #fff;
        }

        .emails-table-container {
          overflow-x: auto;
        }

        .emails-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }

        .emails-table th,
        .emails-table td {
          text-align: left;
          padding: 10px;
          border-bottom: 1px solid #2a2a4e;
        }

        .emails-table th {
          color: #888;
          font-weight: 500;
          font-size: 12px;
          text-transform: uppercase;
        }

        .emails-table td {
          color: #ccc;
        }

        .emails-table tr.current {
          background: rgba(0, 164, 232, 0.1);
        }

        .emails-table tr.sent td { color: #22c55e; }
        .emails-table tr.failed td { color: #ef4444; }

        .email-status {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .error-tooltip {
          cursor: help;
        }

        @media (max-width: 900px) {
          .layout {
            grid-template-columns: 1fr;
          }
          
          .sidebar {
            position: static;
          }
        }
      `}</style>
    </>
  );
}
