'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Send,
  Plus,
  MessageSquare,
  Loader2,
  Zap,
  Activity,
  FileText,
  Target,
  Mail,
  Search,
  CheckCircle2,
  LayoutDashboard,
  Clock,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Trash2,
  FolderPlus,
  FolderOpen,
  X,
  ArrowRight,
  Check,
  Shield,
  Cpu,
  ArrowUpRight,
  CircleDot,
  Workflow,
  LogOut,
  FolderClosed,
  Download,
  Eye,
  FileSpreadsheet,
  FileCode2,
  Image as ImageIcon,
  Calendar,
  HardDrive,
  Filter,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  Hash,
  List,
  Paperclip,
} from 'lucide-react';

// ============================================================================
// Markdown renderer — headings, tables, lists, code blocks, blockquotes
// ============================================================================

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let k = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);
    const codeMatch = remaining.match(/`([^`]+)`/);
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

    let earliest: { match: RegExpMatchArray; type: string } | null = null;
    for (const [type, m] of [['bold', boldMatch], ['italic', italicMatch], ['code', codeMatch], ['link', linkMatch]] as const) {
      if (m && m.index !== undefined && (!earliest || m.index < earliest.match.index!)) {
        earliest = { match: m, type };
      }
    }

    if (!earliest) {
      parts.push(remaining);
      break;
    }

    const idx = earliest.match.index!;
    if (idx > 0) parts.push(remaining.slice(0, idx));

    const key = `${keyPrefix}-${k++}`;
    if (earliest.type === 'bold') {
      parts.push(<strong key={key} className="font-semibold text-[#111827]">{earliest.match[1]}</strong>);
    } else if (earliest.type === 'italic') {
      parts.push(<em key={key} className="italic text-[#4b5563]">{earliest.match[1]}</em>);
    } else if (earliest.type === 'code') {
      parts.push(<code key={key} className="bg-[#e5e7eb] px-1.5 py-0.5 rounded text-[13px] text-[#1f2937] font-mono">{earliest.match[1]}</code>);
    } else if (earliest.type === 'link') {
      parts.push(<a key={key} href={earliest.match[2]} target="_blank" rel="noopener noreferrer" className="text-[#0f9e9a] hover:underline">{earliest.match[1]}</a>);
    }

    remaining = remaining.slice(idx + earliest.match[0].length);
  }

  return parts;
}

function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code block ```
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <div key={`cb-${i}`} className="my-3 rounded-lg overflow-hidden">
          {lang && <div className="bg-[#e0e1e6] px-4 py-1.5 text-[11px] text-[#4b5563] font-mono border-b border-[#c0c4cc]">{lang}</div>}
          <pre className="bg-[#e8e8ec] px-4 py-3 overflow-x-auto">
            <code className="text-[13px] text-[#1f2937] font-mono leading-relaxed">{codeLines.join('\n')}</code>
          </pre>
        </div>
      );
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      elements.push(<hr key={`hr-${i}`} className="border-[#c0c4cc] my-4" />);
      i++;
      continue;
    }

    // Headings
    const h1Match = trimmed.match(/^#\s+(.+)/);
    const h2Match = trimmed.match(/^##\s+(.+)/);
    const h3Match = trimmed.match(/^###\s+(.+)/);
    const h4Match = trimmed.match(/^####\s+(.+)/);
    if (h1Match) {
      elements.push(<h1 key={`h-${i}`} className="text-xl font-bold text-[#111827] mt-5 mb-2">{renderInline(h1Match[1], `h1-${i}`)}</h1>);
      i++; continue;
    }
    if (h2Match) {
      elements.push(<h2 key={`h-${i}`} className="text-lg font-semibold text-[#111827] mt-5 mb-2 pb-1 border-b border-[#c0c4cc]">{renderInline(h2Match[1], `h2-${i}`)}</h2>);
      i++; continue;
    }
    if (h3Match) {
      elements.push(<h3 key={`h-${i}`} className="text-base font-semibold text-[#111827] mt-4 mb-1.5">{renderInline(h3Match[1], `h3-${i}`)}</h3>);
      i++; continue;
    }
    if (h4Match) {
      elements.push(<h4 key={`h-${i}`} className="text-sm font-semibold text-[#111827] mt-3 mb-1">{renderInline(h4Match[1], `h4-${i}`)}</h4>);
      i++; continue;
    }

    // Table — collect all | rows
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableRows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableRows.push(lines[i].trim());
        i++;
      }
      // Parse cells
      const parsedRows = tableRows
        .filter((r) => !/^\|[\s-:|]+\|$/.test(r)) // skip separator row
        .map((r) => r.slice(1, -1).split('|').map((c) => c.trim()));

      if (parsedRows.length > 0) {
        const header = parsedRows[0];
        const body = parsedRows.slice(1);
        elements.push(
          <div key={`tbl-${i}`} className="my-3 overflow-x-auto rounded-lg border border-[#c0c4cc]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f0f0f0]">
                  {header.map((cell, ci) => (
                    <th key={ci} className="px-4 py-2.5 text-left text-xs font-semibold text-[#4b5563] uppercase tracking-wider border-b border-[#c0c4cc]">
                      {renderInline(cell, `th-${i}-${ci}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? 'bg-[#f9fafb]' : 'bg-[#f0f1f3]'}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-4 py-2 text-[#4b5563] border-b border-[#c0c4cc]">
                        {renderInline(cell, `td-${i}-${ri}-${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      elements.push(
        <blockquote key={`bq-${i}`} className="my-3 pl-4 border-l-3 border-[#0f9e9a] text-[#4b5563] italic">
          {quoteLines.map((ql, qi) => <div key={qi}>{renderInline(ql, `bq-${i}-${qi}`)}</div>)}
        </blockquote>
      );
      continue;
    }

    // Numbered list
    const olMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (olMatch) {
      const items: { num: string; text: string }[] = [];
      while (i < lines.length) {
        const m = lines[i].trim().match(/^(\d+)\.\s+(.+)/);
        if (!m) break;
        items.push({ num: m[1], text: m[2] });
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="my-2 space-y-1 pl-1">
          {items.map((item, ii) => (
            <li key={ii} className="flex gap-2.5">
              <span className="text-[#0f9e9a] font-medium shrink-0 w-5 text-right">{item.num}.</span>
              <span>{renderInline(item.text, `ol-${i}-${ii}`)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Bullet list
    const ulMatch = trimmed.match(/^[-•*]\s+(.+)/);
    if (ulMatch) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].trim().match(/^[-•*]\s+(.+)/);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="my-2 space-y-1 pl-1">
          {items.map((item, ii) => (
            <li key={ii} className="flex gap-2.5">
              <span className="text-[#0f9e9a] mt-2 shrink-0">
                <svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor"><circle cx="3" cy="3" r="3" /></svg>
              </span>
              <span>{renderInline(item, `ul-${i}-${ii}`)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Empty line
    if (trimmed === '') {
      elements.push(<div key={`sp-${i}`} className="h-2" />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(<p key={`p-${i}`}>{renderInline(trimmed, `p-${i}`)}</p>);
    i++;
  }

  return <>{elements}</>;
}

// ============================================================================
// Types
// ============================================================================

interface ChatSession {
  id: string;
  title: string;
  updated_at: string;
  message_count: number;
  preview: string;
  last_sender?: string | null;
  project?: string | null;
  subfolder?: string | null;
}

interface Subfolder {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  subfolders?: Subfolder[];
  instructions?: string;
  email?: string;
  doc_url?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sender?: string;
  attachment?: {
    name: string;
    size: number;
    type: string;
    path: string;
  };
}

interface AgentStats {
  deliverables: number;
  tasks_completed: number;
  leads_found: number;
  emails_sent: number;
  research_items: number;
}

interface ActivityEntry {
  type: string;
  description: string;
}

interface AgentData {
  name: string;
  displayName: string;
  template: string;
  status: string;
  bot_username: string;
  email: string;
  identity: string;
  active_task: string;
  heartbeat: string;
  activity: ActivityEntry[];
  stats: AgentStats;
  skills: string[];
  last_active?: string;
}

interface DashboardData {
  client: string;
  agents: AgentData[];
}

type MainView = 'overview' | 'chat' | 'documents' | 'project';

// ============================================================================
// Config
// ============================================================================

const templateGradients: Record<string, string> = {
  cofounder: 'from-violet-500 to-purple-600',
  developer: 'from-blue-500 to-cyan-500',
  'sales-sdr': 'from-orange-500 to-amber-500',
  analyst: 'from-emerald-500 to-green-500',
  'infra-ops': 'from-slate-500 to-gray-600',
  assistant: 'from-pink-500 to-rose-500',
};

const templateLabels: Record<string, string> = {
  cofounder: 'Co-Founder',
  developer: 'Developer',
  'sales-sdr': 'Sales Rep',
  analyst: 'Analyst',
  'infra-ops': 'Infra/Ops',
  assistant: 'Assistant',
};

const activityTypeConfig: Record<string, { icon: typeof Zap; color: string; label: string }> = {
  deliverable: { icon: FileText, color: 'text-blue-400', label: 'Deliverable' },
  task: { icon: CheckCircle2, color: 'text-emerald-400', label: 'Task' },
  lead: { icon: Target, color: 'text-amber-400', label: 'Lead' },
  email: { icon: Mail, color: 'text-purple-400', label: 'Email' },
  research: { icon: Search, color: 'text-cyan-400', label: 'Research' },
};

// ============================================================================
// Helpers
// ============================================================================

function formatRelative(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function formatLastActive(timestamp?: string): string {
  if (!timestamp) return 'Unknown';
  const ts = parseInt(timestamp);
  if (!ts || isNaN(ts)) return 'Unknown';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'Active now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function groupSessionsByDate(sessions: ChatSession[]): { label: string; sessions: ChatSession[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const weekAgo = today - 7 * 86400000;

  const groups: Record<string, ChatSession[]> = {
    Today: [],
    Yesterday: [],
    'Previous 7 days': [],
    Older: [],
  };

  sessions.forEach((s) => {
    const t = new Date(s.updated_at).getTime();
    if (t >= today) groups['Today'].push(s);
    else if (t >= yesterday) groups['Yesterday'].push(s);
    else if (t >= weekAgo) groups['Previous 7 days'].push(s);
    else groups['Older'].push(s);
  });

  return Object.entries(groups)
    .filter(([, v]) => v.length > 0)
    .map(([label, sessions]) => ({ label, sessions }));
}

// ============================================================================
// Document helpers
// ============================================================================

interface DocFile {
  id: string;
  name: string;
  path: string;
  folder: string;
  agent: string;
  type: string;
  ext: string;
  size: number;
  created: number;
  modified: number;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  size?: number;
  modifiedTime?: string;
  parentId?: string | null;
}

const fileTypeIcons: Record<string, { icon: typeof FileText; color: string }> = {
  pdf: { icon: FileText, color: 'text-red-400' },
  word: { icon: FileText, color: 'text-blue-400' },
  spreadsheet: { icon: FileSpreadsheet, color: 'text-emerald-400' },
  presentation: { icon: FileText, color: 'text-orange-400' },
  image: { icon: ImageIcon, color: 'text-purple-400' },
  text: { icon: FileText, color: 'text-[#4b5563]' },
  data: { icon: FileCode2, color: 'text-yellow-400' },
  code: { icon: FileCode2, color: 'text-cyan-400' },
  archive: { icon: HardDrive, color: 'text-[#4b5563]' },
  file: { icon: FileText, color: 'text-[#4b5563]' },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function formatMessageTime(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  if (diffDays === 0) return time;
  if (diffDays === 1) return `Yesterday ${time}`;
  if (diffDays < 7) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}

function formatDateISO(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function driveFileTypeInfo(mimeType: string): { label: string; icon: typeof FileText; color: string } {
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) {
    return { label: 'Sheet', icon: FileSpreadsheet, color: 'text-emerald-400' };
  }
  if (mimeType.includes('document') || mimeType.includes('word')) {
    return { label: 'Doc', icon: FileText, color: 'text-blue-400' };
  }
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
    return { label: 'Slides', icon: FileText, color: 'text-orange-400' };
  }
  if (mimeType.includes('pdf')) {
    return { label: 'PDF', icon: FileText, color: 'text-red-400' };
  }
  if (mimeType.includes('image')) {
    return { label: 'Image', icon: ImageIcon, color: 'text-purple-400' };
  }
  if (mimeType.includes('folder')) {
    return { label: 'Folder', icon: FolderOpen, color: 'text-[#0f9e9a]' };
  }
  if (mimeType.includes('form')) {
    return { label: 'Form', icon: FileText, color: 'text-violet-400' };
  }
  if (mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('yaml')) {
    return { label: 'Data', icon: FileCode2, color: 'text-yellow-400' };
  }
  if (mimeType.includes('text') || mimeType.includes('plain')) {
    return { label: 'Text', icon: FileText, color: 'text-[#4b5563]' };
  }
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('archive')) {
    return { label: 'Archive', icon: HardDrive, color: 'text-[#4b5563]' };
  }
  return { label: 'File', icon: FileText, color: 'text-[#4b5563]' };
}

// ============================================================================
// OVERVIEW VIEW
// ============================================================================

function OverviewView({ agents, client }: { agents: AgentData[]; client: string }) {
  const runningCount = agents.filter((a) => a.status === 'running' || a.status === 'active').length;
  const totalDeliverables = agents.reduce((sum, a) => sum + (a.stats?.deliverables || 0), 0);
  const totalTasks = agents.reduce((sum, a) => sum + (a.stats?.tasks_completed || 0), 0);
  const totalLeads = agents.reduce((sum, a) => sum + (a.stats?.leads_found || 0), 0);
  const totalEmails = agents.reduce((sum, a) => sum + (a.stats?.emails_sent || 0), 0);
  const totalResearch = agents.reduce((sum, a) => sum + (a.stats?.research_items || 0), 0);
  const totalWork = totalDeliverables + totalTasks + totalLeads + totalEmails + totalResearch;

  const allActivity = agents.flatMap((a) =>
    (a.activity || []).map((entry) => ({ ...entry, agentName: a.displayName, agentTemplate: a.template }))
  );

  return (
    <div className="flex-1 overflow-y-auto bg-[#f9fafb]">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">

        {/* Hero */}
        <div>
          <h1 className="text-3xl font-semibold text-[#111827] tracking-tight">
            Welcome back, {client}
          </h1>
          <p className="text-[15px] text-[#4b5563] mt-2">
            {runningCount === agents.length
              ? `All ${agents.length} of your AI employees are online and working.`
              : `${runningCount} of ${agents.length} employees online.`}
            {totalWork > 0 && ` ${totalWork} actions completed today.`}
          </p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Employees', value: agents.length, icon: Cpu, color: 'text-blue-400' },
            { label: 'Online', value: runningCount, icon: Activity, color: 'text-emerald-400' },
            { label: 'Deliverables', value: totalDeliverables, icon: FileText, color: 'text-violet-400' },
            { label: 'Tasks Done', value: totalTasks, icon: CheckCircle2, color: 'text-cyan-400' },
            { label: 'Leads Found', value: totalLeads, icon: Target, color: 'text-amber-400' },
            { label: 'Emails Sent', value: totalEmails, icon: Mail, color: 'text-rose-400' },
          ].map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.label} className="rounded-xl bg-[#f0f1f3] border border-[#c0c4cc] p-4">
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`size-4 ${m.color}`} />
                </div>
                <p className="text-2xl font-semibold text-[#111827] tabular-nums">{m.value}</p>
                <p className="text-xs text-[#4b5563] mt-1">{m.label}</p>
              </div>
            );
          })}
        </div>

        {/* Agent cards */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-[#111827]">Your Employees</h2>

          <div className={`grid gap-4 ${agents.length === 1 ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
            {agents.map((agent) => {
              const gradient = templateGradients[agent.template] || 'from-[#0f9e9a] to-[#0dbdb8]';
              const isRunning = agent.status === 'running' || agent.status === 'active';
              const nonZeroStats = [
                { v: agent.stats?.deliverables || 0, l: 'Deliverables', icon: FileText, color: 'text-violet-400' },
                { v: agent.stats?.tasks_completed || 0, l: 'Tasks', icon: CheckCircle2, color: 'text-emerald-400' },
                { v: agent.stats?.leads_found || 0, l: 'Leads', icon: Target, color: 'text-amber-400' },
                { v: agent.stats?.emails_sent || 0, l: 'Emails', icon: Mail, color: 'text-rose-400' },
                { v: agent.stats?.research_items || 0, l: 'Research', icon: Search, color: 'text-cyan-400' },
              ].filter((s) => s.v > 0);

              return (
                <div key={agent.name} className="rounded-xl bg-[#f0f1f3] border border-[#c0c4cc] overflow-hidden hover:border-[#9ca3af] transition-colors">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0`}>
                          <span className="text-white font-bold text-sm">{agent.displayName.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-semibold text-[#111827] capitalize">{agent.displayName}</h3>
                            <span className={`inline-flex items-center gap-1 text-xs ${isRunning ? 'text-emerald-400' : 'text-red-400'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-red-400'}`} />
                              {isRunning ? 'Online' : 'Offline'}
                            </span>
                          </div>
                          <p className="text-sm text-[#4b5563] mt-0.5">
                            {templateLabels[agent.template] || agent.template}
                            {agent.last_active && <span> · {formatLastActive(agent.last_active)}</span>}
                          </p>
                        </div>
                      </div>
                      {agent.bot_username && (
                        <a
                          href={`https://t.me/${agent.bot_username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#e5e7eb] hover:bg-[#d1d5db] text-[#4b5563] hover:text-[#111827] text-xs transition-colors"
                        >
                          <ExternalLink className="size-3" />
                          Telegram
                        </a>
                      )}
                    </div>

                    {agent.identity && (
                      <p className="text-sm text-[#4b5563] mt-3 italic leading-relaxed">&ldquo;{agent.identity}&rdquo;</p>
                    )}
                  </div>

                  {/* Stats */}
                  {nonZeroStats.length > 0 && (
                    <div className="mx-5 mb-4 rounded-lg bg-[#f0f1f3] border border-[#c0c4cc] overflow-hidden">
                      <div className="flex divide-x divide-[#e5e7eb]">
                        {nonZeroStats.map((s) => {
                          const SIcon = s.icon;
                          return (
                            <div key={s.l} className="flex-1 py-3 px-3 text-center">
                              <SIcon className={`size-3.5 ${s.color} mx-auto mb-1`} />
                              <p className="text-lg font-semibold text-[#111827] tabular-nums">{s.v}</p>
                              <p className="text-[11px] text-[#4b5563]">{s.l}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Active task / heartbeat */}
                  <div className="px-5 pb-5 space-y-2">
                    {agent.active_task && (
                      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[#f0f1f3] border border-[#c0c4cc]">
                        <Zap className="size-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-[#4b5563] mb-0.5">Currently working on</p>
                          <p className="text-sm text-[#4b5563] leading-relaxed">{agent.active_task}</p>
                        </div>
                      </div>
                    )}
                    {agent.heartbeat && (
                      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[#f0f1f3] border border-[#c0c4cc]">
                        <Activity className="size-4 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-[#4b5563] mb-0.5">Latest update</p>
                          <p className="text-sm text-[#4b5563] leading-relaxed">{agent.heartbeat}</p>
                        </div>
                      </div>
                    )}

                    {/* Capabilities */}
                    {(() => {
                      const capsByTemplate: Record<string, string[]> = {
                        developer: ['Backend Development', 'Frontend & Design', 'Mobile Apps', 'API Integrations', 'Database Management', 'DevOps & Deployment'],
                        cofounder: ['Strategy & Planning', 'Market Research', 'Business Development', 'Financial Analysis', 'Team Coordination', 'Decision Support'],
                        'sales-sdr': ['Lead Generation', 'Outbound Outreach', 'Market Research', 'CRM Management', 'Sales Strategy', 'Content Creation'],
                        analyst: ['Data Analysis', 'Reporting & Dashboards', 'Market Intelligence', 'Trend Forecasting', 'Competitive Research', 'KPI Tracking'],
                        'infra-ops': ['Infrastructure Management', 'Monitoring & Alerts', 'Security & Compliance', 'Performance Optimization', 'Incident Response', 'Cost Management'],
                        assistant: ['Scheduling & Calendar', 'Email Management', 'Document Preparation', 'Research & Summaries', 'Task Coordination', 'Communication'],
                      };
                      const caps = capsByTemplate[agent.template] || ['Research', 'Analysis', 'Task Execution', 'Reporting', 'Communication'];
                      return (
                        <div className="pt-1">
                          <p className="text-xs text-[#4b5563] mb-2 flex items-center gap-1.5">
                            <Workflow className="size-3.5" />
                            Capabilities
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {caps.map((c) => (
                              <span key={c} className="px-2 py-0.5 rounded-md bg-[#e5e7eb] text-xs text-[#4b5563]">
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Activity feed */}
        {allActivity.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#111827] flex items-center gap-2">
                <Clock className="size-4 text-[#4b5563]" />
                Today&apos;s Activity
              </h2>
              <span className="text-sm text-[#4b5563]">{allActivity.length} actions</span>
            </div>

            <div className="rounded-xl bg-[#f0f1f3] border border-[#c0c4cc] overflow-hidden divide-y divide-[#e5e7eb]">
              {allActivity.slice(0, 15).map((entry, i) => {
                const cfg = activityTypeConfig[entry.type] || activityTypeConfig.task;
                const Icon = cfg.icon;
                const agentGradient = templateGradients[entry.agentTemplate] || 'from-[#0f9e9a] to-[#0dbdb8]';
                return (
                  <div key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-[#e5e7eb] transition-colors">
                    <Icon className={`size-4 ${cfg.color} shrink-0 mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#4b5563] leading-relaxed">{entry.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className={`w-4 h-4 rounded-full bg-gradient-to-br ${agentGradient} flex items-center justify-center`}>
                          <span className="text-[7px] font-bold text-white uppercase">{entry.agentName.charAt(0)}</span>
                        </div>
                        <span className="text-xs text-[#4b5563] capitalize">{entry.agentName}</span>
                        <span className="text-[#d1d5db]">&middot;</span>
                        <span className={`text-[11px] ${cfg.color}`}>{cfg.label}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {allActivity.length > 15 && (
                <div className="px-4 py-3 text-center">
                  <span className="text-sm text-[#4b5563]">+{allActivity.length - 15} more actions today</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}

// ============================================================================
// DOCUMENTS VIEW
// ============================================================================

function DocumentsView({
  agents,
  client,
  authHeaders,
  projects: projectList,
}: {
  agents: AgentData[];
  client: string;
  authHeaders: () => Record<string, string>;
  projects: Project[];
}) {
  const [documents, setDocuments] = useState<DocFile[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [filterFolder, setFilterFolder] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [driveView, setDriveView] = useState<'local' | 'drive'>('local');
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveAvailable, setDriveAvailable] = useState(true);
  const [driveMessage, setDriveMessage] = useState('');
  const [driveAgent, setDriveAgent] = useState<string>(agents[0]?.name || '');
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null);
  const [driveFolderStack, setDriveFolderStack] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = filterAgent !== 'all' ? `?agent=${filterAgent}` : '';
        const res = await fetch(`/api/dashboard/documents${params}`, {
          headers: authHeaders(),
        });
        const data = await res.json();
        setDocuments(data.documents || []);
        setFolders(data.folders || []);
      } catch {
        setDocuments([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filterAgent, authHeaders]);

  const loadDriveFiles = useCallback(async (agentName: string, folderId?: string | null) => {
    setDriveLoading(true);
    try {
      const params = new URLSearchParams({ agent: agentName });
      if (folderId) params.set('folder', folderId);
      const res = await fetch(`/api/dashboard/drive?${params}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      setDriveFiles(data.files || []);
      setDriveAvailable(data.available !== false);
      setDriveMessage(data.message || '');
    } catch {
      setDriveFiles([]);
      setDriveAvailable(false);
      setDriveMessage('Failed to load Drive files.');
    } finally {
      setDriveLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (driveView === 'drive' && driveAgent) {
      loadDriveFiles(driveAgent, driveFolderId);
    }
  }, [driveView, driveAgent, driveFolderId, loadDriveFiles]);

  function handleDriveNavigate(file: DriveFile) {
    if (file.mimeType === 'application/vnd.google-apps.folder') {
      setDriveFolderStack((prev) => [...prev, { id: file.id, name: file.name }]);
      setDriveFolderId(file.id);
    } else {
      // Proxy download through our server so users don't need Google Drive access
      const token = localStorage.getItem('psv_dashboard_token') || '';
      const params = new URLSearchParams({
        agent: driveAgent,
        id: file.id,
        name: file.name,
        mime: file.mimeType,
        token,
      });
      window.open(`/api/dashboard/drive/download?${params}`, '_blank', 'noopener,noreferrer');
    }
  }

  function handleDriveBack() {
    const newStack = [...driveFolderStack];
    newStack.pop();
    setDriveFolderStack(newStack);
    setDriveFolderId(newStack.length > 0 ? newStack[newStack.length - 1].id : null);
  }

  const filteredDriveFiles = driveFiles.filter((f) => {
    if (!searchQuery) return true;
    return f.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const filtered = documents.filter((d) => {
    if (filterFolder !== 'all' && d.folder !== filterFolder) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return d.name.toLowerCase().includes(q) || d.folder.toLowerCase().includes(q);
    }
    return true;
  });

  // Build grouped docs — start with project names as empty folders, then fill with docs
  const grouped = filtered.reduce<Record<string, DocFile[]>>((acc, doc) => {
    // Try to match doc folder to a project name
    const matchedProject = projectList.find((p) => doc.folder.toLowerCase() === p.name.toLowerCase());
    const key = matchedProject ? matchedProject.name : (doc.folder || 'General');
    if (!acc[key]) acc[key] = [];
    acc[key].push(doc);
    return acc;
  }, {});

  // Ensure every project has a folder entry even if empty
  for (const p of projectList) {
    if (!grouped[p.name]) grouped[p.name] = [];
  }
  // Ensure "General" exists for unmatched docs
  if (!grouped['General']) grouped['General'] = [];

  function handleDownload(doc: DocFile) {
    const token = localStorage.getItem('psv_dashboard_token') || '';
    window.open(`/api/dashboard/documents/download?path=${encodeURIComponent(doc.path)}&token=${token}`, '_blank');
  }

  function handlePreview(doc: DocFile) {
    const token = localStorage.getItem('psv_dashboard_token') || '';
    window.open(`/api/dashboard/documents/download?path=${encodeURIComponent(doc.path)}&token=${token}`, '_blank');
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#f9fafb]">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-[#111827] mb-1">Documents</h1>
          <p className="text-sm text-[#4b5563]">Files and deliverables created by your AI employees</p>
        </div>

        {/* Source Toggle */}
        <div className="flex items-center gap-1 mb-6 p-1 rounded-lg bg-[#f0f1f3] border border-[#c0c4cc] w-fit">
          <button
            onClick={() => setDriveView('local')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${driveView === 'local' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#4b5563] hover:text-[#111827]'}`}
          >
            <HardDrive className="size-4" />
            Files
          </button>
          <button
            onClick={() => setDriveView('drive')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${driveView === 'drive' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#4b5563] hover:text-[#111827]'}`}
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 19.5h20L12 2z" />
              <path d="M2 19.5l5-8.5h10" />
              <path d="M22 19.5l-5-8.5H7" />
            </svg>
            Google Drive
          </button>
        </div>

        {driveView === 'drive' ? (
          <>
            {/* Drive Agent Selector + Search */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="flex-1 min-w-[200px] max-w-md relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#4b5563]" />
                <input
                  type="text"
                  placeholder="Search Drive files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#f0f1f3] border border-[#c0c4cc] text-sm text-[#111827] placeholder-[#9ca3af] placeholder:font-normal focus:outline-none focus:border-[#0f9e9a] transition-colors"
                />
              </div>
              <div className="relative">
                <select
                  value={driveAgent}
                  onChange={(e) => {
                    setDriveAgent(e.target.value);
                    setDriveFolderId(null);
                    setDriveFolderStack([]);
                  }}
                  className="appearance-none pl-4 pr-8 py-2.5 rounded-lg bg-[#f0f1f3] border border-[#c0c4cc] text-sm text-[#4b5563] focus:outline-none focus:border-[#0f9e9a] cursor-pointer"
                >
                  {agents.map((a) => (
                    <option key={a.name} value={a.name}>{a.displayName}</option>
                  ))}
                </select>
                <Filter className="absolute right-3 top-1/2 -translate-y-1/2 size-3 text-[#4b5563] pointer-events-none" />
              </div>
            </div>

            {/* Breadcrumb */}
            {driveFolderStack.length > 0 && (
              <div className="flex items-center gap-1 mb-4 text-sm">
                <button
                  onClick={() => { setDriveFolderId(null); setDriveFolderStack([]); }}
                  className="text-[#0f9e9a] hover:underline"
                >
                  My Drive
                </button>
                {driveFolderStack.map((f, i) => (
                  <span key={f.id} className="flex items-center gap-1">
                    <ChevronRight className="size-3 text-[#4b5563]" />
                    {i < driveFolderStack.length - 1 ? (
                      <button
                        onClick={() => {
                          const newStack = driveFolderStack.slice(0, i + 1);
                          setDriveFolderStack(newStack);
                          setDriveFolderId(newStack[newStack.length - 1].id);
                        }}
                        className="text-[#0f9e9a] hover:underline"
                      >
                        {f.name}
                      </button>
                    ) : (
                      <span className="text-[#111827] font-medium">{f.name}</span>
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* Drive Content */}
            {driveLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="size-6 text-[#0f9e9a] animate-spin" />
              </div>
            ) : !driveAvailable ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <svg className="size-10 text-[#a0a8b4] mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 19.5h20L12 2z" />
                  <path d="M2 19.5l5-8.5h10" />
                  <path d="M22 19.5l-5-8.5H7" />
                </svg>
                <h3 className="text-lg font-medium text-[#4b5563] mb-1">Drive not available</h3>
                <p className="text-sm text-[#4b5563] max-w-sm">{driveMessage || 'Google Drive is not configured for this agent.'}</p>
              </div>
            ) : filteredDriveFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <FolderOpen className="size-10 text-[#a0a8b4] mb-4" />
                <h3 className="text-lg font-medium text-[#4b5563] mb-1">
                  {searchQuery ? 'No matching files' : 'No files found'}
                </h3>
                <p className="text-sm text-[#4b5563] max-w-sm">
                  {searchQuery ? 'Try adjusting your search.' : 'This folder is empty.'}
                </p>
                {driveFolderStack.length > 0 && (
                  <button onClick={handleDriveBack} className="mt-4 text-sm text-[#0f9e9a] hover:underline flex items-center gap-1">
                    <ChevronRight className="size-3 rotate-180" /> Go back
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredDriveFiles.map((file) => {
                  const typeInfo = driveFileTypeInfo(file.mimeType);
                  const Icon = typeInfo.icon;
                  const isFolder = file.mimeType === 'application/vnd.google-apps.folder';

                  return (
                    <button
                      key={file.id}
                      onClick={() => handleDriveNavigate(file)}
                      className="group rounded-xl bg-[#f0f1f3] border border-[#c0c4cc] hover:border-[#9ca3af] transition-all overflow-hidden text-left"
                    >
                      <div className="p-4 pb-3">
                        <div className="flex items-start justify-between mb-3">
                          <div className={`w-9 h-9 rounded-lg bg-[#e5e7eb] ${typeInfo.color} flex items-center justify-center`}>
                            <Icon className="size-4" />
                          </div>
                          {!isFolder && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <ExternalLink className="size-3.5 text-[#4b5563]" />
                            </div>
                          )}
                        </div>
                        <p className="text-sm font-medium text-[#111827] truncate mb-1" title={file.name}>{file.name}</p>
                        <div className="flex items-center gap-3 text-[11px] text-[#4b5563]">
                          <span>{typeInfo.label}</span>
                          {file.size && file.size > 0 && <span>{formatFileSize(file.size)}</span>}
                        </div>
                      </div>
                      <div className="px-4 py-2.5 border-t border-[#c0c4cc] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <svg className="size-4 text-[#4b5563]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2L2 19.5h20L12 2z" />
                            <path d="M2 19.5l5-8.5h10" />
                            <path d="M22 19.5l-5-8.5H7" />
                          </svg>
                          <span className="text-[11px] text-[#4b5563]">Google Drive</span>
                        </div>
                        {file.modifiedTime && (
                          <div className="flex items-center gap-1 text-[11px] text-[#4b5563]">
                            <Calendar className="size-3" />
                            {formatDateISO(file.modifiedTime)}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
        <>
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex-1 min-w-[200px] max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#4b5563]" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#f0f1f3] border border-[#c0c4cc] text-sm text-[#111827] placeholder-[#9ca3af] placeholder:font-normal focus:outline-none focus:border-[#0f9e9a] transition-colors"
            />
          </div>

          <div className="relative">
            <select
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
              className="appearance-none pl-4 pr-8 py-2.5 rounded-lg bg-[#f0f1f3] border border-[#c0c4cc] text-sm text-[#4b5563] focus:outline-none focus:border-[#0f9e9a] cursor-pointer"
            >
              <option value="all">All Agents</option>
              {agents.map((a) => (
                <option key={a.name} value={a.name}>{a.displayName}</option>
              ))}
            </select>
            <Filter className="absolute right-3 top-1/2 -translate-y-1/2 size-3 text-[#4b5563] pointer-events-none" />
          </div>

          {folders.length > 0 && (
            <div className="relative">
              <select
                value={filterFolder}
                onChange={(e) => setFilterFolder(e.target.value)}
                className="appearance-none pl-4 pr-8 py-2.5 rounded-lg bg-[#f0f1f3] border border-[#c0c4cc] text-sm text-[#4b5563] focus:outline-none focus:border-[#0f9e9a] cursor-pointer"
              >
                <option value="all">All Folders</option>
                {folders.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <FolderClosed className="absolute right-3 top-1/2 -translate-y-1/2 size-3 text-[#4b5563] pointer-events-none" />
            </div>
          )}

          <div className="flex items-center rounded-lg bg-[#f0f1f3] border border-[#c0c4cc] p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded transition-all ${viewMode === 'grid' ? 'bg-[#e5e7eb] text-[#111827]' : 'text-[#4b5563] hover:text-[#111827]'}`}
            >
              <LayoutDashboard className="size-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded transition-all ${viewMode === 'list' ? 'bg-[#e5e7eb] text-[#111827]' : 'text-[#4b5563] hover:text-[#111827]'}`}
            >
              <List className="size-4" />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Total Files', value: documents.length },
            { label: 'Folders', value: Object.keys(grouped).length },
            { label: 'Total Size', value: formatFileSize(documents.reduce((s, d) => s + d.size, 0)) },
            { label: 'Agents', value: new Set(documents.map((d) => d.agent)).size || agents.length },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-[#f0f1f3] border border-[#c0c4cc] p-4">
              <p className="text-xs text-[#4b5563] mb-1">{s.label}</p>
              <p className="text-2xl font-semibold text-[#111827]">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-6 text-[#0f9e9a] animate-spin" />
          </div>
        ) : filtered.length === 0 && projectList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FileText className="size-10 text-[#a0a8b4] mb-4" />
            <h3 className="text-lg font-medium text-[#4b5563] mb-1">
              {documents.length === 0 ? 'No documents yet' : 'No matching files'}
            </h3>
            <p className="text-sm text-[#4b5563] max-w-sm">
              {documents.length === 0
                ? 'When your AI employees create deliverables, they\'ll appear here organized and ready to access.'
                : 'Try adjusting your search or filters.'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="space-y-8">
            {Object.entries(grouped)
              .sort(([a], [b]) => {
                // Project folders first, then General last
                const aIsProject = projectList.some((p) => p.name === a);
                const bIsProject = projectList.some((p) => p.name === b);
                if (a === 'General') return 1;
                if (b === 'General') return -1;
                if (aIsProject && !bIsProject) return -1;
                if (!aIsProject && bIsProject) return 1;
                return a.localeCompare(b);
              })
              .map(([folder, docs]) => (
              <div key={folder}>
                <div className="flex items-center gap-2 mb-3">
                  <FolderOpen className="size-4 text-[#0f9e9a]" />
                  <h2 className="text-sm font-semibold text-[#111827]">{folder}</h2>
                  <span className="text-xs text-[#4b5563]">{docs.length} file{docs.length !== 1 ? 's' : ''}</span>
                  {projectList.some((p) => p.name === folder) && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0f9e9a]/10 text-[#0f9e9a] font-medium">Project</span>
                  )}
                </div>
                {docs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#a0a8b4] bg-[#f9fafb] p-6 text-center">
                    <FolderOpen className="size-6 text-[#a0a8b4] mx-auto mb-2" />
                    <p className="text-sm text-[#4b5563]">No documents yet</p>
                    <p className="text-xs text-[#d1d5db] mt-1">Files created by your AI employee will appear here</p>
                  </div>
                ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {docs.map((doc) => {
                    const typeInfo = fileTypeIcons[doc.type] || fileTypeIcons.file;
                    const Icon = typeInfo.icon;
                    const agentData = agents.find((a) => a.name === doc.agent);
                    const gradient = templateGradients[agentData?.template || ''] || 'from-[#0f9e9a] to-[#0dbdb8]';

                    return (
                      <div key={doc.id} className="group rounded-xl bg-[#f0f1f3] border border-[#c0c4cc] hover:border-[#9ca3af] transition-all overflow-hidden">
                        <div className="p-4 pb-3">
                          <div className="flex items-start justify-between mb-3">
                            <div className={`w-9 h-9 rounded-lg bg-[#e5e7eb] ${typeInfo.color} flex items-center justify-center`}>
                              <Icon className="size-4" />
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handlePreview(doc)} className="p-1.5 rounded-lg hover:bg-[#e5e7eb] text-[#4b5563] hover:text-[#111827] transition-colors" title="Preview">
                                <Eye className="size-3.5" />
                              </button>
                              <button onClick={() => handleDownload(doc)} className="p-1.5 rounded-lg hover:bg-[#e5e7eb] text-[#4b5563] hover:text-[#111827] transition-colors" title="Download">
                                <Download className="size-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="text-sm font-medium text-[#111827] truncate mb-1" title={doc.name}>{doc.name}</p>
                          <div className="flex items-center gap-3 text-[11px] text-[#4b5563]">
                            <span className="uppercase">{doc.ext.replace('.', '')}</span>
                            <span>{formatFileSize(doc.size)}</span>
                          </div>
                        </div>
                        <div className="px-4 py-2.5 border-t border-[#c0c4cc] flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                              <span className="text-[7px] font-bold text-white">{(agentData?.displayName || doc.agent).charAt(0).toUpperCase()}</span>
                            </div>
                            <span className="text-[11px] text-[#4b5563] capitalize">{agentData?.displayName || doc.agent}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-[#4b5563]">
                            <Calendar className="size-3" />
                            {formatDate(doc.modified)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-[#c0c4cc] overflow-hidden">
            <div className="grid grid-cols-[1fr_100px_100px_120px_80px] gap-4 px-4 py-2.5 bg-[#f0f1f3] border-b border-[#c0c4cc] text-[11px] font-medium text-[#4b5563] uppercase tracking-wider">
              <span>Name</span>
              <span>Agent</span>
              <span>Type</span>
              <span>Modified</span>
              <span className="text-right">Size</span>
            </div>
            {filtered.map((doc) => {
              const typeInfo = fileTypeIcons[doc.type] || fileTypeIcons.file;
              const Icon = typeInfo.icon;
              const agentData = agents.find((a) => a.name === doc.agent);

              return (
                <div key={doc.id} className="group grid grid-cols-[1fr_100px_100px_120px_80px] gap-4 px-4 py-3 border-b border-[#c0c4cc] hover:bg-[#f0f1f3] transition-colors items-center">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg bg-[#e5e7eb] ${typeInfo.color} flex items-center justify-center shrink-0`}>
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-[#111827] truncate">{doc.name}</p>
                      {doc.folder && <p className="text-[11px] text-[#4b5563] truncate">{doc.folder}</p>}
                    </div>
                    <div className="flex items-center gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => handlePreview(doc)} className="p-1.5 rounded-lg hover:bg-[#e5e7eb] text-[#4b5563] hover:text-[#111827]" title="Preview">
                        <Eye className="size-3.5" />
                      </button>
                      <button onClick={() => handleDownload(doc)} className="p-1.5 rounded-lg hover:bg-[#e5e7eb] text-[#4b5563] hover:text-[#111827]" title="Download">
                        <Download className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <span className="text-xs text-[#4b5563] capitalize">{agentData?.displayName || doc.agent}</span>
                  <span className="text-xs text-[#4b5563] uppercase">{doc.ext.replace('.', '')}</span>
                  <span className="text-xs text-[#4b5563]">{formatDate(doc.modified)}</span>
                  <span className="text-xs text-[#4b5563] text-right">{formatFileSize(doc.size)}</span>
                </div>
              );
            })}
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PROJECT DOCUMENTS SECTION (inline in project workspace)
// ============================================================================

function ProjectDocumentsSection({
  projectName,
  agent,
  agents,
  authHeaders,
  collapsed,
  onToggle,
}: {
  projectName: string;
  agent: AgentData;
  agents: AgentData[];
  authHeaders: () => Record<string, string>;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [documents, setDocuments] = useState<DocFile[]>([]);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [driveAvailable, setDriveAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // Fetch local documents filtered by current agent
        const res = await fetch(`/api/dashboard/documents?agent=${agent.name}`, {
          headers: authHeaders(),
        });
        const data = await res.json();
        const allDocs: DocFile[] = data.documents || [];
        // Filter to docs in the project folder (match folder name to project name)
        const projDocs = allDocs.filter(
          (d) => d.folder.toLowerCase() === projectName.toLowerCase()
        );
        if (!cancelled) setDocuments(projDocs);

        // Also try Drive files
        try {
          const driveRes = await fetch(`/api/dashboard/drive?agent=${agent.name}`, {
            headers: authHeaders(),
          });
          const driveData = await driveRes.json();
          if (!cancelled && driveData.available) {
            setDriveAvailable(true);
            // Filter drive files by name containing project name
            const filtered = (driveData.files || []).filter(
              (f: DriveFile) => f.name.toLowerCase().includes(projectName.toLowerCase())
            );
            setDriveFiles(filtered);
          }
        } catch { /* Drive not available */ }
      } catch { /* */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [agent.name, projectName, authHeaders]);

  const totalCount = documents.length + driveFiles.length;

  function handleDownload(doc: DocFile) {
    const token = localStorage.getItem('psv_dashboard_token') || '';
    window.open(`/api/dashboard/documents/download?path=${encodeURIComponent(doc.path)}&token=${token}`, '_blank');
  }

  return (
    <div className="shrink-0 border-t border-[#c0c4cc] bg-white">
      {/* Toggle header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-[#4b5563] hover:text-[#111827] hover:bg-[#f9fafb] transition-colors"
      >
        <FileText className="size-4" />
        <span>Documents{totalCount > 0 ? ` (${totalCount})` : ''}</span>
        <span className={`ml-auto w-12 h-12 rounded-full bg-[#0f9e9a]/15 flex items-center justify-center transition-transform ${collapsed ? '-rotate-90' : ''}`}>
          <ChevronDown className="size-6 text-[#0f9e9a]" />
        </span>
      </button>

      {/* Document grid */}
      {!collapsed && (
        <div className="px-6 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="size-4 text-[#0f9e9a] animate-spin" />
            </div>
          ) : totalCount === 0 ? (
            <div className="py-4 text-center">
              <p className="text-xs text-[#4b5563]">No documents yet for this project</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {/* Local files */}
              {documents.map((doc) => {
                const typeInfo = fileTypeIcons[doc.type] || fileTypeIcons.file;
                const Icon = typeInfo.icon;
                return (
                  <button
                    key={doc.id}
                    onClick={() => handleDownload(doc)}
                    className="group rounded-lg bg-[#f0f1f3] border border-[#c0c4cc] hover:border-[#9ca3af] transition-all overflow-hidden text-left p-3"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`w-7 h-7 rounded-md bg-[#e5e7eb] ${typeInfo.color} flex items-center justify-center shrink-0`}>
                        <Icon className="size-3.5" />
                      </div>
                      <Download className="size-3 text-[#4b5563] opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
                    </div>
                    <p className="text-xs font-medium text-[#111827] truncate" title={doc.name}>{doc.name}</p>
                    <p className="text-[10px] text-[#4b5563] mt-0.5">{formatFileSize(doc.size)}</p>
                  </button>
                );
              })}
              {/* Drive files */}
              {driveFiles.map((file) => {
                const typeInfo = driveFileTypeInfo(file.mimeType);
                const Icon = typeInfo.icon;
                return (
                  <button
                    key={file.id}
                    onClick={() => {
                      const token = localStorage.getItem('psv_dashboard_token') || '';
                      const params = new URLSearchParams({
                        agent: agent.name,
                        id: file.id,
                        name: file.name,
                        mime: file.mimeType,
                        token,
                      });
                      window.open(`/api/dashboard/drive/download?${params}`, '_blank', 'noopener,noreferrer');
                    }}
                    className="group rounded-lg bg-[#f0f1f3] border border-[#c0c4cc] hover:border-[#9ca3af] transition-all overflow-hidden text-left p-3"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`w-7 h-7 rounded-md bg-[#e5e7eb] ${typeInfo.color} flex items-center justify-center shrink-0`}>
                        <Icon className="size-3.5" />
                      </div>
                      <ExternalLink className="size-3 text-[#4b5563] opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
                    </div>
                    <p className="text-xs font-medium text-[#111827] truncate" title={file.name}>{file.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <svg className="size-3 text-[#4b5563]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2L2 19.5h20L12 2z" />
                        <path d="M2 19.5l5-8.5h10" />
                        <path d="M22 19.5l-5-8.5H7" />
                      </svg>
                      <span className="text-[10px] text-[#4b5563]">Drive</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN DASHBOARD (default export)
// ============================================================================

export default function ClientDashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f9fafb] flex items-center justify-center"><Loader2 className="size-6 text-[#0f9e9a] animate-spin" /></div>}>
      <ClientDashboard />
    </Suspense>
  );
}

function ClientDashboard() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [mainView, setMainView] = useState<MainView>('chat');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // Auto-collapse sidebar on mobile, expand on desktop
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setSidebarCollapsed(!mq.matches);
    const handler = (e: MediaQueryListEvent) => setSidebarCollapsed(!e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Chat state (lifted up so sidebar can render it)
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [newSubfolderProject, setNewSubfolderProject] = useState<string | null>(null);
  const [newSubfolderName, setNewSubfolderName] = useState('');
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedSubfolders, setExpandedSubfolders] = useState<Set<string>>(new Set());
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [projectDocsCollapsed, setProjectDocsCollapsed] = useState(false);
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [instructionsModal, setInstructionsModal] = useState<{ projectId: string; projectName: string; isNew: boolean } | null>(null);
  const [instructionsValue, setInstructionsValue] = useState('');
  const [projectEmailValue, setProjectEmailValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      localStorage.setItem('psv_dashboard_token', token);
      document.cookie = `psv_dashboard_token=${token}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`;
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [searchParams]);

  const getToken = useCallback(() => {
    return localStorage.getItem('psv_dashboard_token') || '';
  }, []);

  const authHeaders = useCallback((): Record<string, string> => {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }, [getToken]);

  // Fetch dashboard data
  const fetchData = useCallback(async () => {
    try {
      const token = getToken();
      const res = await fetch('/api/dashboard', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (res.status === 401) { setError('expired'); setLoading(false); return; }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error('Dashboard API error:', errData);
        throw new Error(errData.error || 'Failed');
      }
      const d: DashboardData = await res.json();
      setData(d);
      setSelectedAgent((prev) => {
        if (prev) return prev;
        if (d.agents.length === 0) return '';
        // Prefer "robin" as the default agent
        const robin = d.agents.find((a) => a.name === 'robin');
        return robin ? robin.name : d.agents[0].name;
      });
    } catch { setError('failed'); }
    finally { setLoading(false); }
  }, [getToken]);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 120000);
    return () => clearInterval(iv);
  }, [fetchData]);

  // Current agent
  const agent = data?.agents.find((a) => a.name === selectedAgent) || data?.agents[0];
  const gradient = agent ? (templateGradients[agent.template] || 'from-[#0f9e9a] to-[#0dbdb8]') : 'from-[#0f9e9a] to-[#0dbdb8]';

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    if (!agent) return;
    try {
      const res = await fetch(`/api/dashboard/chat?agent=${agent.name}`, { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setSessions(d.sessions || []);
        setProjects(d.projects || []);
        // Auto-expand projects that have content
        const projIds = (d.projects || []).map((p: Project) => p.id);
        setExpandedProjects((prev) => {
          const next = new Set(prev);
          projIds.forEach((pid: string) => next.add(pid));
          return next;
        });
      }
    } catch { /* */ }
  }, [agent?.name, authHeaders]);

  useEffect(() => {
    if (agent) fetchSessions();
  }, [agent?.name, fetchSessions]);

  // Fetch messages
  const fetchMessages = useCallback(async (sid: string) => {
    if (!agent) return;
    try {
      const res = await fetch(`/api/dashboard/chat?agent=${agent.name}&session=${sid}`, { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setMessages(d.messages || []);
      }
    } catch { /* */ }
  }, [agent?.name, authHeaders]);

  useEffect(() => {
    if (!activeSession) return;
    // Poll faster while waiting for a reply, slower otherwise
    const interval = sending ? 3000 : 30000;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/dashboard/chat?agent=${agent?.name}&session=${activeSession}`, { headers: authHeaders() });
        if (res.ok) {
          const d = await res.json();
          const msgs = d.messages || [];
          setMessages(msgs);
          // If we were waiting for a reply and one arrived, stop sending
          if (sending && msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
            setSending(false);
            fetchSessions();
          }
        }
      } catch { /* */ }
    }, interval);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession, agent?.name, sending]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // Reset chat state when switching agents
  useEffect(() => {
    setActiveSession(null);
    setMessages([]);
    setActiveProject(null);
    if (mainView === 'project') setMainView('chat');
  }, [selectedAgent]);

  // ---- Chat actions ----

  async function handleNewSession(projectId?: string) {
    if (!agent) return;
    try {
      const res = await fetch('/api/dashboard/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ agent: agent.name, action: 'new_session' }),
      });
      if (res.ok) {
        const d = await res.json();
        if (projectId) {
          await fetch('/api/dashboard/chat', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ agent: agent.name, sessionId: d.sessionId, action: 'move_to_project', project: projectId }),
          });
        }
        setActiveSession(d.sessionId);
        setMessages([]);
        fetchSessions();
        inputRef.current?.focus();
      }
    } catch { /* */ }
  }

  async function handleRename(sid: string) {
    if (!renameValue.trim() || !agent) return;
    await fetch('/api/dashboard/chat', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ agent: agent.name, sessionId: sid, action: 'rename', title: renameValue.trim() }),
    });
    setRenaming(null);
    fetchSessions();
  }

  async function handleDelete(sid: string) {
    if (!agent) return;
    await fetch('/api/dashboard/chat', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ agent: agent.name, sessionId: sid, action: 'delete' }),
    });
    if (activeSession === sid) { setActiveSession(null); setMessages([]); }
    setMenuOpen(null);
    fetchSessions();
  }

  async function handleMoveToProject(sid: string, projectId: string) {
    if (!agent) return;
    await fetch('/api/dashboard/chat', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ agent: agent.name, sessionId: sid, action: 'move_to_project', project: projectId }),
    });
    setMoveTarget(null);
    setMenuOpen(null);
    fetchSessions();
  }

  async function handleRemoveFromProject(sid: string) {
    if (!agent) return;
    await fetch('/api/dashboard/chat', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ agent: agent.name, sessionId: sid, action: 'remove_from_project' }),
    });
    setMenuOpen(null);
    fetchSessions();
  }

  async function handleCreateProject() {
    if (!newProjectName.trim() || !agent) return;
    const name = newProjectName.trim();
    setNewProjectName('');
    setShowNewProject(false);
    try {
      const res = await fetch('/api/dashboard/chat', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ agent: agent.name, sessionId: '', action: 'create_project', title: name }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.projectId) {
          setProjects((prev) => [...prev, { id: d.projectId, name, subfolders: [] }]);
          setExpandedProjects((prev) => new Set(prev).add(d.projectId));
          // Show mandatory instructions modal before proceeding
          setInstructionsValue('');
          setProjectEmailValue('');
          setInstructionsModal({ projectId: d.projectId, projectName: name, isNew: true });
        }
      } else {
        console.error('[project] create failed:', await res.text());
      }
    } catch (err) {
      console.error('[project] create error:', err);
    }
  }

  async function handleSaveInstructions() {
    if (!instructionsModal || !instructionsValue.trim() || !agent) return;
    const { projectId, isNew } = instructionsModal;
    // Save instructions + email to backend (creates/updates Google Doc)
    const saveRes = await fetch('/api/dashboard/chat', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ agent: agent.name, sessionId: '', action: 'set_project_instructions', project: projectId, instructions: instructionsValue.trim(), email: projectEmailValue.trim() }),
    });
    let docUrl = '';
    try { const d = await saveRes.json(); docUrl = d.docUrl || ''; } catch { /* */ }
    // Update local state
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, instructions: instructionsValue.trim(), email: projectEmailValue.trim(), ...(docUrl ? { doc_url: docUrl } : {}) } : p));
    setInstructionsModal(null);
    setInstructionsValue('');
    setProjectEmailValue('');
    if (isNew) {
      // Auto-create the project's dedicated session and open it
      try {
        const sessRes = await fetch('/api/dashboard/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ agent: agent.name, action: 'new_session', project: projectId }),
        });
        if (sessRes.ok) {
          const sessData = await sessRes.json();
          setActiveSession(sessData.sessionId);
          setMessages([]);
          setActiveProject(projectId);
          setMainView('project');
        }
      } catch { /* */ }
      await fetchSessions();
    }
  }

  function handleEditInstructions(projectId: string) {
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) return;
    setInstructionsValue(proj.instructions || '');
    setProjectEmailValue(proj.email || '');
    setInstructionsModal({ projectId, projectName: proj.name, isNew: false });
  }

  async function handleDeleteProject(pid: string) {
    if (!agent) return;
    await fetch('/api/dashboard/chat', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ agent: agent.name, sessionId: '', action: 'delete_project', project: pid }),
    });
    fetchSessions();
  }

  async function handleCreateSubfolder(projectId: string) {
    if (!newSubfolderName.trim() || !agent) return;
    const name = newSubfolderName.trim();
    setNewSubfolderName('');
    setNewSubfolderProject(null);
    setExpandedProjects((prev) => new Set(prev).add(projectId));
    try {
      const res = await fetch('/api/dashboard/chat', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ agent: agent.name, sessionId: '', action: 'create_subfolder', project: projectId, title: name }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.subfolderId) {
          setProjects((prev) => prev.map((p) =>
            p.id === projectId
              ? { ...p, subfolders: [...(p.subfolders || []), { id: d.subfolderId, name }] }
              : p
          ));
          setExpandedSubfolders((prev) => new Set(prev).add(d.subfolderId));
        }
      } else {
        console.error('[subfolder] create failed:', await res.text());
      }
    } catch (err) {
      console.error('[subfolder] create error:', err);
    }
    await fetchSessions();
  }

  async function handleDeleteSubfolder(projectId: string, subfolderId: string) {
    if (!agent) return;
    await fetch('/api/dashboard/chat', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ agent: agent.name, sessionId: '', action: 'delete_subfolder', project: projectId, subfolder: subfolderId }),
    });
    fetchSessions();
  }

  async function handleNewSessionInSubfolder(projectId: string, subfolderId: string) {
    if (!agent) return;
    try {
      const res = await fetch('/api/dashboard/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ agent: agent.name, action: 'new_session', project: projectId, subfolder: subfolderId }),
      });
      if (res.ok) {
        const d = await res.json();
        setActiveSession(d.sessionId);
        setExpandedProjects((prev) => new Set(prev).add(projectId));
        setExpandedSubfolders((prev) => new Set(prev).add(subfolderId));
        fetchSessions();
      }
    } catch {}
  }

  function toggleProject(pid: string) {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid); else next.add(pid);
      return next;
    });
  }

  function toggleSubfolder(sfid: string) {
    setExpandedSubfolders((prev) => {
      const next = new Set(prev);
      if (next.has(sfid)) next.delete(sfid); else next.add(sfid);
      return next;
    });
  }

  async function activateProjectWorkspace(projectId: string) {
    setActiveProject(projectId);
    setMainView('project');
    closeSidebarOnMobile();
    // Find an existing root session for this project (not in a subfolder)
    const existing = sessions.find((s) => s.project === projectId && !s.subfolder);
    if (existing) {
      setActiveSession(existing.id);
      setLoadingMsgs(true);
      fetchMessages(existing.id).finally(() => setLoadingMsgs(false));
    } else {
      // Auto-create a session for this project
      if (!agent) return;
      try {
        const res = await fetch('/api/dashboard/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ agent: agent.name, action: 'new_session', project: projectId }),
        });
        if (res.ok) {
          const d = await res.json();
          setActiveSession(d.sessionId);
          setMessages([]);
          fetchSessions();
        }
      } catch { /* */ }
    }
  }

  function renderAttachment(att: ChatMessage['attachment'], variant: 'user' | 'other') {
    if (!att) return null;
    const token = getToken();
    const downloadUrl = `/api/dashboard/chat/upload/download?path=${encodeURIComponent(att.path)}&token=${encodeURIComponent(token)}`;
    const isImage = /\.(png|jpe?g|gif|webp)$/i.test(att.name);
    if (isImage) {
      return (
        <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="block mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={downloadUrl} alt={att.name} className="max-w-[240px] max-h-[180px] rounded-lg border border-white/20 object-cover" />
          <span className={`text-xs mt-1 inline-block ${variant === 'user' ? 'text-white/70' : 'text-[#4b5563]'}`}>{att.name}</span>
        </a>
      );
    }
    return (
      <a href={downloadUrl} target="_blank" rel="noopener noreferrer"
        className={`flex items-center gap-2 mt-2 px-3 py-2 rounded-lg border transition-colors ${
          variant === 'user'
            ? 'border-white/20 bg-white/10 hover:bg-white/20'
            : 'border-[#c0c4cc] bg-white hover:bg-[#f0f1f3]'
        }`}
      >
        <FileText className={`size-4 shrink-0 ${variant === 'user' ? 'text-white/70' : 'text-[#0f9e9a]'}`} />
        <span className={`text-sm truncate ${variant === 'user' ? 'text-white' : 'text-[#111827]'}`}>{att.name}</span>
        <span className={`text-xs shrink-0 ${variant === 'user' ? 'text-white/60' : 'text-[#4b5563]'}`}>{formatFileSize(att.size)}</span>
        <Download className={`size-3.5 shrink-0 ${variant === 'user' ? 'text-white/60' : 'text-[#4b5563]'}`} />
      </a>
    );
  }

  async function handleSend() {
    const msg = inputValue.trim();
    if ((!msg && !pendingFile) || !agent) return;

    let sid = activeSession;
    if (!sid) {
      try {
        const res = await fetch('/api/dashboard/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            agent: agent.name,
            action: 'new_session',
            ...(mainView === 'project' && activeProject ? { project: activeProject } : {}),
          }),
        });
        if (res.ok) {
          const d = await res.json();
          sid = d.sessionId;
          setActiveSession(sid);
        } else { return; }
      } catch { return; }
    }

    // Upload file if pending
    let attachment: { name: string; size: number; type: string; path: string } | undefined;
    if (pendingFile) {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', pendingFile);
        formData.append('agent', agent.name);
        formData.append('sessionId', sid!);
        const uploadRes = await fetch('/api/dashboard/chat/upload', {
          method: 'POST',
          headers: authHeaders(),
          body: formData,
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          attachment = uploadData.attachment;
        }
      } catch (err) {
        console.error('Upload failed:', err);
      }
      setUploading(false);
      setPendingFile(null);
    }

    const content = msg || (attachment ? `[Attached: ${attachment.name}]` : '');
    if (!content) return;

    setMessages((prev) => [...prev, { id: `t-${Date.now()}`, role: 'user', content, timestamp: new Date().toISOString(), attachment }]);
    setInputValue('');
    setSending(true);

    // Fire and forget — the backend processes the agent call in the background.
    // The useEffect polling (3s while sending=true) detects the reply and sets sending=false.
    fetch('/api/dashboard/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ agent: agent.name, sessionId: sid, message: content, action: 'send', attachment }),
    }).catch(() => { setSending(false); });

    // Safety timeout — stop showing typing indicator after 8 minutes
    setTimeout(() => setSending(false), 240_000);
    inputRef.current?.focus();
  }

  function closeSidebarOnMobile() {
    if (window.innerWidth < 768) setSidebarCollapsed(true);
  }

  function selectSession(sid: string) {
    setActiveSession(sid);
    setActiveProject(null);
    setLoadingMsgs(true);
    fetchMessages(sid).finally(() => setLoadingMsgs(false));
    // Switch to chat view if not already
    if (mainView !== 'chat') setMainView('chat');
    closeSidebarOnMobile();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  // Derived
  const unprojectSessions = sessions.filter((s) => !s.project);
  const projectSessions = (pid: string) => sessions.filter((s) => s.project === pid);
  const subfolderSessions = (pid: string, sfid: string) => sessions.filter((s) => s.project === pid && s.subfolder === sfid);
  const projectRootSessions = (pid: string) => sessions.filter((s) => s.project === pid && !s.subfolder);
  const dateGrouped = groupSessionsByDate(unprojectSessions);

  const isRunning = agent ? (agent.status === 'running' || agent.status === 'active') : false;

  // Suggested prompts
  const suggestedPrompts: Record<string, string[]> = {
    cofounder: ['What are you working on right now?', 'Give me a status update', 'What should we prioritize this week?'],
    developer: ['Show me what you shipped today', 'What blockers do you have?', 'Review the latest deployment'],
    'sales-sdr': ['How many leads did you find today?', 'Show me the outreach results', 'Who should I follow up with?'],
    analyst: ['What insights did you find?', 'Summarize your latest research', 'What trends are you seeing?'],
    'infra-ops': ['What\'s the system status?', 'Any issues to address?', 'Show me the latest metrics'],
    assistant: ['What tasks did you complete?', 'What\'s on the agenda today?', 'Any updates I should know about?'],
  };
  const prompts = agent ? (suggestedPrompts[agent.template] || suggestedPrompts.assistant) : suggestedPrompts.assistant;

  // ---- Loading / Error states ----

  if (loading) {
    return (
      <div className="h-screen bg-[#f9fafb] flex items-center justify-center">
        <Loader2 className="size-6 text-[#0f9e9a] animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    if (typeof window !== 'undefined' && error === 'expired') {
      localStorage.removeItem('psv_dashboard_token');
      document.cookie = 'psv_dashboard_token=; path=/; max-age=0';
      window.location.href = '/dashboard/login';
      return (
        <div className="h-screen bg-[#f9fafb] flex items-center justify-center">
          <Loader2 className="size-6 text-[#0f9e9a] animate-spin" />
        </div>
      );
    }
    return (
      <div className="h-screen bg-[#f9fafb] flex items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <div className="w-12 h-12 rounded-full bg-[#f0f1f3] flex items-center justify-center mx-auto mb-4">
            <span className="text-[#4b5563] text-lg">?</span>
          </div>
          <h1 className="text-lg font-medium text-[#111827] mb-2">Something went wrong</h1>
          <p className="text-sm text-[#4b5563]">Please try again later.</p>
          <a href="/dashboard/login" className="mt-4 inline-block text-sm text-[#0f9e9a] hover:underline">
            Go to login
          </a>
        </div>
      </div>
    );
  }

  if (!agent) return null;

  // ---- Session Item sub-component ----
  function SessionItem({ s }: { s: ChatSession }) {
    const isActive = activeSession === s.id;
    const isRenaming = renaming === s.id;
    const isMenuOpen = menuOpen === s.id;
    const isMoving = moveTarget === s.id;

    return (
      <div className="relative">
        {isRenaming ? (
          <div className="flex items-center gap-1 px-2 py-1.5 mx-2">
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(s.id); if (e.key === 'Escape') setRenaming(null); }}
              className="flex-1 bg-[#f0f1f3] border border-[#c0c4cc] rounded-md px-2 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#0f9e9a]"
            />
            <button onClick={() => handleRename(s.id)} className="p-1 text-[#0f9e9a]"><Check className="size-3" /></button>
            <button onClick={() => setRenaming(null)} className="p-1 text-[#4b5563]"><X className="size-3" /></button>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => selectSession(s.id)}
            onKeyDown={(e) => { if (e.key === 'Enter') selectSession(s.id); }}
            className={`group flex items-center gap-2 mx-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-sm ${
              isActive
                ? 'bg-[#f0f1f3] text-[#111827]'
                : 'text-[#4b5563] hover:bg-[#f0f1f3] hover:text-[#111827]'
            }`}
          >
            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#0f9e9a] rounded-r-full" />}
            <span className="flex-1 truncate">{s.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(isMenuOpen ? null : s.id); setMoveTarget(null); }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded text-[#4b5563] hover:text-[#111827] transition-opacity"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </div>
        )}

        {/* Context menu */}
        {isMenuOpen && !isMoving && (
          <div className="absolute right-4 top-full z-50 w-44 bg-[#f0f1f3] border border-[#c0c4cc] rounded-lg shadow-lg shadow-gray-300/60 py-1 text-sm">
            <button
              onClick={() => { setRenaming(s.id); setRenameValue(s.title); setMenuOpen(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[#4b5563] hover:text-[#111827] hover:bg-[#e5e7eb]"
            >
              <Pencil className="size-3.5" /> Rename
            </button>
            <button
              onClick={() => setMoveTarget(s.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-[#4b5563] hover:text-[#111827] hover:bg-[#e5e7eb]"
            >
              <ArrowRight className="size-3.5" /> Move to project
            </button>
            {s.project && (
              <button
                onClick={() => handleRemoveFromProject(s.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-[#4b5563] hover:text-[#111827] hover:bg-[#e5e7eb]"
              >
                <X className="size-3.5" /> Remove from project
              </button>
            )}
            <div className="h-px bg-[#e5e7eb] my-1" />
            <button
              onClick={() => handleDelete(s.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="size-3.5" /> Delete
            </button>
          </div>
        )}

        {/* Move to project sub-menu */}
        {isMoving && (
          <div className="absolute right-4 top-full z-50 w-52 bg-[#f0f1f3] border border-[#c0c4cc] rounded-lg shadow-lg shadow-gray-300/60 py-1 text-sm">
            <div className="px-3 py-1.5 text-xs text-[#4b5563]">Move to</div>
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => handleMoveToProject(s.id, p.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-[#4b5563] hover:text-[#111827] hover:bg-[#e5e7eb]"
              >
                <FolderOpen className="size-3.5" /> {p.name}
              </button>
            ))}
            <div className="h-px bg-[#e5e7eb] my-1" />
            <button
              onClick={async () => {
                if (!agent) return;
                const projName = s.title || 'New project';
                const res = await fetch('/api/dashboard/chat', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json', ...authHeaders() },
                  body: JSON.stringify({ agent: agent.name, sessionId: '', action: 'create_project', title: projName }),
                });
                if (res.ok) {
                  const d = await res.json();
                  if (d.projectId) {
                    await handleMoveToProject(s.id, d.projectId);
                  }
                }
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[#0f9e9a] hover:bg-[#0f9e9a]/10"
            >
              <FolderPlus className="size-3.5" /> Create new project
            </button>
            <button onClick={() => { setMoveTarget(null); setMenuOpen(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-[#4b5563] hover:text-[#111827]">
              <X className="size-3.5" /> Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---- Handle suggested prompt click (creates session + sends) ----
  async function handlePromptClick(prompt: string) {
    if (!agent || sending) return;
    try {
      // Create session
      const res = await fetch('/api/dashboard/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ agent: agent.name, action: 'new_session' }),
      });
      if (!res.ok) return;
      const d = await res.json();
      const sid = d.sessionId;
      setActiveSession(sid);
      setMessages([{ id: `t-${Date.now()}`, role: 'user', content: prompt, timestamp: new Date().toISOString() }]);
      setSending(true);
      fetchSessions();

      // Fire and forget — useEffect polling handles the reply detection
      fetch('/api/dashboard/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ agent: agent.name, sessionId: sid, message: prompt, action: 'send' }),
      }).catch(() => { setSending(false); });

      setTimeout(() => setSending(false), 240_000);
    } catch { setInputValue(prompt); }
  }

  // ---- Render ----

  return (
    <div className="h-screen flex bg-[#f9fafb] text-[#111827] overflow-hidden">
      {/* Instructions modal — mandatory for new projects */}
      {instructionsModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40">
          <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
              <button
                onClick={() => {
                  if (instructionsModal.isNew && !instructionsValue.trim()) {
                    // Can't dismiss without instructions for new project — delete the project
                    handleDeleteProject(instructionsModal.projectId);
                  }
                  setInstructionsModal(null);
                  setInstructionsValue('');
                  setProjectEmailValue('');
                }}
                className="p-1 text-[#4b5563] hover:text-[#111827] transition-colors"
              >
                <X className="size-5" />
              </button>
              <h3 className="text-lg font-semibold text-[#111827]">Instructions</h3>
              <button
                onClick={handleSaveInstructions}
                disabled={!instructionsValue.trim()}
                className={`p-1 transition-colors ${instructionsValue.trim() ? 'text-[#0f9e9a] hover:text-[#0d8a87]' : 'text-[#c0c4cc]'}`}
              >
                <Check className="size-5" />
              </button>
            </div>
            {/* Form */}
            <div className="flex-1 p-5 overflow-y-auto space-y-5">
              <div>
                <textarea
                  autoFocus
                  value={instructionsValue}
                  onChange={(e) => setInstructionsValue(e.target.value)}
                  placeholder="Use a professional tone, Use concise and simple wording, You are an expert in Astrophysics, etc."
                  className="w-full h-48 bg-[#f9fafb] border border-[#e5e7eb] rounded-xl px-4 py-3 text-[15px] text-[#111827] placeholder-[#9ca3af] resize-none focus:outline-none focus:border-[#0f9e9a] leading-relaxed"
                />
                <p className="text-sm text-[#4b5563] mt-2">
                  Instruct the agent how to behave and respond for all of the chats within <span className="font-medium text-[#111827]">{instructionsModal.projectName}</span>.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#111827] mb-1.5">
                  <Mail className="size-3.5 inline mr-1.5 text-[#4b5563]" />
                  Delivery email
                </label>
                <input
                  type="email"
                  value={projectEmailValue}
                  onChange={(e) => setProjectEmailValue(e.target.value)}
                  placeholder="adriana@example.com"
                  className="w-full bg-[#f9fafb] border border-[#e5e7eb] rounded-xl px-4 py-3 text-[15px] text-[#111827] placeholder-[#9ca3af] focus:outline-none focus:border-[#0f9e9a]"
                />
                <p className="text-sm text-[#4b5563] mt-1.5">
                  The only email this project&apos;s agent should send deliverables to.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Hidden file input for attachments */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.webp,.txt,.md"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && file.size <= 10 * 1024 * 1024) {
            setPendingFile(file);
          } else if (file) {
            alert('File must be under 10MB');
          }
          e.target.value = '';
        }}
      />
      {/* ===== LEFT SIDEBAR ===== */}
      {!sidebarCollapsed && (
        <>
        {/* Mobile backdrop */}
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setSidebarCollapsed(true)}
        />
        <aside className="fixed inset-y-0 left-0 z-50 w-[280px] flex flex-col bg-white border-r border-[#c0c4cc] md:relative md:z-auto">
          {/* Top: New chat + collapse */}
          <div className="flex items-center gap-2 p-3">
            <button
              onClick={() => { setMainView('chat'); setActiveProject(null); handleNewSession(); closeSidebarOnMobile(); }}
              className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#f0f1f3] hover:bg-[#e5e7eb] text-sm text-[#111827] transition-colors"
            >
              <Plus className="size-4" />
              New chat
            </button>
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="p-2.5 rounded-lg text-[#4b5563] hover:text-[#111827] hover:bg-[#f0f1f3] transition-colors"
            >
              <PanelLeftClose className="size-4" />
            </button>
          </div>

          {/* Agent selector (only if multiple agents) */}
          {data.agents.length > 1 && (
            <div className="px-3 mb-2 relative">
              <button
                onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#f0f1f3] transition-colors"
              >
                <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0`}>
                  <span className="text-white text-[10px] font-bold">{agent.displayName.charAt(0).toUpperCase()}</span>
                </div>
                <span className="flex-1 text-left text-sm text-[#111827] capitalize truncate">{agent.displayName}</span>
                <ChevronDown className={`size-3.5 text-[#4b5563] transition-transform ${agentDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {agentDropdownOpen && (
                <div className="absolute top-full left-3 right-3 z-50 mt-1 bg-[#f0f1f3] border border-[#c0c4cc] rounded-lg shadow-lg shadow-gray-300/60 py-1">
                  {data.agents.map((a) => {
                    const g = templateGradients[a.template] || 'from-[#0f9e9a] to-[#0dbdb8]';
                    const isOn = a.status === 'running' || a.status === 'active';
                    const isSelected = a.name === selectedAgent;
                    return (
                      <button
                        key={a.name}
                        onClick={() => { setSelectedAgent(a.name); setAgentDropdownOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                          isSelected ? 'bg-[#e5e7eb] text-[#111827]' : 'text-[#4b5563] hover:bg-[#e5e7eb] hover:text-[#111827]'
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${g} flex items-center justify-center shrink-0`}>
                          <span className="text-white text-[10px] font-bold">{a.displayName.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <span className="capitalize truncate block">{a.displayName}</span>
                          <span className="text-[11px] text-[#4b5563]">{templateLabels[a.template] || a.template}</span>
                        </div>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${isOn ? 'bg-emerald-400' : 'bg-red-400'}`} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Scrollable conversation list */}
          <div className="flex-1 overflow-y-auto py-1" onClick={() => { setMenuOpen(null); setMoveTarget(null); }}>
            {/* Date-grouped sessions */}
            {dateGrouped.map((group) => (
              <div key={group.label} className="mb-2">
                <div className="px-5 py-1.5">
                  <span className="text-[11px] font-medium text-[#4b5563]">{group.label}</span>
                </div>
                {group.sessions.map((s) => (
                  <SessionItem key={s.id} s={s} />
                ))}
              </div>
            ))}

            {/* Projects — Discord-like channel structure */}
            <div className="mt-2 mb-2">
              <div className="px-5 py-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-[#4b5563] uppercase tracking-wider">Projects</span>
                <button onClick={() => setShowNewProject(true)} className="p-0.5 text-[#4b5563] hover:text-[#0f9e9a] transition-colors" title="New project"><Plus className="size-3.5" /></button>
              </div>
                {/* New project input */}
                {showNewProject && (
                  <div className="flex items-center gap-1.5 mx-5 px-3 py-1.5 mb-1">
                    <input
                      autoFocus
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCreateProject(); if (e.key === 'Escape') setShowNewProject(false); }}
                      placeholder="Project name"
                      className="flex-1 bg-[#f0f1f3] border border-[#c0c4cc] rounded-md px-2.5 py-2 text-sm text-[#111827] placeholder-[#9ca3af] placeholder:font-normal focus:outline-none focus:border-[#0f9e9a]"
                    />
                    <button onClick={handleCreateProject} className="p-1 text-[#0f9e9a]"><Check className="size-4" /></button>
                    <button onClick={() => setShowNewProject(false)} className="p-1 text-[#4b5563]"><X className="size-4" /></button>
                  </div>
                )}
                {projects.map((p) => {
                  const pSessions = projectSessions(p.id);
                  const rootSessions = projectRootSessions(p.id);
                  const subs = p.subfolders || [];
                  const isExpanded = expandedProjects.has(p.id);
                  return (
                    <div key={p.id} className="mb-0.5">
                      {/* Project header (category) */}
                      <div
                        className={`flex items-center gap-2 ml-5 mr-2 px-3 py-2 group rounded-lg hover:bg-[#f0f1f3] cursor-pointer ${
                          activeProject === p.id && mainView === 'project' ? 'bg-[#f0f1f3] text-[#111827]' : ''
                        }`}
                      >
                        {subs.length > 0 ? (
                          <button onClick={(e) => { e.stopPropagation(); toggleProject(p.id); }} className="shrink-0 p-0">
                            <ChevronRight className={`size-3.5 text-[#4b5563] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </button>
                        ) : (
                          <ChevronRight className={`size-3.5 text-[#4b5563] transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} onClick={(e) => { e.stopPropagation(); toggleProject(p.id); }} />
                        )}
                        <div className="flex items-center gap-2 flex-1 min-w-0" onClick={() => activateProjectWorkspace(p.id)}>
                          <Cpu className={`size-4 shrink-0 ${activeProject === p.id && mainView === 'project' ? 'text-[#0f9e9a]' : 'text-[#4b5563]'}`} />
                          <span className={`text-[15px] flex-1 truncate font-medium ${activeProject === p.id && mainView === 'project' ? 'text-[#111827]' : 'text-[#4b5563]'}`}>{p.name}</span>
                        </div>
                        <span className="text-xs text-[#4b5563]">{pSessions.length}</span>
                        <button onClick={(e) => { e.stopPropagation(); setNewSubfolderProject(newSubfolderProject === p.id ? null : p.id); setExpandedProjects((prev) => new Set(prev).add(p.id)); }} className="hidden group-hover:block p-0.5 text-[#4b5563] hover:text-[#0f9e9a]" title="New subfolder"><FolderPlus className="size-4" /></button>
                        <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete project "${p.name}" and all its conversations?`)) handleDeleteProject(p.id); }} className="hidden group-hover:block p-0.5 text-[#4b5563] hover:text-red-400" title="Delete project"><Trash2 className="size-4" /></button>
                      </div>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="pl-10">
                          {/* New subfolder input */}
                          {newSubfolderProject === p.id && (
                            <div className="flex items-center gap-1.5 px-2 py-1.5 mr-1">
                              <input
                                autoFocus
                                value={newSubfolderName}
                                onChange={(e) => setNewSubfolderName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSubfolder(p.id); if (e.key === 'Escape') setNewSubfolderProject(null); }}
                                placeholder="Name"
                                className="min-w-0 flex-1 bg-[#f0f1f3] border border-[#c0c4cc] rounded-md px-2 py-1 text-sm text-[#111827] placeholder-[#9ca3af] placeholder:font-normal focus:outline-none focus:border-[#0f9e9a]"
                              />
                              <button onClick={() => handleCreateSubfolder(p.id)} className="p-1 text-[#0f9e9a]"><Check className="size-4" /></button>
                              <button onClick={() => setNewSubfolderProject(null)} className="p-1 text-[#4b5563]"><X className="size-4" /></button>
                            </div>
                          )}

                          {/* Subfolders */}
                          {subs.map((sf) => {
                            const sfSessions = subfolderSessions(p.id, sf.id);
                            const isSfExpanded = expandedSubfolders.has(sf.id);
                            return (
                              <div key={sf.id} className="mb-0.5">
                                <div
                                  className="flex items-center gap-2 mr-2 px-3 py-2 group rounded-lg hover:bg-[#f0f1f3] cursor-pointer"
                                  onClick={() => toggleSubfolder(sf.id)}
                                >
                                  <ChevronRight className={`size-3 text-[#4b5563] transition-transform ${isSfExpanded ? 'rotate-90' : ''}`} />
                                  <Hash className="size-3.5 text-[#4b5563]" />
                                  <span className="text-sm text-[#4b5563] flex-1 truncate">{sf.name}</span>
                                  <span className="text-xs text-[#4b5563]">{sfSessions.length}</span>
                                  <button onClick={(e) => { e.stopPropagation(); handleNewSessionInSubfolder(p.id, sf.id); }} className="hidden group-hover:block p-0.5 text-[#4b5563] hover:text-[#111827]" title="New conversation"><Plus className="size-3.5" /></button>
                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteSubfolder(p.id, sf.id); }} className="hidden group-hover:block p-0.5 text-[#4b5563] hover:text-red-400" title="Delete subfolder"><Trash2 className="size-3.5" /></button>
                                </div>
                                {isSfExpanded && (
                                  <div className="pl-7">
                                    {sfSessions.map((s) => <SessionItem key={s.id} s={s} />)}
                                    {sfSessions.length === 0 && <p className="text-xs text-[#4b5563] px-5 py-1.5">Empty</p>}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Root sessions (not in any subfolder) */}
                          <div className="pl-3">
                            {rootSessions.map((s) => <SessionItem key={s.id} s={s} />)}
                            {rootSessions.length === 0 && subs.length === 0 && <p className="text-xs text-[#4b5563] px-5 py-1.5">Empty</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* No sessions at all */}
            {sessions.length === 0 && projects.length === 0 && (
              <div className="py-10 text-center">
                <MessageSquare className="size-5 text-[#a0a8b4] mx-auto mb-2" />
                <p className="text-sm text-[#4b5563]">No conversations yet</p>
              </div>
            )}

            {/* (New project input is now inline in PROJECTS header above) */}
          </div>

          {/* Bottom: nav icons + sign out */}
          <div className="shrink-0 border-t border-[#c0c4cc] p-2 space-y-0.5">
            <button
              onClick={() => { setMainView('overview'); setActiveProject(null); closeSidebarOnMobile(); }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                mainView === 'overview' ? 'text-[#111827] bg-[#f0f1f3]' : 'text-[#4b5563] hover:text-[#111827] hover:bg-[#f0f1f3]'
              }`}
            >
              <LayoutDashboard className="size-4" />
              Overview
            </button>
            <button
              onClick={() => { setMainView('documents'); setActiveProject(null); closeSidebarOnMobile(); }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                mainView === 'documents' ? 'text-[#111827] bg-[#f0f1f3]' : 'text-[#4b5563] hover:text-[#111827] hover:bg-[#f0f1f3]'
              }`}
            >
              <FileText className="size-4" />
              Documents
            </button>
            <button
              onClick={() => { localStorage.removeItem('psv_dashboard_token'); document.cookie = 'psv_dashboard_token=; path=/; max-age=0'; window.location.href = '/dashboard/login'; }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#4b5563] hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </div>
        </aside>
        </>
      )}

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {/* Collapsed sidebar toggle */}
        {sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="absolute top-3 left-3 z-30 p-2.5 rounded-lg text-[#4b5563] hover:text-[#111827] hover:bg-[#f0f1f3] transition-colors"
          >
            <PanelLeft className="size-4" />
          </button>
        )}

        {mainView === 'overview' ? (
          <OverviewView agents={data.agents} client={data.client} />
        ) : mainView === 'documents' ? (
          <DocumentsView agents={data.agents} client={data.client} authHeaders={authHeaders} projects={projects} />
        ) : mainView === 'project' && activeProject ? (
          /* ===== PROJECT WORKSPACE VIEW ===== */
          (() => {
            const proj = projects.find((p) => p.id === activeProject);
            if (!proj) return <div className="flex-1 flex items-center justify-center"><p className="text-sm text-[#4b5563]">Project not found</p></div>;
            return (
              <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#f9fafb]">
                {/* Project header */}
                <div className="shrink-0 px-4 md:px-6 py-3 border-b border-[#c0c4cc] bg-white flex items-center gap-2 md:gap-3 flex-wrap">
                  <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0`}>
                    <Cpu className="size-3.5 text-white" />
                  </div>
                  <h2 className="text-base md:text-lg font-semibold text-[#111827] truncate">{proj.name}</h2>
                  <span className="text-xs text-[#0f9e9a] px-2 py-0.5 rounded bg-[#ecfdf5] font-medium">Subagent</span>
                  {proj.email && (
                    <span className="hidden md:flex text-xs text-[#4b5563] items-center gap-1">
                      <Mail className="size-3" />
                      {proj.email}
                    </span>
                  )}
                  {proj.doc_url && (
                    <a
                      href={proj.doc_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hidden md:flex text-xs text-[#0f9e9a] hover:text-[#0d8a87] px-2 py-1 rounded hover:bg-[#f0f1f3] transition-colors items-center gap-1"
                    >
                      <ExternalLink className="size-3" />
                      Instructions Doc
                    </a>
                  )}
                  <button
                    onClick={() => handleEditInstructions(activeProject!)}
                    className="ml-auto text-xs text-[#4b5563] hover:text-[#0f9e9a] px-2 py-1 rounded hover:bg-[#f0f1f3] transition-colors flex items-center gap-1"
                  >
                    <Pencil className="size-3" />
                    <span className="hidden md:inline">Edit</span>
                  </button>
                </div>

                {/* Chat area (takes most of the space) */}
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  <div className="flex-1 min-h-0 overflow-y-auto bg-white">
                    {loadingMsgs ? (
                      <div className="flex items-center justify-center h-full">
                        <Loader2 className="size-6 text-[#0f9e9a] animate-spin" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center max-w-sm">
                          <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center mx-auto mb-4`}>
                            <Cpu className="size-6 text-white" />
                          </div>
                          <p className="text-base font-semibold text-[#111827] mb-2">{proj.name} Agent</p>
                          <p className="text-sm text-[#4b5563] mb-1">This is a dedicated subagent for this project.</p>
                          <p className="text-sm text-[#4b5563]">Tell it what role to play and what tasks to handle — it starts as a clean slate.</p>
                          <p className="text-xs text-[#9ca3af] mt-3">Isolated from other projects. Memory stays within this project only.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-full md:max-w-[768px] mx-auto px-4 md:px-6 py-8">
                        <div className="space-y-6">
                          {messages.map((msg) => {
                            const isOtherClient = msg.role === 'user' && msg.sender && msg.sender.toLowerCase() !== data!.client.toLowerCase();
                            return (
                            <div key={msg.id} className={msg.role === 'user' && !isOtherClient ? 'flex justify-end' : ''}>
                              {msg.role === 'assistant' ? (
                                <div className="flex gap-3">
                                  <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 mt-1`}>
                                    <span className="text-white text-[10px] font-bold">{agent.displayName.charAt(0).toUpperCase()}</span>
                                  </div>
                                  <div className="flex-1 min-w-0 pt-0.5">
                                    <p className="text-xs font-medium text-[#4b5563] mb-1 capitalize">{agent.displayName}</p>
                                    <div className="text-[15px] text-[#111827] leading-relaxed">{renderMarkdown(msg.content)}</div>
                                    {msg.attachment && renderAttachment(msg.attachment, 'other')}
                                    {msg.timestamp && <p className="text-[10px] text-[#9ca3af] mt-1">{formatMessageTime(msg.timestamp)}</p>}
                                  </div>
                                </div>
                              ) : isOtherClient ? (
                                <div className="max-w-[75%]">
                                  <p className="text-[11px] text-[#4b5563] mb-0.5 capitalize">{msg.sender}</p>
                                  <div className="rounded-2xl rounded-bl-sm px-4 py-3 bg-[#e5e7eb]">
                                    <p className="text-[15px] text-[#111827] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                    {msg.attachment && renderAttachment(msg.attachment, 'other')}
                                  </div>
                                  <p className="text-[10px] text-[#9ca3af] mt-0.5">{msg.timestamp ? formatMessageTime(msg.timestamp) : ''}</p>
                                </div>
                              ) : (
                                <div className="max-w-[75%]">
                                  {msg.sender && <p className="text-[11px] text-[#4b5563] mb-0.5 text-right capitalize">{msg.sender}</p>}
                                  <div className="rounded-2xl rounded-br-sm px-4 py-3 bg-[#0f9e9a]">
                                    <p className="text-[15px] text-white leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                    {msg.attachment && renderAttachment(msg.attachment, 'user')}
                                  </div>
                                  <p className="text-[10px] text-[#9ca3af] mt-0.5 text-right">{msg.timestamp ? formatMessageTime(msg.timestamp) : ''}</p>
                                </div>
                              )}
                            </div>
                            );
                          })}
                          {sending && (
                            <div className="flex gap-3">
                              <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 mt-1`}>
                                <span className="text-white text-[10px] font-bold">{agent.displayName.charAt(0).toUpperCase()}</span>
                              </div>
                              <div className="pt-2">
                                <div className="flex items-center gap-1 px-1">
                                  {[0, 150, 300].map((delay) => (
                                    <span key={delay} className="w-2 h-2 rounded-full bg-[#0f9e9a] animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                          <div ref={messagesEndRef} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Project chat input */}
                  <div className="shrink-0 p-4 pb-2">
                    <div className="max-w-full md:max-w-[768px] mx-auto">
                      {pendingFile && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-[#f0f1f3] rounded-t-2xl border border-b-0 border-[#c0c4cc]">
                          <FileText className="size-4 text-[#0f9e9a] shrink-0" />
                          <span className="text-sm text-[#111827] truncate flex-1">{pendingFile.name}</span>
                          <span className="text-xs text-[#4b5563]">{formatFileSize(pendingFile.size)}</span>
                          <button onClick={() => setPendingFile(null)} className="p-0.5 text-[#4b5563] hover:text-red-400">
                            <X className="size-3.5" />
                          </button>
                        </div>
                      )}
                      <div className={`relative flex items-end bg-[#f0f1f3] border transition-colors ${
                        pendingFile ? 'rounded-b-2xl border-t-0' : 'rounded-2xl'
                      } ${
                        inputValue.trim() ? 'border-[#9ca3af]' : 'border-[#c0c4cc]'
                      }`}>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="p-2 ml-1.5 mb-2.5 text-[#4b5563] hover:text-[#0f9e9a] transition-colors shrink-0"
                          title="Attach file"
                        >
                          <Paperclip className="size-5" />
                        </button>
                        <textarea
                          ref={inputRef}
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder={`Message ${agent.displayName} about ${proj.name}...`}
                          rows={1}
                          className="flex-1 bg-transparent text-[15px] text-[#111827] placeholder-[#9ca3af] placeholder:font-normal px-2 py-3.5 resize-none focus:outline-none max-h-40 leading-relaxed selection:bg-[#0f9e9a]/40 selection:text-white"
                          style={{ minHeight: '52px' }}
                        />
                        <button
                          onClick={handleSend}
                          disabled={(!inputValue.trim() && !pendingFile) || uploading}
                          className={`mb-2.5 mr-2.5 p-2 rounded-lg transition-all shrink-0 ${
                            inputValue.trim() || pendingFile
                              ? 'bg-[#0f9e9a] text-white hover:bg-[#0dbdb8]'
                              : 'text-[#4b5563]'
                          }`}
                        >
                          {uploading ? <Loader2 className="size-5 animate-spin" /> : <ArrowUpRight className="size-5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Activity history — timeline of what the subagent has done */}
                {messages.length > 0 && (() => {
                  // Group assistant messages by date, extract links
                  const activityByDate = new Map<string, { summaries: string[]; links: { url: string; text: string }[] }>();
                  for (const msg of messages) {
                    if (msg.role !== 'assistant' || !msg.timestamp) continue;
                    const date = new Date(msg.timestamp);
                    const dateKey = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                    if (!activityByDate.has(dateKey)) activityByDate.set(dateKey, { summaries: [], links: [] });
                    const entry = activityByDate.get(dateKey)!;
                    // Extract first meaningful line as summary (skip empty lines)
                    const lines = msg.content.split('\n').filter((l: string) => l.trim());
                    const summary = lines[0]?.replace(/^#+\s*/, '').replace(/^\*\*(.+?)\*\*/, '$1').slice(0, 200) || '';
                    if (summary) entry.summaries.push(summary);
                    // Extract URLs from content
                    const urlRegex = /https?:\/\/[^\s)>\]]+/g;
                    let match;
                    while ((match = urlRegex.exec(msg.content)) !== null) {
                      const url = match[0];
                      // Try to find markdown link text
                      const mdLink = msg.content.match(new RegExp(`\\[([^\\]]+)\\]\\(${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`));
                      entry.links.push({ url, text: mdLink ? mdLink[1] : new URL(url).hostname });
                    }
                  }
                  if (activityByDate.size === 0) return null;
                  return (
                    <div className="shrink-0 border-t border-[#e5e7eb] bg-[#f9fafb]">
                      <div className="max-w-full md:max-w-[768px] mx-auto px-4 md:px-6 py-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Activity className="size-4 text-[#4b5563]" />
                          <span className="text-sm font-semibold text-[#111827]">Activity History</span>
                        </div>
                        <div className="space-y-4">
                          {[...activityByDate.entries()].reverse().map(([dateStr, { summaries, links }]) => (
                            <div key={dateStr} className="relative pl-5 border-l-2 border-[#e5e7eb]">
                              <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-[#0f9e9a]" />
                              <p className="text-xs font-semibold text-[#111827] mb-1">{dateStr}</p>
                              {summaries.slice(0, 3).map((s, i) => (
                                <p key={i} className="text-xs text-[#4b5563] leading-relaxed truncate">{s}</p>
                              ))}
                              {summaries.length > 3 && (
                                <p className="text-xs text-[#9ca3af]">+{summaries.length - 3} more</p>
                              )}
                              {links.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-1.5">
                                  {links.slice(0, 5).map((link, i) => (
                                    <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                                      className="text-[11px] text-[#0f9e9a] hover:text-[#0d8a87] bg-white border border-[#e5e7eb] rounded px-2 py-0.5 flex items-center gap-1 hover:bg-[#f0f1f3] transition-colors">
                                      <ExternalLink className="size-2.5" />
                                      {link.text}
                                    </a>
                                  ))}
                                  {links.length > 5 && <span className="text-[11px] text-[#9ca3af]">+{links.length - 5} links</span>}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Collapsible documents section */}
                <ProjectDocumentsSection
                  projectName={proj.name}
                  agent={agent}
                  agents={data.agents}
                  authHeaders={authHeaders}
                  collapsed={projectDocsCollapsed}
                  onToggle={() => setProjectDocsCollapsed(!projectDocsCollapsed)}
                />
              </div>
            );
          })()
        ) : (
          /* ===== CHAT VIEW ===== */
          <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#f9fafb]">
            {/* Messages area */}
            <div className="flex-1 min-h-0 overflow-y-auto bg-white">
              {!activeSession ? (
                /* Empty state — Claude-style: centered title + input + prompts */
                <div className="flex flex-col items-center justify-center h-full px-4">
                  <div className="max-w-2xl w-full">
                    {/* Greeting */}
                    <div className="text-center mb-8">
                      <h1 className="text-[32px] font-semibold text-[#111827] mb-3">
                        What can I help with?
                      </h1>
                      <div className="flex items-center justify-center gap-2">
                        <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                          <span className="text-white text-[9px] font-bold">{agent.displayName.charAt(0).toUpperCase()}</span>
                        </div>
                        <span className="text-sm text-[#4b5563] capitalize">{agent.displayName}</span>
                        <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-red-400'}`} />
                      </div>
                    </div>

                    {/* Input — inline in empty state like Claude */}
                    <div className="mb-4">
                      {pendingFile && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-[#f0f1f3] rounded-t-2xl border border-b-0 border-[#c0c4cc]">
                          <FileText className="size-4 text-[#0f9e9a] shrink-0" />
                          <span className="text-sm text-[#111827] truncate flex-1">{pendingFile.name}</span>
                          <span className="text-xs text-[#4b5563]">{formatFileSize(pendingFile.size)}</span>
                          <button onClick={() => setPendingFile(null)} className="p-0.5 text-[#4b5563] hover:text-red-400">
                            <X className="size-3.5" />
                          </button>
                        </div>
                      )}
                      <div className={`relative flex items-end bg-[#f0f1f3] border transition-colors ${
                        pendingFile ? 'rounded-b-2xl border-t-0' : 'rounded-2xl'
                      } ${
                        inputValue.trim() ? 'border-[#9ca3af]' : 'border-[#c0c4cc]'
                      }`}>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="p-2 ml-1.5 mb-2.5 text-[#4b5563] hover:text-[#0f9e9a] transition-colors shrink-0"
                          title="Attach file"
                        >
                          <Paperclip className="size-5" />
                        </button>
                        <textarea
                          ref={inputRef}
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder={`Message ${agent.displayName}...`}
                          rows={1}
                          className="flex-1 bg-transparent text-[15px] text-[#111827] placeholder-[#9ca3af] placeholder:font-normal px-2 py-3.5 resize-none focus:outline-none max-h-40 leading-relaxed selection:bg-[#0f9e9a]/40 selection:text-white"
                          style={{ minHeight: '52px' }}
                        />
                        <button
                          onClick={handleSend}
                          disabled={(!inputValue.trim() && !pendingFile) || uploading}
                          className={`mb-2.5 mr-2.5 p-2 rounded-lg transition-all shrink-0 ${
                            inputValue.trim() || pendingFile
                              ? 'bg-[#0f9e9a] text-white hover:bg-[#0dbdb8]'
                              : 'text-[#4b5563]'
                          }`}
                        >
                          {uploading ? <Loader2 className="size-5 animate-spin" /> : <ArrowUpRight className="size-5" />}
                        </button>
                      </div>
                    </div>

                    {/* Suggested prompts as pills below input */}
                    <div className="flex flex-wrap justify-center gap-2">
                      {prompts.map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => handlePromptClick(prompt)}
                          className="px-3.5 py-2 rounded-full border border-[#c0c4cc] bg-white text-[13px] text-[#4b5563] hover:text-[#111827] hover:border-[#9ca3af] hover:bg-[#f0f1f3] transition-all"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : loadingMsgs ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="size-6 text-[#0f9e9a] animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-[#4b5563]">Type a message to begin</p>
                </div>
              ) : (
                <div className="max-w-full md:max-w-[768px] mx-auto px-4 md:px-6 py-8">
                  <div className="space-y-6">
                    {messages.map((msg) => {
                      const isOtherClient = msg.role === 'user' && msg.sender && msg.sender.toLowerCase() !== data!.client.toLowerCase();
                      return (
                      <div key={msg.id} className={msg.role === 'user' && !isOtherClient ? 'flex justify-end' : ''}>
                        {msg.role === 'assistant' ? (
                          /* Assistant message - left aligned with avatar */
                          <div className="flex gap-3">
                            <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 mt-1`}>
                              <span className="text-white text-[10px] font-bold">{agent.displayName.charAt(0).toUpperCase()}</span>
                            </div>
                            <div className="flex-1 min-w-0 pt-0.5">
                              <p className="text-xs font-medium text-[#4b5563] mb-1 capitalize">{agent.displayName}</p>
                              <div className="text-[15px] text-[#111827] leading-relaxed">{renderMarkdown(msg.content)}</div>
                              {msg.attachment && renderAttachment(msg.attachment, 'other')}
                              {msg.timestamp && <p className="text-[10px] text-[#9ca3af] mt-1">{formatMessageTime(msg.timestamp)}</p>}
                            </div>
                          </div>
                        ) : isOtherClient ? (
                          /* Other client's message - left aligned gray bubble */
                          <div className="max-w-[75%]">
                            <p className="text-[11px] text-[#4b5563] mb-0.5 capitalize">{msg.sender}</p>
                            <div className="rounded-2xl rounded-bl-sm px-4 py-3 bg-[#e5e7eb]">
                              <p className="text-[15px] text-[#111827] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                              {msg.attachment && renderAttachment(msg.attachment, 'other')}
                            </div>
                            <p className="text-[10px] text-[#9ca3af] mt-0.5">{msg.timestamp ? formatMessageTime(msg.timestamp) : ''}</p>
                          </div>
                        ) : (
                          /* Current user message - right aligned bubble */
                          <div className="max-w-[75%]">
                            {msg.sender && <p className="text-[11px] text-[#4b5563] mb-0.5 text-right capitalize">{msg.sender}</p>}
                            <div className="rounded-2xl rounded-br-sm px-4 py-3 bg-[#0f9e9a]">
                              <p className="text-[15px] text-white leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                              {msg.attachment && renderAttachment(msg.attachment, 'user')}
                            </div>
                            <p className="text-[10px] text-[#9ca3af] mt-0.5 text-right">{msg.timestamp ? formatMessageTime(msg.timestamp) : ''}</p>
                          </div>
                        )}
                      </div>
                      );
                    })}

                    {sending && (
                      <div className="flex gap-3">
                        <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 mt-1`}>
                          <span className="text-white text-[10px] font-bold">{agent.displayName.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="pt-2">
                          <div className="flex items-center gap-1 px-1">
                            {[0, 150, 300].map((delay) => (
                              <span key={delay} className="w-2 h-2 rounded-full bg-[#0f9e9a] animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </div>
              )}
            </div>

            {/* Input — only when in active conversation */}
            {activeSession && (
              <div className="shrink-0 p-4 pb-6">
                <div className="max-w-full md:max-w-[768px] mx-auto">
                  {pendingFile && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-[#f0f1f3] rounded-t-2xl border border-b-0 border-[#c0c4cc]">
                      <FileText className="size-4 text-[#0f9e9a] shrink-0" />
                      <span className="text-sm text-[#111827] truncate flex-1">{pendingFile.name}</span>
                      <span className="text-xs text-[#4b5563]">{formatFileSize(pendingFile.size)}</span>
                      <button onClick={() => setPendingFile(null)} className="p-0.5 text-[#4b5563] hover:text-red-400">
                        <X className="size-3.5" />
                      </button>
                    </div>
                  )}
                  <div className={`relative flex items-end bg-[#f0f1f3] border transition-colors ${
                    pendingFile ? 'rounded-b-2xl border-t-0' : 'rounded-2xl'
                  } ${
                    inputValue.trim() ? 'border-[#9ca3af]' : 'border-[#c0c4cc]'
                  }`}>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 ml-1.5 mb-2.5 text-[#4b5563] hover:text-[#0f9e9a] transition-colors shrink-0"
                      title="Attach file"
                    >
                      <Paperclip className="size-5" />
                    </button>
                    <textarea
                      ref={inputRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={`Message ${agent.displayName}...`}
                      rows={1}
                      className="flex-1 bg-transparent text-[15px] text-[#111827] placeholder-[#9ca3af] placeholder:font-normal px-2 py-3.5 resize-none focus:outline-none max-h-40 leading-relaxed selection:bg-[#0f9e9a]/40 selection:text-white"
                      style={{ minHeight: '52px' }}
                    />
                    <button
                      onClick={handleSend}
                      disabled={(!inputValue.trim() && !pendingFile) || uploading}
                      className={`mb-2.5 mr-2.5 p-2 rounded-lg transition-all shrink-0 ${
                        inputValue.trim() || pendingFile
                          ? 'bg-[#0f9e9a] text-white hover:bg-[#0dbdb8]'
                          : 'text-[#4b5563]'
                      }`}
                    >
                      {uploading ? <Loader2 className="size-5 animate-spin" /> : <ArrowUpRight className="size-5" />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
