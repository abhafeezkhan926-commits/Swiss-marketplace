"use client";

import { useState, type ChangeEvent } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";

type Props = {
  id: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  autoComplete: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
};

export default function PasswordField({
  id,
  value,
  onChange,
  autoComplete,
  placeholder,
  required,
  minLength,
  maxLength,
}: Props) {
  const [visible, setVisible] = useState(false);
  const label = visible ? "Hide password" : "Show password";

  return <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
    <LockKeyhole size={18} color="#8a93a5" />
    <div className="password-control">
      <input
        id={id}
        className="input"
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((current) => !current)}
        aria-label={label}
        aria-pressed={visible}
        title={label}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  </div>;
}
