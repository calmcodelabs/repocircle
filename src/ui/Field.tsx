type Props = {
  label: string;
  value: string;
  onInput: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  error?: string;
  hint?: string;
  autofocus?: boolean;
  /** Single-line only: called on Enter (the event is consumed). */
  onEnter?: () => void;
};

export function Field({
  label,
  value,
  onInput,
  placeholder,
  maxLength,
  multiline,
  error,
  hint,
  autofocus,
  onEnter,
}: Props) {
  const handler = (e: Event) => onInput((e.currentTarget as HTMLInputElement).value);
  const keyHandler =
    onEnter &&
    ((e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      onEnter();
    });
  const near = maxLength !== undefined && value.length > maxLength * 0.8;
  return (
    <label class="field">
      <span class="field__label">{label}</span>
      {multiline ? (
        <textarea
          class="field__input"
          value={value}
          onInput={handler}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={3}
          autofocus={autofocus}
        />
      ) : (
        <input
          class="field__input"
          value={value}
          onInput={handler}
          onKeyDown={keyHandler}
          placeholder={placeholder}
          maxLength={maxLength}
          autofocus={autofocus}
        />
      )}
      {error ? (
        <span class="field__hint field__hint--error">{error}</span>
      ) : hint || near ? (
        <span class="field__hint">
          {hint}
          {near ? ` ${value.length}/${maxLength}` : ''}
        </span>
      ) : null}
    </label>
  );
}
