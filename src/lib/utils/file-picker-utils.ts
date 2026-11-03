interface SelectFileViaInputOptions {
  // Also settle 800ms after the window regains focus, for environments that don't reliably emit `cancel`.
  // A `change` that arrives after that is dropped, so only enable it where a picker that never settles is worse.
  resolveOnWindowFocus?: boolean;
}

// Opens the browser file picker and resolves with the chosen file, or null when the picker is dismissed.
export async function selectFileViaInput(accept: string, options: SelectFileViaInputOptions = {}): Promise<File | null> {
  return (await selectFilesViaInput(accept, options))[0] ?? null;
}

// Opens the browser file picker and resolves with the chosen files, none when the picker is dismissed.
// The input stays attached to the document until the picker settles: WebKit can garbage-collect a detached
// input while its picker is open, which silently drops the selection.
export function selectFilesViaInput(
  accept: string,
  { multiple = false, resolveOnWindowFocus = false }: SelectFileViaInputOptions & { multiple?: boolean } = {},
): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
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

    const finalize = (files: File[]) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(files);
    };

    const onChange = () => finalize(Array.from(input.files ?? []));

    const onCancel = () => finalize([]);

    const onFocusFallback = () => {
      if (resolved) return;
      if (focusTimeoutId !== null) {
        window.clearTimeout(focusTimeoutId);
      }
      focusTimeoutId = window.setTimeout(() => {
        if (resolved) return;
        finalize(Array.from(input.files ?? []));
      }, 800);
    };

    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    if (resolveOnWindowFocus) {
      window.addEventListener('focus', onFocusFallback);
    }
    document.body.appendChild(input);
    input.click();
  });
}
