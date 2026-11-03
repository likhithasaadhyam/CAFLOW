import React, { useState, useEffect } from 'react';
import { Plus, Check, X } from 'lucide-react';
import { api } from '../../services/api';

export interface CreatableSelectOption {
  value: string;
  label: string;
}

export interface CreatableSelectProps {
  categoryKey: string; // Unique key identifying this dropdown category (e.g., 'client-type', 'client-group')
  options: (string | CreatableSelectOption)[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  className?: string;
  disabled?: boolean;
}

const LOCAL_STORAGE_PREFIX = 'caflow_custom_dropdown_';

export const CreatableSelect: React.FC<CreatableSelectProps> = ({
  categoryKey,
  options,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  required = false,
  className = '',
  disabled = false,
}) => {
  // Normalize provided base options
  const baseOptions: CreatableSelectOption[] = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );

  // Custom options state
  const [customOptions, setCustomOptions] = useState<string[]>(() => {
    try {
      const cached = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${categoryKey}`);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newOptionText, setNewOptionText] = useState('');
  const [savingNew, setSavingNew] = useState(false);

  // Sync custom options from backend settings API & localStorage
  const loadCustomOptions = async () => {
    try {
      const res = await api.getCustomOptions();
      if (res && res.success && res.options && res.options[categoryKey]) {
        const backendOpts: string[] = res.options[categoryKey];
        setCustomOptions((prev) => {
          const merged = Array.from(new Set([...prev, ...backendOpts]));
          localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${categoryKey}`, JSON.stringify(merged));
          return merged;
        });
      }
    } catch (e) {
      // Offline or network error - gracefully rely on localStorage
    }
  };

  useEffect(() => {
    loadCustomOptions();

    // Listen for custom options updates across components / tabs
    const handleUpdate = () => {
      try {
        const cached = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${categoryKey}`);
        if (cached) {
          setCustomOptions(JSON.parse(cached));
        }
      } catch (e) {}
    };

    window.addEventListener('caflow_custom_options_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('caflow_custom_options_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [categoryKey]);

  // Combine standard options + custom options
  const allSelectableOptions: CreatableSelectOption[] = [
    ...baseOptions,
    ...customOptions
      .filter((co) => !baseOptions.some((bo) => bo.value.toLowerCase() === co.toLowerCase()))
      .map((co) => ({ value: co, label: `${co} (Custom)` })),
  ];

  // Handle select dropdown change
  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    if (selected === '__ADD_NEW_CUSTOM_OPTION__') {
      setIsAddingNew(true);
      setNewOptionText('');
    } else {
      onChange(selected);
    }
  };

  // Save new custom option permanently
  const handleSaveNewOption = async () => {
    const trimmed = newOptionText.trim();
    if (!trimmed) {
      setIsAddingNew(false);
      return;
    }

    setSavingNew(true);
    try {
      // 1. Update local state & localStorage immediately
      const updated = Array.from(new Set([...customOptions, trimmed]));
      setCustomOptions(updated);
      localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${categoryKey}`, JSON.stringify(updated));

      // 2. Persist to backend so it's shared across all dashboards
      try {
        await api.addCustomOption(categoryKey, trimmed);
      } catch (err) {
        console.warn('Backend custom option sync deferred:', err);
      }

      // 3. Dispatch event to update all other dropdowns in the app
      window.dispatchEvent(new Event('caflow_custom_options_updated'));

      // 4. Select the newly created option
      onChange(trimmed);
      setIsAddingNew(false);
      setNewOptionText('');
    } finally {
      setSavingNew(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveNewOption();
    } else if (e.key === 'Escape') {
      setIsAddingNew(false);
      setNewOptionText('');
    }
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-semibold text-[#202A33] mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {isAddingNew ? (
        <div className="flex items-center gap-1.5 animate-fadeIn">
          <div className="relative flex-1">
            <input
              type="text"
              autoFocus
              disabled={savingNew}
              placeholder="Type new option..."
              value={newOptionText}
              onChange={(e) => setNewOptionText(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full rounded-md border-2 border-[#2563EB] bg-white px-3 py-1 text-xs text-[#202A33] focus:outline-none shadow-sm"
            />
          </div>
          <button
            type="button"
            title="Save custom option"
            disabled={savingNew || !newOptionText.trim()}
            onClick={handleSaveNewOption}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-[#2563EB] text-white hover:bg-[#1D4ED8] disabled:opacity-50 transition cursor-pointer shrink-0 shadow-xs"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Cancel"
            disabled={savingNew}
            onClick={() => {
              setIsAddingNew(false);
              setNewOptionText('');
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 hover:bg-slate-50 transition cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <select
            disabled={disabled}
            value={value}
            onChange={handleSelectChange}
            className={`w-full rounded-md border border-[#E1E7E2] bg-white px-3 py-1.5 text-xs text-[#202A33] focus:border-[#2563EB] focus:outline-none transition ${className}`}
          >
            {placeholder && <option value="">{placeholder}</option>}
            {allSelectableOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
            <option disabled>──────────</option>
            <option value="__ADD_NEW_CUSTOM_OPTION__" className="font-semibold text-[#2563EB] bg-blue-50/50">
              + Add Custom / Other...
            </option>
          </select>
        </div>
      )}
    </div>
  );
};
