import { useEffect, useMemo, useState } from 'react';
import { Bell, Plus, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type Project = { id: string; name: string; setupScript: string; baseDir: string };
type Conversation = { id: string; title: string; projectId: string; status: string; lastError?: string; updatedAt: string; lastReadyAt?: string };
type Message = { id: string; role: 'user' | 'assistant'; content: string; createdAt: string; clientMessageId?: string };
type Pending = { clientMessageId: string; conversationId: string; content: string; createdAt: string };

const API = 'http://localhost:4000/api';

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [outbox, setOutbox] = useState<Pending[]>(() => JSON.parse(localStorage.getItem('outbox') ?? '[]'));
  const [newProject, setNewProject] = useState({ name: '', setupScript: '', baseDir: '' });

  const activeConversation = useMemo(() => conversations.find((c) => c.id === activeId), [activeId, conversations]);

  const loadBase = async () => {
    const [p, c] = await Promise.all([fetch(`${API}/projects`).then((r) => r.json()), fetch(`${API}/conversations`).then((r) => r.json())]);
    setProjects(p);
    setConversations(c);
    if (!activeId && c[0]?.id) setActiveId(c[0].id);
  };

  const loadMessages = async (conversationId: string) => {
    const data = await fetch(`${API}/conversations/${conversationId}/messages`).then((r) => r.json());
    setMessages(data);
  };

  useEffect(() => {
    loadBase();
    const timer = setInterval(loadBase, 4000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem('outbox', JSON.stringify(outbox));
  }, [outbox]);

  useEffect(() => {
    if (!activeId) return;
    loadMessages(activeId);
    const timer = setInterval(() => loadMessages(activeId), 2500);
    return () => clearInterval(timer);
  }, [activeId]);

  useEffect(() => {
    const events = new EventSource(`${API}/events`);
    events.onmessage = () => {
      loadBase();
      if (activeId) loadMessages(activeId);
    };
    return () => events.close();
  }, [activeId]);

  useEffect(() => {
    const retry = async () => {
      for (const pending of outbox) {
        try {
          await fetch(`${API}/conversations/${pending.conversationId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientMessageId: pending.clientMessageId, content: pending.content })
          });
          setOutbox((prev) => prev.filter((item) => item.clientMessageId !== pending.clientMessageId));
        } catch {
          return;
        }
      }
    };

    retry();
    const interval = setInterval(retry, 3000);
    window.addEventListener('online', retry);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', retry);
    };
  }, [outbox]);

  useEffect(() => {
    if (Notification.permission === 'default') Notification.requestPermission();
  }, []);

  useEffect(() => {
    const readyElsewhere = conversations.filter((c) => c.id !== activeId && c.status === 'ready' && c.lastReadyAt).at(0);
    if (readyElsewhere && Notification.permission === 'granted') {
      new Notification('Conversation ready', { body: `${readyElsewhere.title} is ready for your next turn.` });
    }
  }, [activeId, conversations]);

  const createProject = async () => {
    await fetch(`${API}/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newProject) });
    setNewProject({ name: '', setupScript: '', baseDir: '' });
    await loadBase();
  };

  const createConversation = async (projectId: string) => {
    const title = prompt('Conversation title') || 'New conversation';
    await fetch(`${API}/conversations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, title }) });
    await loadBase();
  };

  const send = async () => {
    if (!activeId || !draft.trim()) return;
    const payload = { clientMessageId: `local-${Date.now()}`, conversationId: activeId, content: draft, createdAt: new Date().toISOString() };
    setOutbox((prev) => [...prev, payload]);
    setMessages((prev) => [...prev, { id: payload.clientMessageId, role: 'user', content: draft, createdAt: payload.createdAt, clientMessageId: payload.clientMessageId }]);
    setDraft('');
  };

  const pendingForConversation = outbox.filter((item) => item.conversationId === activeId);

  return (
    <div className="grid h-screen grid-cols-[300px_1fr] gap-4 p-4">
      <Card className="p-4 flex flex-col gap-4 overflow-hidden">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Conversations</h1>
          <Bell className="h-4 w-4" />
        </div>

        <div className="space-y-2 rounded-lg border border-border p-2">
          <Input placeholder="Project name" value={newProject.name} onChange={(e) => setNewProject((s) => ({ ...s, name: e.target.value }))} />
          <Input placeholder="Setup script path" value={newProject.setupScript} onChange={(e) => setNewProject((s) => ({ ...s, setupScript: e.target.value }))} />
          <Input placeholder="Base directory" value={newProject.baseDir} onChange={(e) => setNewProject((s) => ({ ...s, baseDir: e.target.value }))} />
          <Button className="w-full" onClick={createProject}>Create Project</Button>
        </div>

        <div className="space-y-2 overflow-auto">
          {projects.map((project) => (
            <div key={project.id} className="rounded-lg border border-border p-2">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium">{project.name}</div>
                <Button size="sm" variant="ghost" onClick={() => createConversation(project.id)}><Plus className="h-4 w-4" /></Button>
              </div>
              {conversations.filter((c) => c.projectId === project.id).map((conversation) => (
                <button key={conversation.id} className="mb-1 w-full rounded-md border border-border p-2 text-left text-xs hover:bg-muted" onClick={() => setActiveId(conversation.id)}>
                  <div className="font-medium">{conversation.title}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge>{conversation.status}</Badge>
                    {conversation.lastError && <span className="text-red-400">error</span>}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 flex flex-col">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{activeConversation?.title ?? 'Select a conversation'}</h2>
          {pendingForConversation.length > 0 && <Badge>{pendingForConversation.length} pending</Badge>}
        </div>
        <div className="flex-1 overflow-auto rounded-lg border border-border p-3 space-y-3">
          {messages.map((message) => (
            <div key={message.id} className={`max-w-[80%] rounded-lg p-3 text-sm ${message.role === 'user' ? 'ml-auto bg-muted' : 'bg-zinc-800'}`}>
              {message.content}
              {message.clientMessageId && outbox.some((o) => o.clientMessageId === message.clientMessageId) && (
                <div className="mt-1 text-xs text-yellow-300">Pending sync…</div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input placeholder="Type your message" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
          <Button onClick={send}><Send className="h-4 w-4" /></Button>
        </div>
      </Card>
    </div>
  );
}
