import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs/promises";
import { nanoid } from "nanoid";
import { z } from "zod";
import { mutateDb, readDb } from "./lib/store.js";
import { emitEvent, eventBus } from "./lib/events.js";
import { processConversation } from "./lib/runner.js";

export const app = express();
app.use(cors());
app.use(express.json());

const projectSchema = z.object({
  name: z.string().min(1),
  setupScript: z.string().min(1),
  baseDir: z.string().default(process.cwd())
});

app.get('/api/health', (_req,res)=>res.json({ok:true}));

app.get("/api/projects", async (_req, res) => {
  const db = await readDb();
  res.json(db.projects);
});

app.post("/api/projects", async (req, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const payload = parsed.data;
  await fs.access(payload.setupScript);

  const project = {
    id: nanoid(),
    name: payload.name,
    setupScript: path.resolve(payload.setupScript),
    baseDir: path.resolve(payload.baseDir),
    createdAt: new Date().toISOString()
  };

  await mutateDb((db) => {
    db.projects.push(project);
  });

  res.status(201).json(project);
});

app.get("/api/conversations", async (_req, res) => {
  const db = await readDb();
  res.json(db.conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
});

app.post("/api/conversations", async (req, res) => {
  const schema = z.object({
    projectId: z.string(),
    title: z.string().min(1)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const db = await readDb();
  const project = db.projects.find((p) => p.id === parsed.data.projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const id = nanoid();
  const conversation = {
    id,
    projectId: project.id,
    title: parsed.data.title,
    sessionDir: path.join(project.baseDir, `.session-${id}`),
    status: "running_setup" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await mutateDb((draft) => {
    draft.conversations.push(conversation);
  });

  processConversation(id);
  res.status(201).json(conversation);
});

app.get("/api/conversations/:id/messages", async (req, res) => {
  const db = await readDb();
  const messages = db.messages
    .filter((m) => m.conversationId === req.params.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  res.json(messages);
});

app.post("/api/conversations/:id/messages", async (req, res) => {
  const schema = z.object({ clientMessageId: z.string(), content: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const db = await readDb();
  const existing = db.messages.find(
    (m) => m.conversationId === req.params.id && m.clientMessageId === parsed.data.clientMessageId
  );
  if (existing) return res.json(existing);

  const conversation = db.conversations.find((c) => c.id === req.params.id);
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });

  const message = {
    id: nanoid(),
    conversationId: req.params.id,
    clientMessageId: parsed.data.clientMessageId,
    role: "user" as const,
    content: parsed.data.content,
    status: "sent" as const,
    createdAt: new Date().toISOString()
  };

  await mutateDb((draft) => {
    draft.messages.push(message);
    const convo = draft.conversations.find((c) => c.id === req.params.id);
    if (convo) {
      convo.updatedAt = new Date().toISOString();
      convo.status = "running_assistant";
    }
  });

  emitEvent({ type: "message.added", conversationId: req.params.id });
  emitEvent({ type: "conversation.updated", conversationId: req.params.id });
  processConversation(req.params.id);

  res.status(201).json(message);
});

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const listener = (payload: unknown) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  eventBus.on("event", listener);
  req.on("close", () => eventBus.off("event", listener));
});
