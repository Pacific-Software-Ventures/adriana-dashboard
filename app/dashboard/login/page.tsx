'use client';

import { useState } from 'react';
import { Loader2, ArrowRight } from 'lucide-react';

export default function DashboardLoginPage() {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !password.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/dashboard/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      localStorage.setItem('psv_dashboard_token', data.token);
      document.cookie = `psv_dashboard_token=${data.token}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`;
      window.location.href = '/dashboard';
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#0f9e9a] mb-5">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-[#111827]">Welcome back</h1>
          <p className="text-sm text-[#6b7280] mt-1.5">Sign in to your AI dashboard</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <label className="block text-[13px] text-[#6b7280] mb-1.5">
              Account name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-3 rounded-xl bg-white border border-[#d1d5db] text-[#111827] text-sm placeholder-[#9ca3af] focus:outline-none focus:border-[#0f9e9a] transition-colors"
            />
          </div>

          <div>
            <label className="block text-[13px] text-[#6b7280] mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full px-4 py-3 rounded-xl bg-white border border-[#d1d5db] text-[#111827] text-sm placeholder-[#9ca3af] focus:outline-none focus:border-[#0f9e9a] transition-colors"
            />
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !name || !password.trim()}
            className="w-full flex items-center justify-center gap-2 h-12 bg-[#0f9e9a] text-white font-medium rounded-xl hover:bg-[#0dbdb8] transition-colors disabled:opacity-30 text-sm mt-2"
          >
            {loading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                Continue
                <ArrowRight className="size-4" />
              </>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-[#9ca3af] mt-6">
          Contact your PSV account manager if you need access.
        </p>
      </div>
    </div>
  );
}
