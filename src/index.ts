import { ClusterMap, XOR } from "./types";
import { getStore } from "./utils";

type Coords = [lat: number, lng: number];

export type Marker<T> = { marker: T; coords: Coords; key: number };

export type Cluster<T> = {
  items: Point<T>[];
  key: number;
  zoom: number;
  count: number;
  coords: Coords;
};

export type Point<T> = XOR<[Cluster<T>, Marker<T>]>;

export type ClustererOptions<T> = {
  /**
   * Min zoom level to cluster the points on
   * @default 0
   */
  minZoom?: number;
  /**
   * Max zoom level to cluster the points on
   * @default 16
   */
  maxZoom?: number;
  /**
   * Cluster radius in pixels
   * @default 60
   */
  radius?: number;
  /**
   * tile extent (radius is calculated relative to it)
   * @default 256
   */
  extent?: number;
  getLatLng: (item: T) => Coords;
};

export type GetClustersArg = [
  zoom: number,
  westLng: number,
  southLat: number,
  eastLng: number,
  northLat: number
];

const lngToX = (lng: number) => lng / 360 + 0.5;

const latToY = (lat: number) => {
  const sin = Math.sin((lat * Math.PI) / 180);

  const y = 0.5 - (0.25 * Math.log((1 + sin) / (1 - sin))) / Math.PI;

  return y < 0 ? 0 : y > 1 ? 1 : y;
};

const boundedLngToX = (lng: number) =>
  lngToX(((((lng + 180) % 360) + 360) % 360) - 180);

const boundedLatToY = (lat: number) => latToY(Math.max(-90, Math.min(90, lat)));

const xToLng = (x: number) => (x - 0.5) * 360;

const yToLat = (y: number) =>
  (360 * Math.atan(Math.exp((1 - y * 2) * Math.PI))) / Math.PI - 90;

const pair = (a: number, b: number) => {
  const sum = a + b;

  return (sum * (sum + 1)) / 2 + b;
};

// const getX = <T>(v: ClustererPoint<T>) => v._x;
// const getY = <T>(v: ClustererPoint<T>) => v._y;

type QueueItems<T> = [
  xMin: number,
  xMax: number,
  items: [y: number, x: number, p: Point<T>]
];

type Queue<T> = [yMax: number, queueItems: QueueItems<T>];

