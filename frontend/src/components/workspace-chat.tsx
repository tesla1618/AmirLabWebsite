"use client";

import { loadingPlaceholder } from "@/lib/loading-style";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";
import {
  CheckCheck,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Reply,
  Send,
  Smile,
  Users,
} from "lucide-react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "@/components/auth-provider";
import { ProfileAvatar } from "@/components/profile-avatar";
import { IconButton } from "@/components/ui/icon-button";
import { ButtonControl } from "@/components/ui/button-control";
import { TextareaControl } from "@/components/ui/form-controls";
import { API_URL } from "@/lib/api";
import { cn } from "@/lib/cn";
import { apiRequest } from "@/lib/client-api";
import type {
  CollaborationConversation,
  CollaborationMessage,
} from "@/lib/types";

const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");

type Presence = "ONLINE" | "OFFLINE";

export function WorkspaceChat() {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [conversations, setConversations] = useState<
    CollaborationConversation[]
  >([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [messages, setMessages] = useState<CollaborationMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<CollaborationMessage | null>(null);
  const [presence, setPresence] = useState<Record<string, Presence>>({});
  const [typingUser, setTypingUser] = useState<string>();
  const [reactions, setReactions] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [pushState, setPushState] = useState<
    "idle" | "enabled" | "unavailable"
  >("idle");
  const selected = useMemo(
    () => conversations.find(({ id }) => id === selectedId),
    [conversations, selectedId],
  );
  const participants = selected?.members ?? [];
  const activeCount = participants.filter(
    ({ userId }) => presence[userId] === "ONLINE",
  ).length;

  useEffect(() => {
    let active = true;
    void Promise.all([
      apiRequest<CollaborationConversation[]>("/collaboration/conversations", {
        method: "GET",
      }),
      apiRequest<string[]>("/collaboration/presence", { method: "GET" }),
    ])
      .then(([items, onlineUserIds]) => {
        if (active) {
          setConversations(items);
          setSelectedId(items[0]?.id);
          setPresence(
            Object.fromEntries(
              onlineUserIds.map((userId) => [userId, "ONLINE"]),
            ),
          );
        }
      })
      .catch(
        () =>
          active &&
          setError("Chat could not load. Try refreshing the workspace."),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void apiRequest<CollaborationMessage[]>(
      `/collaboration/conversations/${selectedId}/messages`,
      { method: "GET" },
    )
      .then((items) => active && setMessages(items))
      .catch(() => active && setError("Messages could not load."));
    void apiRequest(`/collaboration/conversations/${selectedId}/read`, {
      method: "PATCH",
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [selectedId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const container = messagesRef.current;
      if (container) container.scrollTop = container.scrollHeight;
      else messagesEndRef.current?.scrollIntoView({ block: "end" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages.length, selectedId, typingUser]);

  useEffect(() => {
    if (!user) return;
    const socket = io(`${SOCKET_URL}/realtime`, {
      transports: ["websocket"],
      withCredentials: true,
    });
    socket.on("message.created", (message: CollaborationMessage) => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === message.conversationId
            ? {
                ...conversation,
                messages: [message],
                updatedAt: message.createdAt,
              }
            : conversation,
        ),
      );
      if (message.conversationId !== selectedId) return;
      setMessages((current) =>
        current.some(({ id }) => id === message.id)
          ? current
          : [...current, message],
      );
    });
    socket.on(
      "presence.updated",
      ({ userId, status }: { userId: string; status: Presence }) =>
        setPresence((current) => ({ ...current, [userId]: status })),
    );
    socket.on(
      "typing",
      ({ userId, active }: { userId: string; active: boolean }) =>
        setTypingUser(active && userId !== user.id ? userId : undefined),
    );
    socket.on(
      "message.reaction.changed",
      ({
        messageId,
        emoji,
        active,
      }: {
        messageId: string;
        emoji: string;
        active: boolean;
      }) =>
        setReactions((current) => ({
          ...current,
          [messageId]: active
            ? [...(current[messageId] ?? []), emoji]
            : (current[messageId] ?? []).filter((value) => value !== emoji),
        })),
    );
    socket.on("connect_error", () =>
      setError("Live chat is unavailable; messages can still be refreshed."),
    );
    socketRef.current = socket;
    const heartbeat = window.setInterval(
      () => socket.emit("presence.heartbeat"),
      30_000,
    );
    return () => {
      window.clearInterval(heartbeat);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [selectedId, user]);

  async function createLabConversation() {
    const conversation = await apiRequest<CollaborationConversation>(
      "/collaboration/conversations/lab",
      { method: "POST" },
    );
    setConversations((current) =>
      current.some(({ id }) => id === conversation.id)
        ? current
        : [conversation, ...current],
    );
    setSelectedId(conversation.id);
  }

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    const socket = socketRef.current;
    if (!socket || !selectedId || !draft.trim() || sending) return;
    setSending(true);
    socket.emit(
      "message.send",
      { conversationId: selectedId, body: draft, replyToId: replyTo?.id },
      (message: CollaborationMessage) => {
        if (!message) return;
        setMessages((current) =>
          current.some(({ id }) => id === message.id)
            ? current
            : [...current, message],
        );
        setDraft("");
        setReplyTo(null);
        socket.emit("typing", { conversationId: selectedId, active: false });
        setSending(false);
        window.requestAnimationFrame(() => composerRef.current?.focus());
      },
    );
    window.setTimeout(() => setSending(false), 5000);
  }

  function updateTyping(value: string) {
    setDraft(value);
    if (!selectedId) return;
    const socket = socketRef.current;
    socket?.emit("typing", {
      conversationId: selectedId,
      active: Boolean(value.trim()),
    });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (value.trim()) {
      typingTimerRef.current = setTimeout(() => {
        socket?.emit("typing", { conversationId: selectedId, active: false });
      }, 1200);
    }
  }

  return (
    <div className="grid h-full min-w-0">
      {error ? (
        <p
          className="m-0 border-l-[3px] border-danger bg-danger-soft px-4 py-[.8rem] text-danger-hover"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)] border-t border-line bg-surface max-[720px]:grid-cols-1">
        <aside className="min-h-0 border-r border-line p-4 max-[720px]:max-h-[190px] max-[720px]:overflow-auto max-[720px]:border-r-0 max-[720px]:border-b">
          <div className="flex items-center justify-between border-b border-line px-[.35rem] pt-[.2rem] pb-[.9rem] font-mono text-[.65rem] uppercase tracking-[.08em] text-ink-muted">
            <span>Conversations</span>
            <Users aria-hidden="true" size={16} />
          </div>
          <div data-loading={loading || undefined}>
            {(loading && !conversations.length
              ? Array.from({ length: 4 }, () => undefined)
              : conversations
            ).map((conversation, index) => (
              <ConversationRow
                conversation={conversation}
                active={Boolean(conversation && conversation.id === selectedId)}
                loading={loading && !conversation}
                presence={presence}
                onClick={
                  conversation
                    ? () => setSelectedId(conversation.id)
                    : undefined
                }
                key={conversation?.id ?? `conversation-loading-${index}`}
              />
            ))}
            {!loading && !conversations.length ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-[.55rem] p-6 text-center text-[.8rem] text-ink-muted [&>svg]:text-brand">
                <MessageCircle size={20} />
                <p>No conversations yet.</p>
                <ButtonControl
                  compact
                  onClick={() => void createLabConversation()}
                  variant="primary"
                >
                  Open lab channel
                </ButtonControl>
              </div>
            ) : null}
          </div>
        </aside>
        <section
          className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto]"
          aria-label="Conversation"
        >
          {selected || loading ? (
            <>
              <header
                className="flex min-h-[68px] items-center justify-between gap-4 border-b border-line px-6 py-[.6rem] max-[720px]:flex-col max-[720px]:items-start max-[720px]:gap-[.55rem]"
                data-loading={loading || undefined}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ProfileAvatar
                    avatarId={
                      selected
                        ? conversationPerson(selected)?.avatar?.id
                        : undefined
                    }
                    loading={loading}
                    name={
                      selected
                        ? conversationPerson(selected)?.fullName
                        : undefined
                    }
                    size="lg"
                  />
                  <div className="min-w-0">
                    <span
                      className={cn(
                        "m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-brand",
                        loadingPlaceholder(loading, "label"),
                      )}
                      data-placeholder={loading ? "label" : undefined}
                    >
                      {selected
                        ? selected.kind === "PROJECT"
                          ? "Project channel"
                          : selected.kind === "DIRECT"
                            ? "Direct conversation"
                            : "Lab channel"
                        : "Conversation type"}
                    </span>
                    <h2
                      className={cn(
                        "mt-[.2rem] overflow-hidden text-ellipsis whitespace-nowrap font-serif text-[1.15rem]",
                        loadingPlaceholder(loading, "text", "long"),
                      )}
                      data-placeholder={loading ? "text" : undefined}
                      data-placeholder-width="long"
                    >
                      {selected
                        ? (selected.title ?? conversationLabel(selected))
                        : "Conversation title"}
                    </h2>
                    <small
                      className={cn(
                        "mt-[.2rem] block text-[.7rem] text-ink-muted",
                        loadingPlaceholder(loading, "label", "medium"),
                      )}
                      data-placeholder={loading ? "label" : undefined}
                      data-placeholder-width="medium"
                    >
                      {selected
                        ? activeCount
                          ? `${activeCount} active now`
                          : "No one else is active"
                        : "Presence status"}
                    </small>
                  </div>
                </div>
                <div className="flex items-center gap-[.85rem] max-[720px]:flex-wrap max-[720px]:items-start max-[720px]:pl-[3.05rem]">
                  <span
                    className={cn(
                      "inline-flex items-center gap-[.45rem] font-mono text-[.65rem] uppercase text-brand max-[720px]:text-[.58rem]",
                      loadingPlaceholder(loading, "label"),
                    )}
                    data-placeholder={loading ? "label" : undefined}
                  >
                    <i className="h-1.5 w-1.5 rounded-full bg-brand animate-[status-pulse_2.2s_infinite] motion-reduce:animate-none" />{" "}
                    Live
                  </span>
                  <button
                    className={cn(
                      "cursor-pointer border-0 bg-transparent py-[.3rem] text-[.7rem] text-ink-muted hover:text-brand",
                      loadingPlaceholder(loading, "control"),
                    )}
                    data-placeholder={loading ? "control" : undefined}
                    disabled={loading}
                    onClick={() => void enablePush(setPushState)}
                    type="button"
                  >
                    {pushState === "enabled"
                      ? "Alerts on"
                      : pushState === "unavailable"
                        ? "Alerts unavailable"
                        : "Enable alerts"}
                  </button>
                  <div className="flex items-center pr-[.3rem] max-[720px]:pl-[3.05rem]">
                    {(loading && !participants.length
                      ? Array.from({ length: 3 }, () => undefined)
                      : participants.slice(0, 4)
                    ).map((participant, index) => (
                      <span
                        className="relative -ml-[.45rem] first:ml-0"
                        key={
                          participant?.userId ?? `participant-loading-${index}`
                        }
                      >
                        <ProfileAvatar
                          avatarId={participant?.user.person?.avatar?.id}
                          loading={loading && !participant}
                          name={participant?.user.person?.fullName}
                          size="sm"
                        />
                        {participant &&
                        presence[participant.userId] === "ONLINE" ? (
                          <i className="absolute -right-px -bottom-px h-2 w-2 rounded-full border-2 border-surface bg-success" />
                        ) : null}
                      </span>
                    ))}
                  </div>
                </div>
              </header>
              <div
                className="flex min-h-0 flex-col gap-[.52rem] overflow-auto bg-[color-mix(in_srgb,var(--canvas)_82%,var(--surface))] px-[clamp(1rem,3vw,2.2rem)] pt-[1.4rem] pb-8 max-[720px]:px-3 max-[720px]:pt-4 max-[720px]:pb-6"
                data-loading={loading || undefined}
                ref={messagesRef}
              >
                {loading && !selected ? (
                  Array.from({ length: 4 }, (_, index) => (
                    <MessageBubble
                      first={index === 0}
                      key={`message-loading-${index}`}
                      last={index === 3}
                      loading
                      mine={false}
                      onReact={() => undefined}
                      onReply={() => undefined}
                      reactions={[]}
                    />
                  ))
                ) : messages.length ? (
                  messages.map((message, index) => {
                    const first = !sameMessageGroup(
                      messages[index - 1],
                      message,
                    );
                    const last = !sameMessageGroup(
                      message,
                      messages[index + 1],
                    );
                    return (
                      <Fragment key={message.id}>
                        {isNewDate(message, messages[index - 1]) ? (
                          <div className="flex items-center justify-center gap-3 my-[.8rem] mb-[.6rem] font-mono text-[.6rem] uppercase tracking-[.05em] text-ink-faint before:h-px before:w-[15%] before:max-w-[120px] before:bg-line before:content-[''] after:h-px after:w-[15%] after:max-w-[120px] after:bg-line after:content-[''] max-[720px]:before:max-w-16 max-[720px]:after:max-w-16">
                            <span>{formatDateLabel(message.createdAt)}</span>
                          </div>
                        ) : null}
                        {message.kind === "SYSTEM" ? (
                          <SystemMessage message={message} />
                        ) : (
                          <MessageBubble
                            message={message}
                            mine={message.senderId === user?.id}
                            first={first}
                            last={last}
                            reactions={reactions[message.id] ?? []}
                            onReact={() =>
                              socketRef.current?.emit("message.react", {
                                messageId: message.id,
                                emoji: "👍",
                              })
                            }
                            onReply={() => setReplyTo(message)}
                          />
                        )}
                      </Fragment>
                    );
                  })
                ) : (
                  <div className="flex min-h-[260px] flex-col items-center justify-center gap-[.55rem] p-6 text-center text-ink-muted [&>svg]:text-brand [&>span]:text-[.8rem] [&>strong]:font-serif [&>strong]:text-[1.2rem] [&>strong]:text-ink">
                    <MessageCircle size={22} />
                    <strong>Start the lab conversation</strong>
                    <span>Share a useful update, question, or next step.</span>
                  </div>
                )}
                {typingUser ? (
                  <div className="flex items-center gap-[.2rem] py-[.3rem] text-[.7rem] text-ink-muted">
                    <span className="h-1 w-1 rounded-full bg-brand animate-[status-pulse_1.2s_infinite] motion-reduce:animate-none" />
                    <span className="h-1 w-1 rounded-full bg-brand animate-[status-pulse_1.2s_infinite_120ms] motion-reduce:animate-none" />
                    <span className="mr-1 h-1 w-1 rounded-full bg-brand animate-[status-pulse_1.2s_infinite_240ms] motion-reduce:animate-none" />{" "}
                    Someone is typing
                  </div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>
              <form
                className="grid gap-[.65rem] border-t border-line bg-surface px-[clamp(1rem,3vw,2.2rem)] pt-[.8rem] pb-4 max-[720px]:px-[.7rem]"
                data-loading={loading || undefined}

                onSubmit={submit}
              >
                {replyTo ? (
                  <div className="flex items-center gap-[.45rem] rounded-control border-l-[3px] border-brand bg-brand-soft px-[.7rem] py-[.55rem] text-[.72rem] text-ink-muted">
                    <Reply size={14} />
                    <span>
                      Replying to{" "}
                      <strong>
                        {replyTo.sender.person?.fullName ?? "a member"}
                      </strong>
                      : {replyTo.body}
                    </span>
                    <button
                      aria-label="Cancel reply"
                      className="ml-auto cursor-pointer border-0 bg-transparent text-[1.1rem] text-ink-muted hover:text-brand"
                      onClick={() => setReplyTo(null)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                ) : null}
                <div className="flex items-center gap-2">
                  <IconButton
                    aria-label="Attach file"
                    shape="round"
                    disabled
                    type="button"
                  >
                    <Paperclip size={17} />
                  </IconButton>
                  <TextareaControl
                    loading={loading}
                    aria-label="Message"
                    className="min-h-[42px] max-h-[140px] flex-1 resize-none rounded-control bg-canvas px-4 py-[.7rem] [field-sizing:content]"
                    disabled={loading || sending}
                    onChange={(event) => updateTyping(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder="Write a message"
                    ref={composerRef}
                    rows={1}
                    value={draft}
                  />
                  <IconButton
                    aria-label="Add reaction"
                    shape="round"
                    disabled
                    type="button"
                  >
                    <Smile size={17} />
                  </IconButton>
                  <ButtonControl
                    aria-label="Send message"
                    className="h-10 min-h-10 w-10 min-w-10 rounded-control p-0"
                    disabled={!draft.trim() || sending}
                    loading={loading}
                    type="submit"
                    variant="primary"
                  >
                    <Send size={16} />
                  </ButtonControl>
                </div>
              </form>
            </>
          ) : (
            <div className="flex min-h-[260px] flex-col items-center justify-center gap-[.55rem] p-6 text-center text-ink-muted [&>svg]:text-brand [&>span]:text-[.8rem] [&>strong]:font-serif [&>strong]:text-[1.2rem] [&>strong]:text-ink">
              <MessageCircle size={26} />
              <strong>Select a conversation</strong>
              <span>Choose a conversation to begin.</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ConversationRow({
  conversation,
  active,
  loading = false,
  presence,
  onClick,
}: {
  conversation?: CollaborationConversation;
  active: boolean;
  loading?: boolean;
  presence: Record<string, Presence>;
  onClick?: () => void;
}) {
  const person = conversation ? conversationPerson(conversation) : undefined;
  const last = conversation?.messages[0];
  return (
    <button
      className={cn(
        "flex w-full cursor-pointer items-center gap-[.7rem] border-0 border-b border-line bg-transparent px-[.35rem] py-[.9rem] text-left text-ink hover:bg-brand-soft disabled:cursor-default",
        active && "bg-brand-soft",
      )}
      data-loading={loading || undefined}
      disabled={loading || !conversation}
      onClick={onClick}
      type="button"
    >
      <span className="relative inline-flex">
        <ProfileAvatar
          avatarId={person?.avatar?.id}
          className="h-[42px] w-[42px]"
          loading={loading}
          name={person?.fullName}
          size="lg"
        />
        {!loading &&
        conversation?.members.some(
          ({ userId }) => presence[userId] === "ONLINE",
        ) ? (
          <i className="absolute -right-px bottom-0 h-2.5 w-2.5 rounded-full border-2 border-surface bg-success" />
        ) : null}
      </span>
      <span className="grid min-w-0 gap-1">
        <strong
          className={cn(
            "overflow-hidden text-ellipsis whitespace-nowrap text-[.86rem]",
            loadingPlaceholder(loading, "text", "long"),
          )}
          data-placeholder={loading ? "text" : undefined}
          data-placeholder-width="long"
        >
          {conversation
            ? conversationLabel(conversation)
            : "Conversation title"}
        </strong>
        <small
          className={cn(
            "text-[.7rem] text-ink-muted",
            loadingPlaceholder(loading, "text", "full"),
          )}
          data-placeholder={loading ? "text" : undefined}
          data-placeholder-width="full"
        >
          {conversation
            ? last
              ? last.kind === "SYSTEM"
                ? last.body
                : `${last.sender.person?.fullName ?? "Member"}: ${last.body}`
              : conversation.kind === "PROJECT"
                ? "Project channel"
                : "No messages yet"
            : "Latest message from this conversation"}
        </small>
      </span>
      <time
        className={cn(
          "ml-auto font-mono text-[.58rem] text-ink-faint",
          loadingPlaceholder(loading, "label", "short"),
        )}
        data-placeholder={loading ? "label" : undefined}
        data-placeholder-width="short"
      >
        {last ? formatTime(last.createdAt) : loading ? "00:00" : ""}
      </time>
    </button>
  );
}

function SystemMessage({ message }: { message: CollaborationMessage }) {
  return (
    <div className="mx-auto my-[.8rem] flex max-w-[80%] items-center justify-center gap-[.45rem] text-center text-[.72rem] text-ink-muted">
      <span className="rounded-small border border-line bg-[color-mix(in_srgb,var(--surface)_84%,transparent)] px-[.7rem] py-[.4rem]">
        {message.body}
      </span>
      <time className="font-mono text-[.58rem] text-ink-faint">
        {formatTime(message.createdAt)}
      </time>
    </div>
  );
}

function MessageBubble({
  message,
  mine,
  first,
  last,
  reactions,
  onReact,
  onReply,
  loading = false,
}: {
  message?: CollaborationMessage;
  mine: boolean;
  loading?: boolean;
  first: boolean;
  last: boolean;
  reactions: string[];
  onReact: () => void;
  onReply: () => void;
}) {
  const position =
    first && last
      ? "group-single"
      : first
        ? "group-first"
        : last
          ? "group-last"
          : "group-middle";
  return (
    <article
      className={cn(
        "max-w-[min(70%,650px)] max-[720px]:max-w-[88%]",
        mine ? "ml-auto self-end" : "mr-auto self-start",
        position === "group-middle" || position === "group-last"
          ? "-mt-[.42rem]"
          : "",
      )}
      data-loading={loading || undefined}
    >
      <div className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
        {!mine ? (
          last ? (
            <ProfileAvatar
              avatarId={message?.sender.person?.avatar?.id}
              loading={loading}
              name={message?.sender.person?.fullName}
              size="sm"
            />
          ) : (
            <span className="w-[30px] shrink-0" />
          )
        ) : null}
        <div
          className={cn(
            "relative min-w-0 max-w-full",
            mine && "w-full text-right",
          )}
        >
          {!mine && first ? (
            <small
              className={cn(
                "mb-[.3rem] ml-[.1rem] block font-mono text-[.6rem] tracking-[.01em] text-ink-muted",
                loadingPlaceholder(loading, "label"),
              )}
              data-placeholder={loading ? "label" : undefined}
            >
              {message?.sender.person?.fullName ?? "Lab member"}
            </small>
          ) : null}
          <div className="group relative inline-block max-w-full text-left">
            {message?.replyTo ? (
              <div
                className={cn(
                  "mb-[2px] flex max-w-full items-start gap-[.35rem] rounded-control border-l-[3px] border-brand bg-[color-mix(in_srgb,var(--ink)_7%,var(--surface))] px-[.58rem] py-[.42rem] text-[.68rem] leading-[1.3] text-ink-muted",
                  mine &&
                    "border-l-[color-mix(in_srgb,var(--on-accent)_68%,transparent)] bg-[color-mix(in_srgb,var(--brand)_77%,var(--surface))] text-[color-mix(in_srgb,var(--on-accent)_82%,transparent)]",
                )}
              >
                <Reply size={12} />
                <span>
                  <strong className={mine ? "text-on-accent" : undefined}>
                    {message.replyTo.sender?.fullName ?? "Member"}
                  </strong>
                  <br />
                  {message.replyTo.body}
                </span>
              </div>
            ) : null}
            <p
              className={cn(
                cn(
                  "m-0 whitespace-pre-wrap border border-[color-mix(in_srgb,var(--line)_72%,transparent)] bg-surface px-[.8rem] py-[.58rem] leading-[1.42] shadow-[0_1px_1px_color-mix(in_srgb,var(--ink)_4%,transparent)] [overflow-wrap:anywhere]",
                  mine && "border-brand bg-brand text-on-accent",
                  !mine && position === "group-single" && "rounded-panel",
                  !mine && position === "group-first" && "rounded-control",
                  !mine && position === "group-middle" && "rounded-control",
                  !mine && position === "group-last" && "rounded-control",
                  mine && position === "group-single" && "rounded-panel",
                  mine && position === "group-first" && "rounded-control",
                  mine && position === "group-middle" && "rounded-control",
                  mine && position === "group-last" && "rounded-control",
                ),
                loadingPlaceholder(loading, "text", "full"),
              )}
              data-placeholder={loading ? "text" : undefined}
              data-placeholder-width="full"
            >
              {message?.body ??
                "Message content is loading for this conversation."}
            </p>
            {!loading && reactions.length ? (
              <div
                className={cn(
                  "relative z-[1] -mt-[.42rem] ml-[.42rem] flex gap-1",
                  mine && "mr-[.42rem] ml-0 justify-end",
                )}
              >
                {reactions.map((emoji, index) => (
                  <span
                    className="rounded-small border border-line bg-surface px-[.35rem] py-[.15rem] text-[.75rem]"
                    key={`${emoji}-${index}`}
                  >
                    {emoji}
                  </span>
                ))}
              </div>
            ) : null}
            <div
              className={cn(
                "absolute right-[.15rem] top-[.1rem] flex -translate-y-full gap-[.15rem] opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 focus-within:opacity-100",
                mine && "right-auto left-[.15rem]",
              )}
              aria-hidden={loading || undefined}
            >
              <IconButton
                aria-label="Reply"
                onClick={onReply}
                shape="round"
                size="sm"
                variant="bordered"
              >
                <Reply size={13} />
              </IconButton>
              <IconButton
                aria-label="React"
                onClick={onReact}
                shape="round"
                size="sm"
                variant="bordered"
              >
                <Smile size={13} />
              </IconButton>
              <IconButton
                aria-label="More actions"
                shape="round"
                size="sm"
                variant="bordered"
              >
                <MoreHorizontal size={13} />
              </IconButton>
            </div>
          </div>
        </div>
      </div>
      {mine && last ? (
        <div className="mt-[.22rem] flex items-center justify-end gap-[.35rem] text-brand">
          <CheckCheck size={13} />
          <ProfileAvatar
            avatarId={message?.sender.person?.avatar?.id}
            className="opacity-90"
            loading={loading}
            name={message?.sender.person?.fullName}
            size="xs"
          />
        </div>
      ) : null}
    </article>
  );
}

function conversationPerson(conversation: CollaborationConversation) {
  return conversation.kind === "DIRECT"
    ? conversation.members[0]?.user.person
    : null;
}
function conversationLabel(conversation: CollaborationConversation) {
  return (
    conversation.title ??
    (conversation.kind === "DIRECT"
      ? (conversationPerson(conversation)?.fullName ?? "Direct conversation")
      : conversation.kind === "PROJECT"
        ? "Project channel"
        : "AMIR Lab")
  );
}
function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function isNewDate(
  message: CollaborationMessage,
  previous?: CollaborationMessage,
) {
  return (
    !previous ||
    new Date(message.createdAt).toDateString() !==
      new Date(previous.createdAt).toDateString()
  );
}
function sameMessageGroup(
  first?: CollaborationMessage,
  second?: CollaborationMessage,
) {
  return Boolean(
    first &&
    second &&
    first.kind === "USER" &&
    second.kind === "USER" &&
    first.senderId === second.senderId &&
    new Date(first.createdAt).toDateString() ===
      new Date(second.createdAt).toDateString() &&
    new Date(second.createdAt).getTime() -
      new Date(first.createdAt).getTime() <=
      5 * 60 * 1000,
  );
}
function formatDateLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? "Today"
    : date.toLocaleDateString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
}

async function enablePush(
  setState: (state: "idle" | "enabled" | "unavailable") => void,
) {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    setState("unavailable");
    return;
  }
  const { publicKey } = await apiRequest<{ publicKey: string | null }>(
    "/collaboration/push/public-key",
    { method: "GET" },
  );
  if (!publicKey || (await Notification.requestPermission()) !== "granted")
    return setState("unavailable");
  const registration =
    await navigator.serviceWorker.register("/push-worker.js");
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeKey(publicKey).buffer as ArrayBuffer,
  });
  await apiRequest("/collaboration/push/subscription", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(subscription),
  });
  setState("enabled");
}

function decodeKey(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
