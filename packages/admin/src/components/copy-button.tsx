import { useSignal } from '@preact/signals';

export interface CopyButtonProps {
  value: string;
  label?: string;
}

export function CopyButton({ value, label }: CopyButtonProps) {
  const copied = useSignal(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback for non-secure contexts
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  };

  return (
    <button class="btn btn-ghost btn-sm" onClick={handleCopy}>
      {copied.value ? 'Copied!' : (label ?? 'Copy')}
    </button>
  );
}
