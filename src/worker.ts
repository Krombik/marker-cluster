import { getData } from "./utils";

declare const self: Worker;

self.addEventListener("message", (e) => {
  const [yOrigin, xOrigin, minZoom, maxZoom, radius, extent] = e.data;

  const data = getData(yOrigin, xOrigin, minZoom, maxZoom, radius, extent);

  self.postMessage(data, [
    ...data[0].map((item) => item.buffer),
    data[1].buffer,
    data[2].buffer,
    data[3].buffer,
  ]);
});
