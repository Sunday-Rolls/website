// The rig and his traced head are kept out of the main bundle; they load when he first walks.
export const loadStrollRig = () => import('./StrollingRig')

/** Fetch the stroll ahead of time, so the first one starts without a wait. */
export function preloadStroll() {
  void loadStrollRig()
}
