
import { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import Layout from "../components/Layout";
import BulkImportModal from "../components/BulkImportModal";
import BulkSettingsModal from "../components/BulkSettingsModal";
import SmtpSettingsModal from "../components/SmtpSettingsModal";

export default function Settings() {
  // Accounts data
  const [accounts, setAccounts] = useState([]);
  const [advices, setAdvices] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectAll, setSelectAll] = useState(false);

  // Filter & Sort
  const [filter, setFilter] = useState({ status: 'all', provider: 'all', search: '' });
  const [sortBy, setSortBy] = useState('recent');

  // Pagination
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  // Modals
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showBulkSettings, setShowBulkSettings] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);

  // Testing
  const [testing, setTesting] = useState(null);
  const [testResult, setTestResult] = useState(null);

  // Load accounts from API
  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/smtp-accounts');
      const data = await res.json();
      if (data.success) {
        setAccounts(data.accounts);
        loadAdvices(data.accounts);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
    setLoading(false);
  };

  // Load advices for all accounts
  const loadAdvices = async (accs) => {
    try {
      const res = await fetch('/api/smtp-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.success && data.accounts) {
        const advMap = {};
        data.accounts.forEach(a => { advMap[a.accountId] = a; });
        setAdvices(advMap);
      }
    } catch (error) {
      console.error('Error loading advices:', error);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  // Filter accounts
  const filteredAccounts = accounts.filter(acc => {
    // Status filter
    if (filter.status !== 'all') {
      const advice = advices[acc.id];
      if (filter.status === 'cold' && advice?.status !== 'cold') return false;
      if (filter.status === 'warming' && !advice?.status?.startsWith('warming')) return false;
      if (filter.status === 'warm' && advice?.status !== 'warm') return false;
      if (filter.status === 'hot' && advice?.status !== 'hot') return false;
    }
    // Provider filter
    if (filter.provider !== 'all') {
      const advice = advices[acc.id];
      if (advice?.provider?.toLowerCase() !== filter.provider.toLowerCase()) return false;
    }
    // Search filter
    if (filter.search) {
      const search = filter.search.toLowerCase();
      if (!acc.user?.toLowerCase().includes(search) &&
        !acc.name?.toLowerCase().includes(search) &&
        !acc.host?.toLowerCase().includes(search)) {
        return false;
      }
    }
    return true;
  });

  // Sort accounts
  const sortedAccounts = [...filteredAccounts].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return (a.name || a.user).localeCompare(b.name || b.user);
      case 'status':
        const statusOrder = { cold: 0, warming_week1: 1, warming_week2: 2, warming_week3: 3, warm: 4, hot: 5 };
        return (statusOrder[advices[a.id]?.status] || 0) - (statusOrder[advices[b.id]?.status] || 0);
      case 'capacity':
        return (advices[b.id]?.usage?.today || 0) - (advices[a.id]?.usage?.today || 0);
      default: // recent
        return new Date(b.lastUsed || 0) - new Date(a.lastUsed || 0);
    }
  });

  // Pagination
  const totalPages = Math.ceil(sortedAccounts.length / perPage);
  const paginatedAccounts = sortedAccounts.slice((page - 1) * perPage, page * perPage);

  // Selection handlers
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedAccounts.map(a => a.id));
    }
    setSelectAll(!selectAll);
  };

  const handleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // CRUD handlers
  const handleSave = async (id, formData) => {
    setSaving(true);
    try {
      // If editing and password is empty, keep the old password
      let payload = { id, ...formData };

      // If editing existing account and no new password provided
      if (id && (!formData.pass || formData.pass === '')) {
        const existingAccount = accounts.find(a => a.id === id);
        if (existingAccount) {
          // Don't include pass in update - API should keep existing
          delete payload.pass;
        }
      }

      const res = await fetch('/api/smtp-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        await loadAccounts();
        setShowSettings(false);
        setEditingAccount(null);
      } else {
        alert('Fout: ' + (data.error || 'Onbekende fout'));
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('Fout bij opslaan: ' + error.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (confirm('Weet je zeker dat je dit SMTP account wilt verwijderen?')) {
      try {
        const res = await fetch('/api/smtp-accounts', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) {
          await loadAccounts();
        }
      } catch (error) {
        alert('Fout bij verwijderen: ' + error.message);
      }
    }
  };

  const handleTest = async (config) => {
    try {
      const res = await fetch('/api/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smtpConfig: config, testEmail: config.user })
      });
      const data = await res.json();
      return { success: data.success, message: data.message || data.error };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  // Bulk import handler
  const handleBulkImport = async (importedAccounts) => {
    setSaving(true);
    try {
      for (const acc of importedAccounts) {
        await fetch('/api/smtp-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(acc)
        });
      }
      await loadAccounts();
    } catch (error) {
      alert('Fout bij importeren: ' + error.message);
    }
    setSaving(false);
  };

  // Bulk settings handler
  const handleBulkSettings = async (updates) => {
    setSaving(true);
    try {
      for (const id of selectedIds) {
        const account = accounts.find(a => a.id === id);
        if (account) {
          await fetch('/api/smtp-accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...account, ...updates })
          });
        }
      }
      await loadAccounts();
      setSelectedIds([]);
      setSelectAll(false);
    } catch (error) {
      alert('Fout bij bulk update: ' + error.message);
    }
    setSaving(false);
  };

  // Open settings modal
  const openAccountSettings = (account = null) => {
    setEditingAccount(account);
    setShowSettings(true);
  };

  return (
    <Layout title="SMTP Settings | SKYE Mail Agent">
      <div className="page-container">
        <div className="page-header flex justify-between items-center">
          <div>
            <h1 className="page-title"><span className="text-gradient">SMTP</span> Instellingen</h1>
            <p className="page-subtitle">Beheer je email accounts voor het verzenden van campagnes.</p>
          </div>
          <div className="flex gap-2">
            <button className="premium-button" onClick={() => openAccountSettings()}>
              ➕ Nieuw Account
            </button>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex flex-wrap gap-4 mb-6 items-center justify-between">
          <div className="flex gap-2">
            <button className="premium-button secondary" onClick={() => setShowBulkImport(true)}>
              📋 Bulk Import
            </button>
            {selectedIds.length > 0 && (
              <button className="premium-button secondary" onClick={() => setShowBulkSettings(true)}>
                ⚙️ Bulk Settings ({selectedIds.length})
              </button>
            )}
          </div>
          <div className="text-sm text-secondary">
            {accounts.length} account{accounts.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Filters and Table */}
        <div className="glass-card p-0 overflow-hidden">
          {/* Filter Bar */}
          <div className="p-4 border-b border-glass flex flex-wrap gap-4 items-center bg-white/5">
            <select
              value={filter.status}
              onChange={e => { setFilter(f => ({ ...f, status: e.target.value })); setPage(1); }}
              className="premium-input w-[150px] py-2 h-auto text-sm"
            >
              <option value="all">Alle Status</option>
              <option value="cold">❄️ Koud</option>
              <option value="warming">🌡️ Warming</option>
              <option value="warm">🔥 Warm</option>
              <option value="hot">💥 Hot</option>
            </select>

            <select
              value={filter.provider}
              onChange={e => { setFilter(f => ({ ...f, provider: e.target.value })); setPage(1); }}
              className="premium-input w-[150px] py-2 h-auto text-sm"
            >
              <option value="all">Alle Providers</option>
              <option value="gmail">Gmail</option>
              <option value="outlook/365">Outlook</option>
              <option value="sendgrid">SendGrid</option>
              <option value="custom">Custom</option>
            </select>

            <div className="flex-1">
              <input
                type="text"
                placeholder="🔍 Zoeken..."
                value={filter.search}
                onChange={e => { setFilter(f => ({ ...f, search: e.target.value })); setPage(1); }}
                className="premium-input w-full py-2 h-auto text-sm"
              />
            </div>

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="premium-input w-[150px] py-2 h-auto text-sm"
            >
              <option value="recent">Recent</option>
              <option value="name">Naam A-Z</option>
              <option value="status">Status</option>
              <option value="capacity">Capaciteit</option>
            </select>

            <select
              value={perPage}
              onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
              className="premium-input w-[80px] py-2 h-auto text-sm"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="premium-table">
              <thead>
                <tr>
                  <th className="w-[50px] text-center">
                    <input
                      type="checkbox"
                      checked={selectAll}
                      onChange={handleSelectAll}
                      className="cursor-pointer"
                    />
                  </th>
                  <th>Account</th>
                  <th>Status</th>
                  <th>Gebruik</th>
                  <th className="text-right">Acties</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5" className="text-center py-12 text-secondary">
                      <div className="spinner mx-auto mb-2 text-accent">⚙️</div>
                      Accounts laden...
                    </td>
                  </tr>
                ) : accounts.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-12 text-secondary">
                      <div className="text-4xl mb-4">🔌</div>
                      <p>Nog geen SMTP accounts geconfigureerd</p>
                    </td>
                  </tr>
                ) : paginatedAccounts.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-12 text-secondary">
                      <div className="text-4xl mb-4">🔍</div>
                      <p>Geen accounts gevonden met deze filters</p>
                    </td>
                  </tr>
                ) : (
                  paginatedAccounts.map(account => {
                    const advice = advices[account.id] || {};
                    return (
                      <tr
                        key={account.id}
                        className={`${!account.active ? 'opacity-50 grayscale-[0.5]' : ''} ${selectedIds.includes(account.id) ? 'bg-accent/10' : ''}`}
                      >
                        <td className="text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(account.id)}
                            onChange={() => handleSelect(account.id)}
                            className="cursor-pointer"
                          />
                        </td>
                        <td>
                          <div className="flex flex-col">
                            <span className="font-mono text-white text-sm">{account.user}</span>
                            <div className="flex gap-2 items-center mt-1 text-xs text-secondary">
                              {account.name && <span>{account.name}</span>}
                              <span className="bg-white/10 px-1.5 rounded">{advice.provider || 'Custom'}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          {advice.statusLabel ? (
                            <span
                              className="badge"
                              style={{
                                background: `${advice.statusColor}20`,
                                borderColor: advice.statusColor,
                                color: advice.statusColor
                              }}
                            >
                              {advice.statusEmoji} {advice.statusLabel}
                            </span>
                          ) : (
                            <span className="text-xs text-secondary">-</span>
                          )}
                        </td>
                        <td>
                          <div className="w-[120px]">
                            <div className="flex justify-between text-xs mb-1 text-secondary">
                              <span>{advice.usage?.today || 0}</span>
                              <span>{advice.usage?.dailyLimit || 50}</span>
                            </div>
                            <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${Math.min(100, ((advice.usage?.today || 0) / (advice.usage?.dailyLimit || 50)) * 100)}%`,
                                  background: advice.statusColor || '#64748b'
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              className="p-1.5 hover:bg-white/10 rounded transition-colors"
                              title="Instellingen"
                              onClick={() => openAccountSettings(account)}
                            >
                              ⚙️
                            </button>
                            <button
                              className="p-1.5 hover:bg-error/20 text-muted hover:text-error rounded transition-colors"
                              title="Verwijderen"
                              onClick={() => handleDelete(account.id)}
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-glass flex justify-center items-center gap-2">
              <button
                className="premium-button secondary text-xs p-2 h-8 w-8 flex items-center justify-center"
                disabled={page === 1}
                onClick={() => setPage(1)}
              >
                ⏮️
              </button>
              <button
                className="premium-button secondary text-xs p-2 h-8 w-8 flex items-center justify-center"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                ◀️
              </button>
              <span className="text-sm text-secondary px-2">
                {page} / {totalPages}
              </span>
              <button
                className="premium-button secondary text-xs p-2 h-8 w-8 flex items-center justify-center"
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                ▶️
              </button>
              <button
                className="premium-button secondary text-xs p-2 h-8 w-8 flex items-center justify-center"
                disabled={page === totalPages}
                onClick={() => setPage(totalPages)}
              >
                ⏭️
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <BulkImportModal
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        onImport={handleBulkImport}
      />

      <BulkSettingsModal
        isOpen={showBulkSettings}
        onClose={() => setShowBulkSettings(false)}
        selectedCount={selectedIds.length}
        onApply={handleBulkSettings}
      />

      <SmtpSettingsModal
        isOpen={showSettings}
        onClose={() => { setShowSettings(false); setEditingAccount(null); }}
        account={editingAccount}
        advice={editingAccount ? advices[editingAccount.id] : null}
        onSave={handleSave}
        onTest={handleTest}
      />
    </Layout>
  );
}
