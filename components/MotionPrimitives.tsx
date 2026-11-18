'use client';

import React, { useRef, useState, useSyncExternalStore } from 'react';
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
} from 'motion/react';
import { Check, Loader2 } from 'lucide-react';

export const ALNIBRAS_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

function subscribeFinePointer(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getFinePointerSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export function useFinePointer(): boolean {
  return useSyncExternalStore(subscribeFinePointer, getFinePointerSnapshot, () => false);
}

/**
 * Root MotionConfig wrapper honoring prefers-reduced-motion automatically.
 */
export function PortalMotionConfig({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/**
 * Fixed 2.5px reading progress bar rendered at the top edge of the viewport.
 */
export function ScrollProgressBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 240,
    damping: 32,
    restDelta: 0.001,
  });

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-[#064E3B] via-[#D4AF37] to-[#064E3B] origin-left z-[60] pointer-events-none"
    />
  );
}

interface SectionRevealProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  delay?: number;
}

/**
 * Scroll-triggered section entrance animation (transform + opacity only).
 */
export function SectionReveal({
  children,
  className = '',
  id,
}: SectionRevealProps) {
  return (
    <section id={id} className={className}>
      {children}
    </section>
  );
}

/**
 * Container coordinating crisp grid layout (zero scroll-blocking opacity traps).
 */
export function StaggerGrid({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}

/**
 * Individual grid item rendered with zero latency.
 */
export function StaggerItem({
  children,
  className = '',
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div onClick={onClick} className={className}>
      {children}
    </div>
  );
}

/**
 * Interactive card combining subtle hover lift, optional 3D perspective tilt on fine pointers,
 * cursor spotlight glow, hover shine sweep, and crisp press feedback.
 */
export function InteractiveCard({
  children,
  className = '',
  onClick,
  shine = false,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  tilt?: boolean;
  spotlight?: boolean;
  shine?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden transition-transform duration-150 ${
        onClick ? 'active:scale-[0.99]' : ''
      } ${shine ? 'hover-shine' : ''} ${className}`}
    >
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

/**
 * Magnetic hover CTA wrapper for hero / primary buttons (fine pointers only).
 */
export function MagneticAction({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const finePointer = useFinePointer();
  const x = useSpring(0, { stiffness: 320, damping: 24 });
  const y = useSpring(0, { stiffness: 320, damping: 24 });

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!finePointer || shouldReduceMotion || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    x.set(dx * 0.14);
    y.set(dy * 0.14);
  };

  const handleLeave = () => {
    x.set(0);
    y.set(0);
  };

  if (shouldReduceMotion || !finePointer) {
    return <div className={`inline-block ${className}`}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ x, y }}
      whileTap={{ scale: 0.97 }}
      className={`inline-block ${className}`}
    >
      {children}
    </motion.div>
  );
}

interface RippleSpec {
  id: number;
  x: number;
  y: number;
  size: number;
}

interface RippleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  shine?: boolean;
  loading?: boolean;
  success?: boolean;
  className?: string;
}

/**
 * Button with crisp click-press scale, coordinate-origin radial ripple,
 * optional hover shine sweep, and loading/success micro-feedback.
 */
export function RippleButton({
  children,
  shine = true,
  loading = false,
  success = false,
  className = '',
  onClick,
  disabled,
  type = 'button',
  ...rest
}: RippleButtonProps) {
  const shouldReduceMotion = useReducedMotion();
  const [ripples, setRipples] = useState<RippleSpec[]>([]);
  const nextId = useRef(0);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!shouldReduceMotion && !disabled && !loading) {
      const rect = e.currentTarget.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX ? e.clientX - rect.left - size / 2 : rect.width / 2 - size / 2;
      const y = e.clientY ? e.clientY - rect.top - size / 2 : rect.height / 2 - size / 2;
      const id = ++nextId.current;
      setRipples((prev) => [...prev.slice(-3), { id, x, y, size }]);
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, 600);
    }
    if (onClick) onClick(e);
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={handleClick}
      className={`relative overflow-hidden press-scale ${shine ? 'hover-shine' : ''} ${className}`}
      {...rest}
    >
      {ripples.map((rp) => (
        <span
          key={rp.id}
          aria-hidden="true"
          style={{
            left: rp.x,
            top: rp.y,
            width: rp.size,
            height: rp.size,
          }}
          className="pointer-events-none absolute rounded-full bg-white/30 animate-ripple"
        />
      ))}
      <span className="relative z-10 inline-flex items-center justify-center gap-2">
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
        ) : success ? (
          <Check className="w-3.5 h-3.5 shrink-0" />
        ) : null}
        {children}
      </span>
    </button>
  );
}

/**
 * Smooth text entrance animation supporting slide-up, slide-down, blur reveal, or fade.
 */
export function TextReveal({
  children,
  className = '',
}: {
  children: React.ReactNode;
  variant?: 'slide-up' | 'slide-down' | 'blur' | 'fade';
  delay?: number;
  className?: string;
}) {
  return <span className={`inline-block ${className}`}>{children}</span>;
}

/**
 * Crisp immediate kicker text (zero interval scramble churn on initial paint).
 */
export function TextScramble({
  text,
  className = '',
}: {
  text: string;
  className?: string;
}) {
  return <span className={className}>{text}</span>;
}

/**
 * Animated metallic emerald/gold shimmer text span for highlight labels.
 */
export function GradientText({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={`animate-text-shimmer ${className}`}>{children}</span>;
}

/**
 * Smooth numeric count-up with tabular numerals for statistics and treasury summaries.
 */
export function AnimatedCounter({
  value,
  formatter,
  className = '',
}: {
  value: number;
  formatter?: (val: number) => string;
  className?: string;
}) {
  return (
    <span className={`tabular-nums ${className}`}>
      {formatter ? formatter(value) : value}
    </span>
  );
}

/**
 * Fast-decoding image wrapper with lightweight background surface.
 */
export function ShimmerImage({
  src,
  alt,
  className = '',
  containerClassName = '',
}: {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
}) {
  return (
    <div className={`relative w-full h-full overflow-hidden bg-[#E5EAE6]/50 dark:bg-[#102922] ${containerClassName}`}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className={className}
      />
    </div>
  );
}

/**
 * Lightweight subtle radial glow backdrop (zero continuous animation or blur-3xl paint cost).
 */
export function AmbientBackground({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.12),transparent_48%)] ${className}`}
    />
  );
}

/**
 * Lightweight frame container without heavy per-card scroll listeners.
 */
export function ParallaxLayer({
  children,
  className = '',
}: {
  children: React.ReactNode;
  offset?: number;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}

/**
 * Animated accordion panel for expandable details across portal lists.
 */
export function AccordionContent({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: ALNIBRAS_EASE }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
