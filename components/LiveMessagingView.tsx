'use client';

import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCheck,
  Download,
  FileText,
  Forward,
  Image as ImageIcon,
  MessageSquare,
  Paperclip,
  Reply,
  Search,
  Send,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import type { ChatMessage, UserProfile } from '@/lib/types';
import { formatIndiaTime } from '@/lib/portal-logic';
import { DeviceFileUpload, type UploadedFileMeta } from './DeviceFileUpload';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { OFFICIAL_ALNIBRAS_LOGO_PATH } from './OfficialBrandingView';

export interface LiveMessagingViewProps {
  currentUser: UserProfile;
  users: UserProfile[];
  chatMessages: ChatMessage[];
  onSendMessage: (payload: {
    recipientId: string;
    text: string;
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentType?: string;
    replyToId?: string;
    replyToSenderName?: string;
    replyToText?: string;
    forwardedFromName?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onDeleteMessage?: (id: string) => Promise<{ ok: boolean; error?: string }>;
  onMarkRead?: (conversationId: string) => void;
  showToast?: (message: string, type: 'success' | 'error') => void;
}

export function LiveMessagingView({
  currentUser,
  users = [],
  chatMessages = [],
  onSendMessage,
  onDeleteMessage,
  onMarkRead,
  showToast,
}: LiveMessagingViewProps) {
  const isAdmin = currentUser.role === 'admin';
  const students = useMemo(() => users.filter((u) => u.role === 'student'), [users]);

  const [selectedStudentUid, setSelectedStudentUid] = useState<string>(() => {
    if (isAdmin) {
      return students[0]?.uid || '';
    }
    return 'admin_super';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [messageFilterQuery, setMessageFilterQuery] = useState('');
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  const [stagedAttachment, setStagedAttachment] = useState<UploadedFileMeta | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  const [pendingDeleteChat, setPendingDeleteChat] = useState<ChatMessage | null>(null);
  const [isDeletingChat, setIsDeletingChat] = useState(false);

  // Group messages for active conversation
  const currentConversationMessages = useMemo(() => {
    const raw = isAdmin
      ? chatMessages.filter(
          (m) =>
            (m.senderId === selectedStudentUid && m.recipientId === currentUser.uid) ||
            (m.senderId === currentUser.uid && m.recipientId === selectedStudentUid) ||
            m.conversationId === selectedStudentUid
        )
      : chatMessages.filter(
          (m) =>
            (m.senderId === currentUser.uid && m.recipientId === 'admin_super') ||
            (m.senderId === 'admin_super' && m.recipientId === currentUser.uid) ||
            m.conversationId === currentUser.uid
        );

    if (!messageFilterQuery.trim()) return raw;
    const q = messageFilterQuery.toLowerCase();
    return raw.filter(
      (m) =>
        m.text.toLowerCase().includes(q) ||
        (m.attachmentName || '').toLowerCase().includes(q)
    );
  }, [chatMessages, isAdmin, selectedStudentUid, currentUser.uid, messageFilterQuery]);

  // Student conversations metadata for left sidebar
  const studentConversationList = useMemo(() => {
    if (!isAdmin) {
      const msgs = chatMessages.filter(
        (m) =>
          (m.senderId === currentUser.uid && m.recipientId === 'admin_super') ||
          (m.senderId === 'admin_super' && m.recipientId === currentUser.uid) ||
          m.conversationId === currentUser.uid
      );
      const lastMessage = msgs[msgs.length - 1];
      const unreadCount = msgs.filter((m) => m.senderId === 'admin_super' && !m.read).length;
      return [
        {
          uid: 'admin_super',
          title: 'AL-NIBRAS Secretariat',
          subtitle: 'Super Admin · Official Union Desk',
          avatarUrl: OFFICIAL_ALNIBRAS_LOGO_PATH,
          lastMessage,
          unreadCount,
        },
      ];
    }

    return students.map((student) => {
      const msgs = chatMessages.filter(
        (m) =>
          (m.senderId === student.uid && m.recipientId === currentUser.uid) ||
          (m.senderId === currentUser.uid && m.recipientId === student.uid) ||
          m.conversationId === student.uid
      );

      const lastMessage = msgs[msgs.length - 1];
      const unreadCount = msgs.filter((m) => m.senderId === student.uid && !m.read).length;

      return {
        uid: student.uid,
        title: student.fullName,
        subtitle: `${student.studentId} · Roll ${student.rollNumber}`,
        avatarUrl: student.avatarUrl || '/images/avatar_admin_portrait.jpg',
        lastMessage,
        unreadCount,
      };
    });
  }, [isAdmin, students, chatMessages, currentUser.uid]);

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return studentConversationList;
    const q = searchQuery.toLowerCase();
    return studentConversationList.filter(
      (c) => c.title.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q)
    );
  }, [studentConversationList, searchQuery]);

  const activeStudentProfile = useMemo(() => {
    return students.find((s) => s.uid === selectedStudentUid);
  }, [students, selectedStudentUid]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !stagedAttachment) return;

    setIsSending(true);
    const recipientId = isAdmin ? selectedStudentUid : 'admin_super';

    try {
      const res = await onSendMessage({
        recipientId,
        text: inputText.trim(),
        attachmentUrl: stagedAttachment?.url,
        attachmentName: stagedAttachment?.name,
        attachmentType: stagedAttachment?.type,
        replyToId: replyingTo?.id,
        replyToSenderName: replyingTo?.senderName,
        replyToText: replyingTo?.text || replyingTo?.attachmentName,
      });

      if (res.ok) {
        setInputText('');
        setStagedAttachment(null);
        setReplyingTo(null);
      } else {
        showToast?.(res.error || 'Failed to send message.', 'error');
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleForwardTo = async (targetRecipientId: string) => {
    if (!forwardingMessage) return;
    setIsSending(true);
    try {
      const res = await onSendMessage({
        recipientId: targetRecipientId,
        text: forwardingMessage.text,
        attachmentUrl: forwardingMessage.attachmentUrl,
        attachmentName: forwardingMessage.attachmentName,
        attachmentType: forwardingMessage.attachmentType,
        forwardedFromName: forwardingMessage.senderName,
      });
      if (res.ok) {
        showToast?.('Message forwarded.', 'success');
        setForwardingMessage(null);
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="telegram-chat-view">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-serif font-bold text-[#0C1A2E]">
            Chat &amp; Direct Secretariat Messenger
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Telegram-style real-time union messaging with replies, forwarding, read receipts, and
            Image / Video / PDF / Document attachments.
          </p>
        </div>
      </div>

      {/* Main Telegram-Style Split Container */}
      <div className="bg-white border border-[#E2DDD2] rounded-2xl overflow-hidden shadow-md grid grid-cols-1 md:grid-cols-12 min-h-[620px]">
        {/* LEFT SIDEBAR: Conversation List */}
        <div className="md:col-span-4 border-r border-[#E2DDD2] flex flex-col bg-[#F8FAFC]">
          {/* Search Bar */}
          <div className="p-3.5 border-b border-[#E2DDD2] bg-white">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl focus:outline-none focus:border-[#0C1A2E]"
              />
            </div>
          </div>

          {/* Conversation Items */}
          <div className="grow overflow-y-auto divide-y divide-[#E2DDD2]/60">
            {filteredConversations.map((conv) => {
              const isSelected = isAdmin
                ? selectedStudentUid === conv.uid
                : conv.uid === 'admin_super';
              return (
                <button
                  key={conv.uid}
                  type="button"
                  onClick={() => {
                    if (isAdmin) {
                      setSelectedStudentUid(conv.uid);
                      onMarkRead?.(conv.uid);
                    } else {
                      onMarkRead?.(currentUser.uid);
                    }
                  }}
                  className={`w-full text-left p-3.5 flex items-center gap-3 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#0C1A2E] text-white'
                      : 'hover:bg-white text-[#0F172A]'
                  }`}
                >
                  <div className="relative shrink-0">
                    <img
                      src={conv.avatarUrl}
                      alt={conv.title}
                      className="w-11 h-11 rounded-full object-cover border-2 border-[#C59B27] bg-white"
                    />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white absolute bottom-0 right-0" />
                  </div>

                  <div className="grow min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`font-bold text-xs truncate ${
                          isSelected ? 'text-white' : 'text-[#0C1A2E]'
                        }`}
                      >
                        {conv.title}
                      </span>
                      {conv.lastMessage && (
                        <span
                          className={`text-[10px] font-mono shrink-0 ${
                            isSelected ? 'text-[#E6C665]' : 'text-slate-400'
                          }`}
                        >
                          {formatIndiaTime(conv.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>

                    <div
                      className={`text-[10px] font-mono truncate ${
                        isSelected ? 'text-slate-300' : 'text-[#9A7515]'
                      }`}
                    >
                      {conv.subtitle}
                    </div>

                    <p
                      className={`text-[11px] truncate mt-0.5 ${
                        isSelected ? 'text-slate-200' : 'text-slate-500'
                      }`}
                    >
                      {conv.lastMessage?.text ||
                        (conv.lastMessage?.attachmentName
                          ? `📎 ${conv.lastMessage.attachmentName}`
                          : 'No messages yet.')}
                    </p>
                  </div>

                  {conv.unreadCount > 0 && (
                    <span className="px-2 py-0.5 bg-[#C59B27] text-[#07111F] font-extrabold text-[10px] rounded-full shrink-0 font-mono">
                      {conv.unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT CONVERSATION WINDOW */}
        <div className="md:col-span-8 flex flex-col bg-[#F0ECE1]/50">
          {/* Chat Header */}
          <div className="px-5 py-3.5 border-b border-[#E2DDD2] bg-white flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img
                src={
                  isAdmin
                    ? activeStudentProfile?.avatarUrl || '/images/avatar_admin_portrait.jpg'
                    : OFFICIAL_ALNIBRAS_LOGO_PATH
                }
                alt="Chat Partner"
                className="w-10 h-10 rounded-full object-cover border border-[#C59B27] bg-white"
              />
              <div>
                <h3 className="text-sm font-bold text-[#0C1A2E]">
                  {isAdmin
                    ? activeStudentProfile?.fullName || 'Select a student'
                    : 'AL-NIBRAS Secretariat & Super Admin'}
                </h3>
                <p className="text-[11px] text-[#64748B] font-mono">
                  {isAdmin
                    ? `${activeStudentProfile?.studentId || ''} · Roll: ${
                        activeStudentProfile?.rollNumber || 'N/A'
                      }`
                    : 'Official Union Administration · Online'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={messageFilterQuery}
                  onChange={(e) => setMessageFilterQuery(e.target.value)}
                  placeholder="Search in chat..."
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-[#CBD5E1] text-xs bg-[#F8FAFC]"
                />
              </div>
            </div>
          </div>

          {/* Messages Stream */}
          <div className="grow p-5 overflow-y-auto space-y-3 min-h-[380px]">
            {currentConversationMessages.length === 0 ? (
              <div className="py-20 text-center text-xs text-slate-500 space-y-2">
                <MessageSquare className="w-8 h-8 text-[#9A7515] mx-auto opacity-60" />
                <p className="font-semibold text-[#0C1A2E]">No messages in this chat yet.</p>
                <p className="text-[11px]">
                  Send a message or attach an Image, Video, PDF, or Document below.
                </p>
              </div>
            ) : (
              currentConversationMessages.map((msg) => {
                const isMine = msg.senderId === currentUser.uid;
                const isImage =
                  msg.attachmentType?.startsWith('image/') ||
                  msg.attachmentUrl?.startsWith('data:image/') ||
                  msg.attachmentName?.match(/\.(png|jpg|jpeg|webp|gif)$/i);
                const isVideo =
                  msg.attachmentType?.startsWith('video/') ||
                  msg.attachmentUrl?.startsWith('data:video/') ||
                  msg.attachmentName?.match(/\.(mp4|webm|mov)$/i);

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-lg rounded-2xl p-3.5 space-y-2 text-xs shadow-xs group relative ${
                        isMine
                          ? 'bg-[#0C1A2E] text-white rounded-tr-xs'
                          : 'bg-white border border-[#E2DDD2] text-[#0F172A] rounded-tl-xs'
                      }`}
                    >
                      {/* Forwarded Indicator */}
                      {msg.forwardedFromName && (
                        <div
                          className={`text-[10px] italic flex items-center gap-1 ${
                            isMine ? 'text-[#E6C665]' : 'text-[#9A7515]'
                          }`}
                        >
                          <Forward className="w-3 h-3" />
                          Forwarded from {msg.forwardedFromName}
                        </div>
                      )}

                      {/* Reply Quote Block */}
                      {msg.replyToText && (
                        <div
                          className={`p-2 rounded-lg border-l-4 border-[#C59B27] text-[11px] ${
                            isMine ? 'bg-white/10 text-slate-200' : 'bg-[#F8FAFC] text-slate-600'
                          }`}
                        >
                          <div className="font-bold text-[#C59B27]">
                            {msg.replyToSenderName || 'Message'}
                          </div>
                          <div className="truncate">{msg.replyToText}</div>
                        </div>
                      )}

                      {/* Message Text */}
                      {msg.text && (
                        <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                      )}

                      {/* Multi-Type Attachment (Image, Video, PDF, Document) */}
                      {msg.attachmentUrl && (
                        <div
                          className={`p-2.5 rounded-xl border ${
                            isMine
                              ? 'bg-white/10 border-white/20 text-white'
                              : 'bg-[#F8FAFC] border-[#E2DDD2] text-[#0F172A]'
                          }`}
                        >
                          {isImage ? (
                            <div className="space-y-1.5">
                              <img
                                src={msg.attachmentUrl}
                                alt={msg.attachmentName || 'Image Attachment'}
                                className="max-h-56 rounded-lg object-cover w-full"
                              />
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="truncate">{msg.attachmentName}</span>
                                <a
                                  href={msg.attachmentUrl}
                                  download={msg.attachmentName || 'Image'}
                                  className="p-1 hover:opacity-80"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            </div>
                          ) : isVideo ? (
                            <div className="space-y-1.5">
                              <video
                                src={msg.attachmentUrl}
                                controls
                                className="max-h-56 rounded-lg w-full bg-black"
                              />
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="truncate flex items-center gap-1">
                                  <Video className="w-3.5 h-3.5 text-[#C59B27]" />
                                  {msg.attachmentName || 'Video Clip'}
                                </span>
                                <a
                                  href={msg.attachmentUrl}
                                  download={msg.attachmentName || 'Video.mp4'}
                                  className="p-1 hover:opacity-80"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 truncate">
                                <FileText className="w-4 h-4 shrink-0 text-[#C59B27]" />
                                <span className="truncate text-[11px] font-semibold">
                                  {msg.attachmentName || 'Attached Document'}
                                </span>
                              </div>
                              <a
                                href={msg.attachmentUrl}
                                target="_blank"
                                rel="noreferrer"
                                download={msg.attachmentName || 'Document'}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#C59B27] text-[#07111F] text-[10px] font-bold shrink-0"
                              >
                                <Download className="w-3 h-3" /> Download
                              </a>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Message Action Bar: Reply, Forward, Delete, Timestamp & Delivery/Read Status */}
                      <div
                        className={`flex items-center justify-end gap-2 pt-1 text-[10px] font-mono ${
                          isMine ? 'text-slate-300' : 'text-slate-400'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setReplyingTo(msg)}
                          title="Reply to message"
                          className="p-0.5 hover:text-[#C59B27] transition-colors"
                        >
                          <Reply className="w-3.5 h-3.5" />
                        </button>

                        {isAdmin && students.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setForwardingMessage(msg)}
                            title="Forward message"
                            className="p-0.5 hover:text-[#C59B27] transition-colors"
                          >
                            <Forward className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {onDeleteMessage && (isAdmin || isMine) && (
                          <button
                            type="button"
                            onClick={() => setPendingDeleteChat(msg)}
                            title="Delete message"
                            className="p-0.5 hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <span>
                          {formatIndiaTime(msg.createdAt)}
                        </span>

                        {isMine && (
                          <span title={msg.read ? 'Read' : 'Delivered'}>
                            {msg.read ? (
                              <CheckCheck className="w-3.5 h-3.5 text-[#E6C665]" />
                            ) : (
                              <Check className="w-3.5 h-3.5 text-slate-300" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Replying To Banner */}
          {replyingTo && (
            <div className="px-5 py-2 bg-[#FEF9E7] border-t border-[#C59B27] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 truncate">
                <Reply className="w-4 h-4 text-[#9A7515] shrink-0" />
                <div className="truncate">
                  <span className="font-bold text-[#0C1A2E] mr-1.5">
                    Replying to {replyingTo.senderName}:
                  </span>
                  <span className="text-[#475569] truncate">
                    {replyingTo.text || replyingTo.attachmentName}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="text-slate-500 hover:text-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Staged Attachment Preview */}
          {stagedAttachment && (
            <div className="px-5 py-2.5 bg-amber-50 border-t border-amber-200 flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-2 truncate">
                <Paperclip className="w-4 h-4 text-[#9A7515]" />
                <span className="font-semibold truncate">Attached file:</span>
                <span className="truncate font-mono">{stagedAttachment.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setStagedAttachment(null)}
                className="text-amber-700 hover:text-amber-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Message Input Bar */}
          <form
            onSubmit={handleSend}
            className="p-3.5 border-t border-[#E2DDD2] bg-white flex items-center gap-2.5"
          >
            <button
              type="button"
              onClick={() => setShowAttachmentModal(true)}
              className="p-2.5 text-[#475569] hover:text-[#0C1A2E] hover:bg-slate-100 rounded-xl transition-colors"
              title="Attach Image, Video, PDF, or Document"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Write a message..."
              className="grow px-4 py-2.5 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl focus:outline-none focus:border-[#0C1A2E]"
            />

            <button
              type="submit"
              disabled={isSending || (!inputText.trim() && !stagedAttachment)}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#0C1A2E] hover:bg-[#162946] text-[#E6C665] text-xs font-bold rounded-xl transition-colors disabled:opacity-40 shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
              Send
            </button>
          </form>
        </div>
      </div>

      {/* Attachment Upload Modal (Image, Video, PDF, Document) */}
      {showAttachmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07111F]/75 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-[#E2DDD2] shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E2DDD2]">
              <h3 className="font-serif font-bold text-base text-[#0C1A2E]">
                Attach Image, Video, PDF, or Document
              </h3>
              <button
                type="button"
                onClick={() => setShowAttachmentModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <DeviceFileUpload
              label="Select Image, Video, PDF, or Office Document"
              helpText="Supports PNG, JPG, WEBP, MP4, WEBM, PDF, DOCX (Max 15MB)"
              accept="image/*,video/mp4,video/webm,application/pdf,.doc,.docx"
              onFileUploaded={(meta) => {
                setStagedAttachment(meta);
                setShowAttachmentModal(false);
              }}
              onClear={() => setStagedAttachment(null)}
            />
          </div>
        </div>
      )}

      {/* Forward Message Modal */}
      {forwardingMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07111F]/75 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-[#E2DDD2] shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2DDD2] pb-3">
              <h3 className="font-serif font-bold text-base text-[#0C1A2E]">
                Forward Message to Student
              </h3>
              <button
                type="button"
                onClick={() => setForwardingMessage(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-[#E2DDD2]">
              {students.map((st) => (
                <button
                  key={st.uid}
                  type="button"
                  onClick={() => handleForwardTo(st.uid)}
                  className="w-full py-2.5 px-3 text-left hover:bg-slate-50 flex items-center justify-between text-xs font-semibold text-[#0C1A2E]"
                >
                  <span>
                    {st.fullName} ({st.studentId})
                  </span>
                  <Forward className="w-3.5 h-3.5 text-[#9A7515]" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        open={Boolean(pendingDeleteChat)}
        title="Delete Chat Message"
        itemLabel={
          pendingDeleteChat?.text
            ? pendingDeleteChat.text.slice(0, 60)
            : pendingDeleteChat?.attachmentName || 'Chat Message'
        }
        description="This will permanently remove this message from the chat conversation."
        isDeleting={isDeletingChat}
        onCancel={() => setPendingDeleteChat(null)}
        onConfirm={async () => {
          if (!pendingDeleteChat || !onDeleteMessage) return;
          setIsDeletingChat(true);
          try {
            const res = await onDeleteMessage(pendingDeleteChat.id);
            if (res.ok) {
              showToast?.('Chat message deleted.', 'success');
              setPendingDeleteChat(null);
            } else {
              showToast?.(res.error || 'Failed to delete chat message.', 'error');
            }
          } finally {
            setIsDeletingChat(false);
          }
        }}
      />
    </div>
  );
}
