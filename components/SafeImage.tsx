'use client';

import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
}

export function SafeImage({ src, alt, className = '', fallbackTitle }: SafeImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const hasError = failedSrc === src;

  if (hasError || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#0B192C] via-[#132743] to-[#1E3A5F] text-[#FAF9F5] p-6 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <BookOpen className="w-8 h-8 text-[#C5A059] mb-2 opacity-90" />
        <span className="text-xs font-medium tracking-wide text-[#C5A059]">
          {fallbackTitle || alt || 'AL-NIBRAS Academic Archive'}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
      className={className}
    />
  );
}
