
import { WARMUP_PROFILES } from '../utils/warmupProfiles';

export default function WarmupStatus({ summary, compact = false }) {
  if (!summary) return null;

  const {
    enabled,
    paused,
    profileName,
    currentPhase,
    totalPhases,
    dailyLimit,
    todaySent,
    remaining,
    progress,
    daysRemaining,
    isComplete
  } = summary;

  if (!enabled) {
    return (
      <div className={`p-4 rounded-xl border border-glass flex items-center gap-2 ${compact ? 'py-2 px-3 text-sm' : ''} bg-white/5 opacity-60`}>
        <span className="text-lg">❄️</span>
        <span className="text-secondary">Warm-up uit</span>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className={`p-4 rounded-xl border border-success/30 flex items-center gap-2 ${compact ? 'py-2 px-3 text-sm' : ''} bg-success/10`}>
        <span className="text-lg">🔥</span>
        <span className="text-success font-bold">Volledig opgewarmd</span>
      </div>
    );
  }

  if (paused) {
    return (
      <div className={`p-4 rounded-xl border border-warning/30 flex items-center gap-2 ${compact ? 'py-2 px-3 text-sm' : ''} bg-warning/10`}>
        <span className="text-lg">⏸️</span>
        <span className="text-warning font-bold">Gepauzeerd</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="flex items-center gap-2 min-w-[80px]">
          <span>🔥</span>
          <span className="text-accent text-sm font-bold">{remaining} over</span>
        </div>
        <div className="flex-1 h-3 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/5 border border-glass rounded-xl p-5">
      <div className="flex justify-between items-center mb-4">
        <span className="text-xs text-secondary uppercase tracking-wider font-bold">{profileName}</span>
        <span className="badge badge-info">Fase {currentPhase}/{totalPhases}</span>
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-sm text-secondary mb-2">
          <span>Vandaag: {todaySent}/{dailyLimit}</span>
          <span className="text-accent font-bold">{remaining} over</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 to-blue-600 shadow-lg shadow-cyan-500/50 transition-all duration-300"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      </div>

      {remaining === 0 && (
        <div className="mb-3 p-2 bg-warning/10 border border-warning/20 rounded text-warning text-xs font-bold text-center">
          ⚠️ Dagelijks limiet bereikt
        </div>
      )}

      <div className="text-xs text-secondary text-right">
        {daysRemaining > 0 ? (
          <span>📅 Volledig over {daysRemaining} dagen</span>
        ) : (
          <span className="text-success">✅ Warm-up bijna compleet</span>
        )}
      </div>
    </div>
  );
}
