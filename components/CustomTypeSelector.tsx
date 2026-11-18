'use client';

import React, { useState } from 'react';
import { Tag, Trash2 } from 'lucide-react';
import type { CustomTypeRecord } from '@/lib/types';

export interface CustomTypeSelectorProps {
  label?: string;
  module: string;
  defaultOptions: string[];
  customTypes: CustomTypeRecord[];
  value: string;
  onChange: (value: string) => void;
  onAddNewCustomType?: (module: string, name: string) => void;
  onAddCustomType?: (name: string) => Promise<void> | void;
  onDeleteCustomType?: (id: string, name: string) => Promise<void> | void;
  required?: boolean;
}

export function CustomTypeSelector({
  label = 'Category / Type',
  module,
  defaultOptions,
  customTypes = [],
  value,
  onChange,
  onAddNewCustomType,
  onAddCustomType,
  onDeleteCustomType,
  required = false,
}: CustomTypeSelectorProps) {
  const moduleCustomRecords = customTypes.filter((ct) => ct.module === module);
  const moduleCustomTypes = moduleCustomRecords.map((ct) => ct.name);

  // Combine unique options
  const allKnownOptions = Array.from(new Set([...defaultOptions, ...moduleCustomTypes]));

  const [isCustomMode, setIsCustomMode] = useState<boolean>(() => {
    return value && !allKnownOptions.includes(value) ? true : false;
  });
  const [customInputValue, setCustomInputValue] = useState<string>(() => {
    return value && !allKnownOptions.includes(value) ? value : '';
  });

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    if (selected === '__CUSTOM_TYPE__') {
      setIsCustomMode(true);
      if (customInputValue) {
        onChange(customInputValue);
      }
    } else {
      setIsCustomMode(false);
      onChange(selected);
    }
  };

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomInputValue(val);
    onChange(val);
  };

  const handleCustomInputBlur = () => {
    const trimmed = customInputValue.trim();
    if (trimmed && !allKnownOptions.includes(trimmed)) {
      onAddNewCustomType?.(module, trimmed);
      void onAddCustomType?.(trimmed);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-[#17221F] dark:text-[#F0F5F2]">
          {label}
        </label>
        {isCustomMode && (
          <button
            type="button"
            onClick={() => {
              setIsCustomMode(false);
              onChange(defaultOptions[0] || '');
            }}
            className="text-[11px] text-[#718078] dark:text-[#9AB0A6] hover:text-[#064E3B] dark:hover:text-[#D4AF37] underline cursor-pointer"
          >
            Use standard options
          </button>
        )}
      </div>

      {!isCustomMode ? (
        <div className="space-y-2">
          <div className="relative">
            <Tag className="w-3.5 h-3.5 text-[#718078] dark:text-[#9AB0A6] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={value}
              onChange={handleSelectChange}
              required={required}
              className="w-full pl-9 pr-3.5 py-2 text-xs bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-lg text-[#17221F] dark:text-[#F0F5F2] focus:outline-none focus:border-[#064E3B] dark:focus:border-[#D4AF37]"
            >
              <optgroup label="Standard Categories">
                {defaultOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </optgroup>

              {moduleCustomTypes.length > 0 && (
                <optgroup label="Previously Created Custom Types">
                  {moduleCustomTypes.map((ct) => (
                    <option key={ct} value={ct}>
                      {ct} (Custom)
                    </option>
                  ))}
                </optgroup>
              )}

              <option value="__CUSTOM_TYPE__">+ Custom Type (Create new...)</option>
            </select>
          </div>

          {onDeleteCustomType && moduleCustomRecords.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#718078] dark:text-[#9AB0A6]">
                Saved Custom:
              </span>
              {moduleCustomRecords.map((rec) => (
                <span
                  key={rec.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] text-[11px] text-[#17221F] dark:text-[#F0F5F2]"
                >
                  <span>{rec.name}</span>
                  <button
                    type="button"
                    onClick={() => void onDeleteCustomType(rec.id, rec.name)}
                    title={`Delete custom type "${rec.name}"`}
                    aria-label={`Delete custom type ${rec.name}`}
                    className="text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="relative">
            <input
              type="text"
              value={customInputValue}
              onChange={handleCustomInputChange}
              onBlur={handleCustomInputBlur}
              placeholder="Enter custom category name (e.g. Colloquium, Monograph, Workshop)..."
              className="w-full px-3 py-2 text-xs bg-white dark:bg-[#071713] border border-[#D4AF37] rounded-lg text-[#17221F] dark:text-[#F0F5F2] focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              autoFocus
              required={required}
            />
          </div>
          <p className="text-[11px] text-[#718078] dark:text-[#D4AF37]">
            Custom type will be applied and remembered for future reuse across AL-NIBRAS.
          </p>
        </div>
      )}
    </div>
  );
}

export default CustomTypeSelector;
