import { useState, useRef, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";

export default function BatchPage() {
  const [leads, setLeads] = useState([]);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [selectedLeads, setSelectedLeads] = useState(new Set());
  const fileInputRef = useRef(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [leadStatuses, setLeadStatuses] = useState({}); // Track status per lead: { [id]: 'waiting' | 'processing' | 'sent' | 'failed' }
  const [currentProcessingId, setCurrentProcessingId] = useState(null);
  const [sessionPrompt, setSessionPrompt] = useState(''); // Tijdelijke extra instructies voor de AI
  const [showSessionPrompt, setShowSessionPrompt] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Calculate pagination
  const totalPages = Math.ceil(leads.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedLeads = leads.slice(startIndex, endIndex);

  // Add single lead
  const addLead = () => {
    setLeads([...leads, {
      id: Date.now(),
      toEmail: "",
      businessName: "",
      websiteUrl: "",
      contactPerson: "",
      emailTone: "professional"
    }]);
  };

  // Update lead
  const updateLead = (id, field, value) => {
    setLeads(leads.map(lead =>
      lead.id === id ? { ...lead, [field]: value } : lead
    ));
  };

  // Remove lead
  const removeLead = (id) => {
    setLeads(leads.filter(lead => lead.id !== id));
    if (selectedLeads.has(id)) {
      const newSelected = new Set(selectedLeads);
      newSelected.delete(id);
      setSelectedLeads(newSelected);
    }
  };

  // Bulk Selection Handlers
  const toggleLead = (id) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedLeads(newSelected);
  };

  const toggleAll = () => {
    if (selectedLeads.size === leads.length && leads.length > 0) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(leads.map(l => l.id)));
    }
  };

  const bulkUpdateTone = (tone) => {
    setLeads(leads.map(lead =>
      selectedLeads.has(lead.id) ? { ...lead, emailTone: tone } : lead
    ));
  };

  const bulkRemove = () => {
    if (!confirm(`Weet je zeker dat je ${selectedLeads.size} leads wilt verwijderen?`)) return;
    setLeads(leads.filter(lead => !selectedLeads.has(lead.id)));
    setSelectedLeads(new Set());
  };

  // Shared function to parse leads from text/CSV
  // Supports both manual input AND the enricher CSV format
  const parseLeadsFromText = (text) => {
    // Normalize line endings
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedText.split('\n').filter(line => line.trim());

    if (lines.length === 0) return [];

    // Detect headers - check first line for known column names
    const firstLine = lines[0].toLowerCase();
    const hasHeaders = (firstLine.includes('email') || firstLine.includes('bedrijf') || firstLine.includes('website')) && !firstLine.includes('@');

    // Parse headers to detect column mapping
    let columnMap = { email: 0, business: 1, website: 2, contact: 3, knowledge: 4, tone: 5 };

    if (hasHeaders) {
      const headerParts = lines[0].split(/[,;\t]/).map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
      headerParts.forEach((header, index) => {
        if (header.includes('email')) columnMap.email = index;
        else if (header.includes('bedrijf') || header.includes('company') || header.includes('naam')) columnMap.business = index;
        else if (header.includes('website') || header.includes('url')) columnMap.website = index;
        else if (header.includes('contact') || header.includes('person')) columnMap.contact = index;
        else if (header.includes('knowledge') || header.includes('file') || header.includes('niche')) columnMap.knowledge = index;
        else if (header.includes('tone') || header.includes('stijl')) columnMap.tone = index;
      });
    }

    const startIndex = hasHeaders ? 1 : 0;
    const importedLeads = [];

    for (let i = startIndex; i < lines.length; i++) {
      // Split on comma, semicolon, or tab
      const parts = lines[i].split(/[,;\t]/).map(p => p.trim().replace(/^"|"$/g, ''));

      // Check if at least we have an email
      const emailValue = parts[columnMap.email];
      if (emailValue && emailValue.includes('@') && emailValue.includes('.')) {
        // Extract knowledge file to potentially set a default tone later
        const knowledgeFile = parts[columnMap.knowledge] || '';

        importedLeads.push({
          id: Date.now() + i,
          toEmail: emailValue,
          businessName: parts[columnMap.business] || "",
          websiteUrl: parts[columnMap.website] || "",
          contactPerson: parts[columnMap.contact] || "",
          knowledgeFile: knowledgeFile, // Store for reference
          emailTone: parts[columnMap.tone] || "professional"
        });
      }
    }
    return importedLeads;
  };

  // Import from CSV
  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const importedLeads = parseLeadsFromText(text);
      setLeads([...leads, ...importedLeads]);
      setShowTextInput(false);
      setPasteText('');
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  // Handle text paste submit
  const handleTextPaste = () => {
    if (!pasteText.trim()) return;

    const importedLeads = parseLeadsFromText(pasteText);

    if (importedLeads.length === 0) {
      alert('Geen geldige leads gevonden in de tekst. Zorg dat elke regel minimaal een email bevat.');
      return;
    }

    setLeads([...leads, ...importedLeads]);
    setPasteText('');
    setShowTextInput(false);
  };

  // Send all emails with real-time streaming progress
  const handleSendAll = async () => {
    const validLeads = leads.filter(l => l.toEmail && l.businessName && l.websiteUrl);

    if (validLeads.length === 0) {
      setError("Geen geldige leads om te versturen");
      return;
    }

    setSending(true);
    setError(null);
    setResults(null);
    setProgress({ current: 0, total: validLeads.length });

    // Initialize all lead statuses to waiting
    const initialStatuses = {};
    validLeads.forEach(lead => {
      initialStatuses[lead.id] = 'waiting';
    });
    setLeadStatuses(initialStatuses);

    try {
      const response = await fetch("/api/send-batch-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: validLeads,
          delayBetweenEmails: 5000, // 5 seconds between emails
          sessionPrompt: sessionPrompt.trim() // Extra AI instructies voor deze batch
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Batch verzenden mislukt");
      }

      // Handle Server-Sent Events
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResults = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        let currentEvent = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.substring(6));

              switch (currentEvent) {
                case 'processing':
                  // Update status for this lead
                  setLeadStatuses(prev => ({
                    ...prev,
                    [validLeads[data.index].id]: 'processing'
                  }));
                  setCurrentProcessingId(validLeads[data.index].id);
                  setProgress({ current: data.current, total: data.total });
                  break;

                case 'sent':
                  setLeadStatuses(prev => ({
                    ...prev,
                    [validLeads[data.index].id]: 'sent'
                  }));
                  setCurrentProcessingId(null);
                  break;

                case 'failed':
                  setLeadStatuses(prev => ({
                    ...prev,
                    [validLeads[data.index].id]: 'failed'
                  }));
                  setCurrentProcessingId(null);
                  break;

                case 'complete':
                  finalResults = data;
                  break;
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
            currentEvent = null;
          }
        }
      }

      if (finalResults) {
        setResults(finalResults);

        // Clear successfully sent leads
        const sentEmails = finalResults.details
          .filter(d => d.status === 'sent')
          .map(d => d.email);
        setLeads(prevLeads => prevLeads.filter(l => !sentEmails.includes(l.toEmail)));
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
      setCurrentProcessingId(null);
      setLeadStatuses({});
    }
  };

  return (
    <>
      <Head>
        <title>Batch Modus | SKYE Mail Agent</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </Head>

      <div className="app">
        <div className="bg-gradient"></div>
        <div className="bg-grid"></div>

        {/* Header */}
        <header className="header">
          <Link href="/" className="back-link">
            ← Terug
          </Link>
          <div className="logo">
            <span className="logo-icon">📦</span>
            <span className="logo-text">Batch Modus</span>
          </div>
          <div className="lead-count">
            {leads.length} leads
          </div>
        </header>

        <main className="main">
          <div className="container">
            {/* Actions Bar */}
            <div className="actions-bar">
              <button onClick={addLead} className="btn btn-secondary">
                ➕ Lead Toevoegen
              </button>

              <div className="input-toggle-inline">
                <button
                  className={`toggle-btn ${!showTextInput ? 'active' : ''}`}
                  onClick={() => setShowTextInput(false)}
                >
                  📄 CSV
                </button>
                <button
                  className={`toggle-btn ${showTextInput ? 'active' : ''}`}
                  onClick={() => setShowTextInput(true)}
                >
                  📋 Plakken
                </button>
              </div>

              {!showTextInput && (
                <label className="btn btn-secondary file-btn">
                  📂 Bestand Kiezen
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleCSVImport}
                    ref={fileInputRef}
                    hidden
                  />
                </label>
              )}

              <button
                onClick={() => setShowSessionPrompt(!showSessionPrompt)}
                className={`btn btn-secondary ${sessionPrompt.trim() ? 'has-content' : ''}`}
                disabled={sending}
              >
                🧠 {sessionPrompt.trim() ? 'AI Instructie ✓' : 'AI Instructie'}
              </button>

              <button
                onClick={handleSendAll}
                disabled={sending || leads.length === 0}
                className="btn btn-primary"
              >
                {sending ? `Versturen... (${progress.current}/${progress.total})` : '🚀 Alle Versturen'}
              </button>
            </div>

            {/* Session Prompt - Extra AI instructies voor deze batch */}
            {showSessionPrompt && (
              <div className="session-prompt-section">
                <div className="session-prompt-header">
                  <span className="session-prompt-icon">🧠</span>
                  <span className="session-prompt-title">Tijdelijke AI Instructie</span>
                  <span className="session-prompt-hint">(alleen voor deze batch)</span>
                </div>
                <textarea
                  value={sessionPrompt}
                  onChange={(e) => setSessionPrompt(e.target.value)}
                  placeholder="Geef extra context aan de AI voor deze batch...

Voorbeelden:
• Focus op onze nieuwe december korting (20% op alle diensten)
• Vermeld dat we binnenkort in Antwerpen openen
• Richt je op restaurants die nog geen online reserveersysteem hebben
• Leg nadruk op de snelle doorlooptijd (binnen 2 weken live)"
                  className="session-prompt-textarea"
                  rows={4}
                  disabled={sending}
                />
                {sessionPrompt.trim() && (
                  <div className="session-prompt-status">
                    ✅ Deze instructie wordt bij elke email meegestuurd
                  </div>
                )}
              </div>
            )}

            {/* Text Paste Area */}
            {showTextInput && (
              <div className="paste-section">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Plak hier je leads...&#10;&#10;Voorbeeld formaat:&#10;info@bedrijf.be, Bedrijf Naam, https://website.be, Jan&#10;contact@ander.be, Ander BV, https://ander.be"
                  className="paste-textarea"
                  rows={5}
                />
                <button
                  onClick={handleTextPaste}
                  className="btn btn-primary"
                  disabled={!pasteText.trim()}
                >
                  ✅ Leads Toevoegen
                </button>
              </div>
            )}

            {/* CSV Format Help */}
            <div className="csv-help">
              <strong>Formaat:</strong> email, bedrijfsnaam, website, contactpersoon (optioneel), tone (optioneel) — <em>Ondersteunt komma, puntkomma en tab als scheidingsteken</em>
            </div>

            {/* Bulk Actions Toolbar */}
            {leads.length > 0 && (
              <div className={`bulk-toolbar ${selectedLeads.size > 0 ? 'active' : ''}`}>
                <div className="bulk-selection">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={leads.length > 0 && selectedLeads.size === leads.length}
                      onChange={toggleAll}
                      className="checkbox"
                      disabled={sending}
                    />
                    <span className="checkbox-text">
                      {selectedLeads.size > 0 ? `${selectedLeads.size} geselecteerd` : 'Alles selecteren'}
                    </span>
                  </label>
                </div>

                {selectedLeads.size > 0 && !sending && (
                  <div className="bulk-actions-group">
                    <div className="bulk-action">
                      <span className="action-label">Zet stijl:</span>
                      <select
                        onChange={(e) => bulkUpdateTone(e.target.value)}
                        className="input select small"
                        value=""
                      >
                        <option value="" disabled>Kies...</option>
                        <option value="professional">💰 ROI Focus</option>
                        <option value="casual">🎯 Value Drop</option>
                        <option value="urgent">🔥 FOMO</option>
                        <option value="friendly">🤝 Warm Direct</option>
                        <option value="random">🎲 Willekeurig</option>
                      </select>
                    </div>
                    <button onClick={bulkRemove} className="btn-danger-text">
                      🗑️ Verwijderen
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Progress Bar - shown when sending */}
            {sending && progress.total > 0 && (
              <div className="progress-container">
                <div className="progress-header">
                  <span className="progress-title">📧 Emails versturen...</span>
                  <span className="progress-count">{progress.current} van {progress.total}</span>
                </div>
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
                <div className="progress-percentage">
                  {Math.round((progress.current / progress.total) * 100)}% voltooid
                </div>
              </div>
            )}

            {/* Pagination Controls */}
            {leads.length > 0 && (
              <div className="pagination-controls">
                <div className="pagination-info">
                  <span>Weergave: {startIndex + 1} - {Math.min(endIndex, leads.length)} van {leads.length} leads</span>
                </div>

                <div className="pagination-per-page">
                  <label>Toon per pagina:</label>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1); // Reset to first page
                    }}
                    className="input select small"
                    disabled={sending}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={250}>250</option>
                    <option value={500}>500</option>
                  </select>
                </div>

                {totalPages > 1 && (
                  <div className="pagination-nav">
                    <button
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1 || sending}
                      className="btn btn-page"
                    >
                      ««
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1 || sending}
                      className="btn btn-page"
                    >
                      «
                    </button>
                    <span className="page-indicator">
                      Pagina {currentPage} van {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages || sending}
                      className="btn btn-page"
                    >
                      »
                    </button>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages || sending}
                      className="btn btn-page"
                    >
                      »»
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Leads List */}
            <div className="leads-list">
              {leads.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">📭</span>
                  <p>Nog geen leads toegevoegd</p>
                  <p className="empty-hint">Klik op "Lead Toevoegen" of importeer een CSV</p>
                </div>
              ) : (
                paginatedLeads.map((lead, index) => {
                  const actualIndex = startIndex + index;
                  const status = leadStatuses[lead.id];
                  const isProcessing = status === 'processing';
                  const isSent = status === 'sent';
                  const isFailed = status === 'failed';
                  const isWaiting = status === 'waiting';

                  return (
                    <div
                      key={lead.id}
                      className={`lead-card ${selectedLeads.has(lead.id) ? 'selected' : ''} ${status ? `status-${status}` : ''}`}
                    >
                      {/* Status Indicator */}
                      {sending && status && (
                        <div className={`lead-status-badge ${status}`}>
                          {isWaiting && <span className="status-icon">⏳</span>}
                          {isProcessing && <span className="status-icon spinner">⚙️</span>}
                          {isSent && <span className="status-icon">✅</span>}
                          {isFailed && <span className="status-icon">❌</span>}
                        </div>
                      )}

                      <div className="lead-check">
                        <input
                          type="checkbox"
                          checked={selectedLeads.has(lead.id)}
                          onChange={() => toggleLead(lead.id)}
                          className="checkbox"
                          disabled={sending}
                        />
                      </div>
                      <div className={`lead-number ${status || ''}`}>{actualIndex + 1}</div>
                      <div className="lead-fields">
                        <input
                          type="email"
                          placeholder="email@bedrijf.be"
                          value={lead.toEmail}
                          onChange={(e) => updateLead(lead.id, 'toEmail', e.target.value)}
                          className="input"
                          disabled={sending}
                        />
                        <input
                          type="text"
                          placeholder="Bedrijfsnaam"
                          value={lead.businessName}
                          onChange={(e) => updateLead(lead.id, 'businessName', e.target.value)}
                          className="input"
                          disabled={sending}
                        />
                        <input
                          type="url"
                          placeholder="https://website.be"
                          value={lead.websiteUrl}
                          onChange={(e) => updateLead(lead.id, 'websiteUrl', e.target.value)}
                          className="input"
                          disabled={sending}
                        />
                        <input
                          type="text"
                          placeholder="Contactpersoon"
                          value={lead.contactPerson}
                          onChange={(e) => updateLead(lead.id, 'contactPerson', e.target.value)}
                          className="input small"
                          disabled={sending}
                        />
                        <select
                          value={lead.emailTone}
                          onChange={(e) => updateLead(lead.id, 'emailTone', e.target.value)}
                          className="input select"
                          disabled={sending}
                        >
                          <option value="professional">💰 ROI Focus</option>
                          <option value="casual">🎯 Value Drop</option>
                          <option value="urgent">🔥 FOMO</option>
                          <option value="friendly">🤝 Warm Direct</option>
                          <option value="random">🎲 Willekeurig</option>
                        </select>
                        {lead.knowledgeFile && (
                          <span className="knowledge-badge" title="Knowledge file voor deze niche">
                            📁 {lead.knowledgeFile}
                          </span>
                        )}
                      </div>
                      {!sending && (
                        <button
                          onClick={() => removeLead(lead.id)}
                          className="remove-btn"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="alert alert-error">
                <span>❌</span> {error}
              </div>
            )}

            {/* Results */}
            {results && (
              <div className="results-card">
                <h3>📊 Resultaten</h3>
                <div className="results-summary">
                  <div className="result-stat success">
                    <span className="stat-num">{results.sent}</span>
                    <span className="stat-label">Verstuurd</span>
                  </div>
                  <div className="result-stat error">
                    <span className="stat-num">{results.failed}</span>
                    <span className="stat-label">Mislukt</span>
                  </div>
                </div>
                <div className="results-details">
                  {results.details.map((d, i) => (
                    <div key={i} className={`result-item ${d.status}`}>
                      <span className="result-icon">{d.status === 'sent' ? '✅' : '❌'}</span>
                      <span className="result-business">{d.business}</span>
                      <span className="result-email">{d.email}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <style jsx>{`
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
          --font-sans: 'Inter', sans-serif;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .app {
          min-height: 100vh;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-family: var(--font-sans);
          position: relative;
        }

        .bg-gradient {
          position: fixed;
          inset: 0;
          background: 
            radial-gradient(ellipse 80% 50% at 50% -20%, rgba(0, 102, 204, 0.08), transparent),
            radial-gradient(ellipse 60% 40% at 100% 100%, rgba(0, 166, 126, 0.06), transparent);
          pointer-events: none;
        }

        .bg-grid {
          position: fixed;
          inset: 0;
          background-image: 
            linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px);
          background-size: 60px 60px;
          pointer-events: none;
        }

        .header {
          position: relative;
          z-index: 10;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid var(--border-color);
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(10px);
        }

        .back-link {
          color: var(--text-secondary);
          text-decoration: none;
          font-size: 14px;
          transition: color 0.2s;
        }

        .back-link:hover { color: var(--accent-primary); }

        .logo {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .logo-icon { font-size: 24px; }
        .logo-text { font-size: 18px; font-weight: 600; }

        .lead-count {
          font-size: 14px;
          color: var(--accent-primary);
          font-weight: 600;
        }

        .main {
          position: relative;
          z-index: 1;
          padding: 24px;
        }

        .container {
          max-width: 900px;
          margin: 0 auto;
        }

        .actions-bar {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
        }

        .btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .btn-primary {
          background: var(--accent-gradient);
          color: #ffffff;
        }

        .btn-secondary {
          background: #ffffff;
          color: var(--text-primary);
          border: 1px solid var(--border-color);
        }

        .btn-secondary:hover {
          background: #f8fafc;
          border-color: rgba(0, 0, 0, 0.2);
        }

        .file-btn { position: relative; }

        .csv-help {
          font-size: 12px;
          color: var(--text-secondary);
          margin-bottom: 24px;
          padding: 12px 16px;
          background: #ffffff;
          border: 1px solid var(--border-color);
          border-radius: 8px;
        }

        .input-toggle-inline {
          display: flex;
          gap: 2px;
          background: #f1f5f9;
          padding: 3px;
          border-radius: 8px;
        }

        .toggle-btn {
          padding: 8px 14px;
          border: none;
          background: transparent;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          color: #64748b;
          transition: all 0.2s;
        }

        .toggle-btn.active {
          background: white;
          color: var(--accent-primary);
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .paste-section {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
          align-items: flex-start;
        }

        .paste-textarea {
          flex: 1;
          padding: 12px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-family: var(--font-sans);
          font-size: 13px;
          resize: vertical;
          min-height: 100px;
          background: #ffffff;
        }

        .paste-textarea:focus {
          outline: none;
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.15);
        }

        /* Session Prompt Styles */
        .session-prompt-section {
          margin-bottom: 16px;
          background: linear-gradient(135deg, #f3e8ff 0%, #fae8ff 50%, #fdf4ff 100%);
          border: 1px solid #d8b4fe;
          border-radius: 12px;
          padding: 16px;
        }

        .session-prompt-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }

        .session-prompt-icon {
          font-size: 20px;
        }

        .session-prompt-title {
          font-size: 14px;
          font-weight: 600;
          color: #7c3aed;
        }

        .session-prompt-hint {
          font-size: 12px;
          color: #a855f7;
          font-style: italic;
        }

        .session-prompt-textarea {
          width: 100%;
          padding: 12px;
          border: 1px solid #d8b4fe;
          border-radius: 8px;
          font-family: var(--font-sans);
          font-size: 13px;
          resize: vertical;
          min-height: 80px;
          background: rgba(255, 255, 255, 0.8);
          color: #581c87;
        }

        .session-prompt-textarea:focus {
          outline: none;
          border-color: #a855f7;
          box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.2);
          background: #ffffff;
        }

        .session-prompt-textarea::placeholder {
          color: #a78bfa;
        }

        .session-prompt-status {
          margin-top: 10px;
          font-size: 12px;
          color: #16a34a;
          font-weight: 500;
        }

        .btn.has-content {
          background: linear-gradient(135deg, #f3e8ff, #fae8ff);
          border-color: #d8b4fe;
          color: #7c3aed;
        }

        .btn.has-content:hover {
          background: linear-gradient(135deg, #ede9fe, #f5d0fe);
        }

        /* Pagination Styles */
        .pagination-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
          padding: 16px 20px;
          background: #ffffff;
          border: 1px solid var(--border-color);
          border-radius: 12px;
          margin-bottom: 16px;
        }

        .pagination-info {
          font-size: 13px;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .pagination-per-page {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .pagination-per-page label {
          font-size: 13px;
          color: var(--text-secondary);
          white-space: nowrap;
        }

        .pagination-nav {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .btn-page {
          padding: 6px 12px;
          font-size: 13px;
          min-width: 36px;
          background: #f8fafc;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          font-weight: 600;
        }

        .btn-page:hover:not(:disabled) {
          background: #e2e8f0;
          border-color: rgba(0, 0, 0, 0.15);
        }

        .btn-page:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .page-indicator {
          font-size: 13px;
          color: var(--text-primary);
          font-weight: 500;
          padding: 0 12px;
          white-space: nowrap;
        }

        .leads-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: var(--text-muted);
        }

        .empty-icon { font-size: 48px; display: block; margin-bottom: 16px; }
        .empty-hint { font-size: 13px; margin-top: 8px; }

        .lead-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: #ffffff;
          border: 1px solid var(--border-color);
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
          transition: all 0.2s;
        }

        .lead-card.selected {
          border-color: var(--accent-primary);
          background: rgba(0, 102, 204, 0.02);
        }

        .lead-check {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .checkbox {
          width: 18px;
          height: 18px;
          accent-color: var(--accent-primary);
          cursor: pointer;
        }

        .bulk-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: #ffffff;
          border: 1px solid var(--border-color);
          border-radius: 12px;
          margin-bottom: 16px;
        }

        .bulk-toolbar.active {
          border-color: var(--accent-primary);
          background: rgba(0, 102, 204, 0.05);
        }

        .bulk-selection {
          display: flex;
          align-items: center;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .bulk-actions-group {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .bulk-action {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .action-label {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .btn-danger-text {
          background: none;
          border: none;
          color: #ef4444;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          padding: 6px 12px;
          border-radius: 6px;
        }

        .btn-danger-text:hover {
          background: rgba(239, 68, 68, 0.1);
        }

        .lead-number {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f1f5f9;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-muted);
        }

        .lead-fields {
          flex: 1;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .input {
          flex: 1;
          min-width: 150px;
          padding: 10px 12px;
          background: #ffffff;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 13px;
        }

        .input:focus {
          outline: none;
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.15);
        }

        .input.small { min-width: 120px; max-width: 150px; }
        .input.select { min-width: 140px; max-width: 160px; }

        .knowledge-badge {
          display: flex;
          align-items: center;
          padding: 6px 10px;
          background: #f0f9ff;
          border: 1px solid #bae6fd;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 500;
          color: #0284c7;
          white-space: nowrap;
        }

        .remove-btn {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(239, 68, 68, 0.1);
          border: none;
          border-radius: 8px;
          color: #ef4444;
          cursor: pointer;
          transition: background 0.2s;
        }

        .remove-btn:hover { background: rgba(239, 68, 68, 0.2); }

        .alert {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 20px;
          padding: 14px 18px;
          border-radius: 10px;
        }

        .alert-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #dc2626;
        }

        .results-card {
          margin-top: 24px;
          padding: 24px;
          background: #ffffff;
          border: 1px solid var(--border-color);
          border-radius: 16px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        }

        .results-card h3 {
          margin-bottom: 20px;
          font-size: 16px;
        }

        .results-summary {
          display: flex;
          gap: 20px;
          margin-bottom: 20px;
        }

        .result-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 16px 32px;
          border-radius: 12px;
        }

        .result-stat.success { background: rgba(34, 197, 94, 0.15); }
        .result-stat.error { background: rgba(239, 68, 68, 0.1); }

        .stat-num { font-size: 28px; font-weight: 700; }
        .result-stat.success .stat-num { color: #16a34a; }
        .result-stat.error .stat-num { color: #dc2626; }

        .stat-label { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

        .results-details {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .result-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          background: #f8fafc;
          border-radius: 8px;
          font-size: 13px;
        }

        .result-business { font-weight: 500; flex: 1; }
        .result-email { color: var(--text-muted); }

        /* Progress Bar Styles */
        .progress-container {
          margin-bottom: 20px;
          padding: 20px;
          background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
          border: 1px solid #7dd3fc;
          border-radius: 12px;
        }

        .progress-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .progress-title {
          font-weight: 600;
          font-size: 14px;
          color: #0369a1;
        }

        .progress-count {
          font-size: 13px;
          color: #0284c7;
          font-weight: 500;
        }

        .progress-bar-track {
          height: 12px;
          background: rgba(255, 255, 255, 0.8);
          border-radius: 6px;
          overflow: hidden;
          box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .progress-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #0ea5e9, #06b6d4, #22c55e);
          border-radius: 6px;
          transition: width 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .progress-bar-fill::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
          animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        .progress-percentage {
          text-align: center;
          margin-top: 8px;
          font-size: 12px;
          color: #0369a1;
          font-weight: 500;
        }

        /* Lead Status Styles */
        .lead-card.status-processing {
          border-color: #0ea5e9;
          background: rgba(14, 165, 233, 0.05);
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.15);
        }

        .lead-card.status-sent {
          border-color: #22c55e;
          background: rgba(34, 197, 94, 0.05);
        }

        .lead-card.status-failed {
          border-color: #ef4444;
          background: rgba(239, 68, 68, 0.05);
        }

        .lead-card.status-waiting {
          opacity: 0.7;
        }

        .lead-status-badge {
          position: absolute;
          top: -8px;
          right: -8px;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          font-size: 16px;
          z-index: 10;
          background: #ffffff;
          border: 2px solid;
        }

        .lead-status-badge.waiting {
          border-color: #94a3b8;
        }

        .lead-status-badge.processing {
          border-color: #0ea5e9;
          background: #f0f9ff;
        }

        .lead-status-badge.sent {
          border-color: #22c55e;
          background: #f0fdf4;
        }

        .lead-status-badge.failed {
          border-color: #ef4444;
          background: #fef2f2;
        }

        .lead-card {
          position: relative;
        }

        .status-icon.spinner {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .lead-number.processing {
          background: #0ea5e9;
          color: white;
        }

        .lead-number.sent {
          background: #22c55e;
          color: white;
        }

        .lead-number.failed {
          background: #ef4444;
          color: white;
        }

        .input:disabled {
          background: #f8fafc;
          cursor: not-allowed;
          opacity: 0.7;
        }

        @media (max-width: 768px) {
          .actions-bar { flex-wrap: wrap; }
          .lead-fields { flex-direction: column; }
          .input { min-width: 100% !important; max-width: 100% !important; }
        }
      `}</style>

      <style jsx global>{`
        html, body { margin: 0; padding: 0; background: #f8fafc; }
      `}</style>
    </>
  );
}
