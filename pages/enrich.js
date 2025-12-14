
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { createCampaign, getSmtpAccounts, getActiveSmtpAccounts } from "../utils/campaignStore";

const ENRICHER_RESULTS_KEY = 'skyeEnricherResults';
const ENRICHER_UPLOADS_KEY = 'skyeEnricherUploads';
const ENRICHER_PROCESSING_KEY = 'skyeEnricherProcessing';

export default function EnrichPage() {
    const router = useRouter();
    const [emails, setEmails] = useState([]);
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [results, setResults] = useState([]);
    const fileInputRef = useRef(null);
    const [showTextInput, setShowTextInput] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [inputMode, setInputMode] = useState('email'); // 'email' of 'domain'

    // Upload geschiedenis
    const [uploadHistory, setUploadHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);

    // Campagne modal & god mode
    const [showCampaignModal, setShowCampaignModal] = useState(false);
    const [campaignName, setCampaignName] = useState('');
    const [useGodMode, setUseGodMode] = useState(false);
    const [smtpAccounts, setSmtpAccounts] = useState([]);
    const [selectedSmtpIds, setSelectedSmtpIds] = useState([]);
    const [defaultTone, setDefaultTone] = useState('professional');

    // Achtergrond processing
    const [isBackgroundProcessing, setIsBackgroundProcessing] = useState(false);
    const processingAbortRef = useRef(false);

    // Load saved results on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(ENRICHER_RESULTS_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                setResults(parsed.results || []);
                setEmails(parsed.emails || []);
            }

            // Load upload history
            const historyData = localStorage.getItem(ENRICHER_UPLOADS_KEY);
            if (historyData) {
                setUploadHistory(JSON.parse(historyData) || []);
            }

            // Check for background processing state
            const processingState = localStorage.getItem(ENRICHER_PROCESSING_KEY);
            if (processingState) {
                const state = JSON.parse(processingState);
                if (state.isProcessing && state.emails?.length > 0) {
                    setIsBackgroundProcessing(true);
                    setEmails(state.emails);
                    setProgress(state.progress || { current: 0, total: state.emails.length });
                    // Resume processing
                    resumeBackgroundProcessing(state);
                }
            }
        } catch (e) {
            console.error('Error loading enricher data:', e);
        }
    }, []);

    // Load SMTP accounts
    useEffect(() => {
        setSmtpAccounts(getSmtpAccounts());
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

    // Save upload to history
    const saveUploadToHistory = (items, mode) => {
        const upload = {
            id: `upload-${Date.now()}`,
            timestamp: new Date().toISOString(),
            mode: mode,
            count: items.length,
            status: 'pending'
        };
        const newHistory = [upload, ...uploadHistory].slice(0, 20); // Keep last 20
        setUploadHistory(newHistory);
        localStorage.setItem(ENRICHER_UPLOADS_KEY, JSON.stringify(newHistory));
        return upload.id;
    };

    // Update upload history status
    const updateUploadStatus = (uploadId, status, successCount = 0) => {
        setUploadHistory(prev => {
            const updated = prev.map(u =>
                u.id === uploadId ? { ...u, status, successCount, completedAt: new Date().toISOString() } : u
            );
            localStorage.setItem(ENRICHER_UPLOADS_KEY, JSON.stringify(updated));
            return updated;
        });
    };

    // Clear saved results
    const clearResults = () => {
        if (confirm('Weet je zeker dat je alle resultaten wilt wissen?')) {
            setEmails([]);
            setResults([]);
            localStorage.removeItem(ENRICHER_RESULTS_KEY);
            localStorage.removeItem(ENRICHER_PROCESSING_KEY);
        }
    };

    // Clear upload history
    const clearHistory = () => {
        if (confirm('Weet je zeker dat je de upload geschiedenis wilt wissen?')) {
            setUploadHistory([]);
            localStorage.removeItem(ENRICHER_UPLOADS_KEY);
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

    // Resume background processing (called on page load if there was unfinished work)
    const resumeBackgroundProcessing = async (state) => {
        setProcessing(true);
        processingAbortRef.current = false;

        const startIndex = state.progress?.current || 0;
        const emailsToProcess = state.emails;
        const total = emailsToProcess.length;

        const newResults = [...(state.results || [])];

        for (let i = startIndex; i < total; i++) {
            if (processingAbortRef.current) break;

            const item = emailsToProcess[i];
            if (item.status === 'success' || item.status === 'failed') continue; // Skip already processed

            setEmails(prev => prev.map((e, idx) => idx === i ? { ...e, status: 'processing' } : e));

            const result = await processLead(item);
            newResults.push(result);

            const updatedEmails = emailsToProcess.map((e, idx) => idx === i ? {
                ...e,
                status: result.success ? 'success' : (result.status === 'no_email_found' ? 'no_email' : 'failed'),
                email: result.email || e.email,
                data: result.data || null,
                websiteUrl: result.websiteUrl,
                message: result.message
            } : e);

            setEmails(updatedEmails);
            setProgress({ current: i + 1, total });

            // Save state for background persistence
            localStorage.setItem(ENRICHER_PROCESSING_KEY, JSON.stringify({
                isProcessing: true,
                emails: updatedEmails,
                results: newResults,
                progress: { current: i + 1, total },
                uploadId: state.uploadId
            }));
        }

        setResults(newResults);
        setProcessing(false);
        setIsBackgroundProcessing(false);
        localStorage.removeItem(ENRICHER_PROCESSING_KEY);

        // Update upload history
        if (state.uploadId) {
            const successCount = newResults.filter(r => r.success).length;
            updateUploadStatus(state.uploadId, 'completed', successCount);
        }
    };

    // Start Bulk Processing with background support
    const handleProcessAll = async () => {
        setProcessing(true);
        processingAbortRef.current = false;
        const total = emails.length;
        setProgress({ current: 0, total });

        // Save upload to history
        const uploadId = saveUploadToHistory(emails, inputMode);

        const newResults = [];

        // Process one by one (to avoid rate limits and nice UI updates)
        for (let i = 0; i < total; i++) {
            if (processingAbortRef.current) break;

            const item = emails[i];

            // Update status in UI immediately
            setEmails(prev => prev.map((e, idx) => idx === i ? { ...e, status: 'processing' } : e));

            // Pass hele item (bevat email OF domain)
            const result = await processLead(item);
            newResults.push(result);

            // Update status with result - track ook gevonden email bij domain mode
            const updatedEmails = emails.map((e, idx) => idx === i ? {
                ...e,
                status: result.success ? 'success' : (result.status === 'no_email_found' ? 'no_email' : 'failed'),
                email: result.email || e.email, // Update met gevonden email
                data: result.data || null,
                websiteUrl: result.websiteUrl,
                message: result.message
            } : e);

            setEmails(updatedEmails);
            setProgress({ current: i + 1, total });

            // Save state for background persistence (can resume if page is left)
            localStorage.setItem(ENRICHER_PROCESSING_KEY, JSON.stringify({
                isProcessing: true,
                emails: updatedEmails,
                results: newResults,
                progress: { current: i + 1, total },
                uploadId
            }));
        }

        setResults(newResults);
        setProcessing(false);
        localStorage.removeItem(ENRICHER_PROCESSING_KEY);

        // Update upload history status
        const successCount = newResults.filter(r => r.success).length;
        updateUploadStatus(uploadId, processingAbortRef.current ? 'paused' : 'completed', successCount);
    };

    // Stop processing (pause)
    const handleStopProcessing = () => {
        processingAbortRef.current = true;
    };

    // Start campaign from enriched results
    const handleStartCampaign = () => {
        const successfulLeads = emails.filter(e => e.status === 'success' && e.email && e.data);

        if (successfulLeads.length === 0) {
            alert('Geen verrijkte leads beschikbaar. Voer eerst een verrijking uit.');
            return;
        }

        const activeSmtps = getActiveSmtpAccounts();
        if (activeSmtps.length === 0) {
            alert('Geen actieve SMTP accounts. Ga naar Settings om er een toe te voegen.');
            return;
        }

        // Create campaign
        const campaign = createCampaign({
            name: campaignName || `Enricher Campagne ${new Date().toLocaleDateString('nl-NL')}`,
            smtpMode: 'rotate',
            smtpAccountIds: selectedSmtpIds.length > 0 ? selectedSmtpIds : activeSmtps.map(s => s.id),
            emailTone: defaultTone,
            emails: successfulLeads.map(lead => ({
                email: lead.email,
                businessName: lead.data?.companyName || '',
                websiteUrl: lead.websiteUrl || '',
                contactPerson: lead.data?.contactPerson || '',
                knowledgeFile: lead.data?.knowledgeFile || ''
            }))
        });

        setShowCampaignModal(false);

        if (useGodMode) {
            // Redirect to batch page with godmode trigger
            router.push(`/batch?campaign=${campaign.id}&godmode=true`);
        } else {
            // Redirect to campaign dashboard
            router.push(`/campaigns?id=${campaign.id}`);
        }
    };

    // CSV Export Helper en handlers (ongewijzigd, alleen logica)
    const downloadCSV = (data, filename) => {
        // ... (existing helper logic)
        const headers = ['Email', 'Bedrijfsnaam', 'Website', 'Contactpersoon', 'Tone'];
        const csvContent = [headers.join(','), ...data.map(item => {
            const d = item.data || {};
            return [`"${item.email || ''}"`, `"${d.companyName || ''}"`, `"${item.websiteUrl || ''}"`, `"${d.contactPerson || ''}"`, `""`].join(',');
        })].join('\n');

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

    const exportAll = () => downloadCSV(results, 'alle_leads_verrijkt.csv');
    const exportSuccess = () => downloadCSV(results.filter(r => r.success), 'leads_met_email.csv');
    const exportFailed = () => downloadCSV(results.filter(r => !r.success && r.status !== 'no_email_found'), 'leads_zonder_website.csv');
    const exportNoEmail = () => downloadCSV(results.filter(r => r.status === 'no_email_found'), 'leads_geen_email.csv');

    const getResultsByKnowledgeFile = () => {
        const grouped = {};
        results.filter(r => r.success).forEach(item => {
            const kf = item.data?.knowledgeFile || 'overig.md';
            if (!grouped[kf]) grouped[kf] = [];
            grouped[kf].push(item);
        });
        return grouped;
    };

    const exportByKnowledgeFile = (knowledgeFile) => {
        const filtered = results.filter(r => r.success && (r.data?.knowledgeFile || 'overig.md') === knowledgeFile);
        const safeName = knowledgeFile.replace('.md', '').replace(/[^a-z0-9]/gi, '_');
        downloadCSV(filtered, `leads_${safeName}.csv`);
    };

    const copyByKnowledgeFile = async (knowledgeFile) => {
        const filtered = results.filter(r => r.success && (r.data?.knowledgeFile || 'overig.md') === knowledgeFile);
        const textContent = filtered.map(item => {
            const d = item.data || {};
            return [item.email || '', d.companyName || '', item.websiteUrl || '', d.contactPerson || '', ''].join(',');
        }).join('\n');
        try {
            await navigator.clipboard.writeText(textContent);
            alert(`✅ ${filtered.length} leads gekopieerd naar klembord!`);
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
        noEmailFound: results.filter(r => r.status === 'no_email_found').length
    };

    return (
        <Layout title="Lead Verrijker | SKYE Mail Agent">
            <div className="page-container">
                <div className="page-header">
                    <h1 className="page-title"><span className="text-gradient">Lead</span> Verrijker</h1>
                    <p className="page-subtitle">Verrijk email lijsten of zoek emails op basis van domeinnamen.</p>
                </div>

                <div className="glass-card mb-8">
                    <div className="flex flex-col md:flex-row gap-8">
                        {/* Left: Input Selection */}
                        <div className="flex-1">
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <span className="badge badge-info">1</span> Input Type
                            </h3>

                            <div className="flex gap-4 mb-4">
                                <button
                                    className={`premium-button flex-1 ${inputMode !== 'email' ? 'secondary' : ''}`}
                                    onClick={() => { setInputMode('email'); setEmails([]); setResults([]); }}
                                >
                                    📧 Emails
                                </button>
                                <button
                                    className={`premium-button flex-1 ${inputMode !== 'domain' ? 'secondary' : ''}`}
                                    onClick={() => { setInputMode('domain'); setEmails([]); setResults([]); }}
                                >
                                    🌐 Domeinen
                                </button>
                            </div>

                            <div className="input-toggle-inline glass-bg-dark rounded-lg p-1 flex mb-4">
                                <button
                                    className={`toggle-btn w-1/2 text-center py-2 rounded ${!showTextInput ? 'bg-white/10 font-bold' : 'text-muted'}`}
                                    onClick={() => setShowTextInput(false)}
                                >
                                    📂 Bestand
                                </button>
                                <button
                                    className={`toggle-btn w-1/2 text-center py-2 rounded ${showTextInput ? 'bg-white/10 font-bold' : 'text-muted'}`}
                                    onClick={() => setShowTextInput(true)}
                                >
                                    📋 Plakken
                                </button>
                            </div>

                            {!showTextInput ? (
                                <label className="premium-button secondary cursor-pointer w-full justify-center py-8 border-dashed">
                                    <div className="flex flex-col items-center gap-2">
                                        <span className="text-2xl">📂</span>
                                        <span>Klik om {inputMode === 'domain' ? 'domein' : 'email'} bestand te kiezen</span>
                                        <span className="text-xs text-muted">(.csv of .txt)</span>
                                    </div>
                                    <input type="file" accept=".csv,.txt" onChange={handleCSVImport} ref={fileInputRef} hidden />
                                </label>
                            ) : (
                                <div className="space-y-4">
                                    <textarea
                                        value={pasteText}
                                        onChange={(e) => setPasteText(e.target.value)}
                                        placeholder={inputMode === 'domain'
                                            ? "Plak hier je domeinen...\n\nVoorbeeld:\nbedrijf1.be\nbedrijf2.nl"
                                            : "Plak hier je emails...\n\nVoorbeeld:\ninfo@bedrijf1.be\ncontact@bedrijf2.be"}
                                        className="premium-input"
                                        rows={6}
                                    />
                                    <button
                                        onClick={handleTextPaste}
                                        className="premium-button w-full"
                                        disabled={!pasteText.trim()}
                                    >
                                        ✅ {inputMode === 'domain' ? 'Domeinen' : 'Emails'} Verwerken
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Middle: Action */}
                        <div className="flex-1 border-l border-glass pl-8">
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <span className="badge badge-info">2</span> Verrijken
                            </h3>

                            <div className="text-center py-6">
                                {emails.length === 0 ? (
                                    <div className="opacity-50">
                                        <div className="text-4xl mb-2">📥</div>
                                        <p>Wacht op input...</p>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="text-2xl font-bold mb-2">{emails.length}</div>
                                        <div className="text-sm text-secondary mb-6">{inputMode === 'domain' ? 'domeinen' : 'emails'} klaar voor verrijking</div>

                                        {!processing ? (
                                            <button
                                                onClick={handleProcessAll}
                                                className="premium-button w-full text-lg py-4"
                                            >
                                                🚀 Start Scrapen
                                            </button>
                                        ) : (
                                            <div className="space-y-4">
                                                <div className="flex justify-between text-sm">
                                                    <span>Bezig met verwerken...</span>
                                                    <span>{progress.current}/{progress.total}</span>
                                                </div>
                                                <div className="h-3 bg-secondary rounded-full overflow-hidden">
                                                    <div className="h-full bg-accent transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                                                </div>
                                                <button onClick={handleStopProcessing} className="premium-button secondary w-full border-warning text-warning">
                                                    ⏸️ Pauzeren
                                                </button>
                                            </div>
                                        )}

                                        {stats.success > 0 && !processing && (
                                            <button
                                                onClick={() => setShowCampaignModal(true)}
                                                className="premium-button w-full mt-4 bg-gradient-to-r from-purple-600 to-blue-600"
                                            >
                                                🔥 Start Campagne ({stats.success})
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right: Export */}
                        <div className="flex-1 border-l border-glass pl-8">
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <span className="badge badge-info">3</span> Resultaat
                            </h3>

                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3 mb-6">
                                    <div className="p-2 bg-white/5 rounded text-center">
                                        <div className="text-xl font-bold text-success">{stats.success}</div>
                                        <div className="text-xs text-secondary">Succes</div>
                                    </div>
                                    <div className="p-2 bg-white/5 rounded text-center">
                                        <div className="text-xl font-bold text-error">{stats.noWebsite + stats.deadDomains + stats.noEmailFound}</div>
                                        <div className="text-xs text-secondary">Mislukt</div>
                                    </div>
                                </div>

                                <button onClick={exportSuccess} disabled={stats.success === 0} className="premium-button secondary w-full justify-between text-success border-success/30">
                                    <span>✅ {inputMode === 'domain' ? 'Met Email' : 'Met Website'}</span>
                                    <span>({stats.success})</span>
                                </button>

                                <button onClick={exportFailed} disabled={stats.noWebsite === 0} className="premium-button secondary w-full justify-between text-error border-error/30">
                                    <span>❌ Onbereikbaar</span>
                                    <span>({stats.noWebsite})</span>
                                </button>

                                <button onClick={exportAll} disabled={results.length === 0} className="premium-button secondary w-full justify-between">
                                    <span>📥 Alles CSV</span>
                                    <span>({results.length})</span>
                                </button>

                                <button onClick={clearResults} disabled={emails.length === 0} className="premium-button secondary w-full text-muted hover:text-error text-sm">
                                    🗑️ Alles Wissen
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Niche Exports */}
                {knowledgeFiles.length > 0 && (
                    <div className="glass-card mb-8">
                        <h3 className="text-lg font-bold mb-4">📁 Exporteren per Niche</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {knowledgeFiles.map(kf => (
                                <div key={kf} className="p-4 rounded-lg bg-white/5 border border-glass flex justify-between items-center group hover:bg-white/10 transition-colors">
                                    <div className="overflow-hidden">
                                        <div className="font-bold truncate" title={kf}>{kf.replace('.md', '')}</div>
                                        <div className="text-xs text-secondary">{groupedResults[kf].length} leads</div>
                                    </div>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => copyByKnowledgeFile(kf)} className="p-2 text-muted hover:text-white" title="Kopieer">📋</button>
                                        <button onClick={() => exportByKnowledgeFile(kf)} className="p-2 text-muted hover:text-accent" title="Download">💾</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Results Grid - Using CSS Grid for masonry-like feel */}
                {emails.length > 0 && (
                    <>
                        <div className="flex justify-between items-center mb-4">
                            <div className="text-sm text-secondary">
                                Pagina {currentPage} van {totalPages}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="premium-button secondary py-1 px-3 text-xs"
                                >
                                    « Vorige
                                </button>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="premium-button secondary py-1 px-3 text-xs"
                                >
                                    Volgende »
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {paginatedEmails.map((item, index) => {
                                const actualIndex = startIndex + index;
                                return (
                                    <div key={actualIndex} className={`glass-card p-4 flex flex-col h-full relative overflow-hidden ${item.status === 'success' ? 'border-success/30' : item.status === 'failed' ? 'border-error/30' : ''}`}>
                                        <div className="flex justify-between items-start mb-3">
                                            <span className="badge secondary text-xs font-mono">{actualIndex + 1}</span>
                                            {item.status === 'processing' && <span className="spinner text-accent">⚙️</span>}
                                            {item.status === 'success' && <span className="text-lg">✅</span>}
                                            {item.status === 'failed' && <span className="text-lg">❌</span>}
                                            {item.status === 'no_email' && <span className="text-lg">⚠️</span>}
                                        </div>

                                        <div className="flex-1 space-y-2 mb-3">
                                            <div>
                                                <div className="text-xs text-secondary uppercase">Email / Input</div>
                                                <div className="font-bold truncate" title={item.email || item.domain}>{item.email || item.domain}</div>
                                            </div>

                                            {item.data?.companyName && (
                                                <div>
                                                    <div className="text-xs text-secondary uppercase">Bedrijf</div>
                                                    <div>{item.data.companyName}</div>
                                                </div>
                                            )}

                                            {item.data?.knowledgeFile && (
                                                <div>
                                                    <div className="text-xs text-secondary uppercase">Niche</div>
                                                    <div className="text-accent text-sm">{item.data.knowledgeFile.replace('.md', '')}</div>
                                                </div>
                                            )}

                                            {item.message && item.status !== 'success' && (
                                                <div className="p-2 rounded bg-white/5 text-xs text-secondary mt-2">
                                                    {item.message}
                                                </div>
                                            )}
                                        </div>

                                        {item.websiteUrl && (
                                            <a href={item.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline flex items-center gap-1 mt-auto">
                                                🔗 {item.websiteUrl}
                                            </a>
                                        )}

                                        {/* Status Bar */}
                                        <div className={`absolute bottom-0 left-0 h-1 w-full ${item.status === 'success' ? 'bg-success' : item.status === 'failed' ? 'bg-error' : item.status === 'processing' ? 'bg-accent' : 'bg-transparent'}`} />
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            <style jsx>{`
               .input-toggle-inline { display: flex; }
            `}</style>
        </Layout>
    );
}
