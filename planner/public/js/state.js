export const state = { user: null, settings: null, chatOpen: false };
export const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
