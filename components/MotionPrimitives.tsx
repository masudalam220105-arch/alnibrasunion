'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  animate,
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
  delay = 0,
}: SectionRevealProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return (
      <section id={id} className={className}>
        {children}
      </section>
    );
  }

  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.05 }}
      transition={{ duration: 0.4, delay, ease: ALNIBRAS_EASE }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

/**
 * Container coordinating staggered entrance animations for card/list grids.
 */
export function StaggerGrid({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.05 }}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: 0.045,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Individual staggered child item inside a StaggerGrid.
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
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return (
      <div onClick={onClick} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      onClick={onClick}
      variants={{
        hidden: { opacity: 0, y: 14 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.32, ease: ALNIBRAS_EASE },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
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
  tilt = false,
  spotlight = false,
  shine = false,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  tilt?: boolean;
  spotlight?: boolean;
  shine?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const finePointer = useFinePointer();

  const rotateX = useSpring(0, { stiffness: 260, damping: 24 });
  const rotateY = useSpring(0, { stiffness: 260, damping: 24 });
  const mouseX = useMotionValue(-180);
  const mouseY = useMotionValue(-180);

  const spotlightBackground = useMotionTemplate`radial-gradient(260px circle at ${mouseX}px ${mouseY}px, rgba(212, 175, 55, 0.14), transparent 72%)`;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!finePointer || shouldReduceMotion || (!tilt && !spotlight)) return;
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mouseX.set(x);
    mouseY.set(y);
    if (tilt) {
      const px = (x / rect.width - 0.5) * 2;
      const py = (y / rect.height - 0.5) * 2;
      rotateX.set(-py * 3.5);
      rotateY.set(px * 3.5);
    }
  };

  const handleMouseLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
    mouseX.set(-180);
    mouseY.set(-180);
  };

  if (shouldReduceMotion) {
    return (
      <div onClick={onClick} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={cardRef}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      whileHover={finePointer ? { y: -3 } : undefined}
      whileTap={onClick ? { scale: 0.985 } : undefined}
      style={
        tilt && finePointer
          ? {
              rotateX,
              rotateY,
              transformPerspective: 900,
              transformStyle: 'preserve-3d',
            }
          : undefined
      }
      transition={{ duration: 0.2, ease: ALNIBRAS_EASE }}
      className={`relative overflow-hidden ${shine ? 'hover-shine' : ''} ${className}`}
    >
      {spotlight && finePointer && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{ background: spotlightBackground }}
        />
      )}
      <div className="relative z-10 h-full">{children}</div>
    </motion.div>
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
  variant = 'slide-up',
  delay = 0,
  className = '',
}: {
  children: React.ReactNode;
  variant?: 'slide-up' | 'slide-down' | 'blur' | 'fade';
  delay?: number;
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  if (shouldReduceMotion) {
    return <span className={className}>{children}</span>;
  }

  const initial =
    variant === 'slide-up'
      ? { opacity: 0, y: 12 }
      : variant === 'slide-down'
      ? { opacity: 0, y: -12 }
      : variant === 'blur'
      ? { opacity: 0, filter: 'blur(6px)', y: 6 }
      : { opacity: 0 };

  const target =
    variant === 'blur'
      ? { opacity: 1, filter: 'blur(0px)', y: 0 }
      : { opacity: 1, y: 0 };

  return (
    <motion.span
      initial={initial}
      whileInView={target}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.38, delay, ease: ALNIBRAS_EASE }}
      className={`inline-block ${className}`}
    >
      {children}
    </motion.span>
  );
}

const SCRAMBLE_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Subtle display kicker/title scramble reveal on initial viewport entry.
 */
export function TextScramble({
  text,
  className = '',
}: {
  text: string;
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [output, setOutput] = useState(text);
  const hasPlayedRef = useRef(false);

  useEffect(() => {
    if (shouldReduceMotion || hasPlayedRef.current) {
      return;
    }
    hasPlayedRef.current = true;
    let frame = 0;
    const totalFrames = Math.min(14, Math.max(8, text.length));
    const timer = setInterval(() => {
      frame += 1;
      const revealedCount = Math.floor((frame / totalFrames) * text.length);
      const next = text
        .split('')
        .map((ch, idx) => {
          if (ch === ' ' || ch === '·' || idx < revealedCount) return ch;
          return SCRAMBLE_GLYPHS[(idx + frame) % SCRAMBLE_GLYPHS.length];
        })
        .join('');
      setOutput(next);
      if (frame >= totalFrames) {
        clearInterval(timer);
        setOutput(text);
      }
    }, 28);
    return () => clearInterval(timer);
  }, [text, shouldReduceMotion]);

  return <span className={className}>{shouldReduceMotion ? text : output}</span>;
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
  const shouldReduceMotion = useReducedMotion();
  const [display, setDisplay] = useState<number>(value);
  const prevRef = useRef<number>(value);

  useEffect(() => {
    if (shouldReduceMotion) {
      prevRef.current = value;
      return;
    }
    const startVal = prevRef.current;
    const controls = animate(startVal, value, {
      duration: 0.65,
      ease: ALNIBRAS_EASE,
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    });
    prevRef.current = value;
    return () => controls.stop();
  }, [value, shouldReduceMotion]);

  const shownValue = shouldReduceMotion ? value : display;

  return (
    <span className={`tabular-nums ${className}`}>
      {formatter ? formatter(shownValue) : shownValue}
    </span>
  );
}

/**
 * Image component with smooth shimmer skeleton placeholder until decoded.
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
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={`relative w-full h-full overflow-hidden ${containerClassName}`}>
      {!loaded && (
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-shimmer bg-[#E5EAE6]/70 dark:bg-[#102922]"
        />
      )}
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={`${className} transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}

/**
 * Subtle ambient aurora gradient & floating gold/emerald orbs for Hero/Banner backdrops.
 */
export function AmbientBackground({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      <div className="absolute -top-24 -right-16 w-80 h-80 rounded-full bg-[#D4AF37]/14 blur-3xl animate-aurora" />
      <div
        className="absolute -bottom-24 -left-16 w-72 h-72 rounded-full bg-emerald-400/10 blur-3xl animate-subtle-float"
      />
    </div>
  );
}

/**
 * Scroll-linked vertical parallax container for hero/highlight frames.
 */
export function ParallaxLayer({
  children,
  offset = 24,
  className = '',
}: {
  children: React.ReactNode;
  offset?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], [-offset, offset]);

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div ref={ref} className={className}>
      <motion.div style={{ y }} className="w-full h-full">
        {children}
      </motion.div>
    </div>
  );
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
