import { Toast } from '@base-ui/react/toast';

// A module-level manager so any module can raise a toast without being inside
// the React tree. `<Toast.Provider toastManager={toastManager}>` wires it up.
export const toastManager = Toast.createToastManager();

export function toast(description, options = {}) {
  return toastManager.add({ description, timeout: 2600, ...options });
}
