'use client';

import React, { useMemo, useState } from 'react';
import { Check, ListFilter, Plus } from 'lucide-react';

export interface SelectOptionItem {
  value: string;
  label: string;
}

export interface SelectWithCustomProps {
  id?: string;
  value: string;
  onChange: (nextValue: string) => void;
  options: Array<string | SelectOptionItem>;
  savedCustomOptions?: string[];
  onCustomValueCommit?: (customValue: string) => void;
  label?: string;
  customPlaceholder?: string;
  customOptionLabel?: string;
  className?: string;
  selectClassName?: string;
  inputClassName?: string;
  required?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  'data-testid'?: string;
}

const CUSTOM_SENTINEL = '__CUSTOM_TYPE__';

export function SelectWithCustom({
  id,
  value,
  onChange,
  options,
  savedCustomOptions = [],
  onCustomValueCommit,
  label,
  customPlaceholder = 'Type custom value...',
  customOptionLabel = '+ Custom Type...',
  className = '',
  selectClassName = 'w-full px-3 py-2 text-xs rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713] text-[#17221F] dark:text-[#F0F5F2] focus:outline-none focus:border-[#064E3B] dark:focus:border-[#D4AF37]',
  inputClassName = 'flex-1 min-w-0 px-3 py-2 text-xs rounded-lg border border-[#D4AF37] bg-white dark:bg-[#071713] text-[#17221F] dark:text-[#F0F5F2] focus:outline-none focus:ring-1 focus:ring-[#D4AF37]',
  required = false,
  disabled = false,
  'aria-label': ariaLabel,
  'data-testid': dataTestId,
}: SelectWithCustomProps) {
  const normalizedOptions = useMemo<SelectOptionItem[]>(() => {
    const base = options.map((opt) =>
      typeof opt === 'string' ? { value: opt, label: opt } : opt
    );
    const seenValues = new Set(base.map((o) => o.value));
    for (const custom of savedCustomOptions) {
      const trimmed = String(custom || '').trim();
      if (trimmed && !seenValues.has(trimmed)) {
        seenValues.add(trimmed);
        base.push({ value: trimmed, label: `${trimmed} (Custom)` });
      }
    }
    if (value && !seenValues.has(value) && value !== CUSTOM_SENTINEL) {
      base.push({ value, label: `${value} (Custom)` });
    }
    return base;
  }, [options, savedCustomOptions, value]);

  const [isCustomMode, setIsCustomMode] = useState(false);
  const [draftCustom, setDraftCustom] = useState('');

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (next === CUSTOM_SENTINEL) {
      setDraftCustom(
        value && !options.some((o) => (typeof o === 'string' ? o : o.value) === value) ? value : ''
      );
      setIsCustomMode(true);
      return;
    }
    setIsCustomMode(false);
    onChange(next);
  };

  const applyCustomValue = () => {
    const trimmed = draftCustom.trim();
    if (!trimmed) {
      setIsCustomMode(false);
      return;
    }
    onChange(trimmed);
    onCustomValueCommit?.(trimmed);
    setIsCustomMode(false);
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-xs font-semibold text-[#17221F] dark:text-[#F0F5F2]">
          {label}
        </label>
      )}

      {!isCustomMode ? (
        <div className="flex items-center gap-1.5">
          <select
            id={id}
            value={value}
            onChange={handleSelectChange}
            required={required}
            disabled={disabled}
            aria-label={ariaLabel || label}
            data-testid={dataTestId}
            className={selectClassName}
          >
            {normalizedOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
            <option value={CUSTOM_SENTINEL}>{customOptionLabel}</option>
          </select>
          {!disabled && (
            <button
              type="button"
              onClick={() => {
                setDraftCustom('');
                setIsCustomMode(true);
              }}
              title="Enter custom type"
              aria-label={`Enter custom value for ${ariaLabel || label || 'field'}`}
              data-testid={dataTestId ? `${dataTestId}-custom-btn` : undefined}
              className="p-2 rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713] text-[#064E3B] dark:text-[#D4AF37] hover:border-[#D4AF37] transition-colors shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={draftCustom}
            onChange={(e) => {
              const val = e.target.value;
              setDraftCustom(val);
              if (val.trim()) {
                onChange(val.trim());
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyCustomValue();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setIsCustomMode(false);
              }
            }}
            placeholder={customPlaceholder}
            aria-label={`Custom input for ${ariaLabel || label || 'field'}`}
            data-testid={dataTestId ? `${dataTestId}-custom-input` : undefined}
            autoFocus
            className={inputClassName}
          />
          <button
            type="button"
            onClick={applyCustomValue}
            title="Apply custom value"
            data-testid={dataTestId ? `${dataTestId}-custom-apply` : undefined}
            className="px-2.5 py-2 rounded-lg bg-[#064E3B] hover:bg-[#0B3D32] text-white text-[11px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <Check className="w-3 h-3 text-[#D4AF37]" />
            <span>Apply</span>
          </button>
          <button
            type="button"
            onClick={() => setIsCustomMode(false)}
            title="Back to dropdown options"
            aria-label="Back to dropdown options"
            className="p-2 rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713] text-[#718078] dark:text-[#9AB0A6] hover:text-[#17221F] dark:hover:text-white shrink-0 cursor-pointer"
          >
            <ListFilter className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default SelectWithCustom;
