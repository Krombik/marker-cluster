import { Bool, ClusterMap, ClusterStore, Point, XAxis } from "./types";

export const clamp = (min: number, value: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const lngToX = (lng: number) => lng / 360 + 0.5;

export const latToY = (lat: number) => {
  const sin = Math.sin((lat * Math.PI) / 180);

  return clamp(0, 0.5 - (0.25 * Math.log((1 + sin) / (1 - sin))) / Math.PI, 1);
};

export const boundedLngToX = (lng: number) =>
  lngToX(((((lng + 180) % 360) + 360) % 360) - 180);

export const boundedLatToY = (lat: number) => latToY(clamp(-90, lat, 90));

export const xToLng = (x: number) => (x - 0.5) * 360;

export const yToLat = (y: number) =>
  (360 * Math.atan(Math.exp((1 - y * 2) * Math.PI))) / Math.PI - 90;

export const pair = (a: number, b: number) => {
  const sum = a + b;

  return (sum * (sum + 1)) / 2 + b;
};

export const pixelsToDistance = (
  pixels: number,
  extent: number,
  zoom: number
) => pixels / (extent * Math.pow(2, zoom));

type Queue<T> = [
  yMax: number,
  xMin: number,
  xMax: number,
  items: [y: number, x: number, p: Point<T>]
];

export const addDot = <T>(
  map: ClusterMap<T>,
  arr: number[],
  y: number,
  x: number,
  p: Point<T>
) => {
  if (map.has(y)) {
    map.get(y)!.push(x, p);
  } else {
    map.set(y, [x, p]);
    arr.push(y);
  }
};

const addDots = <T>(
  data: Queue<T>[3],
  map: any,
  arr: number[],
  zoom: number
) => {
  if (data.length > 3) {
    const yx = data.splice(0, 2) as [y: number, x: number];

    const l = data.length;

    const y = yx[0] / l;
    const x = yx[1] / l;

    let count = 0;

    for (let i = data.length; i--; ) {
      count += (data[i] as Point<T>).count || 1;
    }

    addDot(map, arr, y, x, {
      items: data as Point<T>[],
      coords: [yToLat(y), xToLng(x)],
      key: pair(x, y),
      count,
      zoom,
    });
  } else {
    addDot(map, arr, data[0], data[1], data[2]);
  }
};

const clusteringQueue = <T>(
  queue: Queue<T>,
  startMinXIndex: number,
  y: number,
  x: number,
  p: Point<T>,
  r: number
): Bool => {
  for (let j = startMinXIndex; j < queue.length; j += 4) {
    if (x >= queue[j] && x <= queue[j + 1]) {
      const items = queue[j + 2] as Queue<T>[3];

      items[0] += y;
      items[1] += x;
      items.push(p);

      return 1;
    }
  }

  queue.push(y + 2 * r, x - r, x + r, [y, x, p]);

  return 0;
};

type QueueIndexRef = [index: number];

const mutateQueue = <T>(
  queue: Queue<T>,
  data: QueueIndexRef,
  y: number,
  arrX: XAxis<T>,
  r: number
): Bool => {
  let i = data[0];

  while (y > queue[i]) {
    i += 4;
  }

  data[0] = i;

  let clustered: Bool = 0;

  const startMinXIndex = i + 1;

  for (let j = 0; j < arrX.length; j += 2) {
    clustered |= clusteringQueue(
      queue,
      startMinXIndex,
      y,
      arrX[j] as number,
      arrX[j + 1] as Point<T>,
      r
    );
  }

  return clustered as Bool;
};

export const getStore = <T>(
  map: ClusterMap<T>,
  arr: ArrayBufferLike,
  minZoom: number,
  maxZoom: number,
  radius: number,
  extent: number
) => {
  const store: ClusterStore<T> = new Map();
  store.set(maxZoom + 1, { map, arrY: new Float64Array(arr) });

  const fn = (z: number) => {
    const t1 = performance.now();
    const r = pixelsToDistance(radius, extent, z);

    const tree = store.get(z + 1)!;

    const { map, arrY } = tree;

    const l = arrY.length;

    const queue: Queue<T> = [] as any;

    const queueIndexRef: QueueIndexRef = [0];

    let clustered: Bool = 0;
    for (let i = 0; i < l; i++) {
      const y = arrY[i];

      clustered |= mutateQueue(queue, queueIndexRef, y, map.get(y)!, r);
    }
    if (clustered) {
      const map: ClusterMap<T> = new Map();
      const arr: number[] = [];

      const l = queue.length;

      for (let i = 3; i < l; i += 4) {
        addDots(queue[i] as Queue<T>[3], map, arr, z);
      }

      store.set(z, {
        map,
        arrY: new Float64Array(arr).sort(),
      });
    } else {
      store.set(z, tree);
    }
    console.log(performance.now() - t1);
  };

  for (let z = maxZoom; z >= minZoom; z--) {
    fn(z);
  }

  return store;
};
