import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { computeAmountEdit, formatAmountForInput } from "@/lib/amountFormat";

interface AmountInputProps
  extends Omit<
    React.ComponentProps<typeof Input>,
    "value" | "onChange" | "type" | "inputMode"
  > {
  /** Raw numeric string (no grouping), e.g. "80000", "1234.5" or "". */
  value: string;
  /** Called with the raw numeric string (grouping stripped) on every edit. */
  onChange: (value: string) => void;
  /** Allow a leading minus for negative amounts (e.g. an overdrawn balance). */
  allowNegative?: boolean;
}

/**
 * A money field that shows the value with Indian (lakh/crore) comma grouping as
 * the user types, while reporting the plain numeric string upstream — so it's a
 * drop-in for the old `<Input type="number">` amount fields. The caret is kept
 * in place across re-grouping by tracking significant characters, not offsets.
 */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(
  ({ value, onChange, allowNegative = false, ...rest }, ref) => {
    const display = formatAmountForInput(value ?? "");

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const el = e.currentTarget;
      const caret = el.selectionStart ?? el.value.length;
      const { clean, display: next, caret: pos } = computeAmountEdit(
        el.value,
        caret,
        allowNegative
      );

      // Normalize the DOM immediately so the caret stays put even when the
      // sanitized value is unchanged (React would skip that re-render).
      el.value = next;
      el.setSelectionRange(pos, pos);
      onChange(clean);
    }

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={display}
        onChange={handleChange}
        {...rest}
      />
    );
  }
);
AmountInput.displayName = "AmountInput";
