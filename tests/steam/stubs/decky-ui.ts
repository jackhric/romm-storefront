// Decky's real patcher (what the hooks patch Steam with on the device) and inert stand-ins for the rest.
export { afterPatch, beforePatch, callOriginal, replacePatch } from "../../../node_modules/@decky/ui/dist/utils/patcher.js";

export const findModuleExport = (filter: (e: unknown) => boolean) => (globalThis as any).__steamExports?.find(filter);
export const fakeRenderComponent = (fn: () => unknown) => fn();
export function findInReactTree(node: any, filter: (n: any) => boolean): any {
  if (!node || typeof node !== "object") return undefined;
  if (filter(node)) return node;
  if (Array.isArray(node)) return node.map((n) => findInReactTree(n, filter)).find(Boolean);
  return findInReactTree(node.props?.children, filter);
}
export const DialogButton = "DialogButton";
export const Field = "Field";
