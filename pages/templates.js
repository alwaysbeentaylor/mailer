
import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../components/Layout';

export default function TemplatesPage() {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [editMode, setEditMode] = useState(false);
    const [editData, setEditData] = useState({ name: '', description: '', html: '', accentColor: '#3b82f6' });
    const [previewHtml, setPreviewHtml] = useState('');

    useEffect(() => {
        loadTemplates();
    }, []);

    const loadTemplates = async () => {
        try {
            const res = await fetch('/api/templates');
            const data = await res.json();
            if (data.success) {
                setTemplates(data.templates || []);
            }
        } catch (e) {
            console.error('Failed to load templates:', e);
        }
        setLoading(false);
    };

    const selectTemplate = (template) => {
        setSelectedTemplate(template);
        setEditMode(false);
        setEditData({
            name: template.name,
            description: template.description || '',
            html: template.html,
            accentColor: template.accentColor || '#3b82f6'
        });
        updatePreview(template.html, template.accentColor);
    };

    const updatePreview = (html, accentColor) => {
        let preview = html || '';
        preview = preview.replace(/{{accentColor}}/g, accentColor || '#3b82f6');
        preview = preview.replace(/{{companyName}}/g, 'SKYE');
        preview = preview.replace(/{{headline}}/g, 'Uw Bedrijf Verdient Beter');
        preview = preview.replace(/{{subheadline}}/g, 'Laat ons u laten zien hoe');
        preview = preview.replace(/{{content}}/g, '<p>Dit is een voorbeeld van hoe uw email eruit zal zien. De inhoud wordt automatisch gegenereerd door de AI op basis van de website van uw lead.</p><p>U kunt de template aanpassen aan uw huisstijl.</p>');
        preview = preview.replace(/{{footer}}/g, '© 2024 SKYE • info@skye.be');
        preview = preview.replace(/{{signature}}/g, 'Met vriendelijke groet,<br>Het SKYE Team<br>info@skye.be');
        setPreviewHtml(preview);
    };

    const handleEdit = () => {
        if (selectedTemplate?.isDefault) {
            // Duplicate first
            duplicateTemplate(selectedTemplate.id);
        } else {
            setEditMode(true);
        }
    };

    const saveTemplate = async () => {
        try {
            const res = await fetch('/api/templates', {
                method: selectedTemplate.isDefault ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(selectedTemplate.isDefault ? editData : { id: selectedTemplate.id, ...editData })
            });
            const data = await res.json();
            if (data.success) {
                await loadTemplates();
                if (data.template) {
                    setSelectedTemplate(data.template);
                }
                setEditMode(false);
            } else {
                alert('Fout: ' + data.error);
            }
        } catch (e) {
            alert('Opslaan mislukt: ' + e.message);
        }
    };

    const duplicateTemplate = async (templateId) => {
        try {
            const res = await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ duplicate: templateId })
            });
            const data = await res.json();
            if (data.success) {
                await loadTemplates();
                setSelectedTemplate(data.template);
                setEditMode(true);
                setEditData({
                    name: data.template.name,
                    description: data.template.description || '',
                    html: data.template.html,
                    accentColor: data.template.accentColor || '#3b82f6'
                });
            }
        } catch (e) {
            alert('Dupliceren mislukt: ' + e.message);
        }
    };

    const deleteTemplate = async (templateId) => {
        if (!confirm('Weet je zeker dat je deze template wilt verwijderen?')) return;

        try {
            const res = await fetch('/api/templates', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: templateId })
            });
            const data = await res.json();
            if (data.success) {
                await loadTemplates();
                setSelectedTemplate(null);
            } else {
                alert('Fout: ' + data.error);
            }
        } catch (e) {
            alert('Verwijderen mislukt: ' + e.message);
        }
    };

    const createNewTemplate = () => {
        setSelectedTemplate({ id: 'new', isDefault: false });
        setEditMode(true);
        setEditData({
            name: 'Nieuwe Template',
            description: '',
            html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: sans-serif; line-height: 1.6; color: #333; }
  </style>
</head>
<body>
  {{content}}
</body>
</html>`,
            accentColor: '#3b82f6'
        });
        updatePreview(editData.html, editData.accentColor);
    };

    return (
        <Layout title="Email Templates | SKYE Mail Agent">
            <div className="page-container">
                <div className="page-header flex justify-between items-center">
                    <div>
                        <h1 className="page-title"><span className="text-gradient">Email</span> Templates</h1>
                        <p className="page-subtitle">Ontwerp en beheer de layout van je uitgaande emails.</p>
                    </div>
                    <button onClick={createNewTemplate} className="premium-button">
                        ➕ Nieuwe Template
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 min-h-[600px]">
                    {/* Templates Grid */}
                    <div className="flex flex-col gap-3">
                        {loading ? (
                            <div className="p-8 text-center text-secondary">Loading...</div>
                        ) : (
                            templates.map(template => (
                                <div
                                    key={template.id}
                                    className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedTemplate?.id === template.id ? 'bg-accent/10 border-accent shadow-lg shadow-accent/20' : 'bg-white/5 border-glass hover:bg-white/10 hover:border-white/20'}`}
                                    onClick={() => selectTemplate(template)}
                                >
                                    <div
                                        className="h-16 bg-white/10 rounded-lg flex items-center justify-center text-2xl mb-3 border-t-4"
                                        style={{ borderTopColor: template.accentColor || '#e2e8f0' }}
                                    >
                                        {template.isBlank ? '📄' : '📧'}
                                    </div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="font-bold text-white truncate">{template.name}</div>
                                        {template.isDefault && <span className="badge secondary text-[10px]">Standaard</span>}
                                    </div>
                                    <div className="text-xs text-secondary truncate">{template.description}</div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Template Editor/Preview */}
                    <div className="glass-card p-0 overflow-hidden flex flex-col h-full bg-[#0d0d1a]">
                        {selectedTemplate ? (
                            <>
                                <div className="p-4 border-b border-glass flex justify-between items-center bg-white/5">
                                    <div className="font-bold text-lg text-white">
                                        {editMode ? '✏️ Bewerken' : selectedTemplate.name}
                                    </div>
                                    <div className="flex gap-2">
                                        {!editMode ? (
                                            <>
                                                <button onClick={handleEdit} className="premium-button secondary text-sm">
                                                    {selectedTemplate.isDefault ? '📋 Bewerken (Kopie)' : '✏️ Bewerken'}
                                                </button>
                                                {!selectedTemplate.isDefault && (
                                                    <button
                                                        onClick={() => deleteTemplate(selectedTemplate.id)}
                                                        className="premium-button secondary text-error hover:bg-error/10 border-error/30"
                                                    >
                                                        🗑️
                                                    </button>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <button onClick={() => setEditMode(false)} className="premium-button secondary text-sm">
                                                    Annuleren
                                                </button>
                                                <button onClick={saveTemplate} className="premium-button text-sm bg-gradient-to-r from-green-500 to-emerald-600">
                                                    💾 Opslaan
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {editMode ? (
                                    <div className="p-6 flex-1 overflow-y-auto space-y-4 custom-scrollbar">
                                        <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-4">
                                            <div className="space-y-2">
                                                <label className="text-xs text-secondary uppercase font-bold">Naam</label>
                                                <input
                                                    type="text"
                                                    value={editData.name}
                                                    onChange={e => setEditData({ ...editData, name: e.target.value })}
                                                    className="premium-input w-full"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs text-secondary uppercase font-bold">Accent Kleur</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="color"
                                                        value={editData.accentColor}
                                                        onChange={e => {
                                                            setEditData({ ...editData, accentColor: e.target.value });
                                                            updatePreview(editData.html, e.target.value);
                                                        }}
                                                        className="h-10 w-12 rounded cursor-pointer bg-transparent border border-glass p-0"
                                                    />
                                                    <input
                                                        type="text"
                                                        value={editData.accentColor}
                                                        onChange={e => setEditData({ ...editData, accentColor: e.target.value })}
                                                        className="premium-input w-full"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs text-secondary uppercase font-bold">Beschrijving</label>
                                            <input
                                                type="text"
                                                value={editData.description}
                                                onChange={e => setEditData({ ...editData, description: e.target.value })}
                                                className="premium-input w-full"
                                            />
                                        </div>

                                        <div className="space-y-2 flex-1 flex flex-col">
                                            <label className="text-xs text-secondary uppercase font-bold">HTML Code</label>
                                            <textarea
                                                value={editData.html}
                                                onChange={e => {
                                                    setEditData({ ...editData, html: e.target.value });
                                                    updatePreview(e.target.value, editData.accentColor);
                                                }}
                                                className="premium-input font-mono text-sm w-full h-[300px]"
                                            />
                                        </div>

                                        <div className="p-3 rounded-lg bg-white/5 border border-glass text-xs font-mono text-secondary">
                                            <strong className="text-white block mb-1">Beschikbare variabelen:</strong>
                                            {'{{content}}'} {'{{companyName}}'} {'{{accentColor}}'} {'{{footer}}'} {'{{signature}}'} {'{{headline}}'} {'{{subheadline}}'}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col bg-white">
                                        <div className="px-4 py-2 bg-gray-100 border-b text-xs font-bold text-gray-500 uppercase">Preview</div>
                                        <iframe
                                            srcDoc={previewHtml}
                                            className="w-full flex-1 border-none"
                                            title="Template Preview"
                                        />
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-secondary opacity-50 p-12">
                                <div className="text-6xl mb-4">👈</div>
                                <p>Selecteer een template om te bekijken</p>
                            </div>
                        )}
                    </div>
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
        </Layout>
    );
}
