/** Whether an admin Control panel page is holding edits that haven't been
 * saved yet. Module-level so the top-bar batch switcher (outside the page)
 * can ask before throwing those edits away. */
let unsaved = false;

export const UNSAVED_CHANGES_MESSAGE = "You have changes that are not saved yet. Leave without saving them?";

export function setUnsavedChanges(value: boolean) {
  unsaved = value;
}

/** True when it's fine to continue: nothing unsaved, or the admin agreed to lose it. */
export function confirmDiscardUnsaved() {
  return !unsaved || window.confirm(UNSAVED_CHANGES_MESSAGE);
}
