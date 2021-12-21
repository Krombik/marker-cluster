import { ClusterMap, ClusterStore, Point, XAxis } from "./types";

const lngToX = (lng: number) => lng / 360 + 0.5;

const latToY = (lat: number) => {
  const sin = Math.sin((lat * Math.PI) / 180);

  const y = 0.5 - (0.25 * Math.log((1 + sin) / (1 - sin))) / Math.PI;

  return y < 0 ? 0 : y > 1 ? 1 : y;
};

export const boundedLngToX = (lng: number) =>
  lngToX(((((lng + 180) % 360) + 360) % 360) - 180);

export const boundedLatToY = (lat: number) =>
  latToY(Math.max(-90, Math.min(90, lat)));

const xToLng = (x: number) => (x - 0.5) * 360;

const yToLat = (y: number) =>
  (360 * Math.atan(Math.exp((1 - y * 2) * Math.PI))) / Math.PI - 90;

const pair = (a: number, b: number) => {
  const sum = a + b;

  return (sum * (sum + 1)) / 2 + b;
};

type QueueItems<T> = [
  xMin: number,
  xMax: number,
  items: [y: number, x: number, p: Point<T>]
];

type Queue<T> = [yMax: number, queueItems: QueueItems<T>];

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
  queueItems: QueueItems<T>,
  map: any,
  arr: number[],
  zoom: number
) => {
  for (let j = 2; j < queueItems.length; j += 3) {
    const data = queueItems[j] as QueueItems<T>[2];

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
  }
};

const clusteringQueueItems = <T>(
  queueItems: QueueItems<T>,
  y: number,
  x: number,
  p: Point<T>
) => {
  let clustered = false;

  for (let i = 0; i < queueItems.length; i += 3) {
    if (x >= queueItems[i] && x <= queueItems[i + 1]) {
      const items = queueItems[i + 2] as QueueItems<T>[2];

      items[0] += y;
      items[1] += x;
      items.push(p);

      clustered = true;
    }
  }

  return clustered;
};

const clusteringQueue = <T>(
  queue: Queue<T>,
  startIndex: number,
  y: number,
  x: number,
  p: Point<T>
) => {
  for (let j = startIndex; j < queue.length; j += 2) {
    if (clusteringQueueItems(queue[j] as QueueItems<T>, y, x, p)) return true;
  }

  return false;
};

type MutateQueueData = [index: number, clustered?: true];

const mutateQueue = <T>(
  queue: Queue<T>,
  data: MutateQueueData,
  y: number,
  arrX: XAxis<T>,
  r: number
) => {
  let i = data[0];

  while (y > queue[i]) {
    i += 2;
  }

  data[0] = i;

  let notPushed = true;

  for (let j = 0; j < arrX.length; j += 2) {
    const x = arrX[j] as number;
    const p = arrX[j + 1] as Point<T>;

    if (!clusteringQueue(queue, i + 1, y, x, p)) {
      if (notPushed) {
        queue.push(y + 2 * r, [x - r, x + r, [y, x, p]]);

        notPushed = false;
      } else {
        (queue[queue.length - 1] as QueueItems<T>).push(x - r, x + r, [
          y,
          x,
          p,
        ]);
      }
    } else {
      data[1] = true;
    }
  }
};

export const pixelsToDistance = (
  pixels: number,
  extent: number,
  zoom: number
) => pixels / (extent * Math.pow(2, zoom));

export const getStore = <T>(
  map: ClusterMap<T>,
  arr: number[],
  minZoom: number,
  maxZoom: number,
  radius: number,
  extent: number
) => {
  const store: ClusterStore<T> = new Map();
  store.set(maxZoom + 1, { map, arrY: new Float64Array(arr).sort() });

  const fn = (z: number) => {
    const r = pixelsToDistance(radius, extent, z);

    const tree = store.get(z + 1)!;

    const { map, arrY } = tree;

    const l = arrY.length;

    const queue: Queue<T> = [] as any;

    const data: MutateQueueData = [0];

    for (let i = 0; i < l; i++) {
      const y = arrY[i];

      mutateQueue(queue, data, y, map.get(y)!, r);
    }

    if (data[1]) {
      const map: ClusterMap<T> = new Map();
      const arr: number[] = [];

      const l = queue.length;

      for (let i = 1; i < l; i += 2) {
        addDots(queue[i] as QueueItems<T>, map, arr, z);
      }

      store.set(z, {
        map,
        arrY: new Float64Array(arr).sort(),
      });
    } else {
      store.set(z, tree);
    }
  };

  for (let z = maxZoom; z >= minZoom; z--) {
    fn(z);
  }

  return store;
};
