'use client';

import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCheck,
  Download,
  FileText,
  Forward,
  MessageSquare,
  Paperclip,
  Reply,
  Search,
  Send,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import type { ChatMessage, UserProfile } from '@/lib/types';
import { formatIndiaTime } from '@/lib/portal-logic';
import { DeviceFileUpload, type UploadedFileMeta } from './DeviceFileUpload';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { SafeImage } from './SafeImage';
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
  onMarkRead?: (peerId: string) => void;
  showToast?: (message: string, type?: 'success' | 'error') => void;
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

  // Include ALL active user accounts created by Admin (Admins & Students) excluding self
  const chatPartners = useMemo(() => {
    return users
      .filter((u) => u.uid !== currentUser.uid && u.status !== 'inactive')
      .sort((a, b) => {
        if (a.role === 'admin' && b.role !== 'admin') return -1;
        if (a.role !== 'admin' && b.role === 'admin') return 1;
        return a.fullName.localeCompare(b.fullName);
      });
  }, [users, currentUser.uid]);

  const [selectedPartnerUid, setSelectedPartnerUid] = useState<string>(() => {
    if (!isAdmin && chatPartners.some((u) => u.uid === 'admin_super')) {
      return 'admin_super';
    }
    return chatPartners[0]?.uid || '';
  });

  // Always resolve to an active valid partner if the list hydrates asynchronously
  const activePartnerUid = useMemo(() => {
    if (selectedPartnerUid && chatPartners.some((u) => u.uid === selectedPartnerUid)) {
      return selectedPartnerUid;
    }
    if (!isAdmin && chatPartners.some((u) => u.uid === 'admin_super')) {
      return 'admin_super';
    }
    return chatPartners[0]?.uid || '';
  }, [selectedPartnerUid, chatPartners, isAdmin]);

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

  // Strict 1-to-1 thread filter for (currentUser.uid <-> activePartnerUid)
  const currentConversationMessages = useMemo(() => {
    if (!activePartnerUid) return [];
    const raw = chatMessages.filter(
      (m) =>
        (m.senderId === currentUser.uid && m.recipientId === activePartnerUid) ||
        (m.senderId === activePartnerUid && m.recipientId === currentUser.uid)
    );

    if (!messageFilterQuery.trim()) return raw;
    const q = messageFilterQuery.toLowerCase();
    return raw.filter(
      (m) =>
        m.text.toLowerCase().includes(q) ||
        (m.attachmentName || '').toLowerCase().includes(q)
    );
  }, [chatMessages, activePartnerUid, currentUser.uid, messageFilterQuery]);

  // Build conversations list for EVERY active account
  const conversationList = useMemo(() => {
    return chatPartners.map((partner) => {
      const msgs = chatMessages.filter(
        (m) =>
          (m.senderId === partner.uid && m.recipientId === currentUser.uid) ||
          (m.senderId === currentUser.uid && m.recipientId === partner.uid)
      );

      const lastMessage = msgs[msgs.length - 1];
      const unreadCount = msgs.filter(
        (m) => m.senderId === partner.uid && m.recipientId === currentUser.uid && !m.read
      ).length;

      const isPartnerAdmin = partner.role === 'admin' || partner.uid === 'admin_super';

      return {
        uid: partner.uid,
        role: partner.role,
        title: isPartnerAdmin ? `${partner.fullName} (Union Admin)` : partner.fullName,
        subtitle: isPartnerAdmin
          ? 'Union Administration · Official Desk'
          : `${partner.studentId || 'Member'} · Roll ${partner.rollNumber || 'N/A'}`,
        avatarUrl: isPartnerAdmin
          ? partner.avatarUrl || OFFICIAL_ALNIBRAS_LOGO_PATH
          : partner.avatarUrl || '/images/avatar_admin_portrait.jpg',
        lastMessage,
        unreadCount,
      };
    });
  }, [chatPartners, chatMessages, currentUser.uid]);

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversationList;
    const q = searchQuery.toLowerCase();
    return conversationList.filter(
      (c) => c.title.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q)
    );
  }, [conversationList, searchQuery]);

  const activePartnerProfile = useMemo(() => {
    return chatPartners.find((u) => u.uid === activePartnerUid);
  }, [chatPartners, activePartnerUid]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePartnerUid) {
      showToast?.('Please select an account from the chat list first.', 'error');
      return;
    }
    if (!inputText.trim() && !stagedAttachment) return;

    setIsSending(true);
    try {
      const res = await onSendMessage({
        recipientId: activePartnerUid,
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
      } else {
        showToast?.(res.error || 'Failed to forward message.', 'error');
      }
    } finally {
      setIsSending(false);
    }
  };

  const isActivePartnerAdmin =
    activePartnerProfile?.role === 'admin' || activePartnerProfile?.uid === 'admin_super';

  return (
    <div className="space-y-4" data-testid="telegram-chat-view">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-serif font-bold text-[#0C1A2E] dark:text-white">
            Personal &amp; Union Chat Messenger
          </h1>
          <p className="text-xs text-[#64748B] dark:text-[#9AB0A6] mt-0.5">
            Direct 1-to-1 personal chat across all active Union &amp; Student accounts with replies,
            forwarding, read receipts, and attachments.
          </p>
        </div>
      </div>

      {/* Main Split Container */}
      <div className="bg-white dark:bg-[#0D231D] border border-[#E2DDD2] dark:border-[#1B3B31] rounded-2xl overflow-hidden shadow-md grid grid-cols-1 md:grid-cols-12 md:h-[640px] min-h-[540px]">
        {/* LEFT SIDEBAR: All Active Accounts */}
        <div className="md:col-span-4 border-r border-[#E2DDD2] dark:border-[#1B3B31] flex flex-col min-h-0 md:h-full overflow-hidden bg-[#F8FAFC] dark:bg-[#071713]">
          {/* Search Bar */}
          <div className="p-3.5 border-b border-[#E2DDD2] dark:border-[#1B3B31] bg-white dark:bg-[#0D231D] shrink-0">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search members or admins..."
                data-testid="chat-search-accounts"
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#F8FAFC] dark:bg-[#071713] border border-[#CBD5E1] dark:border-[#1B3B31] rounded-xl text-[#0F172A] dark:text-white focus:outline-none focus:border-[#0C1A2E]"
              />
            </div>
            <p className="text-[10px] text-slate-500 dark:text-[#9AB0A6] mt-1.5 font-mono">
              {chatPartners.length} active account{chatPartners.length === 1 ? '' : 's'} available
            </p>
          </div>

          {/* Conversation Items */}
          <div className="grow min-h-0 overflow-y-auto divide-y divide-[#E2DDD2]/60 dark:divide-[#1B3B31]">
            {filteredConversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-[#9AB0A6]">
                No matching accounts found.
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = activePartnerUid === conv.uid;
                return (
                  <button
                    key={conv.uid}
                    type="button"
                    data-testid={`chat-partner-${conv.uid}`}
                    onClick={() => {
                      setSelectedPartnerUid(conv.uid);
                      onMarkRead?.(conv.uid);
                    }}
                    className={`w-full text-left p-3.5 flex items-center gap-3 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#0C1A2E] text-white'
                        : 'hover:bg-white dark:hover:bg-[#0D231D] text-[#0F172A] dark:text-[#F0F5F2]'
                    }`}
                  >
                    <div className="relative shrink-0 w-11 h-11 rounded-full overflow-hidden border-2 border-[#C59B27] bg-white">
                      <SafeImage
                        src={conv.avatarUrl}
                        alt={conv.title}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="grow min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`font-bold text-xs truncate ${
                            isSelected ? 'text-white' : 'text-[#0C1A2E] dark:text-white'
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
                          isSelected ? 'text-slate-300' : 'text-[#9A7515] dark:text-[#D4AF37]'
                        }`}
                      >
                        {conv.subtitle}
                      </div>

                      <p
                        className={`text-[11px] truncate mt-0.5 ${
                          isSelected ? 'text-slate-200' : 'text-slate-500 dark:text-[#9AB0A6]'
                        }`}
                      >
                        {conv.lastMessage
                          ? `${conv.lastMessage.senderId === currentUser.uid ? 'You: ' : ''}${
                              conv.lastMessage.text ||
                              (conv.lastMessage.attachmentName
                                ? `Attached ${conv.lastMessage.attachmentName}`
                                : '')
                            }`
                          : 'Tap to start personal chat'}
                      </p>
                    </div>

                    {conv.unreadCount > 0 && (
                      <span className="px-2 py-0.5 bg-[#C59B27] text-[#07111F] font-extrabold text-[10px] rounded-full shrink-0 font-mono">
                        {conv.unreadCount}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT CONVERSATION WINDOW */}
        <div className="md:col-span-8 flex flex-col min-h-0 md:h-full overflow-hidden bg-[#F0ECE1]/50 dark:bg-[#071713]/70">
          {/* Chat Header */}
          <div className="px-5 py-3.5 border-b border-[#E2DDD2] dark:border-[#1B3B31] bg-white dark:bg-[#0D231D] flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden border border-[#C59B27] bg-white shrink-0">
                <SafeImage
                  src={
                    isActivePartnerAdmin
                      ? activePartnerProfile?.avatarUrl || OFFICIAL_ALNIBRAS_LOGO_PATH
                      : activePartnerProfile?.avatarUrl || '/images/avatar_admin_portrait.jpg'
                  }
                  alt={activePartnerProfile?.fullName || 'Chat Partner'}
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h3
                  data-testid="chat-active-partner-name"
                  className="text-sm font-bold text-[#0C1A2E] dark:text-white"
                >
                  {activePartnerProfile
                    ? isActivePartnerAdmin
                      ? `${activePartnerProfile.fullName} (Union Admin)`
                      : activePartnerProfile.fullName
                    : 'Select an account to chat'}
                </h3>
                <p className="text-[11px] text-[#64748B] dark:text-[#9AB0A6] font-mono">
                  {activePartnerProfile
                    ? isActivePartnerAdmin
                      ? 'Official Union Administration · Private Chat'
                      : `${activePartnerProfile.studentId || 'Member'} · Roll: ${
                          activePartnerProfile.rollNumber || 'N/A'
                        } · Personal Chat`
                    : 'Choose any account from the sidebar'}
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
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#1B3B31] text-xs bg-[#F8FAFC] dark:bg-[#071713] text-[#0F172A] dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 min-h-0 p-5 overflow-y-auto space-y-3">
            {!activePartnerProfile ? (
              <div className="py-20 text-center text-xs text-slate-500 space-y-2">
                <MessageSquare className="w-8 h-8 text-[#9A7515] mx-auto opacity-60" />
                <p className="font-semibold text-[#0C1A2E] dark:text-white">
                  No active chat recipients available yet.
                </p>
              </div>
            ) : currentConversationMessages.length === 0 ? (
              <div className="py-20 text-center text-xs text-slate-500 dark:text-[#9AB0A6] space-y-2">
                <MessageSquare className="w-8 h-8 text-[#9A7515] mx-auto opacity-60" />
                <p className="font-semibold text-[#0C1A2E] dark:text-white">
                  No messages with {activePartnerProfile.fullName} yet.
                </p>
                <p className="text-[11px]">
                  Send a private message or attach an Image, Video, PDF, or Document below.
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
                          : 'bg-white dark:bg-[#0D231D] border border-[#E2DDD2] dark:border-[#1B3B31] text-[#0F172A] dark:text-[#F0F5F2] rounded-tl-xs'
                      }`}
                    >
                      {!isMine && (
                        <div className="text-[10px] font-bold text-[#9A7515] dark:text-[#D4AF37]">
                          {msg.senderName}
                        </div>
                      )}

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
                            isMine
                              ? 'bg-white/10 text-slate-200'
                              : 'bg-[#F8FAFC] dark:bg-[#071713] text-slate-600 dark:text-[#9AB0A6]'
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
                              : 'bg-[#F8FAFC] dark:bg-[#071713] border-[#E2DDD2] dark:border-[#1B3B31] text-[#0F172A] dark:text-white'
                          }`}
                        >
                          {isImage ? (
                            <div className="space-y-1.5">
                              <SafeImage
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
                          className="p-0.5 hover:text-[#C59B27] transition-colors cursor-pointer"
                        >
                          <Reply className="w-3.5 h-3.5" />
                        </button>

                        {chatPartners.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setForwardingMessage(msg)}
                            title="Forward message"
                            className="p-0.5 hover:text-[#C59B27] transition-colors cursor-pointer"
                          >
                            <Forward className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {onDeleteMessage && (isAdmin || isMine) && (
                          <button
                            type="button"
                            onClick={() => setPendingDeleteChat(msg)}
                            title="Delete message"
                            className="p-0.5 hover:text-rose-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <span>{formatIndiaTime(msg.createdAt)}</span>

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
                className="text-slate-500 hover:text-slate-800 cursor-pointer"
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
                className="text-amber-700 hover:text-amber-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Message Input Bar */}
          <form
            onSubmit={handleSend}
            className="p-3.5 border-t border-[#E2DDD2] dark:border-[#1B3B31] bg-white dark:bg-[#0D231D] flex items-center gap-2.5"
          >
            <button
              type="button"
              onClick={() => setShowAttachmentModal(true)}
              disabled={!activePartnerUid}
              className="p-2.5 text-[#475569] dark:text-[#9AB0A6] hover:text-[#0C1A2E] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors cursor-pointer disabled:opacity-40"
              title="Attach Image, Video, PDF, or Document"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={!activePartnerUid}
              data-testid="chat-message-input"
              placeholder={
                activePartnerProfile
                  ? `Message ${activePartnerProfile.fullName}...`
                  : 'Select a conversation...'
              }
              className="grow px-4 py-2.5 text-xs bg-[#F8FAFC] dark:bg-[#071713] border border-[#CBD5E1] dark:border-[#1B3B31] text-[#0F172A] dark:text-white rounded-xl focus:outline-none focus:border-[#0C1A2E]"
            />

            <button
              type="submit"
              disabled={!activePartnerUid || isSending || (!inputText.trim() && !stagedAttachment)}
              data-testid="chat-send-btn"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#0C1A2E] hover:bg-[#162946] text-[#E6C665] text-xs font-bold rounded-xl transition-colors disabled:opacity-40 shadow-xs cursor-pointer"
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
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <DeviceFileUpload
              label="Select Image, Video, PDF, or Office Document"
              helpText="Supports PNG, JPG, WEBP, MP4, WEBM, PDF, DOCX (Max 15MB)"
              accept="image/*,video/mp4,video/webm,application/pdf,.doc,.docx"
              storageFolder="chat"
              destination="user"
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
                Forward Message to Account
              </h3>
              <button
                type="button"
                onClick={() => setForwardingMessage(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-[#E2DDD2]">
              {chatPartners.map((partner) => (
                <button
                  key={partner.uid}
                  type="button"
                  onClick={() => handleForwardTo(partner.uid)}
                  className="w-full py-2.5 px-3 text-left hover:bg-slate-50 flex items-center justify-between text-xs font-semibold text-[#0C1A2E] cursor-pointer"
                >
                  <span>
                    {partner.fullName} (
                    {partner.role === 'admin' ? 'Union Admin' : partner.studentId})
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
