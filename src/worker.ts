import { getStore } from "./utils";

self.addEventListener("message", (evt) => {
  const { map, arr, minZoom, maxZoom, extent, radius } = evt.data;
  postMessage(getStore(map, arr, minZoom, maxZoom, radius, extent));
});
