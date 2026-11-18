/** Looks up a required element in Tally's own static document. */
export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element ${id}.`);
  return node as T;
}

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function field<T extends FormControl = FormControl>(form: HTMLFormElement, name: string): T {
  const control = form.elements.namedItem(name);
  if (!(control instanceof HTMLElement)) throw new Error(`Missing form field ${name}.`);
  return control as T;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Tally could not complete that action.";
}

export function setFormError(form: HTMLFormElement, message: string): void {
  const alert = form.querySelector<HTMLElement>("[role=alert]");
  if (!alert) throw new Error("Missing form alert.");
  alert.textContent = message;
  alert.hidden = message === "";
}
