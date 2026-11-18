'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ALNIBRAS_EASE } from './MotionPrimitives';

export interface ConfirmDeleteModalProps {
  open: boolean;
  title: string;
  itemLabel?: string;
  description: string;
  confirmLabel?: string;
  isLoading?: boolean;
  isDeleting?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDeleteModal({
  open,
  title,
  itemLabel,
  description,
  confirmLabel = 'Confirm Delete',
  isLoading = false,
  isDeleting = false,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  const busy = isLoading || isDeleting;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, busy, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="confirm-delete-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-[#07111F]/70 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-title"
          onClick={() => !busy && onCancel()}
        >
          <motion.div
            key="confirm-delete-card"
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.22, ease: ALNIBRAS_EASE }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#0D231D] border border-[#E2DDD2] dark:border-[#1B3B31] rounded-xl max-w-md w-full overflow-hidden shadow-2xl"
          >
            <div className="bg-[#0C1A2E] text-white px-6 py-4 flex items-center justify-between border-b border-[#C59B27]/30">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#991B1B]/30 border border-[#EF4444]/40 flex items-center justify-center text-[#FCA5A5]">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <h3 id="confirm-delete-title" className="font-serif text-lg font-bold tracking-wide">
                  {title}
                </h3>
              </div>
              <motion.button
                type="button"
                onClick={onCancel}
                disabled={busy}
                whileHover={{ rotate: 90, scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
                aria-label="Close confirmation dialog"
              >
                <X className="w-5 h-5" />
              </motion.button>
            </div>

            <div className="p-6 space-y-5">
              {itemLabel && (
                <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-[#071713] border border-slate-200 dark:border-[#1B3B31] rounded-lg text-xs font-semibold text-[#0B192C] dark:text-[#F0F5F2] truncate">
                  {itemLabel}
                </div>
              )}

              <p className="text-sm text-[#334155] dark:text-[#9AB0A6] leading-relaxed">{description}</p>

              <div className="bg-[#FEF2F2] dark:bg-red-950/40 border border-[#FECACA] dark:border-red-900 rounded-lg px-4 py-3 text-xs text-[#991B1B] dark:text-red-200 font-medium">
                This action will permanently remove the selected record from the AL-NIBRAS database and update all associated logs.
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#E2DDD2] dark:border-[#1B3B31]">
                <motion.button
                  type="button"
                  onClick={onCancel}
                  disabled={busy}
                  whileTap={{ scale: 0.97 }}
                  className="px-4 py-2.5 rounded-lg border border-[#E2DDD2] dark:border-[#1B3B31] text-xs font-semibold text-[#475569] dark:text-[#9AB0A6] hover:bg-[#F7F5F0] dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Cancel
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => void onConfirm()}
                  disabled={busy}
                  whileTap={{ scale: 0.97 }}
                  data-testid="confirm-delete-submit"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold tracking-wider uppercase transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {busy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  {busy ? 'Deleting...' : confirmLabel}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ConfirmDeleteModal;


