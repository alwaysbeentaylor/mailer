import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import Layout from "../components/Layout";

export default function Home() {
  const [formData, setFormData] = useState({
    toEmail: "",
    businessName: "",
    websiteUrl: "",
    contactPerson: "",
    emailTone: "professional",
    customNotes: "",
    customSubject: "",
    customPreheader: ""
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ sent: 0, pending: 0 });
  const [previewMode, setPreviewMode] = useState(false);

  // SMTP Account selection
  const [smtpAccounts, setSmtpAccounts] = useState([]);
  const [selectedSmtpId, setSelectedSmtpId] = useState('');
  const [loadingSmtp, setLoadingSmtp] = useState(true);

  // Load SMTP accounts from API
  useEffect(() => {
    async function loadSmtpAccounts() {
      setLoadingSmtp(true);
      try {
        const res = await fetch('/api/smtp-accounts');
        const data = await res.json();
        if (data.success && data.accounts.length > 0) {
          setSmtpAccounts(data.accounts);
          // Auto-select first active account
          const activeAccount = data.accounts.find(a => a.active);
          if (activeAccount) {
            setSelectedSmtpId(activeAccount.id);
          } else {
            setSelectedSmtpId(data.accounts[0].id);
          }
        }
      } catch (error) {
        console.error('Error loading SMTP accounts:', error);
      }
      setLoadingSmtp(false);
    }
    loadSmtpAccounts();
  }, []);

  // Load stats from localStorage
  useEffect(() => {
    const savedStats = localStorage.getItem("skyeMailStats");
    if (savedStats) {
      setStats(JSON.parse(savedStats));
    }
  }, []);

  // Email sending logs (persistent)
  const [logs, setLogs] = useState([]);

  // Load logs from localStorage on mount
  useEffect(() => {
    const savedLogs = localStorage.getItem("skyeSingleSendLogs");
    if (savedLogs) {
      setLogs(JSON.parse(savedLogs));
    }
  }, []);

  // Add log function (persistent)
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString('nl-NL');
    const newLog = { timestamp, message, type, id: Date.now() };
    setLogs(prev => {
      const updated = [...prev, newLog].slice(-50); // Keep last 50 logs
      localStorage.setItem("skyeSingleSendLogs", JSON.stringify(updated));
      return updated;
    });
  };

  // Clear logs function
  const clearLogs = () => {
    setLogs([]);
    localStorage.removeItem("skyeSingleSendLogs");
  };

  const updateStats = (newSent) => {
    const newStats = { ...stats, sent: stats.sent + newSent };
    setStats(newStats);
    localStorage.setItem("skyeMailStats", JSON.stringify(newStats));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  async function processFormSubmission(isPreview, preGeneratedResult = null) {
    setPreviewMode(isPreview);
    setLoading(true);
    setError(null);
    setResult(null);

    // Get selected SMTP account info for logging
    const selectedSmtp = smtpAccounts.find(a => a.id === selectedSmtpId);
    const smtpName = selectedSmtp?.name || selectedSmtp?.user || 'onbekend';

    // Check SMTP account when sending (not for preview)
    if (!isPreview && !selectedSmtpId && smtpAccounts.length === 0) {
      addLog('❌ Geen SMTP account geconfigureerd', 'error');
      setError('Geen SMTP account geconfigureerd. Ga naar Settings om een account toe te voegen.');
      setLoading(false);
      return;
    }

    // Log start of process
    if (isPreview) {
      addLog(`👁️ Preview gestart voor ${formData.businessName}`, 'info');
      addLog(`🔍 Website analyse: ${formData.websiteUrl}`, 'info');
    } else {
      addLog(`🚀 Email verzenden naar ${formData.toEmail}`, 'info');
      addLog(`📡 SMTP Account: ${smtpName}`, 'info');
      addLog(`🔗 Verbinding maken met ${selectedSmtp?.host || 'SMTP server'}...`, 'info');
    }

    try {
      const payload = {
        ...formData,
        dryRun: isPreview,
        smtpAccountId: selectedSmtpId || null // Send SMTP account ID
      };

      // If we have pre-generated data (from preview), send it along
      if (!isPreview && preGeneratedResult) {
        addLog('📄 Gebruik pre-generated content uit preview', 'info');
        payload.preGeneratedData = {
          subject: preGeneratedResult.subject,
          body: preGeneratedResult.body,
          sections: preGeneratedResult.sections,
          siteAnalysis: preGeneratedResult.siteAnalysis
        };
      } else if (!isPreview) {
        addLog('🤖 AI email generatie starten...', 'info');
      }

      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        // Handle structured error response
        let errorMessage = "Onbekende fout";
        if (data.details) {
          errorMessage = data.details;
        } else if (data.error) {
          if (typeof data.error === 'object') {
            errorMessage = data.error.message || JSON.stringify(data.error);
            // Hint toevoegen als die er is
            if (data.error.hint) {
              errorMessage += ` (${data.error.hint})`;
            }
          } else {
            errorMessage = data.error;
          }
        }
        throw new Error(errorMessage);
      }

      setResult(data);

      if (isPreview) {
        addLog(`✅ Preview klaar - Niche: ${data.siteAnalysis?.niche || 'onbekend'}`, 'success');
        if (data.usedAI) {
          addLog(`🤖 AI gegenereerd met "${data.selectedTone || formData.emailTone}" stijl`, 'success');
        } else {
          addLog(`⚠️ Fallback template gebruikt (geen AI)`, 'warning');
        }
        // Show if sections have content
        if (data.sections) {
          const filledSections = Object.entries(data.sections).filter(([k, v]) => v && v.length > 10).length;
          addLog(`📊 ${filledSections}/5 secties gevuld`, filledSections >= 4 ? 'success' : 'warning');
        }
      } else {
        addLog(`✅ Email verzonden naar ${formData.toEmail}`, 'success');
        addLog(`📧 Subject: "${data.subject}"`, 'success');
        if (data.messageId) {
          addLog(`📍 Message ID: ${data.messageId.slice(0, 20)}...`, 'info');
        }
        updateStats(1);
        // Reset form after successful send
        setFormData({
          toEmail: "",
          businessName: "",
          websiteUrl: "",
          contactPerson: "",
          emailTone: "professional",
          customNotes: "",
          customSubject: "",
          customPreheader: ""
        });
      }
    } catch (err) {
      addLog(`❌ Fout: ${err.message}`, 'error');
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    const submitter = e.nativeEvent?.submitter;
    const isPreview = submitter?.value === 'preview';
    processFormSubmission(isPreview);
  };

  const handleRealSend = () => {
    // Pass the current result (preview data) so we send EXACTLY what was previewed
    processFormSubmission(false, result);
  };

  const toneOptions = [
    { value: "professional", label: "💰 ROI Focus", desc: "Bold, resultaat-gericht" },
    { value: "casual", label: "🎯 Value Drop", desc: "Relaxed maar direct" },
    { value: "urgent", label: "🔥 FOMO", desc: "Urgentie creëren" },
    { value: "friendly", label: "🤝 Warm Direct", desc: "Persoonlijk, geen fluff" },
    { value: "random", label: "🎲 Willekeurig", desc: "Random stijl per mail" }
  ];

  return (
    <Layout title="SKYE Mail Agent | AI-Powered Cold Outreach">
      <div className="page-container">
        {/* Hero Section */}
        <div className="page-header center-text">
          <h1 className="page-title">
            <span className="text-gradient">AI-Powered</span> Cold Outreach
          </h1>
          <p className="page-subtitle">
            Laat de <span className="highlight">Client Generator</span> het zware werk doen.
            Vul de details in en zie de magie gebeuren.
          </p>
        </div>

        {/* Main Card */}
        <div className="glass-card main-form-card">
          <form onSubmit={handleSubmit} className="form-content">
            {/* Lead Info Section */}
            <div className="form-section">
              <h2 className="section-title">
                <span className="section-icon">📧</span>
                Lead Informatie
              </h2>

              <div className="form-grid">
                <div className="input-group">
                  <label className="input-label">
                    E-mailadres ontvanger <span className="text-pink">*</span>
                  </label>
                  <input
                    type="email"
                    name="toEmail"
                    value={formData.toEmail}
                    onChange={handleChange}
                    required
                    placeholder="info@bedrijf.be"
                    className="premium-input"
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">
                    Bedrijfsnaam <span className="text-pink">*</span>
                  </label>
                  <input
                    type="text"
                    name="businessName"
                    value={formData.businessName}
                    onChange={handleChange}
                    required
                    placeholder="Restaurant De Gouden Leeuw"
                    className="premium-input"
                  />
                </div>

                <div className="input-group full-width">
                  <label className="input-label">
                    Website URL <span className="text-pink">*</span>
                  </label>
                  <input
                    type="url"
                    name="websiteUrl"
                    value={formData.websiteUrl}
                    onChange={handleChange}
                    required
                    placeholder="https://www.bedrijf.be"
                    className="premium-input"
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">
                    Contactpersoon <span className="text-muted">(optioneel)</span>
                  </label>
                  <input
                    type="text"
                    name="contactPerson"
                    value={formData.contactPerson}
                    onChange={handleChange}
                    placeholder="Jan Janssen"
                    className="premium-input"
                  />
                </div>

                {/* SMTP Account Selector */}
                <div className="input-group full-width">
                  <label className="input-label">
                    Verstuur via <span className="text-pink">*</span>
                  </label>
                  {loadingSmtp ? (
                    <div className="status-loading">⏳ SMTP accounts laden...</div>
                  ) : smtpAccounts.length === 0 ? (
                    <div className="status-warning">
                      <span>⚠️ Geen SMTP accounts geconfigureerd</span>
                      <Link href="/settings" className="link-highlight">
                        → Configureer in Settings
                      </Link>
                    </div>
                  ) : (
                    <select
                      value={selectedSmtpId}
                      onChange={(e) => setSelectedSmtpId(e.target.value)}
                      className="premium-input smtp-select"
                    >
                      {smtpAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name || acc.user} ({acc.host})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* Email Style Section */}
            <div className="form-section">
              <h2 className="section-title">
                <span className="section-icon">✨</span>
                Email Stijl
              </h2>

              <div className="tone-grid">
                {toneOptions.map((tone) => (
                  <label
                    key={tone.value}
                    className={`tone-option ${formData.emailTone === tone.value ? 'active' : ''}`}
                  >
                    <input
                      type="radio"
                      name="emailTone"
                      value={tone.value}
                      checked={formData.emailTone === tone.value}
                      onChange={handleChange}
                      className="tone-radio"
                    />
                    <span className="tone-label">{tone.label}</span>
                    <span className="tone-desc">{tone.desc}</span>
                  </label>
                ))}
              </div>

              <div className="input-group mt-4">
                <label className="input-label">
                  Extra notities voor AI <span className="text-muted">(optioneel)</span>
                </label>
                <textarea
                  name="customNotes"
                  value={formData.customNotes}
                  onChange={handleChange}
                  placeholder="Bijv: Focus op mobiele website, vermeld hun Instagram pagina, ze hebben een nieuwe locatie geopend..."
                  className="premium-input textarea"
                  rows={3}
                />
              </div>
            </div>

            {/* Subject & Pre-header Section */}
            <div className="form-section">
              <h2 className="section-title">
                <span className="section-icon">📝</span>
                Onderwerp & Pre-header
              </h2>

              <div className="form-grid">
                {/* Subject Line */}
                <div className="input-group">
                  <div className="field-header">
                    <label className="input-label">Onderwerp</label>
                    <div className="toggle-pills">
                      <button
                        type="button"
                        className={`pill ${!formData.customSubject ? 'active' : ''}`}
                        onClick={() => setFormData(prev => ({ ...prev, customSubject: '' }))}
                      >
                        🎲 Auto
                      </button>
                      <button
                        type="button"
                        className={`pill ${formData.customSubject ? 'active' : ''}`}
                        onClick={() => setFormData(prev => ({ ...prev, customSubject: prev.customSubject || ' ' }))}
                      >
                        ✏️ Custom
                      </button>
                    </div>
                  </div>
                  {formData.customSubject ? (
                    <input
                      type="text"
                      name="customSubject"
                      value={formData.customSubject.trim() ? formData.customSubject : ''}
                      onChange={handleChange}
                      placeholder="Bijv: {businessName} - even gecheckt"
                      className="premium-input"
                    />
                  ) : (
                    <div className="auto-hint">
                      AI genereert automatisch op basis van email stijl
                    </div>
                  )}
                  <div className="placeholder-hint">
                    Gebruik: <code>{'{businessName}'}</code>, <code>{'{websiteUrl}'}</code>
                  </div>
                </div>

                {/* Pre-header */}
                <div className="input-group">
                  <div className="field-header">
                    <label className="input-label">Pre-header</label>
                    <div className="toggle-pills">
                      <button
                        type="button"
                        className={`pill ${!formData.customPreheader ? 'active' : ''}`}
                        onClick={() => setFormData(prev => ({ ...prev, customPreheader: '' }))}
                      >
                        🎲 Auto
                      </button>
                      <button
                        type="button"
                        className={`pill ${formData.customPreheader ? 'active' : ''}`}
                        onClick={() => setFormData(prev => ({ ...prev, customPreheader: prev.customPreheader || ' ' }))}
                      >
                        ✏️ Custom
                      </button>
                    </div>
                  </div>
                  {formData.customPreheader ? (
                    <input
                      type="text"
                      name="customPreheader"
                      value={formData.customPreheader.trim() ? formData.customPreheader : ''}
                      onChange={handleChange}
                      placeholder="Bijv: Ik zag 3 dingen die bezoekers kosten"
                      className="premium-input"
                    />
                  ) : (
                    <div className="auto-hint">
                      AI genereert automatisch op basis van niche
                    </div>
                  )}
                  <div className="placeholder-hint">
                    Tekst die in inbox preview verschijnt na onderwerp
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="button-group">
              <button
                type="submit"
                name="action"
                value="preview"
                disabled={loading}
                className="premium-button secondary"
              >
                👁️ Preview
              </button>
              <button
                type="submit"
                name="action"
                value="send"
                disabled={loading}
                className={`premium-button ${loading ? 'loading' : ''}`}
              >
                {loading ? (
                  <div className="loading-content">
                    <div className="robot-wrapper">
                      <Image
                        src="/assets/robot-working.png"
                        alt="Working Robot"
                        width={30}
                        height={30}
                        className="robot-anim"
                      />
                    </div>
                    <span>De robot is aan het typen...</span>
                  </div>
                ) : (
                  <>🚀 Verstuur Email</>
                )}
              </button>
            </div>
          </form>

          {/* Error Display */}
          {error && (
            <div className="alert alert-error">
              <span className="alert-icon">❌</span>
              <div className="alert-content">
                <strong>Fout bij versturen</strong>
                <p>{error}</p>
              </div>
            </div>
          )}

          {/* Result Display */}
          {result && (
            <div className={`result-card ${result.dryRun ? 'preview' : 'success'}`}>
              <div className="result-header">
                {result.dryRun ? (
                  <>
                    <span className="result-icon">👁️</span>
                    <span className="result-title">Preview Modus</span>
                    <span className="result-badge preview">Niet verstuurd</span>
                  </>
                ) : (
                  <>
                    <span className="result-icon">✅</span>
                    <span className="result-title">Email Verstuurd!</span>
                    <span className="result-badge success">ID: {result.messageId?.slice(0, 8)}...</span>
                  </>
                )}
              </div>

              <div className="result-meta">
                <span>📧 {result.toEmail}</span>
                <span>🏢 {result.businessName}</span>
                {result.usedAI && <span>🤖 AI Generated</span>}
              </div>

              {/* Site Analysis */}
              {result.siteAnalysis && (
                <div className="site-analysis-panel">
                  <div className="analysis-header">🔍 Website Analyse</div>
                  <div className="analysis-grid">
                    {result.siteAnalysis.niche && (
                      <div className="analysis-item">
                        🎯 Branche: <strong>{result.siteAnalysis.niche}</strong>
                      </div>
                    )}
                    <div className="analysis-stats">
                      <span className={result.siteAnalysis.hasSSL ? 'stat-good' : 'stat-bad'}>
                        {result.siteAnalysis.hasSSL ? '🔒 SSL' : '⚠️ Geen SSL'}
                      </span>
                      <span className={result.siteAnalysis.hasMobileViewport ? 'stat-good' : 'stat-bad'}>
                        {result.siteAnalysis.hasMobileViewport ? '📱 Mobile' : '⚠️ Geen Mobile'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="email-preview">
                <div className="email-subject">
                  <span className="email-label">Onderwerp:</span>
                  {result.subject}
                </div>

                {result.preheader && (
                  <div className="email-preheader">
                    <span className="email-label">Pre-header:</span>
                    <span className="preheader-text">{result.preheader}</span>
                  </div>
                )}

                {result.sections ? (
                  <div className="email-sections">
                    <div className="email-section intro">
                      <FormattedText text={result.sections.intro} />
                    </div>
                    <div className="email-section audit">
                      <span className="section-label error">💡 Gratis Audit</span>
                      <FormattedText text={result.sections.audit} />
                    </div>
                    <div className="email-section boosters">
                      <span className="section-label success">🔥 SKYE Oplossing</span>
                      <FormattedText text={result.sections.boosters} />
                    </div>
                    <div className="email-section resultaat">
                      <span className="section-label purple">🚀 Resultaat</span>
                      <FormattedText text={result.sections.resultaat} />
                    </div>
                    <div className="email-section cta">
                      <span className="section-label warning">📞 CTA</span>
                      <FormattedText text={result.sections.cta} />
                    </div>
                  </div>
                ) : (
                  <div className="email-body">
                    <pre>{result.body}</pre>
                  </div>
                )}
              </div>

              {result.dryRun && (
                <button
                  className="premium-button w-full mt-4"
                  onClick={handleRealSend}
                >
                  🚀 Nu Echt Versturen
                </button>
              )}
            </div>
          )}
        </div>

        {/* Logs Panel */}
        {logs.length > 0 && (
          <div className="glass-card mt-4">
            <div className="logs-header">
              <h3 className="logs-title">📜 Activiteit Logs</h3>
              <button className="text-secondary hover:text-white" onClick={clearLogs}>
                🗑️ Wissen
              </button>
            </div>
            <div className="logs-container">
              {logs.map((log) => (
                <div key={log.id} className={`log-entry ${log.type}`}>
                  <span className="log-time">{log.timestamp}</span>
                  <span className="log-message" dangerouslySetInnerHTML={{
                    __html: log.message
                      .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '<strong>$1</strong>')
                      .replace(/(https?:\/\/[^\s]+)/g, '<strong>$1</strong>')
                  }} />
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      <style jsx>{`
        .center-text { text-align: center; }
        .text-pink { color: var(--error); }
        .text-muted { color: var(--text-muted); }
        .highlight { color: var(--accent-primary); font-weight: 700; }
        
        .main-form-card {
          margin: 0 auto;
          max-width: 800px;
        }

        .form-section { margin-bottom: 32px; }
        
        .section-title {
          font-size: 1.25rem;
          font-weight: 700;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--text-primary);
        }
        .section-icon { font-size: 1.5rem; }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        
        @media (max-width: 768px) {
          .form-grid { grid-template-columns: 1fr; }
        }

        .full-width { grid-column: 1 / -1; }
        
        .tone-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px;
        }

        .tone-option {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--glass-border);
          padding: 16px;
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .tone-option:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: var(--text-muted);
        }

        .tone-option.active {
          background: rgba(59, 130, 246, 0.1);
          border-color: var(--accent-primary);
          box-shadow: 0 0 20px rgba(59, 130, 246, 0.1);
        }

        .tone-radio { display: none; }
        
        .tone-label {
           display: block;
           font-weight: 700;
           margin-bottom: 4px;
           font-size: 14px;
         }
         
         .tone-desc {
           display: block;
           font-size: 11px;
           color: var(--text-secondary);
           line-height: 1.4;
         }

         .field-header {
           display: flex;
           justify-content: space-between;
           align-items: center;
           margin-bottom: 8px;
         }

         .toggle-pills {
           display: flex;
           background: rgba(0,0,0,0.2);
           padding: 2px;
           border-radius: 8px;
           gap: 2px;
         }

         .pill {
           background: transparent;
           border: none;
           padding: 4px 10px;
           border-radius: 6px;
           color: var(--text-secondary);
           font-size: 11px;
           cursor: pointer;
           transition: all 0.2s;
         }

         .pill.active {
           background: rgba(255,255,255,0.1);
           color: var(--text-primary);
           font-weight: 600;
         }

         .auto-hint {
           padding: 12px 14px;
           background: rgba(59, 130, 246, 0.1);
           border: 1px dashed var(--accent-primary);
           border-radius: 12px;
           font-size: 13px;
           color: var(--accent-primary);
           text-align: center;
         }

         .placeholder-hint {
            font-size: 11px;
            color: var(--text-muted);
            margin-top: 6px;
            margin-left: 4px;
         }
         
         .placeholder-hint code {
            background: rgba(255,255,255,0.1);
            padding: 2px 4px;
            border-radius: 4px;
         }

         .button-group {
           display: grid;
           grid-template-columns: 1fr 2fr;
           gap: 16px;
           margin-top: 32px;
         }
         
         .loading-content {
            display: flex;
            align-items: center;
            gap: 10px;
         }
         
         .robot-anim {
            animation: bounce 0.5s infinite alternate;
         }
         
         @keyframes bounce {
            from { transform: translateY(0); }
            to { transform: translateY(-5px); }
         }

         /* Result Styles */
         .result-card {
            margin-top: 32px;
            border-radius: 16px;
            padding: 24px;
            background: rgba(0,0,0,0.2);
            border: 1px solid var(--glass-border);
         }
         
         .result-card.preview { border-color: var(--warning); background: rgba(234, 179, 8, 0.05); }
         .result-card.success { border-color: var(--success); background: rgba(34, 197, 94, 0.05); }

         .result-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 16px;
         }
         
         .result-title { font-weight: 700; font-size: 1.1rem; flex: 1; }
         .result-badge {
            font-size: 0.75rem;
            font-family: var(--font-mono);
            padding: 4px 8px;
            border-radius: 4px;
            background: rgba(0,0,0,0.3);
         }

         .result-meta {
            display: flex;
            gap: 16px;
            margin-bottom: 24px;
            font-size: 0.9rem;
            color: var(--text-secondary);
         }

         .site-analysis-panel {
            background: rgba(0,0,0,0.2);
            padding: 16px;
            border-radius: 12px;
            margin-bottom: 24px;
         }
         
         .analysis-header {
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-muted);
            margin-bottom: 12px;
            font-weight: 700;
         }
         
         .analysis-grid {
             display: flex;
             justify-content: space-between;
             align-items: center;
         }

         .stat-good { color: var(--success); margin-left: 12px; font-size: 0.9rem; }
         .stat-bad { color: var(--error); margin-left: 12px; font-size: 0.9rem; }

         .email-preview {
            background: var(--bg-primary);
            border-radius: 12px;
            padding: 24px;
            border: 1px solid var(--glass-border);
         }
         
         .email-label {
            color: var(--text-muted);
            font-size: 0.75rem;
            text-transform: uppercase;
            display: block;
            margin-bottom: 8px;
         }
         
         .email-subject {
            font-size: 1.1rem;
            font-weight: 600;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--glass-border);
            margin-bottom: 16px;
         }
         
         .email-sections {
            display: flex;
            flex-direction: column;
            gap: 16px;
         }
         
         .email-section {
            padding: 16px;
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
            border: 1px solid var(--glass-border);
         }
         
         .section-label {
            display: block;
            font-size: 0.7rem;
            font-weight: 800;
            text-transform: uppercase;
            margin-bottom: 8px;
         }
         
         .section-label.error { color: var(--error); }
         .section-label.success { color: var(--success); }
         .section-label.purple { color: #d946ef; }
         .section-label.warning { color: var(--warning); }

         .logs-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 24px;
            border-bottom: 1px solid var(--glass-border);
         }
         
         .logs-container {
            max-height: 300px;
            overflow-y: auto;
            padding: 16px 24px;
            font-family: var(--font-mono);
            font-size: 0.85rem;
         }

         .log-entry {
            display: flex;
            gap: 12px;
            margin-bottom: 6px;
         }

         .log-time { color: var(--text-muted); opacity: 0.6; }
         .log-message { color: var(--text-secondary); }
         
         .log-entry.success .log-message { color: var(--success); }
         .log-entry.error .log-message { color: var(--error); }
         .log-entry.warning .log-message { color: var(--warning); }
      `}</style>
    </Layout>
  );
}

function FormattedText({ text }) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements = [];
  let inList = false;
  let listItems = [];

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const isBullet = trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('*');

    if (isBullet) {
      if (!inList) inList = true;
      listItems.push(<li key={`li-${i}`}>{trimmed.replace(/^[-*•]\s*/, '').trim()}</li>);
    } else {
      if (inList) {
        elements.push(<ul key={`ul-${i}`}>{listItems}</ul>);
        listItems = [];
        inList = false;
      }
      elements.push(<p key={`p-${i}`}>{trimmed}</p>);
    }
  });

  if (inList) {
    elements.push(<ul key="ul-last">{listItems}</ul>);
  }

  return <div className="section-content text-sm leading-relaxed text-secondary">{elements}</div>;
}
