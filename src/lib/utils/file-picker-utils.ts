// Opens the browser file picker and resolves with the chosen file, or null when the picker is dismissed.
// The input stays attached to the document until the picker settles: WebKit can garbage-collect a detached
// input while its picker is open, which silently drops the selection.
export function selectFileViaInput(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    let resolved = false;
    let focusTimeoutId: number | null = null;

    const cleanup = () => {
      if (focusTimeoutId !== null) {
        window.clearTimeout(focusTimeoutId);
        focusTimeoutId = null;
      }
      input.remove();
      window.removeEventListener('focus', onFocusFallback);
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
    };

    const finalize = (file: File | null) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(file);
    };

    const onChange = () => {
      const file = input.files && input.files.length > 0 ? input.files[0] : null;
      finalize(file);
    };

    const onCancel = () => finalize(null);

    // Fallback: some environments don't reliably emit `cancel`.
    const onFocusFallback = () => {
      if (resolved) return;
      if (focusTimeoutId !== null) {
        window.clearTimeout(focusTimeoutId);
      }
      focusTimeoutId = window.setTimeout(() => {
        if (resolved) return;
        const file = input.files && input.files.length > 0 ? input.files[0] : null;
        finalize(file);
      }, 800);
    };

    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    window.addEventListener('focus', onFocusFallback);
    document.body.appendChild(input);
    input.click();
  });
}
