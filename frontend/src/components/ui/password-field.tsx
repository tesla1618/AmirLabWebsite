"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";
import { IconButton } from "./icon-button";
import { InputControl } from "./form-controls";
import { FormField } from "./form-field";

type PasswordFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & { label: string };

export function PasswordField({ id, label, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const buttonLabel = visible ? "Hide password" : "Show password";

  return (
    <FormField htmlFor={id} label={label}>
      <div className="relative">
        <InputControl
          className="pr-[3rem]"
          id={id}
          {...props}
          type={visible ? "text" : "password"}
        />
        <IconButton
          aria-label={buttonLabel}
          className="absolute right-[.35rem] top-1/2 -translate-y-1/2 text-ink-muted hover:text-brand"
          onClick={() => setVisible((current) => !current)}
          shape="control"
          size="md"
          title={buttonLabel}
          variant="bare"
        >
          {visible ? (
            <EyeOff aria-hidden="true" size={17} />
          ) : (
            <Eye aria-hidden="true" size={17} />
          )}
        </IconButton>
      </div>
    </FormField>
  );
}
