'use client';

import React, { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import { motion } from 'motion/react';
import { formatLiveDateTime } from '@/lib/portal-logic';
import { ALNIBRAS_EASE } from './MotionPrimitives';

interface LiveDateTimeClockProps {
  variant?: 'public' | 'header' | 'banner';
  className?: string;
}

export function LiveDateTimeClock({
  variant = 'header',
  className = '',
}: LiveDateTimeClockProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const initTimer = setTimeout(() => {
      setNow(new Date());
    }, 0);
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60_000);
    return () => {
      clearTimeout(initTimer);
      clearInterval(timer);
    };
  }, []);

  const parts = now ? formatLiveDateTime(now, 'en-IN', 'Asia/Kolkata') : null;

  if (variant === 'public') {
    return (
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: ALNIBRAS_EASE }}
        data-testid="live-datetime-public"
        className={`bg-[#0B3D32] dark:bg-[#061813] text-white border-b border-[#D4AF37]/25 ${className}`}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-5 lg:px-6 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-xs">
          <div className="flex items-center gap-2 text-white/90 font-medium">
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D4AF37] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#D4AF37]" />
            </span>
            <Calendar className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
            <span className="font-bold text-[#D4AF37]" data-testid="live-day">
              {parts ? parts.day : '---'}
            </span>
            <span aria-hidden="true" className="text-white/40">
              ·
            </span>
            <span className="font-medium text-white/95" data-testid="live-date">
              {parts ? parts.date : '---'}
            </span>
          </div>
        </div>
      </motion.div>
    );
  }

  if (variant === 'banner') {
    return (
      <div
        data-testid="live-datetime-banner"
        className={`inline-flex flex-wrap items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 border border-[#D4AF37]/35 text-xs text-white backdrop-blur-xs ${className}`}
      >
        <Calendar className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
        <span className="font-bold text-[#D4AF37]" data-testid="live-day">
          {parts ? parts.day : '---'}
        </span>
        <span className="text-white/40">·</span>
        <span className="font-medium text-white/90" data-testid="live-date">
          {parts ? parts.date : '---'}
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid="live-datetime-header"
      className={`hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] text-[11px] text-[#17221F] dark:text-[#F0F5F2] whitespace-nowrap shrink-0 ${className}`}
    >
      <Calendar className="w-3.5 h-3.5 text-[#064E3B] dark:text-[#D4AF37] shrink-0" />
      <span className="font-bold text-[#064E3B] dark:text-[#D4AF37]" data-testid="live-day">
        {parts ? parts.day : '---'}
      </span>
      <span className="text-[#718078] dark:text-[#9AB0A6]">·</span>
      <span className="font-medium text-[#17221F] dark:text-[#F0F5F2]" data-testid="live-date">
        {parts ? parts.date : '---'}
      </span>
    </div>
  );
}

export default LiveDateTimeClock;
