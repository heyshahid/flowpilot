import React from 'react';
import {
  Play,
  Webhook,
  Clock,
  Globe,
  Mail,
  Bell,
  GitBranch,
  Filter,
  GitMerge,
  Sliders,
  Cpu,
  FileCode,
  Bot,
  Tag,
  FileText,
  Layers,
  HelpCircle,
  FileSpreadsheet,
  MessageSquare,
  Repeat,
  Split,
  Workflow,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  Play,
  Webhook,
  Clock,
  Globe,
  Mail,
  Bell,
  GitBranch,
  Filter,
  GitMerge,
  Sliders,
  Cpu,
  FileCode,
  Bot,
  Tag,
  FileText,
  Layers,
  FileSpreadsheet,
  MessageSquare,
  Repeat,
  Split,
  Workflow,
};

export function resolveNodeIcon(iconName?: string): React.ElementType {
  if (!iconName) return Layers;
  return ICON_MAP[iconName] || Layers;
}

