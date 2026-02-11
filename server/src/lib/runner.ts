import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { mutateDb, readDb } from "./store.js";
import { emitEvent } from "./events.js";
import { Conversation, Message } from "../types.js";

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const inflight = new Set<string>();

function runProcess(command: string, args: string[], cwd: string) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(command, args, { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
    child.on("error", (err) => resolve({ code: -1, stdout, stderr: err.message }));
  });
}

export async function ensureSetup(conversation: Conversation, setupScript: string) {
  const setupMarker = path.join(conversation.sessionDir, ".setup-complete");
  try {
    await fs.access(setupMarker);
    return;
  } catch {
    // continue
  }

  await mutateDb(async (db) => {
    const current = db.conversations.find((c) => c.id === conversation.id);
    if (!current) return;
    current.status = "running_setup";
    current.updatedAt = new Date().toISOString();
  });
  emitEvent({ type: "conversation.updated", conversationId: conversation.id });

  await fs.mkdir(conversation.sessionDir, { recursive: true });
  const result = await runProcess("python", [setupScript], conversation.sessionDir);
  if (result.code !== 0) {
    await mutateDb(async (db) => {
      const current = db.conversations.find((c) => c.id === conversation.id);
      if (!current) return;
      current.status = "error";
      current.lastError = `Setup failed: ${result.stderr || result.stdout}`;
      current.updatedAt = new Date().toISOString();
    });
    emitEvent({ type: "conversation.updated", conversationId: conversation.id });
    throw new Error(`Setup failed for ${conversation.id}`);
  }

  await fs.writeFile(setupMarker, new Date().toISOString(), "utf8");
}

async function generateAssistantMessage(history: Message[]) {
  if (!anthropic) {
    const last = history.filter((m) => m.role === "user").at(-1);
    return `Mock assistant reply: ${last?.content ?? "Hello"}`;
  }

  const resp = await anthropic.messages.create({
    model: "claude-3-5-sonnet-latest",
    max_tokens: 1024,
    messages: history.map((m) => ({ role: m.role, content: m.content }))
  });

  const text = resp.content.find((block) => block.type === "text");
  return text?.text ?? "(no text output)";
}

export async function processConversation(conversationId: string) {
  if (inflight.has(conversationId)) return;
  inflight.add(conversationId);

  try {
    const db = await readDb();
    const conversation = db.conversations.find((c) => c.id === conversationId);
    if (!conversation) return;
    const project = db.projects.find((p) => p.id === conversation.projectId);
    if (!project) return;

    await ensureSetup(conversation, project.setupScript);

    await mutateDb(async (draft) => {
      const c = draft.conversations.find((item) => item.id === conversationId);
      if (!c) return;
      c.status = "running_assistant";
      c.updatedAt = new Date().toISOString();
      c.lastError = undefined;
    });
    emitEvent({ type: "conversation.updated", conversationId });

    const latest = await readDb();
    const history = latest.messages
      .filter((m) => m.conversationId === conversationId && m.status !== "failed")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    if (!history.length || history.at(-1)?.role !== "user") {
      await mutateDb(async (draft) => {
        const c = draft.conversations.find((item) => item.id === conversationId);
        if (!c) return;
        c.status = "ready";
        c.updatedAt = new Date().toISOString();
      });
      emitEvent({ type: "conversation.updated", conversationId });
      return;
    }

    const content = await generateAssistantMessage(history);

    await mutateDb(async (draft) => {
      draft.messages.push({
        id: `m_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        conversationId,
        role: "assistant",
        content,
        status: "sent",
        createdAt: new Date().toISOString()
      });
      const c = draft.conversations.find((item) => item.id === conversationId);
      if (!c) return;
      c.status = "ready";
      c.updatedAt = new Date().toISOString();
      c.lastReadyAt = new Date().toISOString();
    });
    emitEvent({ type: "message.added", conversationId });
    emitEvent({ type: "conversation.updated", conversationId });
  } catch (error) {
    await mutateDb(async (db) => {
      const c = db.conversations.find((item) => item.id === conversationId);
      if (!c) return;
      c.status = "error";
      c.lastError = error instanceof Error ? error.message : String(error);
      c.updatedAt = new Date().toISOString();
    });
    emitEvent({ type: "conversation.updated", conversationId });
  } finally {
    inflight.delete(conversationId);
  }
}
