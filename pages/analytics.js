
import { useState, useEffect } from 'react';
import Head from 'next/head';
import Layout from '../components/Layout';

export default function Analytics() {
  const [stats, setStats] = useState(null);
  const [emails, setEmails] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [filterOptions, setFilterOptions] = useState({ niches: [], tones: [] });
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [scanning, setScanning] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    niche: '',
    emailTone: '',
    status: '',
    hasReply: '',
    fromDate: '',
    toDate: ''
  });

  // Sorting
  const [sortBy, setSortBy] = useState('sent_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // Initial load
  useEffect(() => {
    loadStats();
    loadEmails();
    loadFollowUps();
  }, []);

  // Reload emails when filters or sorting change
  useEffect(() => {
    loadEmails();
  }, [filters, sortBy, sortOrder]);

  async function loadStats() {
    try {
      const res = await fetch('/api/analytics-data?action=stats');
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        setSettings(data.settings);
        setFilterOptions(data.filterOptions);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
    setLoading(false);
  }

  async function loadEmails() {
    try {
      const params = new URLSearchParams({ action: 'emails' });
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      // Add sorting parameters
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);

      const res = await fetch(`/api/analytics-data?${params}`);
      const data = await res.json();
      if (data.success) {
        setEmails(data.emails);
      }
    } catch (error) {
      console.error('Failed to load emails:', error);
    }
  }

  async function loadFollowUps() {
    try {
      const res = await fetch('/api/analytics-data?action=follow-ups');
      const data = await res.json();
      if (data.success) {
        setFollowUps(data.emails);
      }
    } catch (error) {
      console.error('Failed to load follow-ups:', error);
    }
  }

  async function scanReplies() {
    setScanning(true);
    try {
      const res = await fetch('/api/scan-replies');
      const data = await res.json();

      if (data.success) {
        alert(`Scan compleet! ${data.newReplies} nieuwe replies gevonden.`);
        loadStats();
        loadEmails();
        loadFollowUps();
      } else if (data.needsReauth) {
        alert('Gmail authenticatie nodig. Voer node get-gmail-refresh-token.js uit.');
      } else {
        alert('Scan mislukt: ' + (data.details || data.error));
      }
    } catch (error) {
      alert('Scan mislukt: ' + error.message);
    }
    setScanning(false);
  }

  async function updateSetting(key, value) {
    try {
      await fetch('/api/analytics-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-setting', key, value })
      });
      setSettings(prev => ({ ...prev, [key]: value }));
    } catch (error) {
      console.error('Failed to update setting:', error);
    }
  }

  async function markFollowUpDone(emailId) {
    try {
      await fetch('/api/analytics-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-follow-up-done', emailId })
      });
      loadFollowUps();
      loadStats();
    } catch (error) {
      console.error('Failed to mark follow-up done:', error);
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('nl-NL', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function daysSince(dateStr) {
    if (!dateStr) return 0;
    const date = new Date(dateStr);
    const now = new Date();
    return Math.floor((now - date) / (1000 * 60 * 60 * 24));
  }

  if (loading) {
    return (
      <Layout title="Analytics | SKYE">
        <div className="flex flex-col items-center justify-center h-[50vh]">
          <div className="spinner text-accent text-4xl mb-4">⚙️</div>
          <p className="text-secondary">Analytics laden...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Analytics | SKYE">
      <div className="page-container">

        {/* Page Header */}
        <div className="page-header flex justify-between items-center">
          <div>
            <h1 className="page-title"><span className="text-gradient">Analytics</span> Dashboard</h1>
            <p className="page-subtitle">Inzichten en rapportages over je email campagnes.</p>
          </div>
          <button
            className={`premium-button ${scanning ? 'opacity-70' : ''}`}
            onClick={scanReplies}
            disabled={scanning}
          >
            {scanning ? '🔄 Scannen...' : '📬 Scan Replies'}
          </button>
        </div>

        {/* Tabs */}
        <div className="glass-card p-2 mb-6 flex gap-2">
          {['overview', 'emails', 'follow-ups', 'settings'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === tab ? 'bg-accent/20 text-accent ring-1 ring-accent/50' : 'text-secondary hover:bg-white/5 hover:text-white'}`}
            >
              {tab === 'overview' && '📊 Overzicht'}
              {tab === 'emails' && '📧 Alle Emails'}
              {tab === 'follow-ups' && `⏰ Follow-ups (${followUps.length})`}
              {tab === 'settings' && '⚙️ Instellingen'}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && stats && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="glass-card border-l-4 border-l-sky-500 text-center">
                <div className="text-3xl mb-2">📧</div>
                <div className="text-3xl font-bold">{stats.summary.totalEmails}</div>
                <div className="text-xs text-secondary uppercase tracking-wider">Emails Verstuurd</div>
              </div>
              <div className="glass-card border-l-4 border-l-green-500 text-center">
                <div className="text-3xl mb-2">👆</div>
                <div className="text-3xl font-bold">{stats.summary.totalClicks}</div>
                <div className="text-xs text-secondary uppercase tracking-wider">Clicks ({stats.summary.clickRate}%)</div>
              </div>
              <div className="glass-card border-l-4 border-l-blue-500 text-center">
                <div className="text-3xl mb-2">💬</div>
                <div className="text-3xl font-bold">{stats.summary.totalReplies}</div>
                <div className="text-xs text-secondary uppercase tracking-wider">Replies ({stats.summary.replyRate}%)</div>
              </div>
              <div className="glass-card border-l-4 border-l-yellow-500 text-center">
                <div className="text-3xl mb-2">⏰</div>
                <div className="text-3xl font-bold">{stats.summary.pendingFollowUps}</div>
                <div className="text-xs text-secondary uppercase tracking-wider">Follow-ups Nodig</div>
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Per Niche */}
              <div className="glass-card">
                <h3 className="text-lg font-bold mb-4">📌 Per Niche</h3>
                <div className="space-y-3">
                  {stats.nicheStats.map((item, i) => (
                    <div key={i} className="flex items-center gap-4 text-sm">
                      <span className="w-24 text-secondary truncate" title={item.niche}>{item.niche || 'Onbekend'}</span>
                      <div className="flex-1 h-6 bg-white/5 rounded overflow-hidden relative">
                        <div
                          className="h-full bg-gradient-to-r from-sky-500 to-blue-600 flex items-center justify-end px-2 text-[10px] font-bold"
                          style={{ width: `${Math.min((item.total / Math.max(...stats.nicheStats.map(n => n.total))) * 100, 100)}%` }}
                        >
                          {item.total}
                        </div>
                      </div>
                      <span className="w-20 text-xs text-secondary text-right">
                        {item.clicks || 0} 👆 | {item.replies || 0} 💬
                      </span>
                    </div>
                  ))}
                  {stats.nicheStats.length === 0 && <p className="text-center text-muted py-4">Nog geen data</p>}
                </div>
              </div>

              {/* Per Tone */}
              <div className="glass-card">
                <h3 className="text-lg font-bold mb-4">🎨 Per Email Stijl</h3>
                <div className="space-y-3">
                  {stats.toneStats.map((item, i) => (
                    <div key={i} className="flex items-center gap-4 text-sm">
                      <span className="w-24 text-secondary capitalize">{item.email_tone || 'Onbekend'}</span>
                      <div className="flex-1 h-6 bg-white/5 rounded overflow-hidden relative">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 flex items-center justify-end px-2 text-[10px] font-bold"
                          style={{ width: `${Math.min((item.total / Math.max(...stats.toneStats.map(t => t.total))) * 100, 100)}%` }}
                        >
                          {item.total}
                        </div>
                      </div>
                      <span className="w-20 text-xs text-secondary text-right">
                        {item.clicks || 0} 👆 | {item.replies || 0} 💬
                      </span>
                    </div>
                  ))}
                  {stats.toneStats.length === 0 && <p className="text-center text-muted py-4">Nog geen data</p>}
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="glass-card">
              <h3 className="text-lg font-bold mb-4">📈 Activiteit Afgelopen 7 Dagen</h3>
              <div className="flex justify-between items-end h-40 pt-4 px-4 overflow-x-auto gap-4">
                {stats.recentActivity.map((day, i) => (
                  <div key={i} className="flex flex-col items-center gap-2 flex-1 min-w-[60px]">
                    <div className="flex gap-1 items-end h-full w-full justify-center">
                      {/* Sent Bar */}
                      <div className="w-3 bg-white/20 rounded-t relative group h-full max-h-full flex items-end">
                        <div className="w-full bg-secondary rounded-t" style={{ height: `${Math.min(day.sent * 5, 100)}%` }}></div>
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] opacity-0 group-hover:opacity-100 bg-black/80 px-1 rounded transition-opacity">
                          {day.sent}
                        </div>
                      </div>
                      {/* Clicks Bar */}
                      {day.clicks > 0 && (
                        <div className="w-3 bg-green-500/20 rounded-t relative group h-full max-h-full flex items-end">
                          <div className="w-full bg-green-500 rounded-t" style={{ height: `${Math.min(day.clicks * 10, 100)}%` }}></div>
                        </div>
                      )}
                      {/* Replies Bar */}
                      {day.replies > 0 && (
                        <div className="w-3 bg-blue-500/20 rounded-t relative group h-full max-h-full flex items-end">
                          <div className="w-full bg-blue-500 rounded-t" style={{ height: `${Math.min(day.replies * 10, 100)}%` }}></div>
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-secondary whitespace-nowrap">
                      {new Date(day.date).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric' })}
                    </div>
                  </div>
                ))}
                {stats.recentActivity.length === 0 && <p className="w-full text-center text-muted">Nog geen activiteit</p>}
              </div>
              <div className="flex justify-center gap-6 mt-4 text-xs text-secondary">
                <span className="flex items-center gap-2"><span className="w-3 h-3 bg-secondary rounded-sm"></span> Verzonden</span>
                <span className="flex items-center gap-2"><span className="w-3 h-3 bg-green-500 rounded-sm"></span> Clicks</span>
                <span className="flex items-center gap-2"><span className="w-3 h-3 bg-blue-500 rounded-sm"></span> Replies</span>
              </div>
            </div>
          </div>
        )}

        {/* Emails Tab */}
        {activeTab === 'emails' && (
          <div className="glass-card">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-6 p-4 rounded-lg bg-white/5 border border-glass">
              <select
                value={filters.niche}
                onChange={e => setFilters(f => ({ ...f, niche: e.target.value }))}
                className="premium-input text-sm py-2 px-3 w-auto"
              >
                <option value="">Alle niches</option>
                {filterOptions.niches.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>

              <select
                value={filters.emailTone}
                onChange={e => setFilters(f => ({ ...f, emailTone: e.target.value }))}
                className="premium-input text-sm py-2 px-3 w-auto"
              >
                <option value="">Alle stijlen</option>
                {filterOptions.tones.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <select
                value={filters.hasReply}
                onChange={e => setFilters(f => ({ ...f, hasReply: e.target.value }))}
                className="premium-input text-sm py-2 px-3 w-auto"
              >
                <option value="">Alle statussen</option>
                <option value="true">Met reply</option>
                <option value="false">Zonder reply</option>
              </select>

              <input
                type="date"
                value={filters.fromDate}
                onChange={e => setFilters(f => ({ ...f, fromDate: e.target.value }))}
                className="premium-input text-sm py-2 px-3 w-auto"
              />

              <input
                type="date"
                value={filters.toDate}
                onChange={e => setFilters(f => ({ ...f, toDate: e.target.value }))}
                className="premium-input text-sm py-2 px-3 w-auto"
              />

              <div className="flex-grow"></div>

              <button
                className="premium-button secondary text-xs py-2"
                onClick={() => {
                  setFilters({ niche: '', emailTone: '', status: '', hasReply: '', fromDate: '', toDate: '' });
                  setSortBy('sent_at');
                  setSortOrder('desc');
                }}
              >
                ✕ Reset
              </button>
            </div>

            <div className="flex justify-end mb-2 text-xs text-secondary items-center gap-2">
              <span>Sorteren:</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="bg-transparent border border-glass rounded p-1 text-white"
              >
                <option value="sent_at">Verzonden</option>
                <option value="business_name">Bedrijfsnaam</option>
                <option value="click_count">Clicks</option>
                <option value="has_reply">Reply</option>
                <option value="niche">Niche</option>
              </select>
              <button
                className="w-6 h-6 flex items-center justify-center bg-white/5 rounded hover:bg-white/10"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>

            {/* Email Table */}
            <div className="table-container max-h-[600px] overflow-auto">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>Verzonden</th>
                    <th>Bedrijf</th>
                    <th>Email</th>
                    <th>Niche</th>
                    <th>Stijl</th>
                    <th>Clicks</th>
                    <th>Reply</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {emails.map(email => (
                    <tr key={email.id} className={email.has_reply ? 'bg-blue-500/10' : ''}>
                      <td className="whitespace-nowrap">{formatDate(email.sent_at)}</td>
                      <td className="font-bold">{email.business_name}</td>
                      <td className="text-secondary text-sm">{email.to_email}</td>
                      <td><span className="badge secondary text-[10px]">{email.niche || '-'}</span></td>
                      <td><span className="badge secondary text-[10px] uppercase">{email.email_tone || '-'}</span></td>
                      <td>
                        {email.click_count > 0 ? (
                          <span className="badge success">👆 {email.click_count}</span>
                        ) : '-'}
                      </td>
                      <td>
                        {email.has_reply ? (
                          <span className="badge badg-info bg-blue-500 text-white">✅ Ja</span>
                        ) : '-'}
                      </td>
                      <td>
                        <span className={`badge ${email.status === 'sent' ? 'badge-success' : 'badge-error'}`}>
                          {email.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {emails.length === 0 && (
                    <tr>
                      <td colSpan="8" className="text-center py-8 text-secondary">Geen emails gevonden</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Follow-ups Tab */}
        {activeTab === 'follow-ups' && (
          <div className="space-y-4">
            <div className="glass-card mb-4 border-l-4 border-yellow-500">
              <h2 className="text-lg font-bold">⏰ Follow-up Nodig</h2>
              <p className="text-secondary">Emails zonder reactie na {settings.follow_up_days || 3} dagen</p>
            </div>

            {followUps.length === 0 ? (
              <div className="glass-card text-center py-12">
                <span className="text-4xl mb-4 block">🎉</span>
                <h3 className="text-xl font-bold mb-2">Alles is bijgewerkt!</h3>
                <p className="text-secondary">Er zijn geen follow-ups nodig op dit moment.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {followUps.map(email => (
                  <div key={email.id} className="glass-card p-4 flex flex-col">
                    <div className="flex-1 mb-4">
                      <div className="font-bold text-lg mb-1">{email.business_name}</div>
                      <div className="text-sm text-secondary mb-3">{email.to_email}</div>
                      <div className="flex gap-2">
                        <span className="badge secondary text-xs">{email.niche || 'Onbekend'}</span>
                        <span className="badge warning text-xs">{daysSince(email.sent_at)} dagen geleden</span>
                      </div>
                    </div>
                    <div className="flex gap-3 mt-auto">
                      <a
                        href={`mailto:${email.to_email}?subject=Re: ${email.subject || 'Opvolging'}`}
                        className="premium-button flex-1 text-sm justify-center"
                      >
                        📧 Email
                      </a>
                      <button
                        className="premium-button secondary flex-1 text-sm justify-center text-success border-success/30 hover:bg-success/10"
                        onClick={() => markFollowUpDone(email.id)}
                      >
                        ✓ Klaar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="glass-card max-w-2xl mx-auto">
            <h2 className="text-xl font-bold mb-6">⚙️ Instellingen</h2>

            <div className="space-y-6">
              <div className="flex justify-between items-center pb-6 border-b border-glass">
                <div>
                  <label className="font-bold block mb-1">Follow-up Dagen</label>
                  <p className="text-xs text-secondary">Na hoeveel dagen verschijnt een email in de lijst?</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={settings.follow_up_days || 3}
                    onChange={e => updateSetting('follow_up_days', e.target.value)}
                    className="premium-input w-20 text-center"
                  />
                  <span className="text-sm">dagen</span>
                </div>
              </div>

              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <h4 className="font-bold mb-2 flex items-center gap-2">📧 Gmail Reply Scanner</h4>
                <p className="text-sm text-secondary mb-4">
                  Klik op "Scan Replies" in de header om je Gmail inbox te scannen voor antwoorden.
                </p>
                <div className="text-xs font-mono bg-black/30 p-2 rounded">
                  node get-gmail-refresh-token.js
                </div>
              </div>

              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <h4 className="font-bold mb-2 flex items-center gap-2">👆 Click Tracking</h4>
                <p className="text-sm text-secondary">
                  Clicks op CTA knoppen en links worden automatisch getrackt.
                  Zorg dat <code>NEXT_PUBLIC_BASE_URL</code> in je .env.local correct is ingesteld.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
         /* Custom specific styles if needed */
      `}</style>
    </Layout>
  );
}
