'use client';

import React, { useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Calendar, FolderOpen } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ALNIBRAS_EASE } from './MotionPrimitives';
import type { GalleryItem } from '@/lib/types';

interface PhotoLightboxModalProps {
  items: GalleryItem[];
  currentIndex: number | null;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
}

export default function PhotoLightboxModal({
  items,
  currentIndex,
  onClose,
  onNavigate,
}: PhotoLightboxModalProps) {
  const total = items.length;
  const isOpen = currentIndex !== null && currentIndex >= 0 && currentIndex < total;

  const handlePrev = useCallback(() => {
    if (currentIndex === null || total === 0) return;
    onNavigate((currentIndex - 1 + total) % total);
  }, [currentIndex, total, onNavigate]);

  const handleNext = useCallback(() => {
    if (currentIndex === null || total === 0) return;
    onNavigate((currentIndex + 1) % total);
  }, [currentIndex, total, onNavigate]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handlePrev, handleNext]);

  const currentItem = isOpen && currentIndex !== null ? items[currentIndex] : null;

  return (
    <AnimatePresence>
      {isOpen && currentIndex !== null && currentItem && (
        <motion.div
          key="lightbox-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 select-none"
          role="dialog"
          aria-modal="true"
          aria-label="Photo Lightbox Viewer"
          onClick={onClose}
        >
          {/* Top Bar: Counter & Close Button */}
          <div
            className="flex items-center justify-between max-w-6xl w-full mx-auto z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="px-3.5 py-1.5 rounded-lg bg-white/10 border border-white/15 text-white text-xs font-bold tracking-wider uppercase tabular-nums">
                {currentIndex + 1} of {total}
              </span>
              {currentItem.category && (
                <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#064E3B]/80 border border-[#D4AF37]/40 text-[#D4AF37] text-xs font-semibold">
                  <FolderOpen className="w-3.5 h-3.5" />
                  {currentItem.category}
                </span>
              )}
            </div>

            <motion.button
              type="button"
              onClick={onClose}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              aria-label="Close photo viewer"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/15 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Close (Esc)</span>
            </motion.button>
          </div>

          {/* Main Image Stage with Previous / Next Controls */}
          <div
            className="relative flex-1 flex items-center justify-center max-w-6xl w-full mx-auto my-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {total > 1 && (
              <motion.button
                type="button"
                onClick={handlePrev}
                whileHover={{ scale: 1.08, x: -2 }}
                whileTap={{ scale: 0.94 }}
                aria-label="Previous photo"
                className="absolute left-2 sm:left-4 z-20 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/70 hover:bg-[#064E3B] text-white border border-white/20 flex items-center justify-center transition-colors shadow-lg cursor-pointer"
              >
                <ChevronLeft className="w-6 h-6" />
              </motion.button>
            )}

            <AnimatePresence mode="wait">
              <motion.div
                key={currentItem.id || currentIndex}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.24, ease: ALNIBRAS_EASE }}
                className="max-h-[72vh] max-w-full flex items-center justify-center"
              >
                <img
                  src={currentItem.imageUrl}
                  alt={currentItem.title}
                  className="max-h-[72vh] max-w-full w-auto h-auto object-contain rounded-xl border border-white/15 shadow-2xl"
                />
              </motion.div>
            </AnimatePresence>

            {total > 1 && (
              <motion.button
                type="button"
                onClick={handleNext}
                whileHover={{ scale: 1.08, x: 2 }}
                whileTap={{ scale: 0.94 }}
                aria-label="Next photo"
                className="absolute right-2 sm:right-4 z-20 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/70 hover:bg-[#064E3B] text-white border border-white/20 flex items-center justify-center transition-colors shadow-lg cursor-pointer"
              >
                <ChevronRight className="w-6 h-6" />
              </motion.button>
            )}
          </div>

          {/* Bottom Caption & Date */}
          <motion.div
            key={`caption-${currentItem.id || currentIndex}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: ALNIBRAS_EASE }}
            className="max-w-4xl w-full mx-auto bg-white/10 backdrop-blur-md border border-white/15 rounded-xl p-4 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">{currentItem.title}</h3>
                {currentItem.caption && (
                  <p className="text-xs sm:text-sm text-white/80 mt-0.5 leading-relaxed">
                    {currentItem.caption}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-white/70 shrink-0 tabular-nums">
                <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{String(currentItem.createdAt || '').slice(0, 10)}</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

