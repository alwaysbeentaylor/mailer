import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from '../components/Layout';

import { createCampaign, getActiveSmtpAccounts, getSmtpAccounts, saveSmtpAccounts } from "../utils/campaignStore";
import { getWarmupSummary } from "../utils/warmupStore";

export default function BatchPage() {
  const router = useRouter();
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

  // Campaign mode
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [smtpAccounts, setSmtpAccounts] = useState([]);
  const [selectedSmtpIds, setSelectedSmtpIds] = useState([]);
  const [smtpMode, setSmtpMode] = useState('single'); // single or rotate
  const [defaultTone, setDefaultTone] = useState('professional');
  const [verifyDomains, setVerifyDomains] = useState(true); // Verify domains before sending

  // 🔥 GODMODE
  const [sendMode, setSendMode] = useState('normal'); // normal, turbo, godmode
  const [godmodeStats, setGodmodeStats] = useState(null);
  const [godmodeConfirm, setGodmodeConfirm] = useState(false);
  const [godmodeLogs, setGodmodeLogs] = useState([]); // Live activity logs

  // Load SMTP accounts on mount
  useEffect(() => {
    async function loadSmtp() {
      try {
        const res = await fetch('/api/smtp-accounts');
        const data = await res.json();
        if (data.success) {
          setSmtpAccounts(data.accounts || []);
          if (data.accounts) {
            saveSmtpAccounts(data.accounts);
          }
        }
      } catch (e) {
        console.error('Failed to load SMTP accounts:', e);
        setSmtpAccounts(getSmtpAccounts());
      }
    }
    loadSmtp();
  }, []);

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

  // Start campaign mode - creates persistent campaign and redirects to dashboard
  const handleStartCampaign = () => {
    const validLeads = leads.filter(l => l.toEmail && l.businessName && l.websiteUrl);

    if (validLeads.length === 0) {
      setError("Geen geldige leads om te versturen");
      return;
    }

    if (selectedSmtpIds.length === 0) {
      setError("Selecteer minimaal één SMTP account");
      return;
    }

    // Create campaign
    const campaign = createCampaign({
      name: campaignName || `Campagne ${new Date().toLocaleDateString('nl-NL')} ${new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`,
      smtpMode,
      smtpAccountIds: selectedSmtpIds,
      emailTone: defaultTone,
      sessionPrompt: sessionPrompt.trim(),
      delayBetweenEmails: 5000,
      verifyDomains, // Domain verification toggle
      emails: validLeads.map(lead => ({
        email: lead.toEmail,
        businessName: lead.businessName,
        websiteUrl: lead.websiteUrl,
        contactPerson: lead.contactPerson || '',
        knowledgeFile: lead.knowledgeFile || ''
      }))
    });

    // Redirect to campaign dashboard
    setShowCampaignModal(false);
    router.push(`/campaigns?id=${campaign.id}`);
  };

  // 🔥 GODMODE - Maximum speed sending
  const handleGodmode = async () => {
    const validLeads = leads.filter(l => l.toEmail && l.businessName && l.websiteUrl);

    if (validLeads.length === 0) {
      setError("Geen geldige leads om te versturen");
      return;
    }

    const activeSmtps = smtpAccounts.filter(a => a.active !== false);
    if (activeSmtps.length === 0) {
      setError("Geen actieve SMTP accounts. Ga naar Settings.");
      return;
    }

    if (!godmodeConfirm) {
      // Show confirmation
      setGodmodeStats({
        emails: validLeads.length,
        smtps: activeSmtps.length,
        estimatedTime: Math.ceil(validLeads.length / (activeSmtps.length * 10) * 0.5) + ' seconden'
      });
      setGodmodeConfirm(true);
      return;
    }

    // Execute GODMODE
    setSending(true);
    setError(null);
    setResults(null);
    setGodmodeConfirm(false);
    setProgress({ current: 0, total: validLeads.length });
    setGodmodeLogs([]); // Clear previous logs

    // Log helper
    const addLog = (type, message, details = null) => {
      const timestamp = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setGodmodeLogs(prev => [...prev, { timestamp, type, message, details }]);
    };

    addLog('system', '🔥🔥🔥 GODMODE GEACTIVEERD');
    addLog('info', `📧 ${validLeads.length} emails te versturen`);
    addLog('info', `📡 ${activeSmtps.length} SMTP accounts actief`);

    // Initialize all lead statuses
    const initialStatuses = {};
    validLeads.forEach(lead => {
      initialStatuses[lead.id] = 'waiting';
    });
    setLeadStatuses(initialStatuses);

    try {
      // Distribute emails across SMTPs
      const batches = activeSmtps.map(smtp => ({
        smtp,
        emails: []
      }));

      validLeads.forEach((lead, index) => {
        const batchIndex = index % batches.length;
        batches[batchIndex].emails.push(lead);
      });

      // Shared counter object (mutable reference for parallel access)
      const counter = { sent: 0, failed: 0, processed: 0 };
      const details = [];

      // Update progress function
      const updateProgress = () => {
        setProgress({ current: counter.processed, total: validLeads.length });
      };

      // Process all batches in parallel
      const batchPromises = batches.filter(b => b.emails.length > 0).map(async (batch, batchIdx) => {
        const chunkSize = 5; // 5 emails at once per SMTP for better progress updates

        addLog('smtp', `🔌 Verbinden met ${batch.smtp.user}...`, batch.smtp.host);

        for (let i = 0; i < batch.emails.length; i += chunkSize) {
          const chunk = batch.emails.slice(i, i + chunkSize);

          const chunkResults = await Promise.allSettled(
            chunk.map(async (lead) => {
              // Mark as processing
              setLeadStatuses(prev => ({ ...prev, [lead.id]: 'processing' }));
              addLog('send', `📤 Versturen naar ${lead.toEmail}...`, batch.smtp.user);

              try {
                const res = await fetch('/api/send-email', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    toEmail: lead.toEmail,
                    businessName: lead.businessName,
                    websiteUrl: lead.websiteUrl,
                    contactPerson: lead.contactPerson,
                    emailTone: lead.emailTone,
                    smtpAccountId: batch.smtp.id,
                    sessionPrompt: sessionPrompt
                  })
                });

                const data = await res.json();

                if (data.success) {
                  setLeadStatuses(prev => ({ ...prev, [lead.id]: 'sent' }));
                  addLog('success', `✅ Verstuurd: ${lead.toEmail}`, lead.businessName);
                  return { success: true, lead };
                } else {
                  setLeadStatuses(prev => ({ ...prev, [lead.id]: 'failed' }));
                  addLog('error', `❌ Mislukt: ${lead.toEmail}`, data.error?.message || 'Onbekende fout');
                  return { success: false, lead, error: data.error?.message || 'Failed' };
                }
              } catch (err) {
                setLeadStatuses(prev => ({ ...prev, [lead.id]: 'failed' }));
                addLog('error', `❌ Error: ${lead.toEmail}`, err.message);
                return { success: false, lead, error: err.message };
              }
            })
          );

          // Update progress after each chunk
          chunkResults.forEach((result) => {
            counter.processed++;
            if (result.status === 'fulfilled') {
              if (result.value.success) {
                counter.sent++;
                details.push({
                  email: result.value.lead.toEmail,
                  business: result.value.lead.businessName,
                  status: 'sent'
                });
              } else {
                counter.failed++;
                details.push({
                  email: result.value.lead.toEmail,
                  business: result.value.lead.businessName,
                  status: 'failed'
                });
              }
            } else {
              counter.failed++;
            }
          });

          // Update progress bar after each chunk completes
          updateProgress();
        }
      });

      await Promise.all(batchPromises);

      addLog('system', `🏁 GODMODE VOLTOOID`);
      addLog('success', `✅ Verstuurd: ${counter.sent}`);
      if (counter.failed > 0) {
        addLog('error', `❌ Mislukt: ${counter.failed}`);
      }

      setResults({
        sent: counter.sent,
        failed: counter.failed,
        details
      });

      // Clear successfully sent leads
      const sentEmails = details.filter(d => d.status === 'sent').map(d => d.email);
      setLeads(prevLeads => prevLeads.filter(l => !sentEmails.includes(l.toEmail)));

    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
      setCurrentProcessingId(null);
      setLeadStatuses({});
      setGodmodeStats(null);
    }
  };

  return (
    <Layout title="Batch Modus | SKYE Mail Agent">
      <div className="page-container">
        {/* Page Header */}
        <div className="page-header flex justify-between items-center">
          <div>
            <h1 className="page-title">
              <span className="text-gradient">Batch</span> Modus
            </h1>
            <p className="page-subtitle">
              Verstuur gepersonaliseerde emails naar een lijst van leads.
            </p>
          </div>
          <div className="badge badge-info">
            {leads.length} leads
          </div>
        </div>

        {/* Actions Bar */}
        <div className="glass-card mb-4 actions-bar">
          <div className="flex gap-4 items-center flex-wrap">
            <button onClick={addLead} className="premium-button">
              ➕ Lead Toevoegen
            </button>

            <div className="input-toggle-inline glass-bg-dark rounded-lg p-1 flex">
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
              <label className="premium-button secondary cursor-pointer">
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

            <div className="flex-grow"></div>

            <button
              onClick={() => setShowSessionPrompt(!showSessionPrompt)}
              className={`premium-button secondary ${sessionPrompt.trim() ? 'border-accent' : ''}`}
              disabled={sending}
            >
              🧠 {sessionPrompt.trim() ? 'AI Instructie ✓' : 'AI Instructie'}
            </button>

            <button
              onClick={handleSendAll}
              disabled={sending || leads.length === 0}
              className="premium-button"
            >
              {sending && sendMode === 'normal' ? `Versturen... (${progress.current}/${progress.total})` : '📧 Normaal'}
            </button>

            <button
              onClick={() => setShowCampaignModal(true)}
              disabled={sending || leads.length === 0}
              className="premium-button"
            >
              🚀 Campagne
            </button>

            <button
              onClick={handleGodmode}
              disabled={sending || leads.length === 0 || smtpAccounts.filter(a => a.active !== false).length === 0}
              className="premium-button godmode-btn"
            >
              {sending && sendMode === 'godmode' ? `🔥 ${progress.current}/${progress.total}` : '🔥 GODMODE'}
            </button>
          </div>
        </div>

        {/* GODMODE Confirmation Dialog */}
        {godmodeConfirm && godmodeStats && (
          <div className="alert alert-error flex-col items-center text-center godmode-confirm">
            <div className="text-4xl mb-2">🔥🔥🔥</div>
            <h3 className="text-xl font-bold text-red-500 mb-2">GODMODE ACTIVEREN?</h3>
            <p className="text-secondary mb-4">
              Dit gaat <strong>{godmodeStats.emails}</strong> emails versturen via <strong>{godmodeStats.smtps}</strong> SMTP accounts
              in ~<strong>{godmodeStats.estimatedTime}</strong>
            </p>
            <div className="flex gap-8 mb-4">
              <span className="badge badge-error">⚡ 10+ parallel</span>
              <span className="badge badge-error">🚫 Geen limits</span>
              <span className="badge badge-error">💨 0 vertraging</span>
            </div>
            <p className="text-xs text-error mb-4">
              ⚠️ WAARSCHUWING: Dit kan je SMTP reputatie beschadigen bij overmatig gebruik!
            </p>
            <div className="flex gap-4">
              <button onClick={() => setGodmodeConfirm(false)} className="premium-button secondary">
                Annuleren
              </button>
              <button onClick={handleGodmode} className="premium-button godmode-confirm-btn">
                🔥 VUUR LOS!
              </button>
            </div>
          </div>
        )}

        {/* Session Prompt */}
        {showSessionPrompt && (
          <div className="glass-card mb-4 border-accent">
            <div className="flex items-center gap-2 mb-2 text-accent">
              <span>🧠</span>
              <span className="font-bold">Tijdelijke AI Instructie</span>
              <span className="text-xs opacity-70">(alleen voor deze batch)</span>
            </div>
            <textarea
              value={sessionPrompt}
              onChange={(e) => setSessionPrompt(e.target.value)}
              placeholder="Geef extra context aan de AI voor deze batch... (bijv. focus op korting, nieuwe locatie, etc.)"
              className="premium-input"
              rows={3}
              disabled={sending}
            />
          </div>
        )}

        {/* Text Paste Area */}
        {showTextInput && (
          <div className="glass-card mb-4">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Plak hier je leads...&#10;&#10;Voorbeeld formaat:&#10;info@bedrijf.be, Bedrijf Naam, https://website.be, Jan"
              className="premium-input mb-4"
              rows={5}
            />
            <button
              onClick={handleTextPaste}
              className="premium-button"
              disabled={!pasteText.trim()}
            >
              ✅ Leads Toevoegen
            </button>
          </div>
        )}

        {/* CSV Format Help */}
        <div className="text-xs text-muted mb-6 px-4">
          <strong>Formaat:</strong> email, bedrijfsnaam, website, contactpersoon (optioneel), tone (optioneel)
        </div>

        {/* Bulk Actions Toolbar */}
        {leads.length > 0 && selectedLeads.size > 0 && !sending && (
          <div className="glass-card p-3 mb-4 flex items-center justify-between sticky top-4 z-10 glass-bg-dark">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={leads.length > 0 && selectedLeads.size === leads.length}
                  onChange={toggleAll}
                  className="checkbox"
                />
                <span className="text-sm font-bold text-highlight">
                  {selectedLeads.size} geselecteerd
                </span>
              </label>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-secondary">Zet stijl:</span>
                <select
                  onChange={(e) => bulkUpdateTone(e.target.value)}
                  className="premium-input py-1 px-2 text-sm w-auto"
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
              <button onClick={bulkRemove} className="text-error text-sm font-bold hover:underline">
                🗑️ Verwijderen
              </button>
            </div>
          </div>
        )}

        {/* Progress Bar */}
        {sending && progress.total > 0 && (
          <div className="glass-card mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="font-bold">📧 Emails versturen...</span>
              <span>{Math.round((progress.current / progress.total) * 100)}%</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Live Log Panel - GODMODE */}
        {godmodeLogs.length > 0 && (
          <div className="glass-card p-0 overflow-hidden mb-6 font-mono text-xs bg-[#0d1117]">
            <div className="p-3 border-b border-glass flex justify-between items-center bg-secondary/50">
              <span className="font-bold text-orange-400">🔥 GODMODE Live Log</span>
              {!sending && (
                <button
                  className="text-muted hover:text-white"
                  onClick={() => setGodmodeLogs([])}
                >
                  Wissen
                </button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto p-4 space-y-1">
              {godmodeLogs.map((log, i) => (
                <div key={i} className={`flex gap-3 ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : 'text-gray-400'}`}>
                  <span className="opacity-50 min-w-[60px]">{log.timestamp}</span>
                  <span className="flex-1">{log.message}</span>
                  {log.details && <span className="text-xs opacity-50">{log.details}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leads List */}
        <div className="space-y-4">
          {leads.length > 0 && (
            <div className="flex justify-between items-center mb-2 px-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-muted">
                <input
                  type="checkbox"
                  checked={leads.length > 0 && selectedLeads.size === leads.length}
                  onChange={toggleAll}
                  className="checkbox"
                  disabled={sending}
                />
                Alles selecteren
              </label>

              {/* Pagination Controls */}
              <div className="flex items-center gap-2">
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="premium-input py-1 px-2 text-xs w-auto"
                  disabled={sending}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                  <option value={500}>500</option>
                </select>

                {totalPages > 1 && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1 || sending}
                      className="premium-button secondary py-1 px-2 text-xs"
                    >
                      «
                    </button>
                    <span className="text-xs px-2 py-1 text-secondary">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages || sending}
                      className="premium-button secondary py-1 px-2 text-xs"
                    >
                      »
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {leads.length === 0 ? (
            <div className="glass-card text-center py-12">
              <div className="text-4xl mb-4">📭</div>
              <p className="text-secondary mb-2">Nog geen leads toegevoegd</p>
              <button onClick={addLead} className="text-accent hover:underline text-sm">
                Klik om een lead toe te voegen
              </button>
            </div>
          ) : (
            paginatedLeads.map((lead, index) => {
              const actualIndex = startIndex + index;
              const status = leadStatuses[lead.id];

              return (
                <div
                  key={lead.id}
                  className={`glass-card p-4 transition-all ${selectedLeads.has(lead.id) ? 'border-accent bg-accent/5' : ''} ${status === 'processed' ? 'opacity-50' : ''}`}
                >
                  <div className="flex gap-4 items-center flex-wrap md:flex-nowrap">
                    <div className="flex items-center gap-3 min-w-[40px]">
                      <input
                        type="checkbox"
                        checked={selectedLeads.has(lead.id)}
                        onChange={() => toggleLead(lead.id)}
                        className="checkbox"
                        disabled={sending}
                      />
                      <span className="text-xs text-muted font-mono">{actualIndex + 1}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-grow">
                      <input
                        type="email"
                        placeholder="email@bedrijf.be"
                        value={lead.toEmail}
                        onChange={(e) => updateLead(lead.id, 'toEmail', e.target.value)}
                        className="premium-input py-2 text-sm"
                        disabled={sending}
                      />
                      <input
                        type="text"
                        placeholder="Bedrijfsnaam"
                        value={lead.businessName}
                        onChange={(e) => updateLead(lead.id, 'businessName', e.target.value)}
                        className="premium-input py-2 text-sm"
                        disabled={sending}
                      />
                      <input
                        type="url"
                        placeholder="website.be"
                        value={lead.websiteUrl}
                        onChange={(e) => updateLead(lead.id, 'websiteUrl', e.target.value)}
                        className="premium-input py-2 text-sm"
                        disabled={sending}
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Naam (opt)"
                          value={lead.contactPerson}
                          onChange={(e) => updateLead(lead.id, 'contactPerson', e.target.value)}
                          className="premium-input py-2 text-sm flex-1"
                          disabled={sending}
                        />
                        <select
                          value={lead.emailTone}
                          onChange={(e) => updateLead(lead.id, 'emailTone', e.target.value)}
                          className="premium-input py-2 text-sm w-24"
                          disabled={sending}
                        >
                          <option value="professional">💰</option>
                          <option value="casual">🎯</option>
                          <option value="urgent">🔥</option>
                          <option value="friendly">🤝</option>
                          <option value="random">🎲</option>
                        </select>
                      </div>
                    </div>

                    {/* Status/Actions */}
                    <div className="w-[40px] flex justify-center">
                      {sending && status ? (
                        <div title={status}>
                          {status === 'waiting' && <span className="text-lg">⏳</span>}
                          {status === 'processing' && <div className="spinner text-accent">⚙️</div>}
                          {status === 'sent' && <span className="text-lg">✅</span>}
                          {status === 'failed' && <span className="text-lg">❌</span>}
                        </div>
                      ) : (
                        <button
                          onClick={() => removeLead(lead.id)}
                          className="text-muted hover:text-error transition-colors text-lg"
                          title="Verwijder"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  {lead.knowledgeFile && (
                    <div className="mt-2 ml-10 text-xs text-purple-400">
                      📁 Knowledge: {lead.knowledgeFile}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Results Summary */}
        {results && (
          <div className="glass-card mt-8">
            <h3 className="text-xl font-bold mb-4">📊 Resultaten</h3>
            <div className="flex gap-8 mb-4">
              <div className="text-success">
                <div className="text-2xl font-bold">{results.sent}</div>
                <div className="text-sm">Verstuurd</div>
              </div>
              <div className="text-error">
                <div className="text-2xl font-bold">{results.failed}</div>
                <div className="text-sm">Mislukt</div>
              </div>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {results.details.map((d, i) => (
                <div key={i} className={`flex items-center gap-3 text-sm p-2 rounded ${d.status === 'sent' ? 'bg-success/10' : 'bg-error/10'}`}>
                  <span>{d.status === 'sent' ? '✅' : '❌'}</span>
                  <span className="font-bold">{d.business}</span>
                  <span className="opacity-70">{d.email}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Campaign Modal */}
      {showCampaignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCampaignModal(false)}>
          <div className="glass-card w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-bold mb-6">🚀 Nieuwe Campagne</h2>

            <div className="input-group">
              <label className="input-label">Campagne Naam</label>
              <input
                type="text"
                value={campaignName}
                onChange={e => setCampaignName(e.target.value)}
                placeholder={`Campagne ${new Date().toLocaleDateString('nl-NL')}`}
                className="premium-input"
              />
            </div>

            <div className="input-group">
              <label className="input-label">SMTP Account(s) *</label>
              {smtpAccounts.length === 0 ? (
                <div className="badge badge-warning">
                  ⚠️ Geen accounts config. <Link href="/settings" className="underline">Settings</Link>
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-2 p-2 border border-glass rounded-lg">
                  {smtpAccounts.filter(a => a.active).map(account => (
                    <label key={account.id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedSmtpIds.includes(account.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSmtpIds([...selectedSmtpIds, account.id]);
                          } else {
                            setSelectedSmtpIds(selectedSmtpIds.filter(id => id !== account.id));
                          }
                        }}
                        className="checkbox"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-bold">{account.name || account.user}</div>
                        <div className="text-xs text-muted">{account.host}</div>
                      </div>
                      {(() => {
                        const ws = getWarmupSummary(account.id);
                        if (!ws.enabled) return null;
                        return (
                          <span className={`badge badge-warning text-xs ${ws.remaining === 0 ? 'opacity-50' : ''}`}>
                            🔥 {ws.remaining}
                          </span>
                        );
                      })()}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {selectedSmtpIds.length > 1 && (
              <div className="input-group">
                <label className="input-label">SMTP Modus</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="rotate"
                      checked={smtpMode === 'rotate'}
                      onChange={() => setSmtpMode('rotate')}
                    />
                    <span className="text-sm">🔄 Roteren</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="single"
                      checked={smtpMode === 'single'}
                      onChange={() => setSmtpMode('single')}
                    />
                    <span className="text-sm">1️⃣ Eerste account</span>
                  </label>
                </div>
              </div>
            )}

            <div className="input-group">
              <label className="input-label">Standaard Stijl</label>
              <select
                value={defaultTone}
                onChange={e => setDefaultTone(e.target.value)}
                className="premium-input"
              >
                <option value="professional">💰 ROI Focus</option>
                <option value="casual">🎯 Value Drop</option>
                <option value="urgent">🔥 FOMO</option>
                <option value="friendly">🤝 Warm Direct</option>
                <option value="random">🎲 Willekeurig</option>
              </select>
            </div>

            <div className="input-group">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={verifyDomains}
                  onChange={(e) => setVerifyDomains(e.target.checked)}
                />
                <span className="text-sm font-bold">🔍 Domein verificatie</span>
              </label>
              <p className="text-xs text-muted ml-5">Check of website bereikbaar is voor verzending</p>
            </div>

            <div className="flex justify-between items-center text-sm text-secondary mb-6 p-3 rounded bg-secondary/30">
              <span>📧 {leads.filter(l => l.toEmail && l.businessName && l.websiteUrl).length} emails</span>
              <span>📡 {selectedSmtpIds.length} accounts</span>
            </div>

            {error && <div className="alert alert-error mb-4">{error}</div>}

            <div className="flex gap-4">
              <button
                className="premium-button secondary flex-1"
                onClick={() => setShowCampaignModal(false)}
              >
                Annuleren
              </button>
              <button
                className="premium-button flex-1"
                onClick={handleStartCampaign}
                disabled={selectedSmtpIds.length === 0}
              >
                🚀 Start Campagne
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .toggle-btn {
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 0.85rem;
          color: var(--text-muted);
          transition: all 0.2s;
        }
        .toggle-btn.active {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          font-weight: 600;
        }
        .godmode-btn {
          background: linear-gradient(135deg, #f97316, #dc2626);
          animation: pulse-glow 2s infinite;
        }
        .text-accent { color: var(--accent-primary); }
        .text-highlight { color: var(--text-highlight); }
        .border-accent { border-color: var(--accent-primary); }
        .bg-accent { background: var(--accent-primary); }
      `}</style>
    </Layout>
  );
}
