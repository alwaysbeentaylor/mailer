// Global Navigation Component with Dropdown Menu
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

const navItems = [
    { href: '/', label: 'Home', icon: '🏠' },
    { href: '/batch', label: 'Batch', icon: '📦' },
    { href: '/campaigns', label: 'Campagnes', icon: '🚀' },
    { href: '/enrich', label: 'Enricher', icon: '🔍' },
    { href: '/analytics', label: 'Analytics', icon: '📊' },
    { href: '/warmup', label: 'Warm-up', icon: '🔥' },
    { href: '/dashboard', label: 'Dashboard', icon: '📈' },
    { href: '/templates', label: 'Templates', icon: '🎨' },
    { href: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Navigation({ dark = false }) {
    const [isOpen, setIsOpen] = useState(false);
    const [stats, setStats] = useState({ sent: 0 });
    const dropdownRef = useRef(null);
    const router = useRouter();

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Load sent count
    useEffect(() => {
        async function loadStats() {
            try {
                const res = await fetch('/api/jobs?stats=true');
                const data = await res.json();
                if (data.success && data.stats) {
                    setStats({ sent: data.stats.emailsSent || 0 });
                }
            } catch (e) {
                // Silent fail
            }
        }
        loadStats();
    }, []);

    // Close on route change
    useEffect(() => {
        setIsOpen(false);
    }, [router.pathname]);

    const currentPage = navItems.find(item => item.href === router.pathname);

    return (
        <>
            <nav className={`nav ${dark ? 'dark' : 'light'}`}>
                {/* Quick Links (visible items) */}
                <div className="nav-links">
                    {navItems.slice(0, 6).map(item => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`nav-link ${router.pathname === item.href ? 'active' : ''}`}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            <span className="nav-label">{item.label}</span>
                        </Link>
                    ))}
                </div>

                {/* Dropdown Menu */}
                <div className="dropdown-container" ref={dropdownRef}>
                    <button
                        className="dropdown-trigger"
                        onClick={() => setIsOpen(!isOpen)}
                    >
                        <span className="trigger-icon">☰</span>
                        <span className="trigger-text">Meer</span>
                    </button>

                    {isOpen && (
                        <div className="dropdown-menu">
                            <div className="dropdown-header">Navigatie</div>
                            {navItems.map(item => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`dropdown-item ${router.pathname === item.href ? 'active' : ''}`}
                                >
                                    <span className="item-icon">{item.icon}</span>
                                    <span className="item-label">{item.label}</span>
                                    {router.pathname === item.href && <span className="item-check">✓</span>}
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                {/* Sent Counter */}
                <div className="sent-counter">
                    <span className="sent-count">{stats.sent}</span>
                    <span className="sent-label">SENT</span>
                    <span className="sent-dot"></span>
                </div>
            </nav>

            <style jsx>{`
        .nav {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          background: ${dark ? '#0f172a' : 'white'};
          border-bottom: 1px solid ${dark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'};
        }

        .nav-links {
          display: flex;
          gap: 4px;
          flex: 1;
        }

        .nav-link {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 8px;
          text-decoration: none;
          color: ${dark ? '#94a3b8' : '#64748b'};
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .nav-link:hover {
          background: ${dark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'};
          color: ${dark ? '#fff' : '#1e293b'};
        }

        .nav-link.active {
          background: ${dark ? 'rgba(59,130,246,0.15)' : '#eff6ff'};
          color: ${dark ? '#60a5fa' : '#3b82f6'};
        }

        .nav-icon { font-size: 14px; }
        .nav-label { }

        .dropdown-container {
          position: relative;
        }

        .dropdown-trigger {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: ${dark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'};
          border: 1px solid ${dark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'};
          border-radius: 8px;
          color: ${dark ? '#94a3b8' : '#64748b'};
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .dropdown-trigger:hover {
          background: ${dark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'};
          color: ${dark ? '#fff' : '#1e293b'};
        }

        .trigger-icon { font-size: 14px; }

        .dropdown-menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          min-width: 200px;
          background: ${dark ? '#1e293b' : 'white'};
          border: 1px solid ${dark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'};
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,${dark ? '0.4' : '0.15'});
          overflow: hidden;
          z-index: 1000;
          animation: slideDown 0.15s ease;
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .dropdown-header {
          padding: 12px 16px 8px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: ${dark ? '#64748b' : '#94a3b8'};
        }

        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px;
          text-decoration: none;
          color: ${dark ? '#e2e8f0' : '#1e293b'};
          font-size: 14px;
          transition: all 0.15s;
        }

        .dropdown-item:hover {
          background: ${dark ? 'rgba(255,255,255,0.05)' : '#f8fafc'};
        }

        .dropdown-item.active {
          background: ${dark ? 'rgba(59,130,246,0.15)' : '#eff6ff'};
          color: ${dark ? '#60a5fa' : '#3b82f6'};
        }

        .item-icon { font-size: 16px; }
        .item-label { flex: 1; }
        .item-check { 
          color: #22c55e;
          font-size: 12px;
        }

        .sent-counter {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: ${dark ? 'rgba(34,197,94,0.15)' : '#f0fdf4'};
          border-radius: 20px;
          margin-left: 8px;
        }

        .sent-count {
          font-weight: 700;
          font-size: 14px;
          color: ${dark ? '#4ade80' : '#16a34a'};
        }

        .sent-label {
          font-size: 10px;
          font-weight: 600;
          color: ${dark ? '#4ade80' : '#16a34a'};
          letter-spacing: 0.5px;
        }

        .sent-dot {
          width: 8px;
          height: 8px;
          background: #22c55e;
          border-radius: 50%;
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @media (max-width: 900px) {
          .nav-links { display: none; }
          .trigger-text { display: inline; }
        }

        @media (min-width: 901px) {
          .trigger-text { display: none; }
        }
      `}</style>
        </>
    );
}
