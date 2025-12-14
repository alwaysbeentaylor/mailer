
import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../components/Layout';

export default function DashboardPage() {
    const [stats, setStats] = useState(null);
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [selectedJob, setSelectedJob] = useState(null);

    // Load data
    useEffect(() => {
        loadData();
        // Auto refresh every 10 seconds
        const interval = setInterval(loadData, 10000);
        return () => clearInterval(interval);
    }, [filter]);

    const loadData = async () => {
        try {
            // Load stats
            const statsRes = await fetch('/api/jobs?stats=true');
            const statsData = await statsRes.json();
            if (statsData.success) {
                setStats(statsData.stats);
            }

            // Load jobs
            const jobsRes = await fetch(`/api/jobs${filter !== 'all' ? `?status=${filter}` : ''}`);
            const jobsData = await jobsRes.json();
            if (jobsData.success) {
                setJobs(jobsData.jobs || []);
            }
        } catch (e) {
            console.error('Failed to load dashboard data:', e);
        }
        setLoading(false);
    };

    const deleteJob = async (jobId) => {
        if (!confirm('Weet je zeker dat je deze job wilt verwijderen?')) return;

        try {
            await fetch('/api/jobs', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: jobId })
            });
            loadData();
            if (selectedJob?.id === jobId) {
                setSelectedJob(null);
            }
        } catch (e) {
            alert('Verwijderen mislukt: ' + e.message);
        }
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('nl-NL', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'pending': return '⏳';
            case 'processing': return '⚙️';
            case 'completed': return '✅';
            case 'failed': return '❌';
            default: return '❓';
        }
    };

    return (
        <Layout title="Dashboard | SKYE Mail Agent">
            <div className="page-container">
                <div className="page-header flex justify-between items-center">
                    <div>
                        <h1 className="page-title"><span className="text-gradient">Job</span> Dashboard</h1>
                        <p className="page-subtitle">Overzicht van alle achtergrondtaken en recente batches.</p>
                    </div>
                    <button onClick={loadData} className="premium-button secondary">
                        🔄 Ververs
                    </button>
                </div>

                <div className="space-y-6">
                    {/* Stats Cards */}
                    {stats && (
                        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                            <div className="glass-card text-center p-4">
                                <div className="text-3xl font-bold mb-1 text-white">{stats.emailsSent}</div>
                                <div className="text-[10px] uppercase text-secondary font-bold tracking-wider">Totaal Verstuurd</div>
                            </div>
                            <div className="glass-card text-center p-4">
                                <div className="text-3xl font-bold mb-1 text-white">{stats.today}</div>
                                <div className="text-[10px] uppercase text-secondary font-bold tracking-wider">Jobs Vandaag</div>
                            </div>
                            <div className="glass-card text-center p-4 border-l-2 border-accent">
                                <div className="text-3xl font-bold mb-1 text-accent">{stats.processing}</div>
                                <div className="text-[10px] uppercase text-secondary font-bold tracking-wider">Actief</div>
                            </div>
                            <div className="glass-card text-center p-4 border-l-2 border-warning">
                                <div className="text-3xl font-bold mb-1 text-warning">{stats.pending}</div>
                                <div className="text-[10px] uppercase text-secondary font-bold tracking-wider">Wachtend</div>
                            </div>
                            <div className="glass-card text-center p-4 border-l-2 border-success">
                                <div className="text-3xl font-bold mb-1 text-success">{stats.completed}</div>
                                <div className="text-[10px] uppercase text-secondary font-bold tracking-wider">Voltooid</div>
                            </div>
                            <div className="glass-card text-center p-4 border-l-2 border-error">
                                <div className="text-3xl font-bold mb-1 text-error">{stats.failed}</div>
                                <div className="text-[10px] uppercase text-secondary font-bold tracking-wider">Mislukt</div>
                            </div>
                        </div>
                    )}

                    {/* Filter Tabs */}
                    <div className="flex gap-2 p-1 bg-white/5 rounded-lg border border-glass w-fit">
                        {[
                            { id: 'all', label: '📋 Alle' },
                            { id: 'processing', label: '⚙️ Actief' },
                            { id: 'pending', label: '⏳ Wachtend' },
                            { id: 'completed', label: '✅ Voltooid' },
                            { id: 'failed', label: '❌ Mislukt' }
                        ].map(f => (
                            <button
                                key={f.id}
                                className={`px-4 py-2 rounded-md text-sm transition-all ${filter === f.id ? 'bg-accent/20 text-accent font-bold ring-1 ring-accent/50' : 'text-secondary hover:text-white hover:bg-white/5'}`}
                                onClick={() => setFilter(f.id)}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>

                    {/* Jobs Split View */}
                    <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
                        {/* Jobs List */}
                        <div className="glass-card p-0 overflow-hidden flex flex-col h-[600px]">
                            <div className="p-4 border-b border-glass font-bold bg-white/5">
                                Recente Jobs
                            </div>
                            <div className="overflow-y-auto flex-1 p-2 space-y-2 custom-scrollbar">
                                {loading ? (
                                    <div className="p-8 text-center text-secondary">
                                        <div className="spinner mx-auto mb-2 text-accent">⚙️</div>
                                        Laden...
                                    </div>
                                ) : jobs.length === 0 ? (
                                    <div className="p-12 text-center text-secondary flex flex-col items-center">
                                        <div className="text-4xl mb-4">📭</div>
                                        <p className="mb-4">Geen jobs gevonden</p>
                                        <Link href="/batch">
                                            <button className="premium-button text-sm">Start Batch</button>
                                        </Link>
                                    </div>
                                ) : (
                                    jobs.map(job => (
                                        <div
                                            key={job.id}
                                            className={`p-4 rounded-lg border border-transparent cursor-pointer transition-all ${selectedJob?.id === job.id ? 'bg-accent/10 border-accent/30 shadow-lg' : 'hover:bg-white/5 hover:border-white/10'}`}
                                            onClick={() => setSelectedJob(job)}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="text-xl pt-1 min-w-[30px]">{getStatusIcon(job.status)}</div>
                                                <div className="flex-1">
                                                    <div className={`font-bold text-sm mb-1 ${selectedJob?.id === job.id ? 'text-white' : 'text-secondary'}`}>
                                                        {job.name || 'Job ' + job.id.substr(-6)}
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs text-secondary opacity-80">
                                                        <span>{formatDate(job.createdAt)}</span>
                                                        <span>{job.emailCount || 0} emails</span>
                                                    </div>

                                                    {job.results && (
                                                        <div className="flex gap-3 text-[10px] font-bold mt-2">
                                                            <span className="text-success">✅ {job.results.sent}</span>
                                                            {job.results.failed > 0 && <span className="text-error">❌ {job.results.failed}</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Job Detail */}
                        <div className="glass-card p-0 flex flex-col h-[600px]">
                            {selectedJob ? (
                                <>
                                    <div className="p-6 border-b border-glass flex justify-between items-start">
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-2xl">{getStatusIcon(selectedJob.status)}</span>
                                                <h2 className="text-xl font-bold">{selectedJob.name || 'Job Details'}</h2>
                                            </div>
                                            <span className={`badge ${selectedJob.status === 'completed' ? 'badge-success' : selectedJob.status === 'failed' ? 'badge-error' : selectedJob.status === 'processing' ? 'badge-info' : 'badge-warning'}`}>
                                                {selectedJob.status.toUpperCase()}
                                            </span>
                                        </div>
                                        <button
                                            className="text-muted hover:text-error transition-colors p-2"
                                            onClick={() => deleteJob(selectedJob.id)}
                                            title="Verwijder Job"
                                        >
                                            🗑️
                                        </button>
                                    </div>

                                    <div className="overflow-y-auto flex-1 p-6 custom-scrollbar">
                                        <div className="grid grid-cols-2 gap-6 mb-8">
                                            <div>
                                                <div className="text-xs text-secondary uppercase tracking-wider mb-1">Aangemaakt</div>
                                                <div className="font-mono text-sm">{formatDate(selectedJob.createdAt)}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-secondary uppercase tracking-wider mb-1">Laatste update</div>
                                                <div className="font-mono text-sm">{formatDate(selectedJob.updatedAt)}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-secondary uppercase tracking-wider mb-1">Totaal Emails</div>
                                                <div className="font-bold text-lg">{selectedJob.emailCount || 0}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-secondary uppercase tracking-wider mb-1">Job ID</div>
                                                <div className="font-mono text-xs text-secondary truncate" title={selectedJob.id}>{selectedJob.id}</div>
                                            </div>
                                        </div>

                                        {selectedJob.results && (
                                            <div className="mb-8">
                                                <h3 className="text-sm text-white font-bold mb-4 uppercase tracking-wider border-b border-glass pb-2">Resultaten</h3>
                                                <div className="flex gap-8">
                                                    <div className="text-center">
                                                        <div className="text-3xl font-bold text-success mb-1">{selectedJob.results.sent}</div>
                                                        <div className="text-xs text-secondary">Verstuurd</div>
                                                    </div>
                                                    <div className="text-center">
                                                        <div className="text-3xl font-bold text-error mb-1">{selectedJob.results.failed}</div>
                                                        <div className="text-xs text-secondary">Mislukt</div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {selectedJob.logs && selectedJob.logs.length > 0 && (
                                            <div>
                                                <h3 className="text-sm text-white font-bold mb-4 uppercase tracking-wider border-b border-glass pb-2">Logs</h3>
                                                <div className="bg-[#050510] rounded-lg p-4 font-mono text-xs text-gray-400 space-y-1 max-h-[250px] overflow-y-auto border border-glass custom-scrollbar shadow-inner">
                                                    {selectedJob.logs.slice().reverse().map((log, i) => (
                                                        <div key={i} className="flex gap-3">
                                                            <span className="text-sky-500/70 min-w-[50px]">
                                                                {new Date(log.timestamp).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                            <span className={log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : 'text-gray-300'}>
                                                                {log.message}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-secondary opacity-50 p-12">
                                    <div className="text-6xl mb-4">👈</div>
                                    <p>Selecteer een job uit de lijst om details te bekijken</p>
                                </div>
                            )}
                        </div>
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
               .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                  background: rgba(255,255,255,0.2);
               }
            `}</style>
        </Layout>
    );
}
