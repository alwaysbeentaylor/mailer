import { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import { getSmtpAccounts, addSmtpAccount, updateSmtpAccount, deleteSmtpAccount } from "../utils/campaignStore";

export default function Settings() {
    const [accounts, setAccounts] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editingAccount, setEditingAccount] = useState(null);
    const [testing, setTesting] = useState(null);
    const [testResult, setTestResult] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        host: '',
        port: '587',
        user: '',
        pass: '',
        fromName: ''
    });

    useEffect(() => {
        setAccounts(getSmtpAccounts());
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();

        if (editingAccount) {
            updateSmtpAccount(editingAccount.id, formData);
        } else {
            addSmtpAccount(formData);
        }

        setAccounts(getSmtpAccounts());
        closeModal();
    };

    const handleDelete = (id) => {
        if (confirm('Weet je zeker dat je dit SMTP account wilt verwijderen?')) {
            deleteSmtpAccount(id);
            setAccounts(getSmtpAccounts());
        }
    };

    const handleToggleActive = (id, currentActive) => {
        updateSmtpAccount(id, { active: !currentActive });
        setAccounts(getSmtpAccounts());
    };

    const handleTest = async (account) => {
        setTesting(account.id);
        setTestResult(null);

        try {
            const res = await fetch('/api/test-smtp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    smtpConfig: account,
                    testEmail: account.user // Send to self
                })
            });

            const data = await res.json();
            setTestResult({ id: account.id, success: data.success, message: data.message || data.error });
        } catch (err) {
            setTestResult({ id: account.id, success: false, message: err.message });
        }

        setTesting(null);
    };

    const openModal = (account = null) => {
        if (account) {
            setEditingAccount(account);
            setFormData({
                name: account.name || '',
                host: account.host || '',
                port: account.port || '587',
                user: account.user || '',
                pass: account.pass || '',
                fromName: account.fromName || ''
            });
        } else {
            setEditingAccount(null);
            setFormData({
                name: '',
                host: 'smtp.gmail.com',
                port: '587',
                user: '',
                pass: '',
                fromName: 'SKYE'
            });
        }
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingAccount(null);
        setFormData({ name: '', host: '', port: '587', user: '', pass: '', fromName: '' });
    };

    const presetConfigs = [
        { name: 'Gmail', host: 'smtp.gmail.com', port: '587' },
        { name: 'Outlook', host: 'smtp.office365.com', port: '587' },
        { name: 'Yahoo', host: 'smtp.mail.yahoo.com', port: '587' },
        { name: 'Zoho', host: 'smtp.zoho.com', port: '587' }
    ];

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

                {/* Add Account Button */}
                <div className="actions-bar">
                    <button className="btn-primary" onClick={() => openModal()}>
                        ➕ Nieuw SMTP Account
                    </button>
                </div>

                {/* Accounts List */}
                <div className="accounts-grid">
                    {accounts.length === 0 ? (
                        <div className="empty-state">
                            <p>🔌 Nog geen SMTP accounts geconfigureerd</p>
                            <p>Klik op "Nieuw SMTP Account" om te beginnen</p>
                        </div>
                    ) : (
                        accounts.map(account => (
                            <div key={account.id} className={`account-card ${account.active ? 'active' : 'inactive'}`}>
                                <div className="account-header">
                                    <h3>{account.name || 'Naamloos'}</h3>
                                    <span className={`status-badge ${account.active ? 'active' : 'inactive'}`}>
                                        {account.active ? '✅ Actief' : '⏸️ Inactief'}
                                    </span>
                                </div>

                                <div className="account-details">
                                    <p><strong>Host:</strong> {account.host}:{account.port}</p>
                                    <p><strong>User:</strong> {account.user}</p>
                                    <p><strong>Van:</strong> {account.fromName || account.user}</p>
                                </div>

                                {testResult && testResult.id === account.id && (
                                    <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                                        {testResult.success ? '✅' : '❌'} {testResult.message}
                                    </div>
                                )}

                                <div className="account-actions">
                                    <button
                                        className="btn-test"
                                        onClick={() => handleTest(account)}
                                        disabled={testing === account.id}
                                    >
                                        {testing === account.id ? '⏳ Testen...' : '🧪 Test'}
                                    </button>
                                    <button className="btn-edit" onClick={() => openModal(account)}>
                                        ✏️ Bewerk
                                    </button>
                                    <button
                                        className="btn-toggle"
                                        onClick={() => handleToggleActive(account.id, account.active)}
                                    >
                                        {account.active ? '⏸️' : '▶️'}
                                    </button>
                                    <button className="btn-delete" onClick={() => handleDelete(account.id)}>
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Modal */}
                {showModal && (
                    <div className="modal-overlay" onClick={closeModal}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <h2>{editingAccount ? '✏️ Account Bewerken' : '➕ Nieuw SMTP Account'}</h2>

                            {/* Presets */}
                            {!editingAccount && (
                                <div className="presets">
                                    <span>Snel kiezen:</span>
                                    {presetConfigs.map(preset => (
                                        <button
                                            key={preset.name}
                                            type="button"
                                            className="preset-btn"
                                            onClick={() => setFormData(prev => ({
                                                ...prev,
                                                name: preset.name,
                                                host: preset.host,
                                                port: preset.port
                                            }))}
                                        >
                                            {preset.name}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <form onSubmit={handleSubmit}>
                                <div className="form-group">
                                    <label>Naam (optioneel)</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                        placeholder="bv. Gmail Werk"
                                    />
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label>SMTP Host *</label>
                                        <input
                                            type="text"
                                            value={formData.host}
                                            onChange={e => setFormData(prev => ({ ...prev, host: e.target.value }))}
                                            placeholder="smtp.gmail.com"
                                            required
                                        />
                                    </div>
                                    <div className="form-group small">
                                        <label>Poort *</label>
                                        <input
                                            type="text"
                                            value={formData.port}
                                            onChange={e => setFormData(prev => ({ ...prev, port: e.target.value }))}
                                            placeholder="587"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Email / Gebruikersnaam *</label>
                                    <input
                                        type="email"
                                        value={formData.user}
                                        onChange={e => setFormData(prev => ({ ...prev, user: e.target.value }))}
                                        placeholder="jouw@email.com"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Wachtwoord / App Password *</label>
                                    <input
                                        type="password"
                                        value={formData.pass}
                                        onChange={e => setFormData(prev => ({ ...prev, pass: e.target.value }))}
                                        placeholder="••••••••"
                                        required
                                    />
                                    <small>💡 Voor Gmail: gebruik een <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">App Password</a></small>
                                </div>

                                <div className="form-group">
                                    <label>Afzender Naam (optioneel)</label>
                                    <input
                                        type="text"
                                        value={formData.fromName}
                                        onChange={e => setFormData(prev => ({ ...prev, fromName: e.target.value }))}
                                        placeholder="SKYE"
                                    />
                                </div>

                                <div className="modal-actions">
                                    <button type="button" className="btn-secondary" onClick={closeModal}>
                                        Annuleren
                                    </button>
                                    <button type="submit" className="btn-primary">
                                        {editingAccount ? 'Opslaan' : 'Toevoegen'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>

            <style jsx>{`
        .container {
          max-width: 1000px;
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
          margin-bottom: 24px;
        }

        .btn-primary {
          background: linear-gradient(135deg, #00A4E8, #0078d4);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 164, 232, 0.4);
        }

        .accounts-grid {
          display: grid;
          gap: 16px;
        }

        .empty-state {
          text-align: center;
          padding: 60px 20px;
          background: #1a1a2e;
          border-radius: 12px;
          color: #888;
        }

        .empty-state p:first-child {
          font-size: 18px;
          margin-bottom: 8px;
        }

        .account-card {
          background: #1a1a2e;
          border-radius: 12px;
          padding: 20px;
          border: 1px solid #2a2a4e;
          transition: border-color 0.2s;
        }

        .account-card.active {
          border-color: #00A4E8;
        }

        .account-card.inactive {
          opacity: 0.6;
        }

        .account-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .account-header h3 {
          margin: 0;
          color: #fff;
        }

        .status-badge {
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 20px;
        }

        .status-badge.active {
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }

        .status-badge.inactive {
          background: rgba(156, 163, 175, 0.2);
          color: #9ca3af;
        }

        .account-details {
          margin-bottom: 16px;
        }

        .account-details p {
          margin: 4px 0;
          color: #aaa;
          font-size: 14px;
        }

        .test-result {
          padding: 10px;
          border-radius: 8px;
          margin-bottom: 12px;
          font-size: 14px;
        }

        .test-result.success {
          background: rgba(34, 197, 94, 0.1);
          color: #22c55e;
        }

        .test-result.error {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }

        .account-actions {
          display: flex;
          gap: 8px;
        }

        .account-actions button {
          padding: 8px 14px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          transition: opacity 0.2s;
        }

        .account-actions button:hover {
          opacity: 0.8;
        }

        .btn-test {
          background: #2563eb;
          color: white;
        }

        .btn-edit {
          background: #6b7280;
          color: white;
        }

        .btn-toggle {
          background: #374151;
          color: white;
        }

        .btn-delete {
          background: #dc2626;
          color: white;
        }

        .account-actions button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Modal */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .modal {
          background: #1a1a2e;
          border-radius: 16px;
          padding: 28px;
          max-width: 500px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
        }

        .modal h2 {
          margin: 0 0 20px 0;
          color: #fff;
        }

        .presets {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .presets span {
          color: #888;
          font-size: 14px;
        }

        .preset-btn {
          background: #2a2a4e;
          color: #fff;
          border: none;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
        }

        .preset-btn:hover {
          background: #3a3a5e;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          margin-bottom: 6px;
          color: #ccc;
          font-size: 14px;
        }

        .form-group input {
          width: 100%;
          padding: 12px;
          background: #0d0d1a;
          border: 1px solid #2a2a4e;
          border-radius: 8px;
          color: #fff;
          font-size: 14px;
        }

        .form-group input:focus {
          outline: none;
          border-color: #00A4E8;
        }

        .form-group small {
          display: block;
          margin-top: 6px;
          color: #888;
          font-size: 12px;
        }

        .form-group small a {
          color: #00A4E8;
        }

        .form-row {
          display: flex;
          gap: 12px;
        }

        .form-row .form-group {
          flex: 1;
        }

        .form-row .form-group.small {
          flex: 0 0 100px;
        }

        .modal-actions {
          display: flex;
          gap: 12px;
          margin-top: 24px;
        }

        .btn-secondary {
          flex: 1;
          padding: 12px;
          background: #374151;
          color: #fff;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
        }

        .modal-actions .btn-primary {
          flex: 1;
        }
      `}</style>
        </>
    );
}
