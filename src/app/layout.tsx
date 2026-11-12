import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FlowPilot — Visual AI Workflow Automation Platform',
  description: 'Build workflows visually. Connect apps. Automate repetitive work without code.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900 selection:bg-blue-100 selection:text-blue-900">
        {children}
      </body>
    </html>
  );
}
