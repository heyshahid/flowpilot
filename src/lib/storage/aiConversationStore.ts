import fs from 'fs';
import path from 'path';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface AIConversation {
  id: string;
  title: string;
  workspaceId: string;
  workflowId?: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'ai_conversations.json');

export class AIConversationStore {
  private static instance: AIConversationStore;
  private cache: AIConversation[] = [];
  private isLoaded = false;

  private constructor() {
    this.ensureDataFile();
  }

  public static getInstance(): AIConversationStore {
    if (!AIConversationStore.instance) {
      AIConversationStore.instance = new AIConversationStore();
    }
    return AIConversationStore.instance;
  }

  private ensureDataFile(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
      const initial: AIConversation[] = [
        {
          id: 'conv_lead_gen_sample',
          title: 'Lead Gen & Slack Notification Assistant',
          workspaceId: 'ws_default',
          workflowId: 'wf_crm_sync',
          messages: [
            {
              id: 'msg_1',
              role: 'user',
              content: 'Build a workflow that captures form submissions and alerts Slack if the lead budget is over $5k.',
              timestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
            },
            {
              id: 'msg_2',
              role: 'assistant',
              content: 'I generated a workflow proposal featuring a Webhook Trigger, an If/Else budget condition, and a Slack Notification node for the VIP channel.',
              timestamp: new Date(Date.now() - 3600000 * 5 + 2000).toISOString(),
            },
          ],
          createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
          updatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
        },
      ];
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      this.cache = initial;
      this.isLoaded = true;
    }
  }

  private load(): void {
    if (this.isLoaded) return;
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        this.cache = JSON.parse(raw);
      }
    } catch {
      this.cache = [];
    }
    this.isLoaded = true;
  }

  private save(): void {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.cache, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save AI conversations:', e);
    }
  }

  public list(workspaceId = 'ws_default'): AIConversation[] {
    this.load();
    return this.cache
      .filter((c) => !workspaceId || c.workspaceId === workspaceId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public getById(id: string): AIConversation | undefined {
    this.load();
    return this.cache.find((c) => c.id === id);
  }

  public create(title: string, workspaceId = 'ws_default', workflowId?: string): AIConversation {
    this.load();
    const newConv: AIConversation = {
      id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: title || 'New AI Conversation',
      workspaceId,
      workflowId,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.cache.unshift(newConv);
    this.save();
    return newConv;
  }

  public addMessage(
    conversationId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: Record<string, any>
  ): ConversationMessage {
    this.load();
    const conv = this.cache.find((c) => c.id === conversationId);
    if (!conv) {
      throw new Error(`Conversation "${conversationId}" not found.`);
    }

    const msg: ConversationMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      role,
      content,
      timestamp: new Date().toISOString(),
      metadata,
    };

    conv.messages.push(msg);
    conv.updatedAt = new Date().toISOString();
    this.save();
    return msg;
  }

  public delete(id: string): boolean {
    this.load();
    const initLen = this.cache.length;
    this.cache = this.cache.filter((c) => c.id !== id);
    if (this.cache.length !== initLen) {
      this.save();
      return true;
    }
    return false;
  }
}

export const aiConversationStore = AIConversationStore.getInstance();
