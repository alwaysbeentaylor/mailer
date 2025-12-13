import { useState, useRef, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import Navigation from "../components/Navigation";

const ENRICHER_RESULTS_KEY = 'skyeEnricherResults';

export default function EnrichPage() {
    const [emails, setEmails] = useState([]);
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [results, setResults] = useState([]);
    const fileInputRef = useRef(null);
    const [showTextInput, setShowTextInput] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [inputMode, setInputMode] = useState('email'); // 'email' of 'domain'

    // Load saved results on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(ENRICHER_RESULTS_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                setResults(parsed.results || []);
                setEmails(parsed.emails || []);
            }
        } catch (e) {
            console.error('Error loading enricher results:', e);
        }
    }, []);

    // Save results when they change
    useEffect(() => {
        if (results.length > 0 || emails.length > 0) {
            try {
                localStorage.setItem(ENRICHER_RESULTS_KEY, JSON.stringify({
                    results,
                    emails,
                    savedAt: new Date().toISOString()
                }));
            } catch (e) {
                console.error('Error saving enricher results:', e);
            }
        }
    }, [results, emails]);

    // Clear saved results
    const clearResults = () => {
        if (confirm('Weet je zeker dat je alle resultaten wilt wissen?')) {
            setEmails([]);
            setResults([]);
            localStorage.removeItem(ENRICHER_RESULTS_KEY);
        }
    };

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);

    // Calculate pagination
    const totalPages = Math.ceil(emails.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedEmails = emails.slice(startIndex, endIndex);

    // Extract emails from text (shared logic)
    const extractEmailsFromText = (text) => {
        // Normalize line endings (Windows \r\n, Mac \r, Linux \n)
        const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = normalizedText.split('\n').map(l => l.trim()).filter(l => l);

        const extractedEmails = [];

        lines.forEach((line, index) => {
            // Skip header als het 'email' bevat
            if (index === 0 && line.toLowerCase().includes('email') && !line.includes('@')) return;

            // Split op komma, puntkomma, of tab
            const parts = line.split(/[;,\t]/);
            const emailPart = parts.find(p => p.includes('@') && p.includes('.'));

            if (emailPart) {
                extractedEmails.push(emailPart.trim().replace(/^"|"$/g, ''));
            }
        });

        // Filter duplicaten
        return [...new Set(extractedEmails)];
    };

    // 🆕 Extract domains from text
    const extractDomainsFromText = (text) => {
        const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = normalizedText.split('\n').map(l => l.trim()).filter(l => l);

        const extractedDomains = [];

        lines.forEach((line, index) => {
            // Skip headers
            if (index === 0 && (line.toLowerCase().includes('domain') || line.toLowerCase().includes('website') || line.toLowerCase().includes('url'))) return;

            // Split op komma, puntkomma, of tab
            const parts = line.split(/[;,\t]/);

            for (const part of parts) {
                let cleaned = part.trim()
                    .replace(/^"|"$/g, '')
                    .replace(/^https?:\/\//, '')
                    .replace(/^www\./, '')
                    .replace(/\/.*$/, '')
                    .toLowerCase();

                // Check of het een geldige domeinnaam is (bevat . en geen @)
                if (cleaned && cleaned.includes('.') && !cleaned.includes('@') && cleaned.length > 3) {
                    // Filter generieke extensies
                    const extensions = ['.com', '.nl', '.be', '.eu', '.net', '.org', '.io', '.co', '.info', '.biz', '.de', '.fr'];
                    const hasValidExtension = extensions.some(ext => cleaned.endsWith(ext));

                    if (hasValidExtension) {
                        extractedDomains.push(cleaned);
                        break; // Neem eerste geldige domein per regel
                    }
                }
            }
        });

        return [...new Set(extractedDomains)];
    };

    // Import CSV - nu met mode awareness
    const handleCSVImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target.result;

            if (inputMode === 'domain') {
                const uniqueDomains = extractDomainsFromText(text);
                setEmails(uniqueDomains.map(d => ({ domain: d, status: 'pending' })));
            } else {
                const uniqueEmails = extractEmailsFromText(text);
                setEmails(uniqueEmails.map(e => ({ email: e, status: 'pending' })));
            }

            setResults([]);
            setShowTextInput(false);
            setPasteText('');

            if (fileInputRef.current) fileInputRef.current.value = "";
        };
        reader.readAsText(file);
    };

    // Handle text paste submit - nu met mode awareness
    const handleTextPaste = () => {
        if (!pasteText.trim()) return;

        if (inputMode === 'domain') {
            const uniqueDomains = extractDomainsFromText(pasteText);

            if (uniqueDomains.length === 0) {
                alert('Geen geldige domeinen gevonden in de tekst.\n\nVoorbeeld input:\nexamplebedrijf.be\nanderbedrijf.nl');
                return;
            }

            setEmails(uniqueDomains.map(d => ({ domain: d, status: 'pending' })));
        } else {
            const uniqueEmails = extractEmailsFromText(pasteText);

            if (uniqueEmails.length === 0) {
                alert('Geen geldige email adressen gevonden in de tekst');
                return;
            }

            setEmails(uniqueEmails.map(e => ({ email: e, status: 'pending' })));
        }

        setResults([]);
        setPasteText('');
        setShowTextInput(false);
    };

    // Process Single Lead - supports both email and domain
    const processLead = async (item) => {
        try {
            const body = item.email
                ? { email: item.email }
                : { domain: item.domain };

            const res = await fetch('/api/enrich-lead', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            return await res.json();
        } catch (error) {
            return { success: false, status: 'error', email: item.email, domain: item.domain, message: error.message };
        }
    };

    // Start Bulk Processing
    const handleProcessAll = async () => {
        setProcessing(true);
        const total = emails.length;
        setProgress({ current: 0, total });

        const newResults = [];

        // Process one by one (to avoid rate limits and nice UI updates)
        for (let i = 0; i < total; i++) {
            const item = emails[i];

            // Update status in UI immediately
            setEmails(prev => prev.map((e, idx) => idx === i ? { ...e, status: 'processing' } : e));

            // Pass hele item (bevat email OF domain)
            const result = await processLead(item);
            newResults.push(result);

            // Update status with result - track ook gevonden email bij domain mode
            setEmails(prev => prev.map((e, idx) => idx === i ? {
                ...e,
                status: result.success ? 'success' : (result.status === 'no_email_found' ? 'no_email' : 'failed'),
                email: result.email || e.email, // Update met gevonden email
                data: result.data || null,
                websiteUrl: result.websiteUrl,
                message: result.message
            } : e));

            setProgress({ current: i + 1, total });
        }

        setResults(newResults);
        setProcessing(false);
    };

    // CSV Export Helper
    const downloadCSV = (data, filename) => {
        // Definieer kolommen - output voor batch import
        const headers = [
            'Email',
            'Bedrijfsnaam',
            'Website',
            'Contactpersoon',
            'Tone'
        ];

        const csvContent = [
            headers.join(','),
            ...data.map(item => {
                const d = item.data || {};
                return [
                    `"${item.email || ''}"`,
                    `"${d.companyName || ''}"`,
                    `"${item.websiteUrl || ''}"`,
                    `"${d.contactPerson || ''}"`,
                    `""` // Tone leeg laten zodat gebruiker zelf kan kiezen
                ].join(',');
            })
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    // Export handlers
    const exportAll = () => downloadCSV(results, 'alle_leads_verrijkt.csv');
    const exportSuccess = () => downloadCSV(results.filter(r => r.success), 'leads_met_email.csv');
    const exportFailed = () => downloadCSV(results.filter(r => !r.success && r.status !== 'no_email_found'), 'leads_zonder_website.csv');
    const exportNoEmail = () => downloadCSV(results.filter(r => r.status === 'no_email_found'), 'leads_geen_email.csv');

    // Group results by knowledge file
    const getResultsByKnowledgeFile = () => {
        const grouped = {};
        results.filter(r => r.success).forEach(item => {
            const kf = item.data?.knowledgeFile || 'overig.md';
            if (!grouped[kf]) grouped[kf] = [];
            grouped[kf].push(item);
        });
        return grouped;
    };

    // Export specific knowledge file
    const exportByKnowledgeFile = (knowledgeFile) => {
        const filtered = results.filter(r => r.success && (r.data?.knowledgeFile || 'overig.md') === knowledgeFile);
        const safeName = knowledgeFile.replace('.md', '').replace(/[^a-z0-9]/gi, '_');
        downloadCSV(filtered, `leads_${safeName}.csv`);
    };

    // Copy to clipboard for specific knowledge file (for batch paste)
    const copyByKnowledgeFile = async (knowledgeFile) => {
        const filtered = results.filter(r => r.success && (r.data?.knowledgeFile || 'overig.md') === knowledgeFile);

        // Format: email,bedrijfsnaam,website,contactpersoon,tone
        const textContent = filtered.map(item => {
            const d = item.data || {};
            return [
                item.email || '',
                d.companyName || '',
                item.websiteUrl || '',
                d.contactPerson || '',
                '' // Tone leeg
            ].join(',');
        }).join('\n');

        try {
            await navigator.clipboard.writeText(textContent);
            alert(`✅ ${filtered.length} leads gekopieerd naar klembord!\n\nPlak direct in Batch Modus.`);
        } catch (err) {
            console.error('Clipboard error:', err);
            alert('❌ Kopiëren mislukt. Probeer opnieuw.');
        }
    };

    const groupedResults = getResultsByKnowledgeFile();
    const knowledgeFiles = Object.keys(groupedResults).sort();

    const stats = {
        total: emails.length,
        processed: results.length,
        success: results.filter(r => r.success).length,
        noWebsite: results.filter(r => r.status === 'website_unreachable' || r.status === 'no_website_generic').length,
        deadDomains: results.filter(r => r.status === 'domain_dead').length,
        noEmailFound: results.filter(r => r.status === 'no_email_found').length // 🆕 Domeinen zonder gevonden email
    };

    return (
        <>
            <Head>
                <title>Lead Verrijker | SKYE Mail Agent</title>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
            </Head>

            <div className="app">
                <div className="bg-gradient"></div>

                <Navigation />
                <div className="page-header">
                    <div className="logo">
                        <span className="logo-icon">🕵️</span>
                        <span className="logo-text">Lead Verrijker</span>
                    </div>
                </div>

                <main className="main">
                    <div className="container">

                        {/* Control Panel */}
                        <div className="card control-panel">
                            <div className="upload-section">
                                <h3>1. Input Type</h3>

                                {/* 🆕 INPUT MODE TOGGLE */}
                                <div className="mode-toggle">
                                    <button
                                        className={`mode-btn ${inputMode === 'email' ? 'active' : ''}`}
                                        onClick={() => { setInputMode('email'); setEmails([]); setResults([]); }}
                                    >
                                        📧 Emails
                                    </button>
                                    <button
                                        className={`mode-btn ${inputMode === 'domain' ? 'active' : ''}`}
                                        onClick={() => { setInputMode('domain'); setEmails([]); setResults([]); }}
                                    >
                                        🌐 Domeinen
                                    </button>
                                </div>

                                <p className="mode-hint">
                                    {inputMode === 'domain'
                                        ? '💡 Bij domeinen zoeken we automatisch emails op de website'
                                        : 'Upload emails om bedrijfsinfo te verrijken'}
                                </p>

                                <div className="input-toggle">
                                    <button
                                        className={`toggle-btn ${!showTextInput ? 'active' : ''}`}
                                        onClick={() => setShowTextInput(false)}
                                    >
                                        📂 Bestand
                                    </button>
                                    <button
                                        className={`toggle-btn ${showTextInput ? 'active' : ''}`}
                                        onClick={() => setShowTextInput(true)}
                                    >
                                        📋 Tekst Plakken
                                    </button>
                                </div>

                                {!showTextInput ? (
                                    <label className="btn btn-secondary file-btn full-width">
                                        📂 Selecteer {inputMode === 'domain' ? 'domein' : 'email'} bestand
                                        <input type="file" accept=".csv,.txt" onChange={handleCSVImport} ref={fileInputRef} hidden />
                                    </label>
                                ) : (
                                    <div className="text-paste-area">
                                        <textarea
                                            value={pasteText}
                                            onChange={(e) => setPasteText(e.target.value)}
                                            placeholder={inputMode === 'domain'
                                                ? "Plak hier je domeinen...\n\nVoorbeeld:\nbedrijf1.be\nbedrijf2.nl\nhttps://www.bedrijf3.com"
                                                : "Plak hier je emails...\n\nVoorbeeld:\ninfo@bedrijf1.be\ncontact@bedrijf2.be\n\nOf CSV formaat:\nemail;naam;website"}
                                            className="paste-textarea"
                                            rows={6}
                                        />
                                        <button
                                            onClick={handleTextPaste}
                                            className="btn btn-primary full-width"
                                            disabled={!pasteText.trim()}
                                        >
                                            ✅ {inputMode === 'domain' ? 'Domeinen' : 'Emails'} Verwerken
                                        </button>
                                    </div>
                                )}

                                {emails.length > 0 && (
                                    <div className="stats-preview">
                                        ✅ {emails.length} {inputMode === 'domain' ? 'domeinen' : 'emails'} gevonden
                                    </div>
                                )}
                            </div>

                            <div className="action-section">
                                <h3>2. Start Verrijking</h3>
                                <button
                                    onClick={handleProcessAll}
                                    disabled={processing || emails.length === 0}
                                    className="btn btn-primary full-width"
                                >
                                    {processing ? `Bezig... ${progress.current}/${progress.total}` : '🚀 Start Scrapen'}
                                </button>
                            </div>

                            <div className="export-section">
                                <h3>3. Download Resultaat</h3>
                                <div className="btn-group">
                                    <button onClick={exportSuccess} disabled={stats.success === 0} className="btn btn-success">
                                        ✅ {inputMode === 'domain' ? 'Met Email' : 'Met Website'} ({stats.success})
                                    </button>
                                    {inputMode === 'domain' && stats.noEmailFound > 0 && (
                                        <button onClick={exportNoEmail} className="btn btn-warning">
                                            ⚠️ Geen Email Gevonden ({stats.noEmailFound})
                                        </button>
                                    )}
                                    <button onClick={exportFailed} disabled={stats.noWebsite === 0} className="btn btn-error">
                                        ❌ Website Onbereikbaar ({stats.noWebsite})
                                    </button>
                                    <button onClick={exportAll} disabled={results.length === 0} className="btn btn-outline">
                                        📥 Download Alles
                                    </button>
                                    <button onClick={clearResults} disabled={emails.length === 0} className="btn btn-danger">
                                        🗑️ Wissen
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Per Knowledge File Export */}
                        {knowledgeFiles.length > 0 && (
                            <div className="card niche-exports">
                                <h3>📁 Per Niche Exporteren</h3>
                                <p className="niche-hint">Kopieer of download leads gegroepeerd per branche</p>
                                <div className="niche-grid">
                                    {knowledgeFiles.map(kf => (
                                        <div key={kf} className="niche-card">
                                            <div className="niche-header">
                                                <span className="niche-name">{kf.replace('.md', '')}</span>
                                                <span className="niche-count">{groupedResults[kf].length} leads</span>
                                            </div>
                                            <div className="niche-actions">
                                                <button
                                                    onClick={() => copyByKnowledgeFile(kf)}
                                                    className="btn btn-copy"
                                                    title="Kopieer voor Batch Modus"
                                                >
                                                    📋 Kopieer
                                                </button>
                                                <button
                                                    onClick={() => exportByKnowledgeFile(kf)}
                                                    className="btn btn-download"
                                                    title="Download als CSV"
                                                >
                                                    💾 CSV
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Pagination Controls */}
                        {emails.length > 0 && (
                            <div className="pagination-controls">
                                <div className="pagination-info">
                                    <span>Weergave: {startIndex + 1} - {Math.min(endIndex, emails.length)} van {emails.length} {inputMode === 'domain' ? 'domeinen' : 'emails'}</span>
                                </div>

                                <div className="pagination-per-page">
                                    <label>Toon per pagina:</label>
                                    <select
                                        value={itemsPerPage}
                                        onChange={(e) => {
                                            setItemsPerPage(Number(e.target.value));
                                            setCurrentPage(1);
                                        }}
                                        className="input-select"
                                        disabled={processing}
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
                                            disabled={currentPage === 1 || processing}
                                            className="btn-page"
                                        >
                                            ««
                                        </button>
                                        <button
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1 || processing}
                                            className="btn-page"
                                        >
                                            «
                                        </button>
                                        <span className="page-indicator">
                                            Pagina {currentPage} van {totalPages}
                                        </span>
                                        <button
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            disabled={currentPage === totalPages || processing}
                                            className="btn-page"
                                        >
                                            »
                                        </button>
                                        <button
                                            onClick={() => setCurrentPage(totalPages)}
                                            disabled={currentPage === totalPages || processing}
                                            className="btn-page"
                                        >
                                            »»
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Results Grid */}
                        <div className="results-container">
                            {paginatedEmails.map((item, index) => {
                                const actualIndex = startIndex + index;
                                return (
                                    <div key={actualIndex} className={`lead-item ${item.status}`}>
                                        <div className="lead-index">{actualIndex + 1}</div>
                                        <div className="lead-status-icon">
                                            {item.status === 'pending' && '⏳'}
                                            {item.status === 'processing' && '🔄'}
                                            {item.status === 'success' && '✅'}
                                            {item.status === 'no_email' && '⚠️'}
                                            {item.status === 'failed' && '❌'}
                                        </div>
                                        <div className="lead-info">
                                            {/* Toon domein of email afhankelijk van mode */}
                                            <div className="lead-email">
                                                {item.domain && !item.email && <span className="domain-tag">🌐 </span>}
                                                {item.email || item.domain}
                                            </div>

                                            {/* Als we in domain mode een email gevonden hebben, toon die */}
                                            {item.domain && item.email && (
                                                <div className="found-email">📧 {item.email}</div>
                                            )}

                                            {item.data && (
                                                <div className="lead-meta">
                                                    <a href={item.websiteUrl} target="_blank" rel="noopener noreferrer" className="lead-link">{item.data.companyName}</a>
                                                    {item.data.contactPerson && <span className="lead-city">👤 {item.data.contactPerson}</span>}
                                                    {item.data.allEmails && item.data.allEmails.length > 1 && (
                                                        <span className="lead-emails-count">+{item.data.allEmails.length - 1} meer emails</span>
                                                    )}
                                                </div>
                                            )}
                                            {item.message && <div className="lead-error">{item.message}</div>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                    </div>
                </main>
            </div>

            <style jsx>{`
        :root {
          --bg-primary: #f8fafc;
          --text-primary: #1e293b;
          --accent: #3b82f6;
          --success: #22c55e;
          --error: #ef4444;
        }

        .app {
          min-height: 100vh;
          background: var(--bg-primary);
          font-family: 'Inter', sans-serif;
          color: var(--text-primary);
        }

        .page-header {
          padding: 20px 24px;
          background: white;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .logo { font-size: 1.25rem; font-weight: 700; display: flex; gap: 8px; }

        .container {
          max-width: 800px;
          margin: 40px auto;
          padding: 0 20px;
        }

        .card {
          background: white;
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          margin-bottom: 30px;
        }

        .control-panel {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 24px;
        }

        h3 { font-size: 0.9rem; text-transform: uppercase; color: #64748b; margin-bottom: 12px; }
        p { font-size: 0.9rem; color: #94a3b8; margin-bottom: 16px; }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 16px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          gap: 8px;
          font-size: 0.9rem;
          transition: all 0.2s;
        }

        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .full-width { width: 100%; }

        .btn-primary { background: var(--accent); color: white; }
        .btn-secondary { background: white; border: 1px solid #cbd5e1; color: #475569; }
        .btn-success { background: var(--success); color: white; }
        .btn-error { background: 'white'; border: 1px solid var(--error); color: var(--error); }
        .btn-outline { background: white; border: 1px solid #cbd5e1; color: #475569; }
        .btn-danger { background: var(--error); color: white; }

        .btn-group { display: flex; flex-direction: column; gap: 8px; }

        /* Pagination Styles */
        .pagination-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
          padding: 16px 20px;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          margin-bottom: 16px;
        }

        .pagination-info {
          font-size: 13px;
          color: #64748b;
          font-weight: 500;
        }

        .pagination-per-page {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .pagination-per-page label {
          font-size: 13px;
          color: #64748b;
          white-space: nowrap;
        }

        .input-select {
          padding: 6px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 13px;
          background: white;
          cursor: pointer;
        }

        .input-select:focus {
          outline: none;
          border-color: var(--accent);
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
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-page:hover:not(:disabled) {
          background: #e2e8f0;
          border-color: #cbd5e1;
        }

        .btn-page:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .page-indicator {
          font-size: 13px;
          color: #1e293b;
          font-weight: 500;
          padding: 0 12px;
          white-space: nowrap;
        }

        .lead-index {
          font-size: 12px;
          color: #94a3b8;
          min-width: 28px;
          text-align: center;
          font-weight: 500;
        }

        .results-container {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .lead-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 12px 16px;
          background: white;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }

        .lead-item.success { border-left: 4px solid var(--success); }
        .lead-item.failed { border-left: 4px solid var(--error); }
        .lead-item.processing { border-left: 4px solid var(--accent); opacity: 0.8; }
        .lead-item.no_email { border-left: 4px solid #f59e0b; background: #fffbeb; }

        .lead-status-icon { font-size: 1.2rem; }
        
        .lead-info { flex: 1; }
        .lead-email { font-weight: 500; }
        
        .lead-meta { margin-top: 4px; display: flex; gap: 12px; font-size: 0.85rem; align-items: center; flex-wrap: wrap; }
        .lead-link { color: var(--accent); text-decoration: none; font-weight: 600; }
        .lead-badge { background: #f1f5f9; padding: 2px 8px; border-radius: 4px; color: #475569; }
        .lead-city { color: #64748b; }
        
        .lead-error { font-size: 0.8em; color: var(--error); margin-top: 2px; }
        
        /* 🆕 Domain mode styles */
        .found-email { font-size: 0.85rem; color: var(--success); font-weight: 500; margin-top: 2px; }
        .domain-tag { opacity: 0.7; }
        .lead-emails-count { 
          font-size: 0.75rem; 
          background: #dbeafe; 
          color: #1d4ed8; 
          padding: 2px 6px; 
          border-radius: 4px; 
        }
        
        .mode-toggle {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
        }
        
        .mode-btn {
          flex: 1;
          padding: 12px 16px;
          border: 2px solid #e2e8f0;
          background: white;
          border-radius: 10px;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          color: #64748b;
        }
        
        .mode-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
        }
        
        .mode-btn.active {
          border-color: var(--accent);
          background: #eff6ff;
          color: var(--accent);
        }
        
        .mode-hint {
          font-size: 0.8rem !important;
          color: #64748b !important;
          padding: 8px;
          background: #f8fafc;
          border-radius: 6px;
          margin-bottom: 12px !important;
        }
        
        .btn-warning {
          background: #fef3c7;
          border: 1px solid #f59e0b;
          color: #b45309;
        }
        
        .btn-warning:hover {
          background: #fde68a;
        }

        .input-toggle {
          display: flex;
          gap: 4px;
          margin-bottom: 12px;
          background: #f1f5f9;
          padding: 4px;
          border-radius: 8px;
        }

        .toggle-btn {
          flex: 1;
          padding: 8px 12px;
          border: none;
          background: transparent;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          color: #64748b;
          transition: all 0.2s;
        }

        .toggle-btn.active {
          background: white;
          color: var(--accent);
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .text-paste-area {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .paste-textarea {
          width: 100%;
          padding: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-family: 'Inter', sans-serif;
          font-size: 0.9rem;
          resize: vertical;
          min-height: 120px;
        }

        .paste-textarea:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }

        .stats-preview {
          margin-top: 12px;
          padding: 8px 12px;
          background: rgba(34, 197, 94, 0.1);
          border-radius: 6px;
          color: var(--success);
          font-weight: 500;
          font-size: 0.9rem;
        }

        .niche-exports {
          margin-bottom: 24px;
        }

        .niche-exports h3 {
          font-size: 1rem;
          margin-bottom: 4px;
        }

        .niche-hint {
          font-size: 0.85rem;
          color: #64748b;
          margin-bottom: 16px;
        }

        .niche-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 12px;
        }

        .niche-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 14px;
          transition: all 0.2s;
        }

        .niche-card:hover {
          border-color: var(--accent);
          background: #f0f9ff;
        }

        .niche-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .niche-name {
          font-weight: 600;
          font-size: 0.9rem;
          color: #1e293b;
        }

        .niche-count {
          font-size: 0.75rem;
          background: var(--accent);
          color: white;
          padding: 2px 8px;
          border-radius: 10px;
          font-weight: 600;
        }

        .niche-actions {
          display: flex;
          gap: 8px;
        }

        .btn-copy, .btn-download {
          flex: 1;
          padding: 8px 10px;
          font-size: 0.8rem;
          border-radius: 6px;
          border: 1px solid #cbd5e1;
          background: white;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
        }

        .btn-copy:hover {
          background: #dbeafe;
          border-color: #3b82f6;
          color: #1d4ed8;
        }

        .btn-download:hover {
          background: #dcfce7;
          border-color: #22c55e;
          color: #16a34a;
        }

        @media (max-width: 768px) {
          .control-panel { grid-template-columns: 1fr; }
          .niche-grid { grid-template-columns: 1fr; }
        }
      `}</style>
        </>
    );
}
