export type Project = {
  id: string;
  name: string;
  setupScript: string;
  baseDir: string;
  createdAt: string;
};

export type MessageRole = "user" | "assistant";

export type Message = {
  id: string;
  clientMessageId?: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: "queued" | "sent" | "failed";
  createdAt: string;
};

export type ConversationStatus = "running_setup" | "ready" | "running_assistant" | "error";

export type Conversation = {
  id: string;
  projectId: string;
  title: string;
  sessionDir: string;
  status: ConversationStatus;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  lastReadyAt?: string;
};

export type DB = {
  projects: Project[];
  conversations: Conversation[];
  messages: Message[];
};
