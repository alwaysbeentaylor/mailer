import { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import Image from "next/image";

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
        <div className="bg-orb orb-1"></div>
        <div className="bg-orb orb-2"></div>
        <div className="bg-grid"></div>

        {/* Header */}
        <header className="header glass-panel">
          <div className="logo">
            <div className="logo-container">
              {/* Using the new logo asset if you want, or keeping the text style but enhanced */}
              <span className="logo-icon">🍌</span>
              <span className="logo-text neon-text">NANO BANANA</span>
            </div>
            <span className="logo-badge">MAIL AGENT v2.0</span>
          </div>
          <div className="header-right">
            <Link href="/campaigns" className="nav-link">
              🚀 Campagnes
            </Link>
            <Link href="/analytics" className="nav-link">
              📊 Analytics
            </Link>
            <Link href="/batch" className="nav-link">
              📦 Batch
            </Link>
            <Link href="/enrich" className="nav-link">
              🕵️ Enricher
            </Link>
            <Link href="/warmup" className="nav-link">
              🔥 Warm-up
            </Link>
            <Link href="/settings" className="nav-link">
              ⚙️ Settings
            </Link>
            <div className="stats-pill glass-panel">
              <span className="stat-value">{stats.sent}</span>
              <span className="stat-label">SENT</span>
              <span className="status-dot"></span>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="main">
          <div className="container">
            {/* Hero Section */}
            <div className="hero">
              <h1 className="hero-title">
                <span className="text-gradient">AI-Powered</span><br />
                Cold Outreach
              </h1>
              <p className="hero-subtitle">
                Laat de <span className="highlight">Nano Banana Robot</span> het zware werk doen.
                Vul de details in en zie de magie gebeuren.
              </p>
            </div>

            {/* Main Card */}
            <div className="card glass-panel">
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
                    className={`btn btn-primary ${loading ? 'loading' : ''}`}
                  >
                    {loading ? (
                      <div className="loading-content">
                        {/* ROBOT ANIMATION HERE */}
                        <div className="robot-wrapper">
                          <Image
                            src="/assets/robot-working.png"
                            alt="Working Robot"
                            width={50}
                            height={50}
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
        {/* Footer */}
        <footer className="footer">
          <div className="footer-content">
            <span className="footer-logo">🍌</span>
            <p>Built with <span className="heart">💜</span> by <strong>Nano Banana</strong></p>
          </div>
        </footer>
      </div>

      <style jsx>{`
        .app {
          min-height: 100vh;
          position: relative;
          padding-bottom: 40px;
        }

        .bg-orb {
          position: fixed;
          border-radius: 50%;
          filter: blur(100px);
          z-index: -1;
          opacity: 0.6;
        }
        .orb-1 {
          top: -100px;
          left: -100px;
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, var(--neon-blue), transparent);
          animation: float 20s infinite ease-in-out;
        }
        .orb-2 {
          bottom: -100px;
          right: -100px;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, var(--neon-purple), transparent);
          animation: float 25s infinite ease-in-out reverse;
        }

        .bg-grid {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-image:
            linear-gradient(var(--grid-color) 1px, transparent 1px),
            linear-gradient(90deg, var(--grid-color) 1px, transparent 1px);
          background-size: 40px 40px;
          opacity: 0.2;
          z-index: -1;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 32px;
          margin: 20px 20px 0;
          border-radius: 20px;
          z-index: 50;
        }

        .logo {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
        }
        .logo-container {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .logo-icon { font-size: 28px; }
        .logo-text {
          font-family: var(--font-mono);
          font-weight: 800;
          font-size: 20px;
          letter-spacing: -1px;
        }
        .logo-badge {
          font-size: 10px;
          color: var(--neon-blue);
          font-family: var(--font-mono);
          margin-left: 44px;
          letter-spacing: 2px;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .nav-link {
          padding: 10px 18px;
          border-radius: 12px;
          color: var(--text-secondary);
          font-weight: 600;
          font-size: 14px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid transparent;
        }
        .nav-link:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--neon-blue);
          border-color: var(--glass-border);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 243, 255, 0.1);
        }

        .stats-pill {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 16px;
          border-radius: 100px;
          margin-left: 12px;
        }
        .stat-value {
          font-family: var(--font-mono);
          font-weight: 700;
          color: var(--success);
        }
        .stat-label {
          font-size: 10px;
          font-weight: 700;
          color: var(--text-muted);
        }
        .status-dot {
          width: 8px;
          height: 8px;
          background: var(--success);
          border-radius: 50%;
          box-shadow: 0 0 10px var(--success);
          animation: pulse 2s infinite;
        }

        .main { padding: 40px 20px; }

        .hero {
          text-align: center;
          margin-bottom: 60px;
          position: relative;
        }
        .hero-title {
          font-size: 64px;
          font-weight: 800;
          line-height: 1.1;
          letter-spacing: -2px;
          margin-bottom: 16px;
        }
        .hero-subtitle {
          font-size: 18px;
          color: var(--text-secondary);
          max-width: 600px;
          margin: 0 auto;
        }
        .highlight { color: var(--neon-pink); font-weight: 600; }

        .card {
          max-width: 800px;
          margin: 0 auto;
          border-radius: 24px;
          padding: 40px;
          position: relative;
          overflow: hidden;
        }
        .card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, var(--neon-blue), transparent);
          opacity: 0.5;
        }

        .section-title {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--text-primary);
        }
        .section-icon { font-size: 24px; }

        .form-section {
          margin-bottom: 32px;
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-group.full-width { grid-column: 1 / -1; }

        .label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 8px;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .required { color: var(--neon-pink); margin-left: 4px; }
        .optional { color: var(--text-muted); font-size: 11px; margin-left: 6px; text-transform: none; }

        .input, .textarea {
          width: 100%;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid var(--glass-border);
          border-radius: 12px;
          padding: 14px 16px;
          color: var(--text-primary);
          font-size: 15px;
          transition: all 0.2s ease;
        }
        .input:focus, .textarea:focus {
          outline: none;
          border-color: var(--neon-blue);
          box-shadow: 0 0 0 3px rgba(0, 243, 255, 0.1);
          background: rgba(0, 0, 0, 0.5);
        }
        .input::placeholder, .textarea::placeholder {
          color: var(--text-muted);
        }

        .tone-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px;
        }
        .tone-option {
          position: relative;
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
          background: rgba(0, 243, 255, 0.1);
          border-color: var(--neon-blue);
          box-shadow: 0 0 20px rgba(0, 243, 255, 0.1);
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

        .subject-preheader-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
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
          background: rgba(0,0,0,0.3);
          padding: 4px;
          border-radius: 8px;
          gap: 4px;
        }
        .pill {
          background: transparent;
          border: none;
          padding: 6px 12px;
          border-radius: 6px;
          color: var(--text-secondary);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .pill.active {
          background: var(--glass-highlight);
          color: var(--text-primary);
          font-weight: 600;
        }
        .auto-hint {
          padding: 12px 14px;
          background: rgba(0, 243, 255, 0.1);
          border: 1px dashed var(--neon-blue);
          border-radius: 10px;
          font-size: 13px;
          color: var(--neon-blue);
          text-align: center;
        }

        .button-group {
          display: grid;
          grid-template-columns: 1fr 2fr;
          gap: 16px;
          margin-top: 32px;
        }
        .btn {
          border: none;
          border-radius: 14px;
          padding: 16px 24px;
          font-weight: 700;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 10px;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .btn-secondary {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-primary);
          border: 1px solid var(--glass-border);
        }
        .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: var(--text-primary);
        }
        .btn-primary {
          background: linear-gradient(135deg, var(--neon-blue), var(--neon-purple));
          color: white;
          box-shadow: 0 4px 20px rgba(112, 0, 255, 0.4);
          position: relative;
          overflow: hidden;
        }
        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(112, 0, 255, 0.6);
        }
        .btn.full-width {
          width: 100%;
          margin-top: 16px;
        }

        .loading-content {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .robot-wrapper {
          display: flex;
          align-items: center;
        }

        .robot-anim {
          animation: bounce 0.5s infinite alternate;
        }

        @keyframes bounce {
          from { transform: translateY(0); }
          to { transform: translateY(-5px); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .alert {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-top: 24px;
          padding: 16px;
          border-radius: 12px;
        }
        .alert-error {
          background: rgba(255, 0, 85, 0.1);
          border: 1px solid rgba(255, 0, 85, 0.3);
        }
        .alert-icon { font-size: 18px; flex-shrink: 0; }
        .alert-content strong {
          display: block;
          color: var(--error);
          margin-bottom: 4px;
        }
        .alert-content p {
          color: var(--text-secondary);
          font-size: 13px;
        }

        .result {
          margin-top: 24px;
          padding: 20px;
          border-radius: 16px;
        }
        .result-preview {
          background: rgba(255, 214, 0, 0.1);
          border: 1px solid rgba(255, 214, 0, 0.3);
        }
        .result-success {
          background: rgba(0, 255, 157, 0.1);
          border: 1px solid rgba(0, 255, 157, 0.3);
        }
        .result-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
        }
        .result-icon { font-size: 24px; }
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
          background: rgba(255, 214, 0, 0.2);
          color: var(--warning);
        }
        .result-badge.success {
          background: rgba(0, 255, 157, 0.2);
          color: var(--success);
        }
        .result-meta {
          display: flex;
          gap: 16px;
          margin-bottom: 16px;
          font-size: 13px;
          color: var(--text-secondary);
        }

        .email-preview {
          background: rgba(0, 0, 0, 0.3);
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
          border-bottom: 1px solid var(--glass-border);
        }
        .email-preheader {
          margin-bottom: 16px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--glass-border);
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

        .email-sections {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
        }
        .section {
          padding: 16px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--glass-border);
        }
        .section-label {
          display: block;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 8px;
          font-weight: 700;
          color: var(--text-muted);
        }
        .section-content {
          font-size: 13px;
          line-height: 1.6;
          color: var(--text-secondary);
        }
        .section-content p { margin-bottom: 8px; }
        .section-content ul { margin: 0 0 8px 0; padding-left: 20px; }
        .section-content li { margin-bottom: 4px; }

        .section.intro { background: rgba(255, 255, 255, 0.05); }
        .section.audit { background: rgba(255, 0, 85, 0.05); border-color: rgba(255, 0, 85, 0.2); }
        .section.audit .section-label { color: var(--error); }
        .section.boosters { background: rgba(0, 255, 157, 0.05); border-color: rgba(0, 255, 157, 0.2); }
        .section.boosters .section-label { color: var(--success); }
        .section.resultaat { background: rgba(112, 0, 255, 0.05); border-color: rgba(112, 0, 255, 0.2); }
        .section.resultaat .section-label { color: var(--neon-purple); }
        .section.cta { background: rgba(255, 214, 0, 0.05); border-color: rgba(255, 214, 0, 0.2); }
        .section.cta .section-label { color: var(--warning); }

        .branche-badge {
          display: inline-block;
          padding: 4px 10px;
          background: rgba(0, 243, 255, 0.1);
          border: 1px solid rgba(0, 243, 255, 0.3);
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          color: var(--neon-blue);
          margin-bottom: 8px;
        }

        .tips-card {
          margin-top: 24px;
          padding: 20px 24px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--glass-border);
          border-radius: 16px;
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
          color: var(--neon-blue);
        }

        .footer {
          text-align: center;
          padding: 40px;
          color: var(--text-muted);
          font-size: 14px;
        }
        .footer-content {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .footer-logo { font-size: 24px; }
        .heart { color: var(--neon-pink); display: inline-block; animation: pulse 1s infinite; }

        @media (max-width: 768px) {
          .hero-title { font-size: 40px; }
          .button-group { grid-template-columns: 1fr; }
          .header { flex-direction: column; gap: 20px; }
          .form-grid { grid-template-columns: 1fr; }
          .form-group.full-width { grid-column: span 1; }
          .subject-preheader-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
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

  return <div className="section-content">{elements}</div>;
}
