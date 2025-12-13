import { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
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
      const res = await fetch('/api/smtp-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...formData })
      });
      const data = await res.json();
      if (data.success) {
        await loadAccounts();
      } else {
        alert('Fout: ' + data.error);
      }
    } catch (error) {
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
    <>
      <Head>
        <title>SMTP Settings | SKYE Mail Agent</title>
      </Head>

      <div className="container">
        {/* Navigation */}
        <nav className="nav-bar">
          <Link href="/" className="nav-link">📧 Verstuur</Link>
          <Link href="/batch" className="nav-link">📦 Batch</Link>
          <Link href="/campaigns" className="nav-link">🚀 Campagnes</Link>
          <Link href="/enrich" className="nav-link">🔍 Enricher</Link>
          <Link href="/analytics" className="nav-link">📊 Analytics</Link>
          <Link href="/settings" className="nav-link active">⚙️ Settings</Link>
        </nav>

        <header className="header">
          <h1>⚙️ SMTP Instellingen</h1>
          <p>Beheer je email accounts voor het verzenden van campagnes</p>
        </header>

        {/* Action Buttons */}
        <div className="actions-bar">
          <div className="actions-left">
            <button className="btn btn-primary" onClick={() => openAccountSettings()}>
              ➕ Nieuw Account
            </button>
            <button className="btn btn-secondary" onClick={() => setShowBulkImport(true)}>
              📋 Bulk Import
            </button>
            {selectedIds.length > 0 && (
              <button className="btn btn-secondary" onClick={() => setShowBulkSettings(true)}>
                ⚙️ Bulk Settings ({selectedIds.length})
              </button>
            )}
          </div>
          <div className="actions-right">
            <span className="account-count">
              {accounts.length} account{accounts.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Filter & Sort Bar */}
        <div className="filter-bar">
          <div className="filters">
            {/* Status Filter */}
            <select
              value={filter.status}
              onChange={e => { setFilter(f => ({ ...f, status: e.target.value })); setPage(1); }}
            >
              <option value="all">Alle Status</option>
              <option value="cold">❄️ Koud</option>
              <option value="warming">🌡️ Warming</option>
              <option value="warm">🔥 Warm</option>
              <option value="hot">💥 Hot</option>
            </select>

            {/* Provider Filter */}
            <select
              value={filter.provider}
              onChange={e => { setFilter(f => ({ ...f, provider: e.target.value })); setPage(1); }}
            >
              <option value="all">Alle Providers</option>
              <option value="gmail">Gmail</option>
              <option value="outlook/365">Outlook</option>
              <option value="sendgrid">SendGrid</option>
              <option value="custom">Custom</option>
            </select>

            {/* Search */}
            <input
              type="text"
              placeholder="🔍 Zoeken..."
              value={filter.search}
              onChange={e => { setFilter(f => ({ ...f, search: e.target.value })); setPage(1); }}
              className="search-input"
            />
          </div>

          <div className="sort-pagination">
            {/* Sort */}
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="recent">Recent</option>
              <option value="name">Naam A-Z</option>
              <option value="status">Status</option>
              <option value="capacity">Capaciteit</option>
            </select>

            {/* Per Page */}
            <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
            </select>
          </div>
        </div>

        {/* Accounts Table */}
        <div className="accounts-table">
          {/* Header */}
          <div className="table-header">
            <div className="col-check">
              <input
                type="checkbox"
                checked={selectAll}
                onChange={handleSelectAll}
              />
            </div>
            <div className="col-account">Account</div>
            <div className="col-status">Status</div>
            <div className="col-usage">Gebruik</div>
            <div className="col-actions">Acties</div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="loading-state">
              ⏳ Accounts laden...
            </div>
          )}

          {/* Empty State */}
          {!loading && accounts.length === 0 && (
            <div className="empty-state">
              <p>🔌 Nog geen SMTP accounts geconfigureerd</p>
              <p>Klik op "Nieuw Account" of "Bulk Import" om te beginnen</p>
            </div>
          )}

          {/* No Results */}
          {!loading && accounts.length > 0 && paginatedAccounts.length === 0 && (
            <div className="empty-state">
              <p>🔍 Geen accounts gevonden met deze filters</p>
            </div>
          )}

          {/* Account Rows */}
          {paginatedAccounts.map(account => {
            const advice = advices[account.id] || {};
            return (
              <div
                key={account.id}
                className={`table-row ${account.active ? '' : 'inactive'} ${selectedIds.includes(account.id) ? 'selected' : ''}`}
              >
                {/* Checkbox */}
                <div className="col-check">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(account.id)}
                    onChange={() => handleSelect(account.id)}
                  />
                </div>

                {/* Account Info */}
                <div className="col-account">
                  <div className="account-email">📧 {account.user}</div>
                  <div className="account-meta">
                    {account.name && <span className="account-name">{account.name}</span>}
                    <span className="account-provider">{advice.provider || 'Custom'}</span>
                  </div>
                </div>

                {/* Status */}
                <div className="col-status">
                  <span
                    className="status-badge"
                    style={{
                      background: `${advice.statusColor}20`,
                      borderColor: advice.statusColor,
                      color: advice.statusColor
                    }}
                  >
                    {advice.statusEmoji} {advice.statusLabel || 'Unknown'}
                  </span>
                </div>

                {/* Usage */}
                <div className="col-usage">
                  <span className="usage-text">
                    {advice.usage?.today || 0}/{advice.usage?.dailyLimit || 50}
                  </span>
                  <div className="usage-bar">
                    <div
                      className="usage-fill"
                      style={{
                        width: `${Math.min(100, ((advice.usage?.today || 0) / (advice.usage?.dailyLimit || 50)) * 100)}%`,
                        background: advice.statusColor
                      }}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="col-actions">
                  <button
                    className="btn-icon"
                    title="Instellingen"
                    onClick={() => openAccountSettings(account)}
                  >
                    ⚙️
                  </button>
                  <button
                    className="btn-icon"
                    title="Verwijderen"
                    onClick={() => handleDelete(account.id)}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="btn btn-sm"
              disabled={page === 1}
              onClick={() => setPage(1)}
            >
              ⏮️
            </button>
            <button
              className="btn btn-sm"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              ◀️
            </button>
            <span className="page-info">
              {page} / {totalPages}
            </span>
            <button
              className="btn btn-sm"
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              ▶️
            </button>
            <button
              className="btn btn-sm"
              disabled={page === totalPages}
              onClick={() => setPage(totalPages)}
            >
              ⏭️
            </button>
          </div>
        )}
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

      <style jsx>{`
        .container {
          max-width: 1200px;
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

        .nav-link:hover {
          background: #252542;
          color: #fff;
        }

        .nav-link.active {
          background: #00A4E8;
          color: #fff;
        }

        .header {
          margin-bottom: 24px;
        }

        .header h1 {
          margin: 0 0 8px 0;
          color: #fff;
        }

        .header p {
          margin: 0;
          color: #888;
        }

        .actions-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          flex-wrap: wrap;
          gap: 12px;
        }

        .actions-left {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .account-count {
          color: #888;
          font-size: 14px;
        }

        .btn {
          padding: 10px 18px;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 14px;
        }

        .btn-primary {
          background: linear-gradient(135deg, #00A4E8, #0078d4);
          color: white;
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 164, 232, 0.4);
        }

        .btn-secondary {
          background: rgba(255,255,255,0.1);
          color: #fff;
        }

        .btn-secondary:hover {
          background: rgba(255,255,255,0.15);
        }

        .btn-sm {
          padding: 6px 12px;
          font-size: 12px;
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none !important;
        }

        .filter-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .filters {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .sort-pagination {
          display: flex;
          gap: 8px;
        }

        .filter-bar select,
        .search-input {
          padding: 8px 12px;
          background: #1a1a2e;
          border: 1px solid #2a2a4e;
          border-radius: 6px;
          color: #fff;
          font-size: 13px;
        }

        .search-input {
          width: 180px;
        }

        .accounts-table {
          background: #1a1a2e;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid #2a2a4e;
        }

        .table-header {
          display: grid;
          grid-template-columns: 40px 1fr 120px 120px 80px;
          padding: 12px 16px;
          background: #0d0d1a;
          border-bottom: 1px solid #2a2a4e;
          font-size: 12px;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .table-row {
          display: grid;
          grid-template-columns: 40px 1fr 120px 120px 80px;
          padding: 12px 16px;
          border-bottom: 1px solid #2a2a4e;
          align-items: center;
          transition: background 0.2s;
        }

        .table-row:last-child {
          border-bottom: none;
        }

        .table-row:hover {
          background: rgba(255,255,255,0.02);
        }

        .table-row.selected {
          background: rgba(0, 164, 232, 0.1);
        }

        .table-row.inactive {
          opacity: 0.5;
        }

        .col-check input {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }

        .account-email {
          font-size: 14px;
          color: #fff;
          margin-bottom: 2px;
        }

        .account-meta {
          display: flex;
          gap: 8px;
          font-size: 12px;
          color: #888;
        }

        .account-name {
          color: #aaa;
        }

        .status-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          border: 1px solid;
        }

        .usage-text {
          font-size: 13px;
          color: #fff;
          margin-bottom: 4px;
          display: block;
        }

        .usage-bar {
          height: 4px;
          background: rgba(255,255,255,0.1);
          border-radius: 2px;
          overflow: hidden;
        }

        .usage-fill {
          height: 100%;
          border-radius: 2px;
          transition: width 0.3s;
        }

        .col-actions {
          display: flex;
          gap: 4px;
        }

        .btn-icon {
          padding: 6px 8px;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 16px;
          opacity: 0.6;
          transition: opacity 0.2s;
        }

        .btn-icon:hover {
          opacity: 1;
        }

        .loading-state,
        .empty-state {
          padding: 60px 20px;
          text-align: center;
          color: #888;
        }

        .empty-state p:first-child {
          font-size: 18px;
          margin-bottom: 8px;
        }

        .pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          margin-top: 16px;
        }

        .page-info {
          color: #888;
          font-size: 14px;
          padding: 0 12px;
        }
      `}</style>
    </>
  );
}
