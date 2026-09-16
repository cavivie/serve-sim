import type { ReactNode } from "react";

export function CameraInjectionMode({ value, disabled, onChange, description, children }: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  description: string;
  children: ReactNode;
}) {
  return <>
    <label className="flex items-center justify-between gap-3 text-[12px] text-white/85">
      <span>Injection mode</span>
      <select aria-label="Injection mode" value={value} disabled={disabled}
        onChange={event => onChange(event.currentTarget.value)}
        className="bg-panel border border-white/15 rounded-[7px] px-2 py-1.5 text-white text-[12px]">
        {children}
      </select>
    </label>
    <p className="m-0 text-[10px] leading-[1.5] text-white/45">{description}</p>
  </>;
}
