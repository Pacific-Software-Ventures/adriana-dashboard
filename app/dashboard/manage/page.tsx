'use client';

import { useState, useEffect } from 'react';
import {
  Link2,
  Copy,
  Check,
  ExternalLink,
  Users,
  RefreshCw,
  Trash2,
  Bot,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface Employee {
  name: string;
  template: string;
  status: string;
}

const templateColors: Record<string, string> = {
  cofounder: 'bg-purple-50 text-purple-600 border-purple-200',
  developer: 'bg-blue-50 text-blue-600 border-blue-200',
  'sales-sdr': 'bg-orange-50 text-orange-600 border-orange-200',
  analyst: 'bg-green-50 text-green-600 border-green-200',
  'infra-ops': 'bg-gray-50 text-gray-600 border-gray-200',
  assistant: 'bg-pink-50 text-pink-600 border-pink-200',
};

export default function DashboardManagePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientName, setClientName] = useState('');
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/employees')
      .then((r) => {
        if (r.status === 401) throw new Error('Not logged in — go to /admin/login first');
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setEmployees(data);
        else throw new Error('Not logged in — go to /admin/login first');
      })
      .catch((err) => setError(err.message || 'Failed to load employees'))
      .finally(() => setLoading(false));
  }, []);

  function toggleAgent(name: string) {
    setSelectedAgents((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  async function handleGenerate() {
    if (!clientName.trim() || selectedAgents.length === 0) {
      setError('Enter a client name and select at least one agent');
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/admin/dashboard-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: clientName.trim(),
          agents: selectedAgents,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setGeneratedUrl(data.url);
      } else {
        setError(data.error || 'Failed to generate');
      }
    } catch {
      setError('Failed to generate link');
    } finally {
      setGenerating(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleReset() {
    setClientName('');
    setSelectedAgents([]);
    setGeneratedUrl('');
    setError('');
    setCopied(false);
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      {/* Top bar */}
      <header className="border-b border-white/[0.06]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-ocean to-[#0dbdb8] flex items-center justify-center">
              <span className="text-white font-bold text-sm">P</span>
            </div>
            <span className="text-white font-semibold text-sm">PSV</span>
            <span className="text-white/20 text-sm">/ Dashboard Manager</span>
          </div>
          <Link
            href="/admin"
            className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            <ArrowLeft className="size-3" />
            Admin
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        {/* Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-ocean/20 to-[#0dbdb8]/20 mb-4">
            <Link2 className="size-7 text-ocean" />
          </div>
          <h1 className="text-2xl font-bold text-white">Client Dashboard Links</h1>
          <p className="text-sm text-white/40 mt-2 max-w-md mx-auto">
            Generate secure access links for clients to view their AI employees.
            Each link is valid for 30 days.
          </p>
        </div>

        {!generatedUrl ? (
          <div className="space-y-6">
            {/* Client Name */}
            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">
                Client Name
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g., Barbara, Acme Corp"
                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-white/20 focus:outline-none focus:border-ocean/40 focus:ring-2 focus:ring-ocean/10 transition-all"
              />
            </div>

            {/* Agent Selection */}
            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">
                Select Agents
              </label>

              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-14 rounded-xl bg-white/[0.02] animate-pulse"
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {employees.map((emp) => {
                    const isSelected = selectedAgents.includes(emp.name);
                    const color =
                      templateColors[emp.template] ||
                      'bg-gray-50 text-gray-600 border-gray-200';
                    const isRunning =
                      emp.status === 'running' || emp.status === 'active';

                    return (
                      <button
                        key={emp.name}
                        onClick={() => toggleAgent(emp.name)}
                        className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-left text-sm transition-all duration-200 ${
                          isSelected
                            ? 'bg-ocean/10 border-2 border-ocean/30'
                            : 'bg-white/[0.02] border-2 border-transparent hover:border-white/[0.06] hover:bg-white/[0.04]'
                        }`}
                      >
                        {/* Checkbox */}
                        <div
                          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                            isSelected
                              ? 'bg-ocean border-ocean'
                              : 'border-white/20'
                          }`}
                        >
                          {isSelected && (
                            <Check className="size-3 text-white" />
                          )}
                        </div>

                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center">
                          <Bot className="size-4 text-white/40" />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-white capitalize">
                            {emp.name}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span
                              className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${color}`}
                            >
                              {emp.template}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-white/30">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isRunning ? 'bg-emerald-400' : 'bg-red-400'
                                }`}
                              />
                              {isRunning ? 'Online' : 'Offline'}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Selected count */}
            {selectedAgents.length > 0 && (
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-white/30">
                  {selectedAgents.length} agent{selectedAgents.length > 1 ? 's' : ''} selected
                </span>
                <button
                  onClick={() => setSelectedAgents([])}
                  className="text-xs text-white/20 hover:text-white/40 flex items-center gap-1"
                >
                  <Trash2 className="size-3" />
                  Clear
                </button>
              </div>
            )}

            {error && (
              <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={generating || !clientName.trim() || selectedAgents.length === 0}
              className="w-full h-12 bg-gradient-to-r from-ocean to-[#0dbdb8] text-white hover:opacity-90 gap-2 text-sm font-semibold rounded-xl disabled:opacity-30"
            >
              {generating ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Link2 className="size-4" />
                  Generate Dashboard Link
                </>
              )}
            </Button>
          </div>
        ) : (
          /* ===== SUCCESS STATE ===== */
          <div className="space-y-6">
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 mb-4">
                <Check className="size-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Link Ready</h2>
              <p className="text-sm text-white/40">
                Share this link with <span className="text-white/60 font-medium">{clientName}</span>.
                Valid for 30 days.
              </p>

              {/* URL Box */}
              <div className="flex items-center gap-2 bg-white/[0.04] rounded-xl p-2 mt-6">
                <input
                  readOnly
                  value={generatedUrl}
                  className="flex-1 bg-transparent text-xs text-white/60 px-3 focus:outline-none truncate font-mono"
                />
                <button
                  onClick={handleCopy}
                  className="shrink-0 p-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/50 hover:text-white transition-colors"
                  title="Copy link"
                >
                  {copied ? (
                    <Check className="size-4 text-emerald-400" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </button>
                <a
                  href={generatedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/50 hover:text-white transition-colors"
                  title="Open dashboard"
                >
                  <ExternalLink className="size-4" />
                </a>
              </div>

              {/* Agents included */}
              <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
                <span className="text-[11px] text-white/20 uppercase tracking-wider mr-1">
                  Agents:
                </span>
                {selectedAgents.map((name) => (
                  <span
                    key={name}
                    className="px-2.5 py-1 rounded-lg bg-white/[0.04] text-xs text-white/50 font-medium capitalize"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={handleReset}
                className="text-sm text-white/30 hover:text-white/60 transition-colors flex items-center gap-1.5"
              >
                <Users className="size-4" />
                Generate Another
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
