
import { useState } from 'react';

export default function BulkImportModal({ isOpen, onClose, onImport }) {
  const [importText, setImportText] = useState('');
  const [format, setFormat] = useState('text'); // 'text' or 'csv'
  const [preview, setPreview] = useState([]);
  const [error, setError] = useState('');

  const parseTextFormat = (text) => {
    // Format: host:port:user:password:fromName (one per line)
    const lines = text.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    const accounts = [];

    for (const line of lines) {
      const parts = line.trim().split(':');
      if (parts.length >= 4) {
        accounts.push({
          host: parts[0].trim(),
          port: parts[1].trim() || '587',
          user: parts[2].trim(),
          pass: parts[3].trim(),
          fromName: parts[4]?.trim() || ''
        });
      }
    }
    return accounts;
  };

  const parseCsvFormat = (text) => {
    // Format: CSV with headers: host,port,user,pass,fromName,fromEmail
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
    const accounts = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const account = {};

      headers.forEach((header, idx) => {
        account[header] = values[idx] || '';
      });

      if (account.host && account.user && account.pass) {
        accounts.push({
          host: account.host,
          port: account.port || '587',
          user: account.user,
          pass: account.pass,
          fromName: account.fromname || account.fromName || '',
          fromEmail: account.fromemail || account.fromEmail || ''
        });
      }
    }
    return accounts;
  };

  const handlePreview = () => {
    setError('');
    try {
      const accounts = format === 'csv'
        ? parseCsvFormat(importText)
        : parseTextFormat(importText);

      if (accounts.length === 0) {
        setError('Geen geldige accounts gevonden. Check het formaat.');
        setPreview([]);
      } else {
        setPreview(accounts);
      }
    } catch (e) {
      setError('Fout bij parsen: ' + e.message);
      setPreview([]);
    }
  };

  const handleImport = async () => {
    if (preview.length === 0) return;
    await onImport(preview);
    setImportText('');
    setPreview([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-6 border-b border-glass mb-4">
          <h2 className="text-xl font-bold text-white">📋 Bulk Import SMTP Accounts</h2>
          <button className="text-secondary hover:text-white text-2xl" onClick={onClose}>×</button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Format Selection */}
          <div className="flex gap-4 mb-4">
            <button
              className={`flex-1 py-3 px-4 rounded-lg border text-sm font-bold transition-all ${format === 'text' ? 'bg-accent/20 border-accent text-accent' : 'bg-white/5 border-glass text-secondary hover:bg-white/10'}`}
              onClick={() => setFormat('text')}
            >
              📝 Kladblok
            </button>
            <button
              className={`flex-1 py-3 px-4 rounded-lg border text-sm font-bold transition-all ${format === 'csv' ? 'bg-accent/20 border-accent text-accent' : 'bg-white/5 border-glass text-secondary hover:bg-white/10'}`}
              onClick={() => setFormat('csv')}
            >
              📊 CSV
            </button>
          </div>

          {/* Format Help */}
          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm text-secondary">
            {format === 'text' ? (
              <p>
                <strong className="text-blue-400">Formaat:</strong> host:port:user:password:fromName<br />
                <code className="block mt-2 bg-black/30 p-2 rounded text-blue-300">smtp.gmail.com:587:email@gmail.com:apppassword:SKYE</code>
              </p>
            ) : (
              <p>
                <strong className="text-blue-400">CSV Headers:</strong> host,port,user,pass,fromName<br />
                <code className="block mt-2 bg-black/30 p-2 rounded text-blue-300">smtp.gmail.com,587,email@gmail.com,pass,SKYE</code>
              </p>
            )}
          </div>

          {/* Text Input */}
          <textarea
            className="premium-input font-mono text-xs w-full min-h-[200px]"
            placeholder={format === 'text'
              ? "# Plak SMTP accounts (één per regel)\nsmtp.gmail.com:587:email@gmail.com:password:SKYE"
              : "host,port,user,pass,fromName\nsmtp.gmail.com,587,email@gmail.com,password,SKYE"
            }
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />

          {/* Error */}
          {error && <div className="p-3 bg-red-500/10 border border-error/50 rounded text-error text-sm font-bold">❌ {error}</div>}

          {/* Preview Results */}
          {preview.length > 0 && (
            <div className="mt-4 border border-success/30 rounded-lg overflow-hidden">
              <div className="bg-success/10 p-3 border-b border-success/30 font-bold text-success flex justify-between">
                <span>✅ {preview.length} accounts gevonden</span>
              </div>
              <div className="max-h-[150px] overflow-y-auto p-2 bg-black/20 space-y-1">
                {preview.slice(0, 5).map((acc, i) => (
                  <div key={i} className="flex justify-between text-xs p-2 hover:bg-white/5 rounded">
                    <span className="text-white font-mono">{acc.user}</span>
                    <span className="text-secondary">{acc.host}:{acc.port}</span>
                  </div>
                ))}
                {preview.length > 5 && (
                  <div className="text-center text-xs text-secondary py-2 italic opacity-70">
                    ... en {preview.length - 5} meer
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-glass flex justify-end gap-3 bg-black/20">
          <button className="premium-button secondary" onClick={onClose}>
            Annuleren
          </button>
          {preview.length === 0 ? (
            <button
              className="premium-button"
              onClick={handlePreview}
              disabled={!importText.trim()}
            >
              👁️ Preview
            </button>
          ) : (
            <button
              className="premium-button bg-gradient-to-r from-green-500 to-emerald-600"
              onClick={handleImport}
            >
              📥 Importeer {preview.length} Accounts
            </button>
          )}
        </div>
      </div>
      <style jsx>{`
               .custom-scrollbar::-webkit-scrollbar {
                  width: 6px;
               }
               .custom-scrollbar::-webkit-scrollbar-track {
                  background: rgba(0,0,0,0.1);
               }
               .custom-scrollbar::-webkit-scrollbar-thumb {
                  background: rgba(255,255,255,0.1);
                  border-radius: 3px;
               }
            `}</style>
    </div>
  );
}
