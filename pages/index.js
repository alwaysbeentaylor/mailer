import { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";

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

  // Load stats from localStorage
  useEffect(() => {
    const savedStats = localStorage.getItem("skyeMailStats");
    if (savedStats) {
      setStats(JSON.parse(savedStats));
    }
  }, []);

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
    // Don't clear result immediately if we are sending, to avoid UI flicker? 
    // Actually standard behavior is fine, but let's keep it null for loading state logic if needed.
    setResult(null);

    try {
      const payload = {
        ...formData,
        dryRun: isPreview
      };

      // If we have pre-generated data (from preview), send it along
      if (!isPreview && preGeneratedResult) {
        payload.preGeneratedData = {
          subject: preGeneratedResult.subject,
          body: preGeneratedResult.body,
          sections: preGeneratedResult.sections,
          siteAnalysis: preGeneratedResult.siteAnalysis
        };
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
        throw new Error(data.details || data.error || "Onbekende fout");
      }

      setResult(data);
      if (!isPreview) {
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
    <>
      <Head>
        <title>SKYE Mail Agent | AI-Powered Cold Outreach</title>
        <meta name="description" content="Genereer en verstuur AI-geschreven cold emails direct via Gmail" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </Head>

      <div className="app">
        {/* Background Effects */}
        <div className="bg-gradient"></div>
        <div className="bg-grid"></div>

        {/* Header */}
        <header className="header">
          <div className="logo">
            <span className="logo-icon">⚡</span>
            <span className="logo-text">SKYE</span>
            <span className="logo-badge">MAIL AGENT</span>
          </div>
          <div className="header-right">
            <Link href="/analytics" className="batch-link analytics-link">
              📊 Analytics
            </Link>
            <Link href="/batch" className="batch-link">
              📦 Batch Modus
            </Link>
            <Link href="/enrich" className="batch-link">
              🕵️ Lead Verrijker
            </Link>
            <div className="stats-bar">
              <div className="stat">
                <span className="stat-value">{stats.sent}</span>
                <span className="stat-label">Verstuurd</span>
              </div>
              <div className="stat-divider"></div>
              <div className="stat">
                <span className="stat-value status-live">●</span>
                <span className="stat-label">Live</span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="main">
          <div className="container">
            {/* Hero Section */}
            <div className="hero">
              <h1 className="hero-title">
                <span className="gradient-text">AI-Powered</span> Cold Outreach
              </h1>
              <p className="hero-subtitle">
                Vul de gegevens van een lead in. De AI schrijft een gepersonaliseerde mail
                en verstuurt hem direct via jouw Gmail.
              </p>
            </div>

            {/* Main Card */}
            <div className="card">
              <form onSubmit={handleSubmit} className="form">
                {/* Lead Info Section */}
                <div className="form-section">
                  <h2 className="section-title">
                    <span className="section-icon">📧</span>
                    Lead Informatie
                  </h2>

                  <div className="form-grid">
                    <div className="form-group">
                      <label className="label">
                        E-mailadres ontvanger
                        <span className="required">*</span>
                      </label>
                      <input
                        type="email"
                        name="toEmail"
                        value={formData.toEmail}
                        onChange={handleChange}
                        required
                        placeholder="info@bedrijf.be"
                        className="input"
                      />
                    </div>

                    <div className="form-group">
                      <label className="label">
                        Bedrijfsnaam
                        <span className="required">*</span>
                      </label>
                      <input
                        type="text"
                        name="businessName"
                        value={formData.businessName}
                        onChange={handleChange}
                        required
                        placeholder="Restaurant De Gouden Leeuw"
                        className="input"
                      />
                    </div>

                    <div className="form-group full-width">
                      <label className="label">
                        Website URL
                        <span className="required">*</span>
                      </label>
                      <input
                        type="url"
                        name="websiteUrl"
                        value={formData.websiteUrl}
                        onChange={handleChange}
                        required
                        placeholder="https://www.bedrijf.be"
                        className="input"
                      />
                    </div>

                    <div className="form-group">
                      <label className="label">
                        Contactpersoon
                        <span className="optional">(optioneel)</span>
                      </label>
                      <input
                        type="text"
                        name="contactPerson"
                        value={formData.contactPerson}
                        onChange={handleChange}
                        placeholder="Jan Janssen"
                        className="input"
                      />
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

                  <div className="form-group" style={{ marginTop: '16px' }}>
                    <label className="label">
                      Extra notities voor AI
                      <span className="optional">(optioneel)</span>
                    </label>
                    <textarea
                      name="customNotes"
                      value={formData.customNotes}
                      onChange={handleChange}
                      placeholder="Bijv: Focus op mobiele website, vermeld hun Instagram pagina, ze hebben een nieuwe locatie geopend..."
                      className="textarea"
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

                  <div className="subject-preheader-grid">
                    {/* Subject Line */}
                    <div className="custom-field-block">
                      <div className="field-header">
                        <label className="label">Onderwerp</label>
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
                          className="input"
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
                    <div className="custom-field-block">
                      <div className="field-header">
                        <label className="label">Pre-header</label>
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
                          className="input"
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
                    className="btn btn-secondary"
                  >
                    👁️ Preview
                  </button>
                  <button
                    type="submit"
                    name="action"
                    value="send"
                    disabled={loading}
                    className="btn btn-primary"
                  >
                    {loading ? (
                      <>
                        <span className="spinner"></span>
                        {previewMode ? 'Genereren...' : 'Versturen...'}
                      </>
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
                <div className={`result ${result.dryRun ? 'result-preview' : 'result-success'}`}>
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
                    {result.wasRandom && result.selectedTone && (
                      <span>🎲 Stijl: {
                        result.selectedTone === 'professional' ? 'ROI Focus' :
                          result.selectedTone === 'casual' ? 'Value Drop' :
                            result.selectedTone === 'urgent' ? 'FOMO' :
                              result.selectedTone === 'friendly' ? 'Warm Direct' : result.selectedTone
                      }</span>
                    )}
                  </div>

                  {/* Site Analysis Display */}
                  {result.siteAnalysis && (
                    <div className="site-analysis">
                      <div className="analysis-header">🔍 Website Analyse</div>

                      {/* Niche Detection */}
                      {result.siteAnalysis.niche && (
                        <div className="niche-badge">
                          🎯 Gedetecteerde branche: <strong>{result.siteAnalysis.niche}</strong>
                          <span className={`confidence ${result.siteAnalysis.nicheConfidence}`}>
                            ({result.siteAnalysis.nicheConfidence} zekerheid)
                          </span>
                        </div>
                      )}

                      {/* Unique Observations */}
                      {result.siteAnalysis.uniqueObservations && result.siteAnalysis.uniqueObservations.length > 0 && (
                        <div className="observations-section">
                          <div className="mini-header">💡 Persoonlijke observaties:</div>
                          {result.siteAnalysis.uniqueObservations.map((obs, i) => (
                            <div key={i} className="observation-item">• {obs}</div>
                          ))}
                        </div>
                      )}

                      {/* Detected Services */}
                      {result.siteAnalysis.services && result.siteAnalysis.services.length > 0 && (
                        <div className="services-section">
                          <div className="mini-header">📋 Gevonden diensten:</div>
                          <div className="services-list">
                            {result.siteAnalysis.services.slice(0, 4).map((service, i) => (
                              <span key={i} className="service-tag">{service}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Slogans */}
                      {result.siteAnalysis.slogans && result.siteAnalysis.slogans.length > 0 && (
                        <div className="slogan-section">
                          <div className="mini-header">✨ Hun boodschap:</div>
                          <div className="slogan-text">"{result.siteAnalysis.slogans[0]}"</div>
                        </div>
                      )}

                      {/* Technical Issues */}
                      {result.siteAnalysis.issues && result.siteAnalysis.issues.length > 0 && (
                        <div className="analysis-issues">
                          <div className="mini-header">⚠️ Technische problemen:</div>
                          {result.siteAnalysis.issues.map((issue, i) => (
                            <div key={i} className="issue-item">{issue}</div>
                          ))}
                        </div>
                      )}
                      {result.siteAnalysis.issues && result.siteAnalysis.issues.length === 0 && (
                        <div className="issue-item success">✅ Geen grote problemen gevonden</div>
                      )}

                      <div className="analysis-stats">
                        <span className={result.siteAnalysis.hasSSL ? 'stat-good' : 'stat-bad'}>
                          {result.siteAnalysis.hasSSL ? '🔒' : '⚠️'} HTTPS
                        </span>
                        <span className={result.siteAnalysis.hasMobileViewport ? 'stat-good' : 'stat-bad'}>
                          {result.siteAnalysis.hasMobileViewport ? '📱' : '⚠️'} Mobile
                        </span>
                        <span className={result.siteAnalysis.hasWhatsApp ? 'stat-good' : 'stat-bad'}>
                          {result.siteAnalysis.hasWhatsApp ? '💬' : '⚠️'} WhatsApp
                        </span>
                        {result.siteAnalysis.hasTestimonials && (
                          <span className="stat-good">⭐ Reviews</span>
                        )}
                        {result.siteAnalysis.hasBlog && (
                          <span className="stat-good">📰 Blog</span>
                        )}
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
                        {/* Intro sectie ZONDER label, maar MET branche badge */}
                        <div className="section intro">
                          {result.siteAnalysis?.niche && result.siteAnalysis.niche !== 'bedrijf' && (
                            <span className="branche-badge">🎯 {result.siteAnalysis.niche}</span>
                          )}
                          <FormattedText text={result.sections.intro} />
                        </div>
                        <div className="section audit">
                          <span className="section-label">💡 Gratis Audit</span>
                          <FormattedText text={result.sections.audit} />
                        </div>
                        <div className="section boosters">
                          <span className="section-label">🔥 SKYE Oplossing</span>
                          <FormattedText text={result.sections.boosters} />
                        </div>
                        <div className="section resultaat">
                          <span className="section-label">🚀 Resultaat</span>
                          <FormattedText text={result.sections.resultaat} />
                        </div>
                        <div className="section cta">
                          <span className="section-label">📞 CTA</span>
                          <FormattedText text={result.sections.cta} />
                        </div>
                      </div>
                    ) : (
                      <div className="email-body">
                        <span className="email-label">Email:</span>
                        <pre>{result.body}</pre>
                      </div>
                    )}
                  </div>

                  {result.dryRun && (
                    <button
                      className="btn btn-primary full-width"
                      onClick={handleRealSend}
                    >
                      🚀 Nu Echt Versturen
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Tips Section */}
            <div className="tips-card">
              <h3 className="tips-title">💡 Pro Tips</h3>
              <ul className="tips-list">
                <li>Bekijk eerst de website van het bedrijf om context toe te voegen</li>
                <li>Gebruik de preview modus om de email te checken voor versturen</li>
                <li>Voeg specifieke details toe in de notities voor betere personalisatie</li>
                <li>Varieer de email tonen om te zien wat het beste werkt</li>
              </ul>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="footer">
          <p>Built with ⚡ by SKYE Unlimited</p>
        </footer>
      </div>

      <style jsx>{`
        /* CSS Variables - LIGHT THEME */
        :root {
          --bg-primary: #f8fafc;
          --bg-secondary: #ffffff;
          --bg-card: rgba(255, 255, 255, 0.95);
          --border-color: rgba(0, 0, 0, 0.1);
          --text-primary: #1a1a2e;
          --text-secondary: #4a5568;
          --text-muted: #718096;
          --accent-primary: #0066cc;
          --accent-secondary: #00a67e;
          --accent-gradient: linear-gradient(135deg, #0066cc, #00a67e);
          --error-bg: rgba(239, 68, 68, 0.1);
          --error-border: rgba(239, 68, 68, 0.3);
          --error-text: #dc2626;
          --success-bg: rgba(34, 197, 94, 0.15);
          --success-border: rgba(34, 197, 94, 0.4);
          --success-text: #16a34a;
          --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
        }

        /* Reset & Base */
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        .app {
          min-height: 100vh;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-family: var(--font-sans);
          position: relative;
          overflow-x: hidden;
        }

        /* Background Effects */
        .bg-gradient {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: 
            radial-gradient(ellipse 80% 50% at 50% -20%, rgba(0, 102, 204, 0.08), transparent),
            radial-gradient(ellipse 60% 40% at 100% 100%, rgba(0, 166, 126, 0.06), transparent);
          pointer-events: none;
          z-index: 0;
        }

        .bg-grid {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-image: 
            linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px);
          background-size: 60px 60px;
          pointer-events: none;
          z-index: 0;
        }

        /* Header */
        .header {
          position: relative;
          z-index: 10;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid var(--border-color);
          backdrop-filter: blur(10px);
          background: rgba(255, 255, 255, 0.9);
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .logo-icon {
          font-size: 24px;
        }

        .logo-text {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.5px;
        }

        .logo-badge {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 1px;
          padding: 4px 8px;
          background: var(--accent-gradient);
          color: var(--bg-primary);
          border-radius: 4px;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .batch-link {
          padding: 8px 16px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-secondary);
          text-decoration: none;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .batch-link:hover {
          background: rgba(0, 102, 204, 0.1);
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }

        .stats-bar {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }

        .stat-value {
          font-size: 18px;
          font-weight: 600;
          font-family: var(--font-mono);
        }

        .stat-label {
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .stat-divider {
          width: 1px;
          height: 30px;
          background: var(--border-color);
        }

        .status-live {
          color: #22c55e;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        /* Main */
        .main {
          position: relative;
          z-index: 1;
          padding: 40px 24px 80px;
        }

        .container {
          max-width: 720px;
          margin: 0 auto;
        }

        /* Hero */
        .hero {
          text-align: center;
          margin-bottom: 40px;
        }

        .hero-title {
          font-size: 36px;
          font-weight: 700;
          letter-spacing: -1px;
          margin-bottom: 12px;
        }

        .gradient-text {
          background: var(--accent-gradient);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .hero-subtitle {
          font-size: 16px;
          color: var(--text-secondary);
          line-height: 1.6;
          max-width: 500px;
          margin: 0 auto;
        }

        /* Card */
        .card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 20px;
          padding: 32px;
          backdrop-filter: blur(20px);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        }

        /* Form */
        .form-section {
          margin-bottom: 32px;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 20px;
          color: var(--text-primary);
        }

        .section-icon {
          font-size: 20px;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group.full-width {
          grid-column: span 2;
        }

        .label {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .required {
          color: #ef4444;
        }

        .optional {
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 400;
        }

        .input, .textarea {
          width: 100%;
          padding: 12px 14px;
          background: #ffffff;
          border: 1px solid var(--border-color);
          border-radius: 10px;
          color: var(--text-primary);
          font-size: 14px;
          font-family: var(--font-sans);
          transition: all 0.2s ease;
        }

        .input:focus, .textarea:focus {
          outline: none;
          border-color: var(--accent-primary);
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.15);
        }

        .input::placeholder, .textarea::placeholder {
          color: var(--text-muted);
        }

        .textarea {
          resize: vertical;
          min-height: 80px;
        }

        /* Tone Options */
        .tone-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .tone-option {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 14px 16px;
          background: #ffffff;
          border: 1px solid var(--border-color);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .tone-option:hover {
          background: #f8fafc;
          border-color: rgba(0, 0, 0, 0.2);
        }

        .tone-option.active {
          background: rgba(0, 102, 204, 0.08);
          border-color: var(--accent-primary);
        }

        .tone-radio {
          display: none;
        }

        .tone-label {
          font-size: 14px;
          font-weight: 500;
        }

        .tone-desc {
          font-size: 12px;
          color: var(--text-muted);
        }

        /* Subject & Pre-header Section */
        .subject-preheader-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }

        .custom-field-block {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .field-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .toggle-pills {
          display: flex;
          gap: 4px;
          background: #f1f5f9;
          padding: 3px;
          border-radius: 8px;
        }

        .pill {
          padding: 6px 12px;
          border: none;
          background: transparent;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          color: #64748b;
          transition: all 0.2s;
        }

        .pill.active {
          background: white;
          color: var(--accent-primary);
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .pill:hover:not(.active) {
          color: var(--text-primary);
        }

        .auto-hint {
          padding: 12px 14px;
          background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
          border: 1px dashed #7dd3fc;
          border-radius: 10px;
          font-size: 13px;
          color: #0369a1;
          text-align: center;
        }

        .placeholder-hint {
          font-size: 11px;
          color: var(--text-muted);
        }

        .placeholder-hint code {
          background: #f1f5f9;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: var(--font-mono);
          font-size: 10px;
          color: #0369a1;
        }

        @media (max-width: 640px) {
          .subject-preheader-grid {
            grid-template-columns: 1fr;
          }
        }

        /* Buttons */
        .button-group {
          display: flex;
          gap: 12px;
          margin-top: 8px;
        }

        .btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px 24px;
          border: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          font-family: var(--font-sans);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-primary {
          background: var(--accent-gradient);
          color: #ffffff;
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(0, 102, 204, 0.3);
        }

        .btn-secondary {
          background: #ffffff;
          color: var(--text-primary);
          border: 1px solid var(--border-color);
        }

        .btn-secondary:hover:not(:disabled) {
          background: #f8fafc;
          border-color: rgba(0, 0, 0, 0.2);
        }

        .btn.full-width {
          width: 100%;
          margin-top: 16px;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid transparent;
          border-top-color: currentColor;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Alerts */
        .alert {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-top: 24px;
          padding: 16px;
          border-radius: 12px;
        }

        .alert-error {
          background: var(--error-bg);
          border: 1px solid var(--error-border);
        }

        .alert-icon {
          font-size: 18px;
          flex-shrink: 0;
        }

        .alert-content strong {
          display: block;
          color: var(--error-text);
          margin-bottom: 4px;
        }

        .alert-content p {
          color: var(--text-secondary);
          font-size: 13px;
        }

        /* Result */
        .result {
          margin-top: 24px;
          padding: 20px;
          border-radius: 16px;
        }

        .result-preview {
          background: rgba(251, 191, 36, 0.1);
          border: 1px solid rgba(251, 191, 36, 0.3);
        }

        .result-success {
          background: var(--success-bg);
          border: 1px solid var(--success-border);
        }

        .result-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
        }

        .result-icon {
          font-size: 24px;
        }

        .result-title {
          font-size: 16px;
          font-weight: 600;
          flex: 1;
        }

        .result-badge {
          font-size: 11px;
          font-weight: 500;
          padding: 4px 10px;
          border-radius: 6px;
          font-family: var(--font-mono);
        }

        .result-badge.preview {
          background: rgba(251, 191, 36, 0.2);
          color: #fbbf24;
        }

        .result-badge.success {
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }

        .result-meta {
          display: flex;
          gap: 16px;
          margin-bottom: 16px;
          font-size: 13px;
          color: var(--text-secondary);
        }

        .email-preview {
          background: #f1f5f9;
          border-radius: 12px;
          padding: 16px;
        }

        .email-label {
          display: block;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }

        .email-subject {
          font-size: 15px;
          font-weight: 600;
          margin-bottom: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-color);
        }

        .email-preheader {
          margin-bottom: 16px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border-color);
        }

        .preheader-text {
          font-size: 13px;
          color: var(--text-muted);
          font-style: italic;
        }

        .email-body pre {
          font-family: var(--font-sans);
          font-size: 13px;
          line-height: 1.7;
          white-space: pre-wrap;
          word-wrap: break-word;
          color: var(--text-secondary);
        }

        /* Site Analysis */
        .site-analysis {
          margin-bottom: 16px;
          padding: 16px;
          background: #f0f9ff;
          border: 1px solid #bae6fd;
          border-radius: 12px;
        }

        .analysis-header {
          font-size: 14px;
          font-weight: 600;
          color: var(--accent-primary);
          margin-bottom: 12px;
        }

        .analysis-issues {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 12px;
        }

        .issue-item {
          font-size: 13px;
          color: #b45309;
          padding: 6px 10px;
          background: #fef3c7;
          border-radius: 6px;
        }

        .issue-item.success {
          color: #16a34a;
          background: #dcfce7;
        }

        .analysis-stats {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .analysis-stats span {
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 20px;
          font-weight: 500;
        }

        .stat-good {
          background: #dcfce7;
          color: #16a34a;
        }

        .stat-bad {
          background: #fee2e2;
          color: #dc2626;
        }

        /* Personalization Elements */
        .niche-badge {
          padding: 10px 14px;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1));
          border: 1px solid rgba(99, 102, 241, 0.3);
          border-radius: 10px;
          font-size: 14px;
          margin-bottom: 12px;
          color: #4f46e5;
        }

        .niche-badge strong {
          text-transform: capitalize;
          color: #4338ca;
        }

        .niche-badge .confidence {
          font-size: 11px;
          margin-left: 6px;
          opacity: 0.7;
        }

        .niche-badge .confidence.hoog {
          color: #16a34a;
        }

        .niche-badge .confidence.medium {
          color: #ca8a04;
        }

        .niche-badge .confidence.laag {
          color: #dc2626;
        }

        .mini-header {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 6px;
        }

        .observations-section {
          margin-bottom: 12px;
          padding: 10px;
          background: rgba(34, 197, 94, 0.08);
          border-radius: 8px;
        }

        .observation-item {
          font-size: 13px;
          color: #166534;
          padding: 4px 0;
        }

        .services-section {
          margin-bottom: 12px;
        }

        .services-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .service-tag {
          font-size: 11px;
          padding: 4px 10px;
          background: #e0f2fe;
          color: #0369a1;
          border-radius: 20px;
          font-weight: 500;
        }

        .slogan-section {
          margin-bottom: 12px;
          padding: 10px;
          background: rgba(251, 191, 36, 0.1);
          border-left: 3px solid #f59e0b;
          border-radius: 0 8px 8px 0;
        }

        .slogan-text {
          font-size: 13px;
          color: #92400e;
          font-style: italic;
        }

        /* Tips */
        .tips-card {
          margin-top: 24px;
          padding: 20px 24px;
          background: #ffffff;
          border: 1px solid var(--border-color);
          border-radius: 16px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
        }

        .tips-title {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 12px;
        }

        .tips-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .tips-list li {
          font-size: 13px;
          color: var(--text-secondary);
          padding-left: 20px;
          position: relative;
        }

        .tips-list li::before {
          content: "→";
          position: absolute;
          left: 0;
          color: var(--accent-primary);
        }

        /* Footer */
        .footer {
          position: relative;
          z-index: 1;
          text-align: center;
          padding: 24px;
          color: var(--text-muted);
          font-size: 13px;
        }

        /* Responsive */
        @media (max-width: 640px) {
          .header {
            flex-direction: column;
            gap: 16px;
          }

          .hero-title {
            font-size: 28px;
          }

          .card {
            padding: 20px;
          }

          .form-grid {
            grid-template-columns: 1fr;
          }

          .form-group.full-width {
            grid-column: span 1;
          }

          .tone-grid {
            grid-template-columns: 1fr;
          }

          .button-group {
            flex-direction: column;
          }

          .result-meta {
            flex-direction: column;
            gap: 8px;
          }
        }

        /* Email Sections Preview */
        .email-sections {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
        }

        @media (min-width: 768px) {
          .email-sections {
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }
          .section.intro { grid-column: 1 / -1; }
          .section.promise { grid-column: 1 / -1; }
          .section.cta { grid-column: 1 / -1; }
        }

        .section {
          padding: 16px;
          border-radius: 8px;
          background: #f8fafc;
          border: 1px solid var(--border-color);
          height: 100%;
        }

        .section-label {
          display: block;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 8px;
          font-weight: 800;
        }

        .section-content {
          font-size: 13px;
          line-height: 1.6;
        }

        .section-content p {
          margin-bottom: 8px;
        }

        .section-content ul {
          margin: 0 0 8px 0;
          padding-left: 20px;
        }

        .section-content li {
          margin-bottom: 4px;
        }

        .section.intro { background: #ffffff; }
        .section.intro .section-label { color: var(--text-muted); }

        /* Branche badge styling */
        .branche-badge {
          display: inline-block;
          padding: 4px 10px;
          background: linear-gradient(135deg, #0066cc15, #00a67e15);
          border: 1px solid #0066cc30;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          color: #0066cc;
          margin-bottom: 8px;
          text-transform: capitalize;
        }

        .section.audit { background: #fef2f2; border-color: #fecaca; }
        .section.audit .section-label { color: #dc2626; }
        .section.audit .section-content { color: #7f1d1d; }

        .section.boosters { background: #f0fdf4; border-color: #dcfce7; }
        .section.boosters .section-label { color: #16a34a; }
        .section.boosters .section-content { color: #14532d; }

        .section.resultaat { background: #faf5ff; border-color: #f3e8ff; }
        .section.resultaat .section-label { color: #9333ea; }
        .section.resultaat .section-content { color: #581c87; }

        .section.cta { background: #fef3c7; border-color: #fde68a; }
        .section.cta .section-label { color: #d97706; }
        .section.cta .section-content { font-weight: 500; color: #92400e; }
      `}</style>

      <style jsx global>{`
        html, body {
          margin: 0;
          padding: 0;
          background: #f8fafc;
        }
      `}</style>
    </>
  );
}

// Helper component for formatted text
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

  return <div className="section-content">{elements}</div>;
}