const addDot = <T>(
  map: Map<number, [x: number, p: Point<T>]>,
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
  // const clusters = [];

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
  arrX: [x: number, p: Point<T>],
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

/**
 * @param expand
 * @default 0
 */
type GetPoints<T> = {
  (
    zoom: number,
    westLng: number,
    southLat: number,
    eastLng: number,
    northLat: number,
    expand?: number
  ): Point<T>[];
  <M, C>(
    zoom: number,
    westLng: number,
    southLat: number,
    eastLng: number,
    northLat: number,
    getMarker: (marker: Marker<T>) => M,
    getCluster: (cluster: Cluster<T>) => C,
    expand?: number
  ): (M | C)[];
};

class MarkerCluster<T> {
  private _options: Required<ClustererOptions<T>>;
  private _store = new Map<
    number,
    { map: ClusterMap<T>; arrY: Float64Array }
  >();

  constructor(options: ClustererOptions<T>) {
    this._options = {
      minZoom: 0,
      maxZoom: 16,
      radius: 60,
      extent: 256,
      ...options,
    };
  }

  private _pixelsToDistance(pixels: number, zoom: number) {
    return pixels / (this._options.extent * Math.pow(2, zoom));
  }

  private _initCluster(arrY: number[], map: ClusterMap<T>, points: T[]) {
    const { getLatLng } = this._options;
    for (let i = points.length; i--; ) {
      const p = points[i];

      const coords = getLatLng(p);

      const y = latToY(coords[0]);
      const x = lngToX(coords[1]);

      addDot(map, arrY, y, x, {
        marker: p,
        coords,
        key: pair(x, y),
      });
    }
  }

  async loadAsync(points: T[], onLoad: () => void) {
    const worker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });

    const { minZoom, maxZoom, extent, radius } = this._options;

    const map: ClusterMap<T> = new Map();

    const arr: number[] = [];

    this._initCluster(arr, map, points);

    worker.addEventListener("message", (e) => {
      console.log(e.data);
      this._store = e.data;
      onLoad();
    });
    worker.postMessage({ map, arr, minZoom, maxZoom, extent, radius });
  }

  load(points: T[]) {
    const { minZoom, maxZoom, extent, radius } = this._options;

    const map: ClusterMap<T> = new Map();

    const arr: number[] = [];

    this._initCluster(arr, map, points);

    this._store = getStore(map, arr, minZoom, maxZoom, radius, extent);
  }

  getPoints = ((
    zoom: number,
    westLng: number,
    southLat: number,
    eastLng: number,
    northLat: number,
    arg1: (<M>(marker: Marker<T>) => M) | number | undefined,
    arg2,
    arg3
  ) => {
    const points: ReturnType<GetPoints<T>> = [];

    let mutate: (p: Point<T>) => any;

    let expand: number;

    if (typeof arg1 == "function") {
      mutate = (p) => points.push(p.items ? arg2(p) : arg1(p));

      expand = arg3 || 0;
    } else {
      mutate = points.push;

      expand = arg1 || 0;
    }

    let minY = boundedLatToY(northLat);
    let maxY = boundedLatToY(southLat);

    let expandX: number;

    if (expand) {
      const expandY =
        Math.abs(expand) < 1
          ? (maxY - minY) * expand
          : (expandX = this._pixelsToDistance(expand, zoom));

      minY -= expandY;
      maxY += expandY;

      if (minY < 0) minY = 0;
      if (maxY > 1) maxY = 1;
    }

    let minX: number;
    let maxX: number;

    if (eastLng - westLng < 360) {
      minX = boundedLngToX(westLng);
      maxX = eastLng == 180 ? 1 : boundedLngToX(eastLng);

      if (expand) {
        expandX ||= Math.abs(maxX - minX) * expand;

        minX -= expandX;
        maxX += expandX;

        if (minY < 0) minY = 0;
        if (maxY > 1) maxY = 1;
      }

      if (minX > maxX) {
        this._mutatePoints(mutate, 0, minY, maxX, maxY, zoom);
        this._mutatePoints(mutate, minX, minY, 1, maxY, zoom);

        return points;
      }
    } else {
      minX = 0;
      maxX = 1;
    }

    this._mutatePoints(mutate, minX, minY, maxX, maxY, zoom);

    return points;
  }) as GetPoints<T>;

  private _mutatePoints(
    mutate: (p: Point<T>) => any,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    zoom: number
  ) {
    const { map, arrY } = this._store.get(this._limitZoom(zoom))!;

    let start = 0;
    let end = arrY.length - 1;

    while (arrY[start] < minY) {
      const middle = Math.floor((start + end) / 2);

      if (minY < arrY[middle]) {
        end = middle - 1;
      } else {
        start = middle + 1;
      }
    }

    end = arrY.length - 1;

    const first = start;

    while (arrY[end] > maxY) {
      const middle = Math.floor((start + end) / 2);

      if (maxY < arrY[middle]) {
        end = middle - 1;
      } else {
        start = middle + 1;
      }
    }

    end++;

    for (let i = first; i < end; i++) {
      const aX = map.get(arrY[i])!;
      for (let j = 0; j < aX.length; j += 2) {
        const curr = aX[j];
        if (curr > minX && curr < maxX) {
          mutate(aX[j + 1] as Point<T>);
        }
      }
    }
  }

  private _limitZoom(z: number) {
    return Math.max(
      this._options.minZoom,
      Math.min(z, this._options.maxZoom + 1)
    );
  }
}

export default MarkerCluster;
