import { getStore } from "./utils";

declare const self: Worker;

self.addEventListener("message", (evt) => {
  const { map, arr, minZoom, maxZoom, extent, radius } = evt.data;
  // const data = [];
  const t1 = performance.now();
  // for (let i = 0; i < 16; i++) {
  //   const arr = [];
  //   const arr1 = [];
  //   for (let j = Math.round(10000 / (i + 1)); j--; ) {
  //     const kek = Math.random();
  //     arr.push(kek);
  //     arr1.push([
  //       kek,
  //       Math.random() > 0.5 ? [0.1, 0.5, 1] : [0.1, 0.5, 1, 2, 3, 4, 5, 6],
  //     ]);
  //   }
  //   data.push(new Float64Array(arr).sort().buffer);
  // }
  const kek = getStore(map, arr, minZoom, maxZoom, radius, extent);
  // const bek = [];
  // for (let i = 0; i < data.length; i += 2) {
  //   bek.push(data[i]);
  // }
  console.log(performance.now() - t1);
  // (kek as any).bek = 123;
  self.postMessage(kek);
});
