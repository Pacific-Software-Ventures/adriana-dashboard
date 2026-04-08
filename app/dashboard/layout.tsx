import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My AI Employees | PSV Dashboard',
  description: 'Monitor and interact with your AI employees',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
